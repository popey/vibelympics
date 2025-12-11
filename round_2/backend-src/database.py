import sqlite3
import os
import logging
from contextlib import contextmanager
from .config import settings

logger = logging.getLogger(__name__)

# Ensure data directory exists
os.makedirs(os.path.dirname(settings.database_path), exist_ok=True)


def get_connection():
    """Get a database connection with row factory."""
    conn = sqlite3.connect(settings.database_path)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def get_db():
    """Context manager for database connections."""
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


def init_db():
    """Initialize database schema."""
    logger.info(f"Initializing database at {settings.database_path}")

    with get_db() as conn:
        cursor = conn.cursor()

        # Packages table - snap metadata
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS packages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                title TEXT,
                summary TEXT,
                description TEXT,
                icon_url TEXT,
                publisher TEXT,
                publisher_id TEXT,
                verified INTEGER DEFAULT 0,
                star_developer INTEGER DEFAULT 0,
                store_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Revisions table - each revision of a snap we've scanned
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS revisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                package_id INTEGER NOT NULL,
                revision INTEGER NOT NULL,
                version TEXT,
                architecture TEXT DEFAULT 'amd64',
                base TEXT,
                confinement TEXT,
                published_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (package_id) REFERENCES packages(id),
                UNIQUE(package_id, revision, architecture)
            )
        """)

        # SBOMs table - generated SBOMs
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sboms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                revision_id INTEGER NOT NULL,
                s3_path TEXT NOT NULL,
                total_components INTEGER DEFAULT 0,
                known_components INTEGER DEFAULT 0,
                unknown_components INTEGER DEFAULT 0,
                syft_version TEXT,
                generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (revision_id) REFERENCES revisions(id)
            )
        """)

        # Scans table - vulnerability scan results
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS scans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sbom_id INTEGER NOT NULL,
                s3_path TEXT NOT NULL,
                grype_version TEXT,
                grype_db_version TEXT,
                distro TEXT,
                critical_count INTEGER DEFAULT 0,
                high_count INTEGER DEFAULT 0,
                medium_count INTEGER DEFAULT 0,
                low_count INTEGER DEFAULT 0,
                negligible_count INTEGER DEFAULT 0,
                unknown_count INTEGER DEFAULT 0,
                kev_count INTEGER DEFAULT 0,
                scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sbom_id) REFERENCES sboms(id)
            )
        """)

        # Vulnerabilities table - individual CVEs/GHSAs
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS vulnerabilities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scan_id INTEGER NOT NULL,
                vuln_id TEXT NOT NULL,
                severity TEXT,
                cvss_score REAL,
                description TEXT,
                affected_package TEXT,
                affected_version TEXT,
                fixed_version TEXT,
                is_kev INTEGER DEFAULT 0,
                data_source TEXT,
                FOREIGN KEY (scan_id) REFERENCES scans(id)
            )
        """)

        # Queue table - scan queue
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS scan_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                snap_name TEXT NOT NULL,
                revision INTEGER,
                architecture TEXT DEFAULT 'amd64',
                priority INTEGER DEFAULT 5,
                status TEXT DEFAULT 'pending',
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                started_at TIMESTAMP,
                completed_at TIMESTAMP
            )
        """)

        # Grype DB status
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS grype_status (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                db_version TEXT,
                last_updated TIMESTAMP,
                last_checked TIMESTAMP
            )
        """)

        # Create indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_packages_name ON packages(name)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_revisions_package ON revisions(package_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sboms_revision ON sboms(revision_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_scans_sbom ON scans(sbom_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_vulns_scan ON vulnerabilities(scan_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_queue_status ON scan_queue(status)")

        logger.info("Database initialized successfully")
