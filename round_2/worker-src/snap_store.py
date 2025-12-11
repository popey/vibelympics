import httpx
import logging
from .config import settings

logger = logging.getLogger(__name__)

SNAP_HEADERS = {
    "Snap-Device-Series": "16",
    "Content-Type": "application/json",
}


def get_snap_info(snap_name: str) -> dict | None:
    """Get detailed info for a specific snap (synchronous)."""
    logger.info(f"Fetching snap info for: {snap_name}")

    url = f"{settings.snap_store_api}/snaps/info/{snap_name}"
    params = {
        "fields": "title,summary,description,publisher,media,snap-id,revision,version,base,confinement,channel-map",
    }

    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.get(url, params=params, headers=SNAP_HEADERS)
            logger.debug(f"Response status: {response.status_code}")

            if response.status_code == 404:
                logger.warning(f"Snap not found: {snap_name}")
                return None

            response.raise_for_status()
            data = response.json()

            snap_data = data.get("snap", {})
            publisher_data = snap_data.get("publisher", {})

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


def get_latest_revision(snap_name: str, architecture: str = "amd64") -> dict | None:
    """Get the latest revision for a snap on stable channel."""
    info = get_snap_info(snap_name)
    if not info:
        return None

    for channel in info.get("channel_map", []):
        channel_info = channel.get("channel", {})
        arch = channel_info.get("architecture", "amd64")
        channel_name = channel_info.get("name", "")

        if arch == architecture and channel_name == "stable":
            return {
                "revision": channel.get("revision"),
                "version": channel.get("version", ""),
                "architecture": arch,
                "base": channel.get("base"),
                "confinement": channel.get("confinement", "strict"),
                "released_at": channel_info.get("released-at"),
            }

    # Fallback to any channel if stable not found
    for channel in info.get("channel_map", []):
        channel_info = channel.get("channel", {})
        arch = channel_info.get("architecture", "amd64")

        if arch == architecture:
            return {
                "revision": channel.get("revision"),
                "version": channel.get("version", ""),
                "architecture": arch,
                "base": channel.get("base"),
                "confinement": channel.get("confinement", "strict"),
                "released_at": channel_info.get("released-at"),
            }

    return None
