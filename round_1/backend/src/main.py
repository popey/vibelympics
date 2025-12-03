"""
MojiNav Backend - Emoji-only navigation API

This FastAPI application provides:
- Health check endpoint
- Search for nearby amenities via OpenStreetMap Overpass API
- Walking directions via OpenRouteService API
- In-memory caching with expiration
- Rate limiting per endpoint
"""

import logging
import os
import time
import hashlib
from collections import defaultdict
from typing import Optional
from dataclasses import dataclass, field

import httpx
from fastapi import FastAPI, Request, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Configure verbose logging for debugging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# =============================================================================
# Configuration
# =============================================================================

ORS_API_KEY = os.environ.get("ORS_API_KEY", "")
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
ORS_DIRECTIONS_URL = "https://api.openrouteservice.org/v2/directions/foot-walking"

# Rate limiting configuration (per minute)
SEARCH_RATE_LIMIT = 30  # 30 searches per minute per IP
ROUTE_RATE_LIMIT = 60   # 60 route requests per minute per IP
RATE_WINDOW = 60        # 1 minute window

# Cache configuration
SEARCH_CACHE_TTL = 300  # 5 minutes for search results
ROUTE_CACHE_TTL = 600   # 10 minutes for routes

# Amenity to OSM tag mapping
AMENITY_OSM_TAGS = {
    'pub': [('amenity', 'pub')],
    'cafe': [('amenity', 'cafe')],
    'train': [('railway', 'station'), ('public_transport', 'station')],
    'pool': [('leisure', 'swimming_pool'), ('amenity', 'swimming_pool')],
    'gym': [('leisure', 'fitness_centre'), ('amenity', 'gym')],
    'park': [('leisure', 'park')],
    'pizza': [('cuisine', 'pizza'), ('amenity', 'restaurant')],  # Combined query
    'fastfood': [('amenity', 'fast_food')],
    'fuel': [('amenity', 'fuel')],
    'pharmacy': [('amenity', 'pharmacy')],
    'atm': [('amenity', 'atm')],
    'supermarket': [('shop', 'supermarket')],
    'toilet': [('amenity', 'toilets')],
    'parking': [('amenity', 'parking')],
    'library': [('amenity', 'library')],
    'cinema': [('amenity', 'cinema')],
}

# Search radius per amenity type (in meters)
AMENITY_RADIUS = {
    'pub': 1000,
    'cafe': 800,
    'train': 2000,
    'pool': 2000,
    'gym': 1500,
    'park': 1000,
    'pizza': 1000,
    'fastfood': 800,
    'fuel': 2000,
    'pharmacy': 1500,
    'atm': 1000,
    'supermarket': 1500,
    'toilet': 500,
    'parking': 800,
    'library': 2000,
    'cinema': 2000,
}

# =============================================================================
# Caching
# =============================================================================

@dataclass
class CacheEntry:
    """Cache entry with expiration."""
    data: dict
    expires_at: float

class SimpleCache:
    """Simple in-memory cache with TTL."""

    def __init__(self):
        self._cache: dict[str, CacheEntry] = {}

    def get(self, key: str) -> Optional[dict]:
        """Get cached value if not expired."""
        entry = self._cache.get(key)
        if entry is None:
            logger.debug(f"Cache MISS: {key[:50]}...")
            return None
        if time.time() > entry.expires_at:
            logger.debug(f"Cache EXPIRED: {key[:50]}...")
            del self._cache[key]
            return None
        logger.debug(f"Cache HIT: {key[:50]}...")
        return entry.data

    def set(self, key: str, data: dict, ttl: float):
        """Set cache value with TTL in seconds."""
        self._cache[key] = CacheEntry(data=data, expires_at=time.time() + ttl)
        logger.debug(f"Cache SET: {key[:50]}... (TTL: {ttl}s)")

    def clear_expired(self):
        """Remove expired entries."""
        now = time.time()
        expired = [k for k, v in self._cache.items() if now > v.expires_at]
        for key in expired:
            del self._cache[key]
        if expired:
            logger.debug(f"Cache cleanup: removed {len(expired)} expired entries")

# Global cache instances
search_cache = SimpleCache()
route_cache = SimpleCache()

# =============================================================================
# Rate Limiting
# =============================================================================

@dataclass
class RateLimiter:
    """Per-endpoint rate limiter."""
    limit: int
    window: int = 60
    requests: dict = field(default_factory=lambda: defaultdict(list))

    def check(self, client_ip: str) -> bool:
        """Check if request is allowed. Returns True if allowed."""
        now = time.time()

        # Clean old requests
        self.requests[client_ip] = [
            req_time for req_time in self.requests[client_ip]
            if now - req_time < self.window
        ]

        # Check limit
        if len(self.requests[client_ip]) >= self.limit:
            logger.warning(f"🐢 Rate limit exceeded for {client_ip}")
            return False

        # Record request
        self.requests[client_ip].append(now)
        return True

# Global rate limiters
search_limiter = RateLimiter(limit=SEARCH_RATE_LIMIT)
route_limiter = RateLimiter(limit=ROUTE_RATE_LIMIT)

