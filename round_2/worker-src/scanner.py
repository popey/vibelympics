import json
import logging
import os
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from .config import settings
from .database import get_db
from .s3 import upload_json, download_json
from .snap_store import get_snap_info, get_latest_revision

logger = logging.getLogger(__name__)

# Base to Ubuntu distro mapping
BASE_TO_DISTRO = {
    "core": "ubuntu:16.04",
    "core16": "ubuntu:16.04",
    "core18": "ubuntu:18.04",
    "core20": "ubuntu:20.04",
    "core22": "ubuntu:22.04",
    "core24": "ubuntu:24.04",
}

# Temp directory for storing files (inside container)
TEMP_DIR = os.environ.get("TEMP_DIR", "/tmp/snapscope")
# Host path for temp directory (for mounting into sibling containers)
HOST_TEMP_DIR = os.environ.get("HOST_TEMP_DIR", TEMP_DIR)
os.makedirs(TEMP_DIR, exist_ok=True)


def run_syft(snap_name: str) -> dict | None:
    """
    Run Syft to generate SBOM for a snap.
    Uses Anchore's Syft container image.
    """
    logger.info(f"Running Syft for snap: {snap_name}")

    try:
        # Use Anchore's Syft image via Docker (Chainguard's requires auth)
        cmd = [
            "docker", "run", "--rm",
            "anchore/syft:latest",
            f"snap:{snap_name}",
            "-o", "syft-json",
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600,  # 10 minute timeout
        )

        if result.returncode != 0:
            logger.error(f"Syft failed for {snap_name}: {result.stderr}")
            return None

        sbom = json.loads(result.stdout)
        logger.info(f"Syft completed for {snap_name}, found {len(sbom.get('artifacts', []))} artifacts")
        return sbom

    except subprocess.TimeoutExpired:
        logger.error(f"Syft timed out for {snap_name}")
        return None
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Syft output: {e}")
        return None
    except Exception as e:
        logger.error(f"Syft error for {snap_name}: {e}")
        return None


def extract_sbom_metadata(sbom: dict) -> dict:
    """Extract relevant metadata from SBOM."""
    artifacts = sbom.get("artifacts", [])
    total = len(artifacts)

    # Count known vs unknown
    known = 0
    unknown = 0
    base = None

    for artifact in artifacts:
        # Check for base in snap metadata
        if artifact.get("metadataType") == "snap-entry":
            metadata = artifact.get("metadata", {})
            if metadata.get("base"):
                base = metadata["base"]

        # Count package types
        if artifact.get("type") == "binary":
            unknown += 1
        else:
            known += 1

    # Get Syft version from descriptor
    syft_version = None
    descriptor = sbom.get("descriptor", {})
    if descriptor.get("name") == "syft":
        syft_version = descriptor.get("version")

    return {
        "total_components": total,
        "known_components": known,
        "unknown_components": unknown,
        "base": base,
        "syft_version": syft_version,
    }


def run_grype(sbom_path: str, distro: str | None = None) -> dict | None:
    """
    Run Grype against an SBOM file.
    Uses Docker to run Chainguard's Grype image.
    """
    logger.info(f"Running Grype against SBOM at {sbom_path}" + (f" with distro {distro}" if distro else ""))

    try:
        # Use host path for mounting into sibling container
        sbom_filename = os.path.basename(sbom_path)

        cmd = [
            "docker", "run", "--rm",
            "-v", f"{HOST_TEMP_DIR}:/data:ro",
            "cgr.dev/chainguard/grype:latest",
            f"sbom:/data/{sbom_filename}",
            "-o", "json",
        ]

        if distro:
            cmd.extend(["--distro", distro])

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,  # 5 minute timeout
        )

        # Grype may return non-zero when vulnerabilities are found, so check stderr
        if result.returncode != 0 and "error" in result.stderr.lower():
            logger.error(f"Grype failed: {result.stderr}")
            return None

        vuln_report = json.loads(result.stdout)
        logger.info(f"Grype completed, found {len(vuln_report.get('matches', []))} vulnerabilities")
        return vuln_report

    except subprocess.TimeoutExpired:
        logger.error("Grype timed out")
        return None
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Grype output: {e}")
        return None
    except Exception as e:
        logger.error(f"Grype error: {e}")
        return None


