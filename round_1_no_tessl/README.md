# Ⓜ️🍩🌶️📍♑️🔺✌️ MojiNav

An emoji-only navigation app. No words. Just universal symbols guiding you to the nearest pub, coffee shop, train station, or toilet.

## Quick Start

1. Copy the environment file and add your OpenRouteService API key:
   ```bash
   cp .env.example .env
   # Edit .env and add your ORS_API_KEY from https://openrouteservice.org/dev/#/signup
   ```

2. Start the app:
   ```bash
   docker compose up --build
   ```

3. Open http://localhost:5173 on your device

4. For mobile testing over HTTPS (required for geolocation), use Tailscale Funnel or ngrok:
   ```bash
   tailscale funnel 5173
   # or
   ngrok http 5173
   ```

## How It Works

1. 📍 Grant location permission
2. 🍺☕🚂🍕 Tap an amenity emoji
3. 🗺️ See the 5 nearest options on a map
4. 👆 Tap one to navigate
5. ⬆️➡️⬅️ Follow emoji arrows
6. 🎉 Celebrate when you arrive!

## Architecture

- **Frontend**: React + Vite + Leaflet
- **Backend**: FastAPI + Python
- **Data**: OpenStreetMap (via Overpass API)
- **Routing**: OpenRouteService API
- **Containers**: Chainguard base images

## Development

Hot-reload is enabled for both containers. Edit files locally and see changes instantly.

Backend logs are verbose - check `docker compose logs backend` for debugging.

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/amenities` - List available amenity types
- `POST /api/search` - Search for nearby amenities
- `POST /api/route` - Get walking directions

## Settings

Tap ⚙️ to toggle between feet (🦶) and meters (Ⓜ️).

---

Built for Chainguard's Vibelympics. 🧭
