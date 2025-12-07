"""
MojiNav Backend - Emoji Navigation API

This FastAPI backend provides:
- Search for nearby amenities via OpenStreetMap Overpass API
- Walking directions via OpenRouteService API
- In-memory caching with expiration
- Rate limiting per IP
"""

import os
import time
import hashlib
import logging
from typing import Optional
from collections import defaultdict

import httpx
import polyline
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Configure verbose logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="MojiNav API")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Environment variables
ORS_API_KEY = os.getenv("ORS_API_KEY", "")

# Amenity configuration: emoji -> (OSM tags, search radius in meters)
AMENITIES = {
    "pub": {
        "emoji": "🍺",
        "tags": ["amenity=pub", "amenity=bar"],
        "radius": 1000
    },
    "cafe": {
        "emoji": "☕",
        "tags": ["amenity=cafe"],
        "radius": 800
    },
    "train": {
        "emoji": "🚂",
        "tags": ["railway=station", "public_transport=station"],
        "radius": 2000
    },
    "pool": {
        "emoji": "🏊",
        "tags": ["leisure=swimming_pool", "amenity=swimming_pool"],
        "radius": 2000
    },
    "gym": {
        "emoji": "💪",
        "tags": ["leisure=fitness_centre", "amenity=gym"],
        "radius": 1500
    },
    "park": {
        "emoji": "🌳",
        "tags": ["leisure=park"],
        "radius": 1000
    },
    "pizza": {
        "emoji": "🍕",
        "tags": ["amenity=restaurant[cuisine=pizza]", "cuisine=pizza"],
        "radius": 1000
    },
    "fastfood": {
        "emoji": "🍔",
        "tags": ["amenity=fast_food"],
        "radius": 800
    },
    "fuel": {
        "emoji": "⛽",
        "tags": ["amenity=fuel"],
        "radius": 2000
    },
    "pharmacy": {
        "emoji": "💊",
        "tags": ["amenity=pharmacy"],
        "radius": 1500
    },
    "atm": {
        "emoji": "🏧",
        "tags": ["amenity=atm", "amenity=bank"],
        "radius": 1000
    },
    "supermarket": {
        "emoji": "🛒",
        "tags": ["shop=supermarket"],
        "radius": 1500
    },
    "toilet": {
        "emoji": "🚻",
        "tags": ["amenity=toilets"],
        "radius": 500
    },
    "parking": {
        "emoji": "🅿️",
        "tags": ["amenity=parking"],
        "radius": 800
    },
    "library": {
        "emoji": "📚",
        "tags": ["amenity=library"],
        "radius": 2000
    },
    "cinema": {
        "emoji": "🎬",
        "tags": ["amenity=cinema"],
        "radius": 2000
    }
}

# Simple in-memory cache
class Cache:
    def __init__(self):
        self._data = {}
        self._expiry = {}

    def get(self, key: str) -> Optional[dict]:
        if key in self._data:
            if time.time() < self._expiry.get(key, 0):
                logger.info(f"CACHE HIT: {key[:50]}...")
                return self._data[key]
            else:
                logger.info(f"CACHE EXPIRED: {key[:50]}...")
                del self._data[key]
                del self._expiry[key]
        logger.info(f"CACHE MISS: {key[:50]}...")
        return None

    def set(self, key: str, value: dict, ttl_seconds: int):
        self._data[key] = value
        self._expiry[key] = time.time() + ttl_seconds
        logger.info(f"CACHE SET: {key[:50]}... (TTL: {ttl_seconds}s)")

cache = Cache()

# Rate limiting
class RateLimiter:
    def __init__(self):
        self._requests = defaultdict(list)

    def is_allowed(self, ip: str, limit: int, window_seconds: int = 60) -> bool:
        now = time.time()
        # Clean old requests
        self._requests[ip] = [t for t in self._requests[ip] if now - t < window_seconds]

        if len(self._requests[ip]) >= limit:
            logger.warning(f"RATE LIMITED: {ip} ({len(self._requests[ip])} requests)")
            return False

        self._requests[ip].append(now)
        return True

rate_limiter = RateLimiter()

# Pydantic models
class SearchRequest(BaseModel):
    lat: float
    lon: float
    amenity: str

class RouteRequest(BaseModel):
    start_lat: float
    start_lon: float
    end_lat: float
    end_lon: float

class Amenity(BaseModel):
    lat: float
    lon: float
    distance: float  # in meters
    name: Optional[str] = None

class SearchResponse(BaseModel):
    emoji: str
    results: list[Amenity]

class RouteStep(BaseModel):
    instruction: str  # arrow emoji
    distance: float  # in meters
    lat: float
    lon: float

class RouteResponse(BaseModel):
    steps: list[RouteStep]
    geometry: list[list[float]]  # [[lon, lat], ...]
    total_distance: float