def parse_vulnerabilities(vuln_report: dict) -> list[dict]:
    """Parse vulnerability report into database-friendly format."""
    vulnerabilities = []

    for match in vuln_report.get("matches", []):
        vuln = match.get("vulnerability", {})
        artifact = match.get("artifact", {})
        related = match.get("relatedVulnerabilities", [])

        # Get CVSS score from related vulnerabilities if not in main vuln
        cvss_score = None
        description = None

        for rel in related:
            for cvss in rel.get("cvss", []):
                metrics = cvss.get("metrics", {})
                if metrics.get("baseScore"):
                    cvss_score = metrics["baseScore"]
                    break
            if rel.get("description"):
                description = rel["description"]
            if cvss_score:
                break

        # Check if this is a Known Exploited Vulnerability
        is_kev = bool(vuln.get("knownExploited")) or any(
            bool(r.get("knownExploited")) for r in related
        )

        # Get fix information
        fix = vuln.get("fix", {})
        fixed_versions = fix.get("versions", [])
        fixed_version = fixed_versions[0] if fixed_versions else None

        vulnerabilities.append({
            "vuln_id": vuln.get("id", ""),
            "severity": vuln.get("severity", "Unknown"),
            "cvss_score": cvss_score,
            "description": description,
            "affected_package": artifact.get("name", ""),
            "affected_version": artifact.get("version", ""),
            "fixed_version": fixed_version,
            "is_kev": is_kev,
            "data_source": vuln.get("dataSource", ""),
        })

    return vulnerabilities


def count_by_severity(vulnerabilities: list[dict]) -> dict:
    """Count vulnerabilities by severity."""
    counts = {
        "critical": 0,
        "high": 0,
        "medium": 0,
        "low": 0,
        "negligible": 0,
        "unknown": 0,
        "kev": 0,
    }

    for vuln in vulnerabilities:
        severity = vuln.get("severity", "Unknown").lower()
        if severity in counts:
            counts[severity] += 1
        else:
            counts["unknown"] += 1

        if vuln.get("is_kev"):
            counts["kev"] += 1

    return counts


