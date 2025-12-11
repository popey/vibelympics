# SnapScope 🔍🛡️

## The Vibe

We're building a security microscope for the snap ecosystem. Search for any snap package, see its security posture, dig into the CVEs. No judgement, just facts. Firefox has 4 high-severity vulnerabilities and 2 known exploited in the wild? Here's the data, here are the links, make your own decisions.

This is an entry for Chainguard's Vibelympics Round 2 - a competition where developers build apps without looking at the code. The AI does all the coding. You're the AI. Build something that makes security accessible.

---

## What Success Looks Like

Someone visits SnapScope wondering if their favourite snap is secure. They type "firefox" in the search box. Autocomplete suggests "Firefox" with its familiar logo. They hit enter.

The package overview loads: Firefox by Mozilla, with a verified publisher checkmark and star developer badge. A table shows all the revisions we've scanned - 7423 is the latest stable, with 0 critical, 4 high, 32 medium vulnerabilities. Two are known exploited vulnerabilities (KEV). They click revision 7423.

The detail page opens. On the left, a scrollable list of all 38 vulnerabilities, sorted by severity. Each shows the CVE ID (linked to NVD), affected package, CVSS score. The two KEVs have a warning indicator - these are actively being exploited in the wild. On the right, a "Security Summary" card shows the nutrition-label-style breakdown: component counts, vulnerability distribution, KEV count, scan timestamp.

They click a CVE link, it opens NVD in a new tab. They click "Firefox" in the header, it opens the snap store page in a new tab. Everything connects. Everything is factual. They leave informed.

---

## The Golden Rule

**Present facts, not judgement.** We don't say "this package is unsafe" or assign letter grades or traffic lights. We show the data: X vulnerabilities at Y severity, Z of which are known exploited. We link to authoritative sources. We let users draw conclusions.

Text is fine everywhere in this app - this isn't MojiNav. But every piece of data should be accurate, sourced, and linked where possible.

---

## The User Journey

### Home Page

A search box dominates the top. Placeholder text suggests examples: "Firefox, Spotify, Nextcloud". As the user types, autocomplete shows matching snaps with their logos and friendly names.

Below the search, a table of recently scanned packages. Columns: logo, friendly name (linked to package overview), latest revision scanned, KEV count, critical/high/medium/low counts, time since last scan. The table updates as new scans complete.

### Package Overview

Header shows the snap's logo (large), friendly name, publisher name, and trust badges if applicable, and blank if not. The verified publisher checkmark only appears if the publisher is actually verified - don't show anything for unverified publishers. Similarly, the star developer badge only appears for actual star developers - never show an empty badge or zero indicator.

A "View in Snap Store" link opens the store page in a new tab.

Below, a table of all revisions we've scanned for this package. Columns: revision number (linked to detail), version string, architecture, KEV count, severity breakdown, when published, when we scanned it. Sorted by revision descending (highest revision first). This historical view lets users see how the security posture has changed across revisions.

### Revision Detail

The deep dive. Header repeats the snap identity (logo, name, version, revision) with the store link.