# Health check
@app.get("/api/health")
async def health():
    logger.info("Health check requested")
    return {"status": "ok", "emoji": "🧭"}

# Get available amenities
@app.get("/api/amenities")
async def get_amenities():
    """Return list of searchable amenities with their emojis"""
    logger.info("Amenities list requested")
    return {
        key: {"emoji": val["emoji"], "radius": val["radius"]}
        for key, val in AMENITIES.items()
    }

def build_overpass_query(lat: float, lon: float, amenity_config: dict) -> str:
    """Build Overpass QL query for the given amenity near location"""
    radius = amenity_config["radius"]
    tags = amenity_config["tags"]

    # Build union of queries for all tags
    queries = []
    for tag in tags:
        if "[" in tag:
            # Complex tag like amenity=restaurant[cuisine=pizza]
            base, filter_part = tag.split("[")
            key, value = base.split("=")
            filter_key, filter_value = filter_part.rstrip("]").split("=")
            queries.append(f'node["{key}"="{value}"]["{filter_key}"="{filter_value}"](around:{radius},{lat},{lon});')
            queries.append(f'way["{key}"="{value}"]["{filter_key}"="{filter_value}"](around:{radius},{lat},{lon});')
        else:
            key, value = tag.split("=")
            queries.append(f'node["{key}"="{value}"](around:{radius},{lat},{lon});')
            queries.append(f'way["{key}"="{value}"](around:{radius},{lat},{lon});')

    query = f"""
    [out:json][timeout:25];
    (
        {"".join(queries)}
    );
    out center 5;
    """
    return query

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points in meters"""
    import math
    R = 6371000  # Earth radius in meters

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

    return R * c

@app.post("/api/search", response_model=SearchResponse)
async def search_amenities(request: SearchRequest, req: Request):
    """Search for nearby amenities using OpenStreetMap Overpass API"""
    client_ip = req.client.host if req.client else "unknown"
    logger.info(f"Search request from {client_ip}: {request.amenity} near ({request.lat}, {request.lon})")

    # Rate limiting: 30 requests per minute
    if not rate_limiter.is_allowed(f"search:{client_ip}", limit=30):
        raise HTTPException(status_code=429, detail="🐢")

    if request.amenity not in AMENITIES:
        logger.error(f"Unknown amenity type: {request.amenity}")
        raise HTTPException(status_code=400, detail="🔍❌")

    amenity_config = AMENITIES[request.amenity]

    # Check cache (5 minute TTL for searches)
    cache_key = f"search:{request.amenity}:{request.lat:.4f}:{request.lon:.4f}"
    cached = cache.get(cache_key)
    if cached:
        return SearchResponse(**cached)

    # Build and execute Overpass query
    query = build_overpass_query(request.lat, request.lon, amenity_config)
    logger.info(f"Overpass query: {query[:200]}...")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://overpass-api.de/api/interpreter",
                data={"data": query},
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()
    except httpx.TimeoutException:
        logger.error("Overpass API timeout")
        raise HTTPException(status_code=504, detail="🌐❌")
    except Exception as e:
        logger.error(f"Overpass API error: {e}")
        raise HTTPException(status_code=502, detail="🌐❌")

    # Parse results
    elements = data.get("elements", [])
    logger.info(f"Found {len(elements)} raw results")

    results = []
    for el in elements:
        # Get coordinates (ways have center, nodes have lat/lon directly)
        if el.get("type") == "way":
            lat = el.get("center", {}).get("lat")
            lon = el.get("center", {}).get("lon")
        else:
            lat = el.get("lat")
            lon = el.get("lon")

        if lat is None or lon is None:
            continue

        distance = haversine_distance(request.lat, request.lon, lat, lon)
        name = el.get("tags", {}).get("name")

        results.append(Amenity(lat=lat, lon=lon, distance=distance, name=name))

    # Sort by distance and take top 5
    results.sort(key=lambda x: x.distance)
    results = results[:5]

    logger.info(f"Returning {len(results)} results")

    response_data = {
        "emoji": amenity_config["emoji"],
        "results": [r.model_dump() for r in results]
    }

    # Cache the response
    cache.set(cache_key, response_data, ttl_seconds=300)

    return SearchResponse(**response_data)

def map_maneuver_to_arrow(maneuver_type: int) -> str:
    """Map OpenRouteService maneuver types to arrow emojis"""
    # ORS maneuver types: https://giscience.github.io/openrouteservice/documentation/Instruction-Types.html
    mapping = {
        0: "⬆️",   # Left
        1: "⬆️",   # Right
        2: "↗️",   # Sharp left
        3: "↗️",   # Sharp right
        4: "↖️",   # Slight left
        5: "↗️",   # Slight right
        6: "⬆️",   # Straight
        7: "↩️",   # Enter roundabout
        8: "↩️",   # Exit roundabout
        9: "↩️",   # U-turn
        10: "🏁",  # Goal
        11: "⬆️",  # Depart
        12: "⬆️",  # Keep left
        13: "⬆️",  # Keep right
    }
    return mapping.get(maneuver_type, "⬆️")

def map_instruction_to_arrow(instruction_type: int) -> str:
    """Map ORS instruction types to arrow emojis - corrected mapping"""
    # Based on ORS documentation
    if instruction_type == 0:    # Turn left
        return "⬅️"
    elif instruction_type == 1:  # Turn right
        return "➡️"
    elif instruction_type == 2:  # Sharp left
        return "⬅️"
    elif instruction_type == 3:  # Sharp right
        return "➡️"
    elif instruction_type == 4:  # Slight left
        return "↖️"
    elif instruction_type == 5:  # Slight right
        return "↗️"
    elif instruction_type == 6:  # Straight
        return "⬆️"
    elif instruction_type in [7, 8]:  # Roundabout
        return "↩️"
    elif instruction_type == 9:  # U-turn
        return "↩️"
    elif instruction_type == 10: # Goal/Arrive
        return "🏁"
    elif instruction_type == 11: # Depart
        return "⬆️"
    elif instruction_type == 12: # Keep left
        return "↖️"
    elif instruction_type == 13: # Keep right
        return "↗️"
    else:
        return "⬆️"

@app.post("/api/route", response_model=RouteResponse)
async def get_route(request: RouteRequest, req: Request):
    """Get walking directions using OpenRouteService API"""
    client_ip = req.client.host if req.client else "unknown"
    logger.info(f"Route request from {client_ip}: ({request.start_lat}, {request.start_lon}) -> ({request.end_lat}, {request.end_lon})")

    # Rate limiting: 60 requests per minute
    if not rate_limiter.is_allowed(f"route:{client_ip}", limit=60):
        raise HTTPException(status_code=429, detail="🐢")

    if not ORS_API_KEY:
        logger.error("ORS_API_KEY not configured")
        raise HTTPException(status_code=500, detail="🌐❌")

    # Check cache (10 minute TTL for routes)
    cache_key = f"route:{request.start_lat:.5f}:{request.start_lon:.5f}:{request.end_lat:.5f}:{request.end_lon:.5f}"
    cached = cache.get(cache_key)
    if cached:
        return RouteResponse(**cached)

    # Call OpenRouteService
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openrouteservice.org/v2/directions/foot-walking",
                json={
                    "coordinates": [
                        [request.start_lon, request.start_lat],
                        [request.end_lon, request.end_lat]
                    ]
                },
                headers={
                    "Authorization": ORS_API_KEY,
                    "Content-Type": "application/json"
                },
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()
    except httpx.TimeoutException:
        logger.error("OpenRouteService API timeout")
        raise HTTPException(status_code=504, detail="🌐❌")
    except httpx.HTTPStatusError as e:
        logger.error(f"OpenRouteService API error: {e.response.status_code} - {e.response.text}")
        raise HTTPException(status_code=502, detail="🌐❌")
    except Exception as e:
        logger.error(f"OpenRouteService API error: {e}")
        raise HTTPException(status_code=502, detail="🌐❌")

    # Parse response
    try:
        route = data["routes"][0]
        segments = route["segments"][0]
        steps_data = segments["steps"]

        # Decode geometry - ORS returns encoded polyline
        geometry_encoded = route["geometry"]
        geometry_decoded = polyline.decode(geometry_encoded)
        # polyline returns [(lat, lon), ...] but we need [[lon, lat], ...]
        geometry = [[lon, lat] for lat, lon in geometry_decoded]

        logger.info(f"Route has {len(steps_data)} steps and {len(geometry)} geometry points")

        steps = []
        for step in steps_data:
            instruction_type = step.get("type", 6)
            arrow = map_instruction_to_arrow(instruction_type)
            distance = step.get("distance", 0)

            # Get waypoint coordinates from geometry
            way_points = step.get("way_points", [0, 0])
            geom_index = way_points[0] if way_points else 0

            if geom_index < len(geometry):
                lon, lat = geometry[geom_index]
            else:
                lon, lat = geometry[0]

            steps.append(RouteStep(
                instruction=arrow,
                distance=distance,
                lat=lat,
                lon=lon
            ))

        total_distance = segments.get("distance", 0)

        response_data = {
            "steps": [s.model_dump() for s in steps],
            "geometry": geometry,
            "total_distance": total_distance
        }

        # Cache the response
        cache.set(cache_key, response_data, ttl_seconds=600)

        return RouteResponse(**response_data)

    except (KeyError, IndexError) as e:
        logger.error(f"Failed to parse ORS response: {e}")
        logger.error(f"Response data: {data}")
        raise HTTPException(status_code=502, detail="🌐❌")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
