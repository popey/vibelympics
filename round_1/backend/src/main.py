"""
MojiNav Backend - Emoji-only navigation API

This FastAPI application provides:
- Health check endpoint
- Search for nearby amenities via OpenStreetMap Overpass API
- Walking directions via OpenRouteService API
"""

import logging
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Configure verbose logging for debugging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="MojiNav API",
    description="Emoji-only navigation backend",
    version="0.1.0"
)

# Configure CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    """Log startup information."""
    logger.info("🚀 MojiNav backend starting up...")
    ors_key = os.environ.get("ORS_API_KEY", "")
    if ors_key:
        logger.info("✅ ORS_API_KEY is configured")
    else:
        logger.warning("⚠️ ORS_API_KEY is not set - routing will not work")

@app.get("/health")
async def health_check():
    """
    Health check endpoint.
    Returns 200 OK when the service is running.
    """
    logger.debug("Health check requested")
    return {"status": "ok", "service": "mojinav-backend"}

@app.get("/")
async def root():
    """Root endpoint - redirects to health check."""
    return {"message": "MojiNav API - See /docs for API documentation"}
