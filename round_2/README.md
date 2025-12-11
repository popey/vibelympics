# SnapScope 🔍🛡️

Security microscope for the snap ecosystem. Search for any snap package, see its security posture, and dig into the CVEs.

**No judgement, just facts.**

## What is SnapScope?

SnapScope is a security scanner for [snap packages](https://snapcraft.io/). It:

- Searches the Snap Store for any package
- Generates SBOMs (Software Bill of Materials) using [Syft](https://github.com/anchore/syft)
- Scans for vulnerabilities using [Grype](https://github.com/anchore/grype)
- Tracks Known Exploited Vulnerabilities (KEV) from CISA
- Presents the data clearly without making judgements

## Quick Start

```bash
# Start all services
docker compose up

# Access the app
open http://localhost:3000

# API available at
curl http://localhost:8000/health
```

## Architecture

- **Frontend**: React + Vite served from a [Chainguard Node](https://images.chainguard.dev/directory/image/node/versions) container
- **Backend**: FastAPI on [Chainguard Python](https://images.chainguard.dev/directory/image/python/versions)
- **Worker**: Background processor for scanning, also on Chainguard Python
- **Minio**: S3-compatible storage for SBOMs and vulnerability reports
- **Grype**: Vulnerability scanner using [Chainguard's Grype image](https://images.chainguard.dev/directory/image/grype/versions)

```
┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │
│  (React)    │     │  (FastAPI)  │
└─────────────┘     └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌─────────┐  ┌─────────┐  ┌─────────┐
        │  SQLite │  │  Minio  │  │  Worker │
        │   DB    │  │   S3    │  │ (Syft/  │
        └─────────┘  └─────────┘  │  Grype) │
                                  └─────────┘
```

## Features

### Package Search
- Autocomplete search powered by Snap Store API
- Includes both strict and classic confinement snaps
- Shows publisher verification status and star developer badges

### Security Scanning
- SBOM generation with Syft
- Vulnerability detection with Grype
- Distro-aware scanning based on snap base (core18, core20, core22, core24)
- KEV (Known Exploited Vulnerability) tracking

### Security Dashboard
- Severity breakdown (Critical/High/Medium/Low)
- KEV warnings for actively exploited vulnerabilities
- Component inventory (total/known/unknown)
- Direct links to NVD and GitHub Security Advisories

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /api/status` | System status |
| `GET /api/search?q=firefox` | Search snaps |
| `GET /api/packages/{name}` | Package info |
| `GET /api/packages/{name}/revisions` | Scanned revisions |
| `GET /api/packages/{name}/revisions/{rev}` | Revision details |
| `GET /api/packages/{name}/revisions/{rev}/vulnerabilities` | CVE list |
| `POST /api/scans/request` | Queue a scan |
| `GET /api/scans/recent` | Recently scanned |
| `GET /api/scans/queue` | Queue status |

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
# S3/Minio
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin

# Database
DATABASE_PATH=./data/snapscope.db
```

## Development

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
pip install -e .

# Run frontend (dev mode)
npm run dev

# Run backend
uvicorn backend-src.main:app --reload

# Run worker
python -m worker-src.main
```

## Built With

- [Chainguard Images](https://www.chainguard.dev/chainguard-images) - Minimal, secure container images
- [Syft](https://github.com/anchore/syft) - SBOM generator
- [Grype](https://github.com/anchore/grype) - Vulnerability scanner
- [FastAPI](https://fastapi.tiangolo.com/) - Modern Python web framework
- [React](https://react.dev/) - UI library
- [Vite](https://vitejs.dev/) - Frontend build tool

## Vibelympics

This is an entry for [Chainguard's Vibelympics](https://www.chainguard.dev/vibelympics) Round 2 - a competition where developers build apps using AI assistants.

## License

MIT