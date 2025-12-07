import React, { useState, useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Amenity configuration matching backend
const AMENITIES = [
  { key: 'pub', emoji: '🍺' },
  { key: 'cafe', emoji: '☕' },
  { key: 'train', emoji: '🚂' },
  { key: 'pool', emoji: '🏊' },
  { key: 'gym', emoji: '💪' },
  { key: 'park', emoji: '🌳' },
  { key: 'pizza', emoji: '🍕' },
  { key: 'fastfood', emoji: '🍔' },
  { key: 'fuel', emoji: '⛽' },
  { key: 'pharmacy', emoji: '💊' },
  { key: 'atm', emoji: '🏧' },
  { key: 'supermarket', emoji: '🛒' },
  { key: 'toilet', emoji: '🚻' },
  { key: 'parking', emoji: '🅿️' },
  { key: 'library', emoji: '📚' },
  { key: 'cinema', emoji: '🎬' },
]

// Number to emoji mapping
const NUM_EMOJIS = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣']

// Convert number to emoji string
function numToEmoji(num) {
  const str = Math.round(num).toString()
  return str.split('').map(d => NUM_EMOJIS[parseInt(d)]).join('')
}

// Format distance with emojis
function formatDistance(meters, useFeet) {
  if (useFeet) {
    const feet = meters * 3.28084
    if (feet >= 1000) {
      const miles = feet / 5280
      return `${numToEmoji(Math.round(miles * 10) / 10)}📏`
    }
    return `${numToEmoji(Math.round(feet))}🦶`
  } else {
    if (meters >= 1000) {
      const km = meters / 1000
      return `${numToEmoji(Math.round(km * 10) / 10)}📏`
    }
    return `${numToEmoji(Math.round(meters))}Ⓜ️`
  }
}

// Create emoji icon for Leaflet
function createEmojiIcon(emoji, size = 32) {
  return L.divIcon({
    html: `<div style="font-size: ${size}px; line-height: 1; text-align: center;">${emoji}</div>`,
    className: 'emoji-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2]
  })
}

// Map controller component to update view
function MapController({ center, zoom }) {
  const map = useMap()
  useEffect(() => {
    if (center) {
      map.setView(center, zoom)
    }
  }, [center, zoom, map])
  return null
}

// Calculate distance between two points
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const phi1 = lat1 * Math.PI / 180
  const phi2 = lat2 * Math.PI / 180
  const deltaPhi = (lat2 - lat1) * Math.PI / 180
  const deltaLambda = (lon2 - lon1) * Math.PI / 180

  const a = Math.sin(deltaPhi / 2) ** 2 +
            Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

// Find minimum distance from point to polyline
function distanceToRoute(lat, lon, geometry) {
  let minDist = Infinity
  for (const [gLon, gLat] of geometry) {
    const d = haversineDistance(lat, lon, gLat, gLon)
    if (d < minDist) minDist = d
  }
  return minDist
}

// App states
const STATES = {
  LOADING_LOCATION: 'loading_location',
  LOCATION_ERROR: 'location_error',
  GRID: 'grid',
  SEARCHING: 'searching',
  SEARCH_ERROR: 'search_error',
  MAP_RESULTS: 'map_results',
  LOADING_ROUTE: 'loading_route',
  NAVIGATING: 'navigating',
  ARRIVED: 'arrived',
  SETTINGS: 'settings',
  RATE_LIMITED: 'rate_limited'
}

export default function App() {
  const [appState, setAppState] = useState(STATES.LOADING_LOCATION)
  const [userLocation, setUserLocation] = useState(null)
  const [selectedAmenity, setSelectedAmenity] = useState(null)
  const [searchResults, setSearchResults] = useState([])
  const [selectedDestination, setSelectedDestination] = useState(null)
  const [route, setRoute] = useState(null)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [useFeet, setUseFeet] = useState(() => {
    const saved = localStorage.getItem('mojinav_useFeet')
    return saved ? JSON.parse(saved) : true
  })
  const [isRecalculating, setIsRecalculating] = useState(false)

  const watchIdRef = useRef(null)
  const lastRecalcRef = useRef(0)

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('mojinav_useFeet', JSON.stringify(useFeet))
  }, [useFeet])

  // Get initial location
  useEffect(() => {
    console.log('MojiNav: Requesting geolocation...')

    if (!navigator.geolocation) {
      console.error('MojiNav: Geolocation not supported')
      setAppState(STATES.LOCATION_ERROR)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log('MojiNav: Got initial location:', position.coords.latitude, position.coords.longitude)
        setUserLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude
        })
        setAppState(STATES.GRID)
      },
      (error) => {
        console.error('MojiNav: Location error:', error.message)
        setAppState(STATES.LOCATION_ERROR)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }, [])

  // Watch position during navigation
  useEffect(() => {
    if (appState !== STATES.NAVIGATING || !route) return

    console.log('MojiNav: Starting position watch for navigation')

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const newLoc = {
          lat: position.coords.latitude,
          lon: position.coords.longitude
        }
        console.log('MojiNav: Position update:', newLoc.lat, newLoc.lon)
        setUserLocation(newLoc)
      },
      (error) => {
        console.warn('MojiNav: Position watch error:', error.message)
        // Don't fail on intermittent errors
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 1000 }
    )

    return () => {
      if (watchIdRef.current) {
        console.log('MojiNav: Clearing position watch')
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [appState, route])

  // Navigation logic
  useEffect(() => {
    if (appState !== STATES.NAVIGATING || !route || !userLocation || !selectedDestination) return

    const { lat, lon } = userLocation

    // Check if arrived at destination (within 20 meters)
    const distToDest = haversineDistance(lat, lon, selectedDestination.lat, selectedDestination.lon)
    console.log('MojiNav: Distance to destination:', distToDest.toFixed(1), 'm')

    if (distToDest < 20) {
      console.log('MojiNav: ARRIVED!')
      setAppState(STATES.ARRIVED)
      return
    }

    // Check step progression (within 6 meters of step end)
    const currentStep = route.steps[currentStepIndex]
    if (currentStep) {
      const distToStep = haversineDistance(lat, lon, currentStep.lat, currentStep.lon)
      console.log('MojiNav: Distance to step', currentStepIndex, ':', distToStep.toFixed(1), 'm')

      if (distToStep < 6 && currentStepIndex < route.steps.length - 1) {
        console.log('MojiNav: Advancing to next step')
        setCurrentStepIndex(prev => prev + 1)
      }
    }

    // Check if off-route (more than 10 meters from route)
    const distToRoute = distanceToRoute(lat, lon, route.geometry)
    console.log('MojiNav: Distance to route:', distToRoute.toFixed(1), 'm')

    if (distToRoute > 10 && !isRecalculating) {
      const now = Date.now()
      if (now - lastRecalcRef.current > 10000) {
        console.log('MojiNav: Off route, recalculating...')
        lastRecalcRef.current = now
        recalculateRoute()
      }
    }
  }, [userLocation, appState, route, currentStepIndex, selectedDestination, isRecalculating])

  // Search for amenities
  const searchAmenity = async (amenityKey) => {
    console.log('MojiNav: Searching for', amenityKey)
    setSelectedAmenity(amenityKey)
    setAppState(STATES.SEARCHING)

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: userLocation.lat,
          lon: userLocation.lon,
          amenity: amenityKey
        })
      })

      if (response.status === 429) {
        console.warn('MojiNav: Rate limited')
        setAppState(STATES.RATE_LIMITED)
        return
      }

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`)
      }

      const data = await response.json()
      console.log('MojiNav: Search results:', data.results.length)

      if (data.results.length === 0) {
        setAppState(STATES.SEARCH_ERROR)
      } else {
        setSearchResults(data.results)
        setAppState(STATES.MAP_RESULTS)
      }
    } catch (error) {
      console.error('MojiNav: Search error:', error)
      setAppState(STATES.SEARCH_ERROR)
    }
  }

  // Get route to destination
  const getRoute = async (destination) => {
    console.log('MojiNav: Getting route to', destination.lat, destination.lon)
    setSelectedDestination(destination)
    setAppState(STATES.LOADING_ROUTE)

    try {
      const response = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_lat: userLocation.lat,
          start_lon: userLocation.lon,
          end_lat: destination.lat,
          end_lon: destination.lon
        })
      })

      if (response.status === 429) {
        console.warn('MojiNav: Rate limited')
        setAppState(STATES.RATE_LIMITED)
        return
      }

      if (!response.ok) {
        throw new Error(`Route failed: ${response.status}`)
      }

      const data = await response.json()
      console.log('MojiNav: Got route with', data.steps.length, 'steps')

      setRoute(data)
      setCurrentStepIndex(0)
      setAppState(STATES.NAVIGATING)
    } catch (error) {
      console.error('MojiNav: Route error:', error)
      setAppState(STATES.SEARCH_ERROR)
    }
  }

  // Recalculate route when off-route
  const recalculateRoute = async () => {
    if (!selectedDestination || !userLocation) return

    setIsRecalculating(true)
    console.log('MojiNav: Recalculating route from current position')

    try {
      const response = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_lat: userLocation.lat,
          start_lon: userLocation.lon,
          end_lat: selectedDestination.lat,
          end_lon: selectedDestination.lon
        })
      })

      if (response.ok) {
        const data = await response.json()
        console.log('MojiNav: Recalculated route with', data.steps.length, 'steps')
        setRoute(data)
        setCurrentStepIndex(0)
      }
    } catch (error) {
      console.error('MojiNav: Recalculation error:', error)
    } finally {
      setIsRecalculating(false)
    }
  }

  // Go back to grid
  const goToGrid = () => {
    setAppState(STATES.GRID)
    setSelectedAmenity(null)
    setSearchResults([])
    setSelectedDestination(null)
    setRoute(null)
    setCurrentStepIndex(0)
  }

  // Retry location
  const retryLocation = () => {
    setAppState(STATES.LOADING_LOCATION)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude
        })
        setAppState(STATES.GRID)
      },
      () => setAppState(STATES.LOCATION_ERROR),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  // Render based on state
  const renderContent = () => {
    switch (appState) {
      case STATES.LOADING_LOCATION:
        return (
          <div className="center-screen">
            <div className="pulse">📍</div>
          </div>
        )

      case STATES.LOCATION_ERROR:
        return (
          <div className="center-screen">
            <div className="error-icon">📍🚫</div>
            <button className="emoji-button" onClick={retryLocation}>🔄</button>
          </div>
        )

      case STATES.SETTINGS:
        return (
          <div className="settings-screen">
            <button className="back-button" onClick={() => setAppState(STATES.GRID)}>⬅️</button>
            <div className="settings-content">
              <div className="setting-row">
                <button
                  className={`unit-button ${useFeet ? 'active' : ''}`}
                  onClick={() => setUseFeet(true)}
                >
                  🦶
                </button>
                <button
                  className={`unit-button ${!useFeet ? 'active' : ''}`}
                  onClick={() => setUseFeet(false)}
                >
                  Ⓜ️
                </button>
              </div>
            </div>
          </div>
        )

      case STATES.GRID:
        return (
          <div className="grid-screen">
            <button className="settings-button" onClick={() => setAppState(STATES.SETTINGS)}>⚙️</button>
            <div className="amenity-grid">
              {AMENITIES.map(({ key, emoji }) => (
                <button
                  key={key}
                  className="amenity-button"
                  onClick={() => searchAmenity(key)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )

      case STATES.SEARCHING:
        return (
          <div className="center-screen">
            <div className="search-animation">🔍</div>
          </div>
        )

      case STATES.SEARCH_ERROR:
        return (
          <div className="center-screen">
            <div className="error-icon">🔍❌</div>
            <button className="emoji-button" onClick={goToGrid}>⬅️</button>
          </div>
        )

      case STATES.RATE_LIMITED:
        return (
          <div className="center-screen">
            <div className="error-icon">🐢</div>
            <button className="emoji-button" onClick={goToGrid}>⬅️</button>
          </div>
        )

      case STATES.MAP_RESULTS:
        const amenityEmoji = AMENITIES.find(a => a.key === selectedAmenity)?.emoji || '📍'

        // Calculate bounds to fit all markers
        const allPoints = [
          [userLocation.lat, userLocation.lon],
          ...searchResults.map(r => [r.lat, r.lon])
        ]
        const bounds = L.latLngBounds(allPoints)

        return (
          <div className="map-screen">
            <button className="back-button map-back" onClick={goToGrid}>⬅️</button>
            <MapContainer
              bounds={bounds}
              boundsOptions={{ padding: [50, 50] }}
              style={{ height: '100%', width: '100%' }}
              zoomControl={false}
            >
              <TileLayer
                url="https://tiles.stadiamaps.com/tiles/stamen_toner_background/{z}/{x}/{y}{r}.png"
                attribution='<a href="https://stadiamaps.com/">©️</a>'
              />
              {/* User location */}
              <Marker
                position={[userLocation.lat, userLocation.lon]}
                icon={createEmojiIcon('📍', 40)}
              />
              {/* Results */}
              {searchResults.map((result, idx) => (
                <Marker
                  key={idx}
                  position={[result.lat, result.lon]}
                  icon={createEmojiIcon(amenityEmoji, 36)}
                  eventHandlers={{
                    click: () => getRoute(result)
                  }}
                >
                  <Popup className="emoji-popup">
                    <div className="distance-display">
                      {formatDistance(result.distance, useFeet)}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
            {/* Distance labels overlay */}
            <div className="distance-labels">
              {searchResults.map((result, idx) => (
                <div key={idx} className="distance-label">
                  {amenityEmoji} {formatDistance(result.distance, useFeet)}
                </div>
              ))}
            </div>
          </div>
        )

      case STATES.LOADING_ROUTE:
        return (
          <div className="center-screen">
            <div className="spin">🔄</div>
          </div>
        )

      case STATES.NAVIGATING:
        if (!route) return null

        const currentStep = route.steps[currentStepIndex]
        const nextStep = route.steps[currentStepIndex + 1]
        const routeLine = route.geometry.map(([lon, lat]) => [lat, lon])

        return (
          <div className="nav-screen">
            <div className="nav-map">
              <MapContainer
                center={[userLocation.lat, userLocation.lon]}
                zoom={17}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
              >
                <TileLayer
                  url="https://tiles.stadiamaps.com/tiles/stamen_toner_background/{z}/{x}/{y}{r}.png"
                  attribution='<a href="https://stadiamaps.com/">©️</a>'
                />
                <MapController center={[userLocation.lat, userLocation.lon]} zoom={17} />
                {/* Route line */}
                <Polyline positions={routeLine} color="#4285f4" weight={5} />
                {/* User position */}
                <Marker
                  position={[userLocation.lat, userLocation.lon]}
                  icon={createEmojiIcon('📍', 40)}
                />
                {/* Destination */}
                <Marker
                  position={[selectedDestination.lat, selectedDestination.lon]}
                  icon={createEmojiIcon('🏁', 36)}
                />
              </MapContainer>
              <button className="back-button map-back" onClick={goToGrid}>⬅️</button>
              {isRecalculating && (
                <div className="recalc-indicator">🔄</div>
              )}
            </div>
            <div className="nav-instructions">
              <div className="current-instruction">
                <span className="direction-arrow">{currentStep?.instruction || '⬆️'}</span>
                <span className="direction-distance">
                  {formatDistance(currentStep?.distance || 0, useFeet)}
                </span>
              </div>
              {nextStep && (
                <div className="next-instruction">
                  <span className="next-arrow">{nextStep.instruction}</span>
                  <span className="next-distance">
                    {formatDistance(nextStep.distance, useFeet)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )

      case STATES.ARRIVED:
        return (
          <div className="center-screen arrived">
            <div className="celebration">🎉</div>
            <button className="emoji-button" onClick={goToGrid}>⬅️</button>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="app">
      {renderContent()}
    </div>
  )
}