**Left panel (scrollable):** All vulnerabilities found in this revision. Each vulnerability card shows:
- CVE or GHSA identifier (linked to NVD or GitHub Security Advisory)
- Severity badge (Critical/High/Medium/Low with appropriate colours)
- KEV warning if applicable (grype reports this in its output when a vulnerability is in CISA's Known Exploited Vulnerabilities catalog)
- CVSS score if available
- Affected package/component within the snap
- Brief description if available from the vulnerability database

Sort by severity (critical first) by default. Maybe allow sorting by CVSS score or alphabetically by CVE.

**Right panel (sticky):** The "Security Summary" card - our nutrition label. Shows:
- Total components detected by Syft
- Known components (identified packages)
- Unknown binaries (files we couldn't identify - a supply chain risk signal)
- Vulnerability breakdown with simple bar visualisation
- KEV count with warning styling if non-zero
- When this revision was published
- When we generated the SBOM, and version of Syft used
- When we last ran the vulnerability scan
- Grype database date updated used, and version of Grype used

### Error States

Package not found in snap store? Clear message, suggest checking spelling.
Package exists but geo-restricted or private? Explain we couldn't download it.
Scan in progress? Show queue position and estimated time.
Scan failed? Show what went wrong, offer retry.

---

## Technical Architecture

### Containers

**Frontend:** React with Vite, served from a Chainguard Node container. Modern, responsive, works on mobile and desktop. Communicates with backend via API.

**Backend:** FastAPI on Chainguard Python. Handles all API requests, manages the database, coordinates with the worker. Exposes endpoints for search, package data, revision data, queue status.

**Worker:** Separate Chainguard Python container. Runs background tasks: processing the scan queue (run Syft directly against snap name, store SBOM, run Grype, store results), checking for Grype database updates, polling the snap store for new revisions of tracked packages, rescanning existing SBOMs when the vulnerability database updates.

**Minio:** S3-compatible object storage for development. Stores SBOMs and vulnerability reports. In production, swap the endpoint to any S3-compatible service (AWS, Cloudflare R2, etc.) via environment variables.

**Grype:** Use Chainguard's Grype container image rather than Anchore's. Chainguard updates the vulnerability database more frequently. The worker calls out to this container (or shells out to grype binary) to perform scans.

**Syft:** Install in the worker container. Generates SBOMs by pulling snap packages directly from the store, just by specifying the snap name. Output format: syft-json.

### Data Storage

**SQLite** for relational data: snap metadata, revisions, scan records, vulnerability details, queue state. Lives in a mounted volume so it persists across container restarts.

**S3 (Minio)** for large artifacts: SBOM JSON files, vulnerability report JSON files. Referenced by path in SQLite.

Organised as:
- Bucket for SBOMs: one file per snap/revision/arch combination
- Bucket for vulnerability reports: timestamped files per snap/revision, keeping history as the database updates

### Environment Configuration

The backend and worker need:
- S3 connection details (endpoint, access key, secret key, bucket names)
- Database path
- Grype configuration (update interval, auto-update toggle)

The frontend needs:
- Just the backend API URL (can be relative in same-origin deployment)

Provide a `.env.example` with sensible defaults for local development with Minio.

---

## The Snap Store Integration

The snap store has a public API. Use it to:

**Search:** Query by name, get back matching snaps with metadata (name, title/friendly name, publisher, icon URL, verification status). **Important:** Include both strict and classic confinement in queries - add `confinement=strict,classic` as a parameter to ensure classic snaps like VS Code appear in results.

**Package details:** Get full metadata including description, publisher details, whether they're verified or a star developer.

**Revisions:** Get the list of published revisions with version strings, architectures, and publication timestamps. Queue up any previous unscanned revisions for scanning as well, at a lower priority.

Handle rate limiting gracefully. Cache metadata to avoid hammering the API. The store is fairly permissive but be a good citizen.

For architecture, default to amd64. The URL can accept a query parameter to filter by architecture for future enhancement, but start with amd64 only.

---

## The SBOM Pipeline

**Critical:** Syft can pull snaps directly from the snap store by snap name - there's no need to download the snap file first, nor specify the full url. This is cleaner, faster, and avoids storing large snap files temporarily.

When a snap revision enters the queue:

1. Run Syft directly against the snap name for that package/revision - Syft handles the download internally
2. Capture the SBOM in syft-json format
3. Parse the SBOM to extract component counts (total, known, unknown)
4. Extract the snap's base from the SBOM metadata - this indicates which Ubuntu version the snap was built on
5. Upload SBOM JSON to S3
6. Record in database: snap, revision, arch, base, sbom_path, component counts, timestamp
7. Trigger vulnerability scan, passing the base information

Syft identifies packages inside the squashfs: debs, Python packages, Node modules, Go binaries, and flags unknown executables it can't identify.

---

## The Vulnerability Pipeline

Once an SBOM exists:

1. Determine the correct distro parameter from the snap's base (stored during SBOM generation)
2. Run Grype against the SBOM with the appropriate distro flag

The snap base indicates which Ubuntu version the packages inside came from:
- core maps to Ubuntu 16.04
- core18 maps to Ubuntu 18.04  
- core20 maps to Ubuntu 20.04
- core22 maps to Ubuntu 22.04
- core24 maps to Ubuntu 24.04

Some snaps use a "bare" base which means no distro - these are harder to scan accurately and may produce less reliable results. Handle this gracefully, perhaps noting in the UI that distro detection wasn't possible.

3. Parse the vulnerability report - Grype's JSON output includes KEV (Known Exploited Vulnerability) flags directly, so we don't need to cross-reference externally
4. Upload vulnerability report JSON to S3
5. Store individual vulnerabilities in database for fast querying, including the KEV flag
6. Record scan metadata: timestamp, grype database version, distro used

The Grype database updates frequently. When it does, all existing SBOMs need rescanning. The worker tracks the database version and marks scans as stale when a newer database is available.

---

## Background Tasks

**Queue processor:** Continuously processes pending scan requests. Runs Syft directly against snap names, generates SBOM, runs vulnerability scan. Rate-limited to be kind to the snap store and not overwhelm the system. Prioritises new scans over rescans, or old revisions.

**Database update checker:** Hourly (or more frequently), checks if a new Grype database is available. If so, triggers an update and marks all existing SBOMs for rescanning.

**Rescan processor:** Works through the backlog of stale scans, regenerating vulnerability reports against updated database. Lower priority than new scans.

**Store poller:** Periodically checks the snap store for new revisions of packages we're already tracking. If a snap publishes a new revision, automatically queue it for scanning. Runs every 15-30 minutes. Prioritises new scans over rescans, or old revisions.

**Popular package seeder:** On first run (empty database), seed the queue with popular snaps: firefox, spotify, nextcloud, vlc, discord. Gives new users something to see immediately.

---

## API Endpoints

**Search and discovery:**
- Search snaps (proxies to snap store with caching, including both strict and classic confinement)
- List recently scanned packages
- List popular/featured packages

**Package data:**
- Get package metadata (friendly name, publisher, badges, logo)
- List scanned revisions for a package

**Revision data:**
- Get revision detail (SBOM stats, latest scan results)
- List all vulnerabilities for a revision
- Get scan history for a revision (if we've scanned it multiple times)

**Queue management:**
- Request scans - accepts either a single package name or an array of package names for batch processing
- Optionally specify revision number(s) to scan specific historical revisions rather than just the latest
- Check queue status for pending scans

**Health and status:**
- Health check endpoint
- Grype database version and last update time

---

## UI/UX Details

**Visual hierarchy:** Clean, professional, not flashy. Think security tool, not consumer app. But also not ugly. Modern and trustworthy.

**Colours for severity:** 
- Critical: deep red
- High: orange  
- Medium: yellow/amber
- Low: blue or grey
- KEV gets special treatment: maybe a warning icon, maybe a subtle background, something that says "pay attention to this one"

**Loading states:** Skeleton loaders or spinners. Scanning takes time; make the wait feel responsive.

**Empty states:** No results? Clear messaging. No scans yet? Suggest popular packages to try.

**Responsiveness:** Works on mobile. The nutrition label sidebar might stack below the vulnerability list on narrow screens.

**Links:** 
- Package names in lists link to package overview
- Revisions link to revision detail  
- CVE IDs link to NVD (nvd.nist.gov)
- GHSA IDs link to GitHub Security Advisories
- Package name in revision header links to snap store
- Publisher name could link to their store profile

**Logos:** Pull icon URLs from snap store API. Display at reasonable size. Have a fallback for packages without icons.

**Trust badges:** If the publisher is verified, show a checkmark badge. If they're a star developer, show a star. These come from the store API. **Important:** Only display these badges when the publisher actually has the status - never show an empty badge placeholder, zero indicator, or "not verified" text. The absence of a badge is self-explanatory.

---

## Sample Data

The `./sample_data` folder contains example SBOM and vulnerability report JSON files from Syft and Grype. These are real outputs from scanning actual snaps. Reference these to understand the structure of the data you'll be working with - field names, nesting, how KEV flags appear, where the base metadata lives, etc.

**Important:** Some of these files are very large. Don't try to ingest them fully into context. Glance at the structure, understand the schema, then work from that understanding.

---

## Development Phases

Work through these in order, committing after each. The git history tells the story.

**Phase 0 - Foundation:** Docker Compose orchestrating frontend, backend, worker, and minio. All containers start. Health endpoints respond. Minio is accessible. Hot reload works for development. Once dependencies are installed, query Tessl for tiles on FastAPI, React, and S3/Minio patterns before writing application code.

**Phase 1 - Snap Store Integration:** Backend can search the snap store (including classic confinement snaps), fetch package metadata, list revisions. Frontend has a working search box with autocomplete. Selecting a package shows its metadata (no scan data yet).

**Phase 2 - SBOM Generation:** Worker can run Syft directly against snap store URLs (no local download needed), extract the base metadata, store the SBOM in Minio, record in database. Manual trigger via API for testing - accepts single package or batch of packages, optionally with specific revision numbers.

**Phase 3 - Vulnerability Scanning:** Worker runs Grype against stored SBOMs with the correct distro parameter, stores results, records vulnerabilities (including KEV flags) in database.

**Phase 4 - Queue System:** Full queue flow works. Frontend can request a scan (single or batch), see queue status, get results when complete. Recently scanned list populates.

**Phase 5 - Package and Revision Views:** Frontend displays package overview with revision list. Revision detail shows all vulnerabilities with the nutrition label sidebar. Trust badges only appear when earned.

**Phase 6 - Background Tasks:** Database update detection, automatic rescanning, store polling for new revisions, popular package seeding.

**Phase 7 - Polish:** Error handling, loading states, empty states, mobile responsiveness, documentation.

---

## Working Style

**Be autonomous.** Make reasonable decisions without asking. If something is ambiguous, pick the sensible option and note it in a commit message.

**Start with Tessl.** Before writing code for a new component, search Tessl for relevant tiles. When you add a dependency (FastAPI, React, Minio client, whatever), immediately query Tessl for documentation and patterns for that library. The tiles contain battle-tested patterns that save time and avoid common mistakes. The project structure keeps dependencies in root-level package.json and pyproject.toml specifically so Tessl can see what's installed and find the right tiles.

**Commit often.** After each phase, after significant milestones. Judges read the git log.

**Log verbosely.** Console output is our debugging window. When something processes, log it. When something fails, log why.

---

## Project Structure

Keep it flat for Tessl compatibility:

```
round_2/
├── docker-compose.yml
├── Dockerfile.frontend
├── Dockerfile.backend
├── Dockerfile.worker
├── package.json
├── pyproject.toml
├── frontend-src/
├── backend-src/
├── worker-src/
├── sample_data/
├── data/
├── .env.example
└── README.md
```

Frontend and backend dependencies declared in root-level files so Tessl can introspect them. Source code in subdirectories. Data directory mounted as volume for SQLite persistence. Sample data for reference during development.

This structure exists specifically to enable Tessl - use it. After running `npm install` or `uv pip install`, Tessl can see your dependencies and surface relevant tiles for React, FastAPI, boto3, or whatever you've added.

---

## Chainguard Alignment

Use Chainguard container images throughout:
- `cgr.dev/chainguard/node:latest-dev` for frontend
- `cgr.dev/chainguard/python:latest-dev` for backend and worker
- `cgr.dev/chainguard/grype:latest` for vulnerability scanning

These images run as non-root by default. Handle file ownership appropriately in Dockerfiles - create directories with correct ownership before use, use --chown on COPY commands.

Mention Chainguard in the README. We're using their images, their Grype distribution, demonstrating supply chain security tooling. They'll appreciate the alignment.

---

## External Dependencies

**Snap Store API:** Public, no authentication required. Be respectful of rate limits. Remember to include both confinement types in searches. It requires "Snap-Device-Series": "16" in the headers.

**NVD / GitHub Security Advisories:** Only for linking, not API calls. CVE links go to nvd.nist.gov, GHSA links go to github.com/advisories.

**Syft:** Open source SBOM generator from Anchore. Install in worker container. Can pull snaps directly from snap store with snap name without local download.

**Grype:** Open source vulnerability scanner. Use Chainguard's container image for fresher database updates. Grype includes KEV data in its output directly - no need to fetch the CISA feed separately.

---

## Definition of Done

- `docker compose up` starts all containers cleanly
- Search finds packages in the snap store (including classic confinement snaps like Spotify)
- Selecting a package shows metadata with logo and publisher info
- Trust badges only appear when publisher is verified or star developer - never empty indicators
- Requesting a scan queues it and eventually completes (supports batch requests)
- Can request scans for specific revisions to track security changes over time
- Completed scans show vulnerability data with correct distro detection
- KEV vulnerabilities are clearly highlighted
- CVE links open NVD in new tab
- Package header links to snap store
- Recently scanned list shows recent activity
- Grype database updates are detected and trigger rescans
- New revisions of tracked packages are auto-discovered
- README explains how to run locally
- Git history shows meaningful progression

---

## Final Thought

Security tooling is often intimidating, ugly, or both. SnapScope should be approachable. Someone who's never thought about software supply chain security should be able to search for their favourite app and understand what they're looking at. The data is complex; the presentation shouldn't be.

Build something that makes security visible without making it scary.

Now go build it. 🔍
