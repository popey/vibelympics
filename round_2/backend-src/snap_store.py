import httpx
import logging
from typing import Optional
from .config import settings

logger = logging.getLogger(__name__)

# Required headers for Snap Store API
SNAP_HEADERS = {
    "Snap-Device-Series": "16",
    "Content-Type": "application/json",
}


async def search_snaps(query: str, limit: int = 10) -> list[dict]:
    """
    Search for snaps in the Snap Store.
    """
    logger.info(f"Searching snap store for: {query}")

    url = f"{settings.snap_store_api}/snaps/find"
    params = {
        "q": query,
        "fields": "title,summary,publisher,media",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params, headers=SNAP_HEADERS)
            response.raise_for_status()
            data = response.json()

            results = []
            for snap in data.get("results", [])[:limit]:
                snap_data = snap.get("snap", {})
                publisher_data = snap_data.get("publisher", {})

                # Get icon URL from media
                icon_url = None
                for media in snap_data.get("media", []):
                    if media.get("type") == "icon":
                        icon_url = media.get("url")
                        break

                results.append({
                    "name": snap.get("name", ""),
                    "title": snap_data.get("title", snap.get("name", "")),
                    "summary": snap_data.get("summary", ""),
                    "icon_url": icon_url,
                    "publisher": publisher_data.get("display-name", publisher_data.get("username", "")),
                    "verified": publisher_data.get("validation") == "verified",
                    "star_developer": publisher_data.get("validation") == "starred",
                })

            logger.info(f"Found {len(results)} snaps for query: {query}")
            return results

    except httpx.HTTPError as e:
        logger.error(f"Snap store search failed: {e}")
        return []


async def get_snap_info(snap_name: str) -> Optional[dict]:
    """Get detailed info for a specific snap."""
    logger.info(f"Fetching snap info for: {snap_name}")

    url = f"{settings.snap_store_api}/snaps/info/{snap_name}"
    params = {
        "fields": "title,summary,description,publisher,media,snap-id",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params, headers=SNAP_HEADERS)

            if response.status_code == 404:
                logger.warning(f"Snap not found: {snap_name}")
                return None

            response.raise_for_status()
            data = response.json()

            snap_data = data.get("snap", {})
            publisher_data = snap_data.get("publisher", {})

            # Get icon URL from media
            icon_url = None
            for media in snap_data.get("media", []):
                if media.get("type") == "icon":
                    icon_url = media.get("url")
                    break

            return {
                "name": data.get("name", snap_name),
                "snap_id": data.get("snap-id", ""),
                "title": snap_data.get("title", snap_name),
                "summary": snap_data.get("summary", ""),
                "description": snap_data.get("description", ""),
                "icon_url": icon_url,
                "publisher": publisher_data.get("display-name", publisher_data.get("username", "")),
                "publisher_id": publisher_data.get("id", ""),
                "verified": publisher_data.get("validation") == "verified",
                "star_developer": publisher_data.get("validation") == "starred",
                "store_url": f"https://snapcraft.io/{snap_name}",
                "channel_map": data.get("channel-map", []),
            }

    except httpx.HTTPError as e:
        logger.error(f"Failed to fetch snap info: {e}")
        return None


async def get_snap_revisions(snap_name: str, architecture: str = "amd64") -> list[dict]:
    """Get available revisions for a snap."""
    logger.info(f"Fetching revisions for: {snap_name} ({architecture})")

    info = await get_snap_info(snap_name)
    if not info:
        return []

    revisions = []
    seen_revisions = set()

    for channel in info.get("channel_map", []):
        channel_info = channel.get("channel", {})
        arch = channel_info.get("architecture", "amd64")

        if arch != architecture:
            continue

        rev = channel.get("revision")
        if rev in seen_revisions:
            continue
        seen_revisions.add(rev)

        revisions.append({
            "revision": rev,
            "version": channel.get("version", ""),
            "architecture": arch,
            "base": channel.get("base"),
            "confinement": channel.get("confinement", "strict"),
            "channel": channel_info.get("name", ""),
            "released_at": channel_info.get("released-at"),
        })

    # Sort by revision number descending
    revisions.sort(key=lambda x: x["revision"], reverse=True)
    logger.info(f"Found {len(revisions)} revisions for {snap_name}")
    return revisions