# =============================================================================
# Polyline Decoder
# =============================================================================

def decode_polyline(polyline: str, is_3d: bool = False) -> list[list[float]]:
    """
    Decode a Google-encoded polyline string into coordinates.

    Args:
        polyline: Encoded polyline string
        is_3d: Whether the polyline includes elevation (3D)

    Returns:
        List of [lng, lat] or [lng, lat, elevation] coordinates
    """
    points = []
    index = 0
    lat = 0
    lng = 0
    elevation = 0

    while index < len(polyline):
        # Decode latitude
        result = 0
        shift = 0
        while True:
            b = ord(polyline[index]) - 63
            index += 1
            result |= (b & 0x1f) << shift
            shift += 5
            if b < 0x20:
                break
        lat += (~(result >> 1)) if (result & 1) else (result >> 1)

        # Decode longitude
        result = 0
        shift = 0
        while True:
            b = ord(polyline[index]) - 63
            index += 1
            result |= (b & 0x1f) << shift
            shift += 5
            if b < 0x20:
                break
        lng += (~(result >> 1)) if (result & 1) else (result >> 1)

        # Decode elevation if 3D
        if is_3d:
            result = 0
            shift = 0
            while True:
                b = ord(polyline[index]) - 63
                index += 1
                result |= (b & 0x1f) << shift
                shift += 5
                if b < 0x20:
                    break
            elevation += (~(result >> 1)) if (result & 1) else (result >> 1)
            points.append([lng / 1e5, lat / 1e5, elevation / 100])
        else:
            points.append([lng / 1e5, lat / 1e5])

    return points

# =============================================================================
# FastAPI Application
# =============================================================================

app = FastAPI(
    title="MojiNav API",
    description="Emoji-only navigation backend",
    version="0.1.0"
)

