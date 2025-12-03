# Ⓜ️🍩🌶️📍♑️🔺✌️

> **MojiNav** - An emoji-only navigation app for finding nearby places

## 🎯 What is this?

MojiNav is a navigation app that speaks exclusively in emoji. No words. No text. Just universal symbols guiding you to the nearest pub, coffee shop, train station, or toilet.

**Tap 🍺** → See nearby pubs on a map → **Tap one** → Follow emoji arrows → **Arrive** → 🎉

Built for [Chainguard's Vibelympics](https://github.com/chainguard-dev/vibelympics) - a competition where AI does all the coding.

## 🚀 Quick Start

```bash
# 1. Clone and navigate to the project
cd round_1

# 2. Create .env file with your OpenRouteService API key
cp .env.example .env
# Edit .env and add your key from https://openrouteservice.org/dev/#/signup

# 3. Start the app
docker compose up

# 4. Open in browser
open http://localhost:5173
```

## 📱 Mobile Testing

For testing on a real phone (required for geolocation over HTTPS):

```bash
# Option 1: Tailscale
tailscale up
# Access via your Tailscale hostname

# Option 2: ngrok
ngrok http 5173
# Access via the ngrok HTTPS URL
```

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   Frontend      │     │   Backend       │
│   (React/Vite)  │────▶│   (FastAPI)     │
│   Port 5173     │     │   Port 8000     │
└─────────────────┘     └─────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
      ┌───────────┐   ┌───────────┐   ┌───────────┐
      │ Overpass  │   │   ORS     │   │  Stadia   │
      │ (Search)  │   │ (Routing) │   │  (Tiles)  │
      └───────────┘   └───────────┘   └───────────┘
```

**Two containers, Chainguard base images:**
- `cgr.dev/chainguard/python:latest-dev` - FastAPI backend
- `cgr.dev/chainguard/node:latest-dev` - React/Vite frontend

## 🗺️ Amenities

| Emoji | Type | Search Radius |
|-------|------|---------------|
| 🍺 | Pubs | 1km |
| ☕ | Cafes | 800m |
| 🚂 | Train stations | 2km |
| 🏊 | Swimming pools | 2km |
| 💪 | Gyms | 1.5km |
| 🌳 | Parks | 1km |
| 🍕 | Pizza | 1km |
| 🍔 | Fast food | 800m |
| ⛽ | Petrol stations | 2km |
| 💊 | Pharmacies | 1.5km |
| 🏧 | ATMs | 1km |
| 🛒 | Supermarkets | 1.5km |
| 🚻 | Public toilets | 500m |
| 🅿️ | Parking | 800m |
| 📚 | Libraries | 2km |
| 🎬 | Cinemas | 2km |

## 🧭 Navigation Arrows

| Arrow | Meaning |
|-------|---------|
| ⬆️ | Go straight |
| ➡️ | Turn right |
| ⬅️ | Turn left |
| ↗️ | Slight right |
| ↖️ | Slight left |
| ↩️ | U-turn |
| 🏁 | Arrived! |

## ⚙️ Settings

Tap the ⚙️ in the top-right to toggle distance units:
- 🦶 = Feet (e.g., 1️⃣5️⃣0️⃣🦶)
- Ⓜ️ = Meters (e.g., 1️⃣5️⃣0️⃣Ⓜ️)

Distances over 1000 show as miles/km with 📏

## 🔧 Development

```bash
# Watch logs
docker compose logs -f

# Rebuild after Dockerfile changes
docker compose build

# Full restart
docker compose down && docker compose up
```

Hot-reload is enabled for both frontend and backend.

## 📍 API Endpoints

### Health Check
```
GET /api/health
```

### Search Amenities
```
GET /api/search?lat=51.5074&lng=-0.1278&amenity=pub
```

### Get Route
```
GET /api/route?start_lat=51.5074&start_lng=-0.1278&end_lat=51.5067&end_lng=-0.1269
```

## ⚠️ Error States

| Emoji | Meaning |
|-------|---------|
| 📍🚫 | Location denied |
| 🌐❌ | Network error |
| 🔍❌ | No results found |
| 🐢 | Rate limited |
| ⏱️ | Timeout |

## 📄 License

MIT

---

🤖 *Built with AI assistance for Chainguard Vibelympics 2024*
