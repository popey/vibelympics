import logging
import time
from datetime import datetime, timedelta, timezone

from .config import settings
from .database import get_db
from .scanner import process_scan
from .snap_store import get_latest_revision

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Popular snaps to seed on first run
SEED_PACKAGES = [
    "firefox",
    "spotify",
    "nextcloud",
    "vlc",
    "discord",
    "code",
    "slack",
    "chromium",
]

# Rescan interval (7 days)
RESCAN_INTERVAL_DAYS = 7


def seed_queue():
    """Seed the queue with popular packages if database is empty."""
    with get_db() as conn:
        cursor = conn.cursor()

        # Check if we have any packages
        cursor.execute("SELECT COUNT(*) FROM packages")
        pkg_count = cursor.fetchone()[0]

        if pkg_count == 0:
            logger.info("Database empty, seeding with popular packages...")
            for pkg in SEED_PACKAGES:
                cursor.execute(
                    """
                    INSERT OR IGNORE INTO scan_queue (snap_name, priority, status)
                    VALUES (?, 10, 'pending')
                    """,
                    (pkg,),
                )
            logger.info(f"Seeded queue with {len(SEED_PACKAGES)} packages")


def get_next_job() -> dict | None:
    """Get the next pending job from the queue."""
    with get_db() as conn:
        cursor = conn.cursor()

        # Get highest priority pending job
        cursor.execute(
            """
            SELECT id, snap_name, revision, architecture
            FROM scan_queue
            WHERE status = 'pending'
            ORDER BY priority DESC, created_at ASC
            LIMIT 1
            """
        )
        row = cursor.fetchone()

        if row:
            # Mark as processing
            cursor.execute(
                "UPDATE scan_queue SET status = 'processing', started_at = ? WHERE id = ?",
                (datetime.now(timezone.utc).isoformat(), row["id"]),
            )
            return {
                "id": row["id"],
                "snap_name": row["snap_name"],
                "revision": row["revision"],
                "architecture": row["architecture"],
            }

        return None


def complete_job(job_id: int, success: bool, error_message: str | None = None):
    """Mark a job as completed or failed."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE scan_queue
            SET status = ?, completed_at = ?, error_message = ?
            WHERE id = ?
            """,
            (
                "completed" if success else "failed",
                datetime.now(timezone.utc).isoformat(),
                error_message,
                job_id,
            ),
        )


def check_stale_scans():
    """Queue rescans for packages that haven't been scanned recently."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=RESCAN_INTERVAL_DAYS)
    cutoff_str = cutoff.strftime("%Y-%m-%d %H:%M:%S")

    with get_db() as conn:
        cursor = conn.cursor()

        # Find packages with outdated scans that aren't already in queue
        cursor.execute(
            """
            SELECT DISTINCT p.name
            FROM packages p
            JOIN revisions r ON r.package_id = p.id
            JOIN sboms sb ON sb.revision_id = r.id
            JOIN scans s ON s.sbom_id = sb.id
            WHERE s.scanned_at < ?
            AND NOT EXISTS (
                SELECT 1 FROM scan_queue sq
                WHERE sq.snap_name = p.name
                AND sq.status IN ('pending', 'processing')
            )
            ORDER BY s.scanned_at ASC
            LIMIT 5
            """,
            (cutoff_str,),
        )

        stale = cursor.fetchall()
        for row in stale:
            cursor.execute(
                """
                INSERT INTO scan_queue (snap_name, priority, status)
                VALUES (?, 3, 'pending')
                """,
                (row["name"],),
            )
            logger.info(f"Queued rescan for stale package: {row['name']}")


def check_new_revisions():
    """Check tracked packages for new revisions."""
    with get_db() as conn:
        cursor = conn.cursor()

        # Get packages that aren't already in queue
        cursor.execute(
            """
            SELECT p.name, MAX(r.revision) as latest_scanned
            FROM packages p
            JOIN revisions r ON r.package_id = p.id
            WHERE NOT EXISTS (
                SELECT 1 FROM scan_queue sq
                WHERE sq.snap_name = p.name
                AND sq.status IN ('pending', 'processing')
            )
            GROUP BY p.name
            LIMIT 10
            """
        )

        packages = cursor.fetchall()

    # Check each package for new revisions (outside the db transaction)
    for pkg in packages:
        try:
            rev_info = get_latest_revision(pkg["name"])
            if rev_info and rev_info["revision"] > pkg["latest_scanned"]:
                logger.info(
                    f"New revision found for {pkg['name']}: "
                    f"{rev_info['revision']} > {pkg['latest_scanned']}"
                )
                with get_db() as conn:
                    cursor = conn.cursor()
                    cursor.execute(
                        """
                        INSERT INTO scan_queue (snap_name, priority, status)
                        VALUES (?, 8, 'pending')
                        """,
                        (pkg["name"],),
                    )
        except Exception as e:
            logger.warning(f"Failed to check revision for {pkg['name']}: {e}")


def process_queue():
    """Process jobs from the queue."""
    job = get_next_job()
    if not job:
        return False

    logger.info(f"Processing job {job['id']}: {job['snap_name']}")

    try:
        success = process_scan(job["snap_name"])
        complete_job(job["id"], success)
        return True
    except Exception as e:
        logger.exception(f"Job {job['id']} failed with exception")
        complete_job(job["id"], False, str(e))
        return True


def main():
    """Main worker loop."""
    logger.info("Starting SnapScope worker...")
    logger.info(f"Database: {settings.database_path}")
    logger.info(f"S3 endpoint: {settings.s3_endpoint}")
    logger.info(f"Poll interval: {settings.poll_interval}s")

    # Give backend time to initialize database
    logger.info("Waiting for backend to initialize...")
    time.sleep(5)

    # Seed queue on first run
    seed_queue()

    logger.info("Worker ready, starting queue processing loop...")

    # Track when we last ran background tasks
    last_background_check = 0
    background_interval = 300  # Check every 5 minutes

    while True:
        try:
            # Process one job
            processed = process_queue()

            if not processed:
                # No jobs available - run background tasks if it's time
                now = time.time()
                if now - last_background_check > background_interval:
                    logger.info("Running background tasks...")
                    try:
                        check_stale_scans()
                        check_new_revisions()
                    except Exception as e:
                        logger.warning(f"Background task error: {e}")
                    last_background_check = now

                # Sleep before checking again
                time.sleep(settings.poll_interval)

        except KeyboardInterrupt:
            logger.info("Worker shutting down...")
            break
        except Exception as e:
            logger.exception(f"Error in worker loop: {e}")
            time.sleep(settings.poll_interval)


if __name__ == "__main__":
    main()
