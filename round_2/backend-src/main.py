import logging
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from contextlib import asynccontextmanager

from .database import init_db, get_db
from .snap_store import search_snaps, get_snap_info, get_snap_revisions
from .s3 import check_s3_connection
from .config import settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    logger.info("Starting SnapScope backend...")
    init_db()

    # Check S3 connection
    if check_s3_connection():
        logger.info("S3/Minio connection verified")
    else:
        logger.warning("S3/Minio connection failed - storage may not work")

    yield
    logger.info("Shutting down SnapScope backend...")


app = FastAPI(
    title="SnapScope API",
    description="Security microscope for the snap ecosystem",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============ Health Endpoints ============


@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/api/status")
def api_status():
    """API status with component health."""
    s3_ok = check_s3_connection()

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM packages")
        pkg_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM scans")
        scan_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM scan_queue WHERE status = 'pending'")
        queue_count = cursor.fetchone()[0]

    return {
        "status": "healthy",
        "storage": "connected" if s3_ok else "disconnected",
        "packages_tracked": pkg_count,
        "scans_completed": scan_count,
        "queue_pending": queue_count,
    }


# ============ Search Endpoints ============


@app.get("/api/search")
async def search(q: str = Query(..., min_length=1)):
    """Search for snaps in the Snap Store."""
    results = await search_snaps(q)
    return results


# ============ Package Endpoints ============


@app.get("/api/packages/{snap_name}")
async def get_package(snap_name: str):
    """Get package metadata. Fetches from store if not cached."""
    # Try database first
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM packages WHERE name = ?", (snap_name,)
        )
        row = cursor.fetchone()

        if row:
            return {
                "name": row["name"],
                "title": row["title"],
                "summary": row["summary"],
                "icon_url": row["icon_url"],
                "publisher": row["publisher"],
                "verified": bool(row["verified"]),
                "star_developer": bool(row["star_developer"]),
                "store_url": row["store_url"] or f"https://snapcraft.io/{snap_name}",
            }

    # Fetch from store
    info = await get_snap_info(snap_name)
    if not info:
        raise HTTPException(status_code=404, detail="Package not found")

    # Cache in database
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT OR REPLACE INTO packages
            (name, title, summary, description, icon_url, publisher, publisher_id, verified, star_developer, store_url, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (
                info["name"],
                info["title"],
                info["summary"],
                info.get("description", ""),
                info["icon_url"],
                info["publisher"],
                info.get("publisher_id", ""),
                1 if info["verified"] else 0,
                1 if info["star_developer"] else 0,
                info["store_url"],
            ),
        )

    return {
        "name": info["name"],
        "title": info["title"],
        "summary": info["summary"],
        "icon_url": info["icon_url"],
        "publisher": info["publisher"],
        "verified": info["verified"],
        "star_developer": info["star_developer"],
        "store_url": info["store_url"],
    }


@app.get("/api/packages/{snap_name}/revisions")
async def get_package_revisions(snap_name: str):
    """Get scanned revisions for a package."""
    with get_db() as conn:
        cursor = conn.cursor()

        # Get package ID
        cursor.execute("SELECT id FROM packages WHERE name = ?", (snap_name,))
        pkg_row = cursor.fetchone()

        if not pkg_row:
            # Package not in DB yet - return empty list
            return []

        # Get scanned revisions with vulnerability counts
        cursor.execute(
            """
            SELECT
                r.revision,
                r.version,
                r.architecture,
                r.published_at,
                s.scanned_at,
                s.critical_count,
                s.high_count,
                s.medium_count,
                s.low_count,
                s.kev_count
            FROM revisions r
            LEFT JOIN sboms sb ON sb.revision_id = r.id
            LEFT JOIN scans s ON s.sbom_id = sb.id
            WHERE r.package_id = ?
            ORDER BY r.revision DESC
            """,
            (pkg_row["id"],),
        )

        revisions = []
        for row in cursor.fetchall():
            revisions.append({
                "revision": row["revision"],
                "version": row["version"],
                "architecture": row["architecture"],
                "kev_count": row["kev_count"] or 0,
                "critical_count": row["critical_count"] or 0,
                "high_count": row["high_count"] or 0,
                "medium_count": row["medium_count"] or 0,
                "low_count": row["low_count"] or 0,
                "published_at": row["published_at"],
                "scanned_at": row["scanned_at"],
            })

        return revisions