def process_scan(snap_name: str) -> bool:
    """
    Process a complete scan for a snap.
    1. Get snap info from store
    2. Run Syft to generate SBOM
    3. Store SBOM in S3
    4. Run Grype for vulnerabilities
    5. Store results in database
    """
    logger.info(f"Processing scan for: {snap_name}")

    # Get snap info
    snap_info = get_snap_info(snap_name)
    if not snap_info:
        logger.error(f"Could not get snap info for {snap_name}")
        return False

    # Get latest revision info
    rev_info = get_latest_revision(snap_name)
    if not rev_info:
        logger.error(f"Could not get revision info for {snap_name}")
        return False

    logger.info(f"Scanning {snap_name} revision {rev_info['revision']} (v{rev_info['version']})")

    # Run Syft
    sbom = run_syft(snap_name)
    if not sbom:
        return False

    # Extract metadata
    sbom_meta = extract_sbom_metadata(sbom)
    base = sbom_meta.get("base") or rev_info.get("base")

    # Determine distro for Grype
    distro = BASE_TO_DISTRO.get(base) if base else None
    if base and not distro:
        logger.warning(f"Unknown base '{base}' for {snap_name}, scanning without distro")

    # Store SBOM to S3
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    sbom_key = f"{snap_name}/{rev_info['revision']}/sbom_{timestamp}.json"

    if not upload_json(settings.s3_sbom_bucket, sbom_key, sbom):
        logger.error(f"Failed to upload SBOM for {snap_name}")
        return False

    # Write SBOM to temp file for Grype (use shared temp dir for Docker access)
    sbom_temp_path = os.path.join(TEMP_DIR, f"sbom_{snap_name}_{timestamp}.json")
    with open(sbom_temp_path, 'w') as f:
        json.dump(sbom, f)

    try:
        # Run Grype
        vuln_report = run_grype(sbom_temp_path, distro)
        if not vuln_report:
            logger.error(f"Grype failed for {snap_name}")
            return False
    finally:
        # Clean up temp file
        Path(sbom_temp_path).unlink(missing_ok=True)

    # Parse vulnerabilities
    vulnerabilities = parse_vulnerabilities(vuln_report)
    severity_counts = count_by_severity(vulnerabilities)

    # Store vulnerability report to S3
    vuln_key = f"{snap_name}/{rev_info['revision']}/vulns_{timestamp}.json"
    if not upload_json(settings.s3_vuln_bucket, vuln_key, vuln_report):
        logger.warning(f"Failed to upload vulnerability report for {snap_name}")

    # Get Grype metadata
    grype_descriptor = vuln_report.get("descriptor", {})
    grype_version = grype_descriptor.get("version")
    grype_db = vuln_report.get("db", {})
    grype_db_version = grype_db.get("built")

    # Store everything in database
    with get_db() as conn:
        cursor = conn.cursor()

        # Upsert package
        cursor.execute(
            """
            INSERT INTO packages (name, title, summary, description, icon_url, publisher, publisher_id, verified, star_developer, store_url, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(name) DO UPDATE SET
                title = excluded.title,
                summary = excluded.summary,
                icon_url = excluded.icon_url,
                publisher = excluded.publisher,
                verified = excluded.verified,
                star_developer = excluded.star_developer,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                snap_name,
                snap_info.get("title", snap_name),
                snap_info.get("summary", ""),
                snap_info.get("description", ""),
                snap_info.get("icon_url"),
                snap_info.get("publisher", ""),
                snap_info.get("publisher_id", ""),
                1 if snap_info.get("verified") else 0,
                1 if snap_info.get("star_developer") else 0,
                snap_info.get("store_url", f"https://snapcraft.io/{snap_name}"),
            ),
        )

        # Get package ID
        cursor.execute("SELECT id FROM packages WHERE name = ?", (snap_name,))
        package_id = cursor.fetchone()["id"]

        # Upsert revision
        cursor.execute(
            """
            INSERT INTO revisions (package_id, revision, version, architecture, base, confinement, published_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(package_id, revision, architecture) DO UPDATE SET
                version = excluded.version,
                base = excluded.base
            """,
            (
                package_id,
                rev_info["revision"],
                rev_info["version"],
                rev_info.get("architecture", "amd64"),
                base,
                rev_info.get("confinement", "strict"),
                rev_info.get("released_at"),
            ),
        )

        # Get revision ID
        cursor.execute(
            "SELECT id FROM revisions WHERE package_id = ? AND revision = ? AND architecture = ?",
            (package_id, rev_info["revision"], rev_info.get("architecture", "amd64")),
        )
        revision_id = cursor.fetchone()["id"]

        # Insert SBOM record
        cursor.execute(
            """
            INSERT INTO sboms (revision_id, s3_path, total_components, known_components, unknown_components, syft_version)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                revision_id,
                sbom_key,
                sbom_meta["total_components"],
                sbom_meta["known_components"],
                sbom_meta["unknown_components"],
                sbom_meta.get("syft_version"),
            ),
        )
        sbom_id = cursor.lastrowid

        # Insert scan record
        cursor.execute(
            """
            INSERT INTO scans (sbom_id, s3_path, grype_version, grype_db_version, distro, critical_count, high_count, medium_count, low_count, negligible_count, unknown_count, kev_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                sbom_id,
                vuln_key,
                grype_version,
                grype_db_version,
                distro,
                severity_counts["critical"],
                severity_counts["high"],
                severity_counts["medium"],
                severity_counts["low"],
                severity_counts["negligible"],
                severity_counts["unknown"],
                severity_counts["kev"],
            ),
        )
        scan_id = cursor.lastrowid

        # Insert vulnerabilities
        for vuln in vulnerabilities:
            cursor.execute(
                """
                INSERT INTO vulnerabilities (scan_id, vuln_id, severity, cvss_score, description, affected_package, affected_version, fixed_version, is_kev, data_source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    scan_id,
                    vuln["vuln_id"],
                    vuln["severity"],
                    vuln["cvss_score"],
                    vuln["description"],
                    vuln["affected_package"],
                    vuln["affected_version"],
                    vuln["fixed_version"],
                    1 if vuln["is_kev"] else 0,
                    vuln["data_source"],
                ),
            )

    logger.info(
        f"Scan complete for {snap_name}: "
        f"{severity_counts['critical']} critical, "
        f"{severity_counts['high']} high, "
        f"{severity_counts['medium']} medium, "
        f"{severity_counts['low']} low, "
        f"{severity_counts['kev']} KEV"
    )
    return True