# Configure CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_client_ip(request: Request) -> str:
    """Extract client IP from request, handling proxies."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

@app.on_event("startup")
async def startup_event():
    """Log startup information."""
    logger.info("🚀 MojiNav backend starting up...")
    if ORS_API_KEY:
        logger.info("✅ ORS_API_KEY is configured")
    else:
        logger.warning("⚠️ ORS_API_KEY is not set - routing will not work")

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    logger.debug("Health check requested")
    return {"status": "ok", "service": "mojinav-backend"}

@app.get("/")
async def root():
    """Root endpoint."""
    return {"message": "MojiNav API - See /docs for API documentation"}

# =============================================================================
# Search Endpoint
# =============================================================================

@app.get("/search")
async def search_amenities(
    request: Request,
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    amenity: str = Query(..., description="Amenity type"),
):
    """
    Search for nearby amenities using OpenStreetMap Overpass API.

    Returns up to 5 nearest amenities of the specified type.
    """
    client_ip = get_client_ip(request)
    logger.info(f"🔍 Search request: amenity={amenity}, lat={lat}, lng={lng}, ip={client_ip}")

    # Rate limiting check
    if not search_limiter.check(client_ip):
        logger.warning(f"🐢 Rate limited: {client_ip}")
        return JSONResponse(
            status_code=429,
            content={"error": "rate_limited", "emoji": "🐢"}
        )

    # Validate amenity type
    if amenity not in AMENITY_OSM_TAGS:
        logger.error(f"❌ Invalid amenity type: {amenity}")
        raise HTTPException(status_code=400, detail="Invalid amenity type")

    # Check cache
    cache_key = f"search:{amenity}:{lat:.4f}:{lng:.4f}"
    cached = search_cache.get(cache_key)
    if cached:
        logger.info(f"📦 Returning cached search results for {amenity}")
        return cached

    # Build Overpass query
    radius = AMENITY_RADIUS.get(amenity, 1000)
    tags = AMENITY_OSM_TAGS[amenity]

    # Build query parts for each tag
    query_parts = []
    for tag_key, tag_value in tags:
        if amenity == 'pizza':
            # Special case: pizza needs AND condition
            query_parts.append(f'node["amenity"="restaurant"]["cuisine"="pizza"](around:{radius},{lat},{lng});')
            query_parts.append(f'way["amenity"="restaurant"]["cuisine"="pizza"](around:{radius},{lat},{lng});')
            break
        else:
            query_parts.append(f'node["{tag_key}"="{tag_value}"](around:{radius},{lat},{lng});')
            query_parts.append(f'way["{tag_key}"="{tag_value}"](around:{radius},{lat},{lng});')

    overpass_query = f"""
    [out:json][timeout:25];
    (
        {chr(10).join(query_parts)}
    );
    out center 5;
    """

    logger.debug(f"Overpass query:\n{overpass_query}")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                OVERPASS_URL,
                data={"data": overpass_query},
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()
    except httpx.TimeoutException:
        logger.error("⏱️ Overpass API timeout")
        return JSONResponse(
            status_code=504,
            content={"error": "timeout", "emoji": "⏱️"}
        )
    except httpx.HTTPError as e:
        logger.error(f"❌ Overpass API error: {e}")
        return JSONResponse(
            status_code=502,
            content={"error": "upstream_error", "emoji": "🌐❌"}
        )

    # Parse results
    elements = data.get("elements", [])
    logger.info(f"📍 Found {len(elements)} raw results for {amenity}")

    results = []
    for element in elements[:5]:  # Limit to 5
        # Get coordinates (center for ways, direct for nodes)
        if element["type"] == "way":
            el_lat = element.get("center", {}).get("lat")
            el_lng = element.get("center", {}).get("lon")
        else:
            el_lat = element.get("lat")
            el_lng = element.get("lon")

        if el_lat is None or el_lng is None:
            continue

        # Calculate distance (simple Euclidean for sorting, real distance calculated client-side)
        dist = ((el_lat - lat) ** 2 + (el_lng - lng) ** 2) ** 0.5

        results.append({
            "id": element["id"],
            "lat": el_lat,
            "lng": el_lng,
            "tags": element.get("tags", {}),
            "distance_sort": dist,
        })

    # Sort by distance and remove sort key
    results.sort(key=lambda x: x["distance_sort"])
    for r in results:
        del r["distance_sort"]

    result = {
        "amenity": amenity,
        "count": len(results),
        "results": results,
    }

    # Cache results
    search_cache.set(cache_key, result, SEARCH_CACHE_TTL)
    logger.info(f"✅ Returning {len(results)} results for {amenity}")

    return result

# =============================================================================
# Route Endpoint
# =============================================================================

@app.get("/route")
async def get_route(
    request: Request,
    start_lat: float = Query(..., description="Start latitude"),
    start_lng: float = Query(..., description="Start longitude"),
    end_lat: float = Query(..., description="End latitude"),
    end_lng: float = Query(..., description="End longitude"),
):
    """
    Get walking directions using OpenRouteService API.

    Returns route geometry and turn-by-turn instructions.
    """
    client_ip = get_client_ip(request)
    logger.info(f"🧭 Route request: ({start_lat},{start_lng}) -> ({end_lat},{end_lng}), ip={client_ip}")

    # Rate limiting check
    if not route_limiter.check(client_ip):
        logger.warning(f"🐢 Rate limited: {client_ip}")
        return JSONResponse(
            status_code=429,
            content={"error": "rate_limited", "emoji": "🐢"}
        )

    # Check if ORS API key is configured
    if not ORS_API_KEY:
        logger.error("❌ ORS_API_KEY not configured")
        return JSONResponse(
            status_code=503,
            content={"error": "routing_unavailable", "emoji": "🔑❌"}
        )

    # Check cache
    cache_key = f"route:{start_lat:.5f}:{start_lng:.5f}:{end_lat:.5f}:{end_lng:.5f}"
    cached = route_cache.get(cache_key)
    if cached:
        logger.info("📦 Returning cached route")
        return cached

    # Request route from ORS
    headers = {
        "Authorization": ORS_API_KEY,
        "Content-Type": "application/json",
    }

    payload = {
        "coordinates": [[start_lng, start_lat], [end_lng, end_lat]],
        "instructions": True,
        "language": "en",
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                ORS_DIRECTIONS_URL,
                headers=headers,
                json=payload,
                timeout=30.0
            )

            if response.status_code == 403:
                logger.error("❌ ORS API key invalid or expired")
                return JSONResponse(
                    status_code=503,
                    content={"error": "routing_unavailable", "emoji": "🔑❌"}
                )

            response.raise_for_status()
            data = response.json()
    except httpx.TimeoutException:
        logger.error("⏱️ ORS API timeout")
        return JSONResponse(
            status_code=504,
            content={"error": "timeout", "emoji": "⏱️"}
        )
    except httpx.HTTPError as e:
        logger.error(f"❌ ORS API error: {e}")
        return JSONResponse(
            status_code=502,
            content={"error": "upstream_error", "emoji": "🌐❌"}
        )

    # Parse response
    try:
        route = data["routes"][0]
        geometry_encoded = route["geometry"]
        summary = route["summary"]
        segments = route.get("segments", [])

        # Decode polyline geometry
        coordinates = decode_polyline(geometry_encoded)

        # Extract steps with turn instructions
        steps = []
        for segment in segments:
            for step in segment.get("steps", []):
                steps.append({
                    "instruction": step.get("instruction", ""),
                    "type": step.get("type"),  # Maneuver type (0-13)
                    "distance": step.get("distance", 0),  # meters
                    "duration": step.get("duration", 0),  # seconds
                    "way_points": step.get("way_points", []),  # Indices into coordinates
                })

        result = {
            "distance": summary.get("distance", 0),  # Total distance in meters
            "duration": summary.get("duration", 0),  # Total duration in seconds
            "coordinates": coordinates,  # Decoded polyline [[lng, lat], ...]
            "steps": steps,
        }

        # Cache route
        route_cache.set(cache_key, result, ROUTE_CACHE_TTL)
        logger.info(f"✅ Route calculated: {result['distance']:.0f}m, {len(steps)} steps")

        return result

    except (KeyError, IndexError) as e:
        logger.error(f"❌ Failed to parse ORS response: {e}")
        return JSONResponse(
            status_code=502,
            content={"error": "parse_error", "emoji": "🌐❌"}
        )