@app.get("/api/packages/{snap_name}/revisions/{revision}")
async def get_revision_detail(snap_name: str, revision: int):
    """Get detailed scan info for a specific revision."""
    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT
                r.revision,
                r.version,
                r.architecture,
                r.base,
                r.published_at,
                sb.total_components,
                sb.known_components,
                sb.unknown_components,
                sb.syft_version,
                sb.generated_at as sbom_generated_at,
                s.grype_version,
                s.grype_db_version,
                s.distro,
                s.critical_count,
                s.high_count,
                s.medium_count,
                s.low_count,
                s.kev_count,
                s.scanned_at
            FROM packages p
            JOIN revisions r ON r.package_id = p.id
            LEFT JOIN sboms sb ON sb.revision_id = r.id
            LEFT JOIN scans s ON s.sbom_id = sb.id
            WHERE p.name = ? AND r.revision = ?
            ORDER BY s.scanned_at DESC
            LIMIT 1
            """,
            (snap_name, revision),
        )

        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Revision not found")

        return {
            "revision": row["revision"],
            "version": row["version"],
            "architecture": row["architecture"],
            "base": row["base"],
            "total_components": row["total_components"] or 0,
            "known_components": row["known_components"] or 0,
            "unknown_components": row["unknown_components"] or 0,
            "critical_count": row["critical_count"] or 0,
            "high_count": row["high_count"] or 0,
            "medium_count": row["medium_count"] or 0,
            "low_count": row["low_count"] or 0,
            "kev_count": row["kev_count"] or 0,
            "published_at": row["published_at"],
            "sbom_generated_at": row["sbom_generated_at"],
            "syft_version": row["syft_version"],
            "scanned_at": row["scanned_at"],
            "grype_db_version": row["grype_db_version"],
            "grype_version": row["grype_version"],
        }


@app.get("/api/packages/{snap_name}/revisions/{revision}/vulnerabilities")
async def get_revision_vulnerabilities(snap_name: str, revision: int):
    """Get vulnerabilities for a specific revision."""
    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT
                v.vuln_id as id,
                v.severity,
                v.cvss_score,
                v.description,
                v.affected_package,
                v.affected_version,
                v.is_kev,
                v.data_source
            FROM packages p
            JOIN revisions r ON r.package_id = p.id
            JOIN sboms sb ON sb.revision_id = r.id
            JOIN scans s ON s.sbom_id = sb.id
            JOIN vulnerabilities v ON v.scan_id = s.id
            WHERE p.name = ? AND r.revision = ?
            ORDER BY
                CASE v.severity
                    WHEN 'Critical' THEN 1
                    WHEN 'High' THEN 2
                    WHEN 'Medium' THEN 3
                    WHEN 'Low' THEN 4
                    ELSE 5
                END,
                v.is_kev DESC,
                v.cvss_score DESC
            """,
            (snap_name, revision),
        )

        vulns = []
        for row in cursor.fetchall():
            vulns.append({
                "id": row["id"],
                "severity": row["severity"],
                "cvss_score": row["cvss_score"],
                "description": row["description"],
                "affected_package": row["affected_package"],
                "affected_version": row["affected_version"],
                "is_kev": bool(row["is_kev"]),
                "data_source": row["data_source"],
            })

        return vulns


# ============ Scan Endpoints ============


class ScanRequest(BaseModel):
    packages: list[str]
    revisions: Optional[list[int]] = None


@app.post("/api/scans/request")
async def request_scan(request: ScanRequest):
    """Request a scan for one or more packages."""
    logger.info(f"Scan requested for: {request.packages}")

    with get_db() as conn:
        cursor = conn.cursor()

        queued = []
        for pkg in request.packages:
            # Check if already in queue
            cursor.execute(
                """
                SELECT id FROM scan_queue
                WHERE snap_name = ? AND status IN ('pending', 'processing')
                """,
                (pkg,),
            )

            if cursor.fetchone():
                logger.info(f"Package {pkg} already in queue")
                continue

            # Add to queue
            cursor.execute(
                """
                INSERT INTO scan_queue (snap_name, priority, status)
                VALUES (?, 5, 'pending')
                """,
                (pkg,),
            )
            queued.append(pkg)

    return {
        "message": f"Queued {len(queued)} package(s) for scanning",
        "queued": queued,
    }


@app.get("/api/scans/recent")
async def get_recent_scans(limit: int = Query(default=20, le=100)):
    """Get recently scanned packages."""
    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT
                p.name as snap_name,
                p.title,
                p.icon_url,
                r.revision as latest_revision,
                s.kev_count,
                s.critical_count,
                s.high_count,
                s.medium_count,
                s.low_count,
                s.scanned_at
            FROM packages p
            JOIN revisions r ON r.package_id = p.id
            JOIN sboms sb ON sb.revision_id = r.id
            JOIN scans s ON s.sbom_id = sb.id
            WHERE s.scanned_at = (
                SELECT MAX(s2.scanned_at)
                FROM scans s2
                JOIN sboms sb2 ON s2.sbom_id = sb2.id
                JOIN revisions r2 ON sb2.revision_id = r2.id
                WHERE r2.package_id = p.id
            )
            ORDER BY s.scanned_at DESC
            LIMIT ?
            """,
            (limit,),
        )

        results = []
        for row in cursor.fetchall():
            results.append({
                "snap_name": row["snap_name"],
                "title": row["title"],
                "icon_url": row["icon_url"],
                "latest_revision": row["latest_revision"],
                "kev_count": row["kev_count"] or 0,
                "critical_count": row["critical_count"] or 0,
                "high_count": row["high_count"] or 0,
                "medium_count": row["medium_count"] or 0,
                "low_count": row["low_count"] or 0,
                "scanned_at": row["scanned_at"],
            })

        return results


@app.get("/api/scans/queue")
async def get_queue_status():
    """Get current queue status."""
    with get_db() as conn:
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT snap_name, revision, status, created_at, error_message
            FROM scan_queue
            WHERE status IN ('pending', 'processing')
            ORDER BY priority DESC, created_at ASC
            """
        )

        queue = []
        for row in cursor.fetchall():
            queue.append({
                "snap_name": row["snap_name"],
                "revision": row["revision"],
                "status": row["status"],
                "created_at": row["created_at"],
                "error_message": row["error_message"],
            })

        return queue


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
