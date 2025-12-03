import { useState, useEffect, useCallback, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

// =============================================================================
// Constants & Types
// =============================================================================

const AMENITIES = [
  { id: 'pub', emoji: '🍺' },
  { id: 'cafe', emoji: '☕' },
  { id: 'train', emoji: '🚂' },
  { id: 'pool', emoji: '🏊' },
  { id: 'gym', emoji: '💪' },
  { id: 'park', emoji: '🌳' },
  { id: 'pizza', emoji: '🍕' },
  { id: 'fastfood', emoji: '🍔' },
  { id: 'fuel', emoji: '⛽' },
  { id: 'pharmacy', emoji: '💊' },
  { id: 'atm', emoji: '🏧' },
  { id: 'supermarket', emoji: '🛒' },
  { id: 'toilet', emoji: '🚻' },
  { id: 'parking', emoji: '🅿️' },
  { id: 'library', emoji: '📚' },
  { id: 'cinema', emoji: '🎬' },
] as const

type AmenityId = typeof AMENITIES[number]['id']
type DistanceUnit = 'feet' | 'meters'

type AppView =
  | 'loading'
  | 'location_error'
  | 'network_error'
  | 'rate_limited'
  | 'grid'
  | 'searching'
  | 'results'
  | 'no_results'
  | 'navigating'
  | 'recalculating'
  | 'arrived'
  | 'settings'

interface Location {
  lat: number
  lng: number
}

interface SearchResult {
  id: number
  lat: number
  lng: number
  tags: Record<string, string>
}

interface RouteStep {
  instruction: string
  type: number
  distance: number
  duration: number
  way_points: number[]
}

interface Route {
  distance: number
  duration: number
  coordinates: [number, number][]
  steps: RouteStep[]
}

// Maneuver type to arrow emoji mapping
const MANEUVER_ARROWS: Record<number, string> = {
  0: '⬅️',   // Left
  1: '➡️',   // Right
  2: '↗️',   // Slight right
  3: '↖️',   // Slight left
  4: '➡️',   // Sharp right
  5: '⬅️',   // Sharp left
  6: '⬆️',   // Straight
  7: '↩️',   // U-turn
  8: '↩️',   // U-turn
  9: '↩️',   // U-turn
  10: '🏁',  // Arrive
  11: '⬆️',  // Depart/Head
  12: '⬆️',  // Keep
  13: '⬆️',  // Keep
}

// Emoji number mapping
const DIGIT_EMOJIS = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣']

// =============================================================================
// Utility Functions
// =============================================================================

function createEmojiIcon(emoji: string, size: number = 32): L.DivIcon {
  return L.divIcon({
    html: `<span style="font-size: ${size}px; line-height: 1;">${emoji}</span>`,
    className: 'emoji-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function formatDistance(meters: number, unit: DistanceUnit): string {
  let value: number
  let suffix: string

  if (unit === 'feet') {
    const feet = meters * 3.28084
    if (feet >= 1000) {
      // Convert to miles
      value = Math.round((feet / 5280) * 10) / 10
      suffix = '📏'
    } else {
      value = Math.round(feet)
      suffix = '🦶'
    }
  } else {
    if (meters >= 1000) {
      // Convert to km
      value = Math.round((meters / 1000) * 10) / 10
      suffix = '📏'
    } else {
      value = Math.round(meters)
      suffix = 'Ⓜ️'
    }
  }

  // Convert number to emoji digits
  const digits = value.toString().split('').map(char => {
    if (char === '.') return '.'
    return DIGIT_EMOJIS[parseInt(char)] || char
  }).join('')

  return digits + suffix
}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  // Haversine formula for distance in meters
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// =============================================================================
// Map Components
// =============================================================================

function MapUpdater({ center, zoom }: { center: [number, number]; zoom?: number }) {
  const map = useMap()
  useEffect(() => {
    if (zoom) {
      map.setView(center, zoom)
    } else {
      map.setView(center)
    }
  }, [center, zoom, map])
  return null
}

function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression }) {
  const map = useMap()
  useEffect(() => {
    map.fitBounds(bounds, { padding: [50, 50] })
  }, [bounds, map])
  return null
}

// =============================================================================
// Main App
// =============================================================================

function App() {
  const [view, setView] = useState<AppView>('loading')
  const [location, setLocation] = useState<Location | null>(null)
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>(() => {
    const saved = localStorage.getItem('mojinav_unit')
    return (saved === 'feet' || saved === 'meters') ? saved : 'feet'
  })
  const [selectedAmenity, setSelectedAmenity] = useState<AmenityId | null>(null)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [selectedDestination, setSelectedDestination] = useState<SearchResult | null>(null)
  const [route, setRoute] = useState<Route | null>(null)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)

  const watchIdRef = useRef<number | null>(null)
  const lastRecalcTimeRef = useRef<number>(0)

  // Save distance unit to localStorage
  useEffect(() => {
    localStorage.setItem('mojinav_unit', distanceUnit)
    console.log(`📏 Distance unit set to: ${distanceUnit}`)
  }, [distanceUnit])

  // Initialize: check backend and get location
  useEffect(() => {
    const initialize = async () => {
      console.log('🚀 MojiNav initializing...')

      try {
        const response = await fetch('/api/health')
        if (!response.ok) {
          console.error('❌ Backend unhealthy:', response.status)
          setView('network_error')
          return
        }
        console.log('✅ Backend healthy')
      } catch (error) {
        console.error('❌ Backend connection failed:', error)
        setView('network_error')
        return
      }

      if (!navigator.geolocation) {
        console.error('❌ Geolocation not supported')
        setView('location_error')
        return
      }

      console.log('📍 Requesting location permission...')
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc = { lat: position.coords.latitude, lng: position.coords.longitude }
          console.log('✅ Location acquired:', loc)
          setLocation(loc)
          setView('grid')
        },
        (error) => {
          console.error('❌ Location error:', error.message)
          setView('location_error')
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      )
    }

    initialize()
  }, [])

  // Cleanup position watcher
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [])

  // Search for amenities
  const handleAmenitySelect = useCallback(async (amenityId: AmenityId) => {
    if (!location) return

    console.log(`🔍 Searching for: ${amenityId}`)
    setSelectedAmenity(amenityId)
    setView('searching')

    try {
      const response = await fetch(
        `/api/search?lat=${location.lat}&lng=${location.lng}&amenity=${amenityId}`
      )

      if (response.status === 429) {
        console.warn('🐢 Rate limited')
        setView('rate_limited')
        return
      }

      if (!response.ok) {
        console.error('❌ Search failed:', response.status)
        setView('network_error')
        return
      }

      const data = await response.json()
      console.log(`📍 Found ${data.count} results`)

      if (data.count === 0) {
        setView('no_results')
        return
      }

      setSearchResults(data.results)
      setView('results')
    } catch (error) {
      console.error('❌ Search error:', error)
      setView('network_error')
    }
  }, [location])

  // Select a destination and get route
  const handleDestinationSelect = useCallback(async (result: SearchResult) => {
    if (!location) return

    console.log(`🎯 Selected destination: ${result.id}`)
    setSelectedDestination(result)
    setView('searching')

    try {
      const response = await fetch(
        `/api/route?start_lat=${location.lat}&start_lng=${location.lng}&end_lat=${result.lat}&end_lng=${result.lng}`
      )

      if (response.status === 429) {
        console.warn('🐢 Rate limited')
        setView('rate_limited')
        return
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        console.error('❌ Route failed:', response.status, data)
        setView('network_error')
        return
      }

      const routeData: Route = await response.json()
      console.log(`🧭 Route: ${routeData.distance}m, ${routeData.steps.length} steps`)

      setRoute(routeData)
      setCurrentStepIndex(0)
      setView('navigating')

      // Start watching position
      startPositionWatch(result, routeData)
    } catch (error) {
      console.error('❌ Route error:', error)
      setView('network_error')
    }
  }, [location])

  // Position watching for navigation
  const startPositionWatch = useCallback((destination: SearchResult, currentRoute: Route) => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const newLoc = { lat: position.coords.latitude, lng: position.coords.longitude }
        setLocation(newLoc)

        // Check if arrived (within 20m of destination)
        const distToDest = calculateDistance(newLoc.lat, newLoc.lng, destination.lat, destination.lng)
        if (distToDest < 20) {
          console.log('🎉 Arrived at destination!')
          if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current)
            watchIdRef.current = null
          }
          setView('arrived')
          return
        }

        // Check for step progression (within 6m of step end)
        setCurrentStepIndex((prevIndex) => {
          const step = currentRoute.steps[prevIndex]
          if (step && step.way_points.length > 1) {
            const endIdx = step.way_points[step.way_points.length - 1]
            const endCoord = currentRoute.coordinates[endIdx]
            if (endCoord) {
              const distToStep = calculateDistance(newLoc.lat, newLoc.lng, endCoord[1], endCoord[0])
              if (distToStep < 6 && prevIndex < currentRoute.steps.length - 1) {
                console.log(`📍 Advancing to step ${prevIndex + 1}`)
                return prevIndex + 1
              }
            }
          }
          return prevIndex
        })

        // Check if off-route (simple distance from line - could be improved)
        const nearestDist = findNearestDistanceToRoute(newLoc, currentRoute.coordinates)
        if (nearestDist > 30) {
          const now = Date.now()
          if (now - lastRecalcTimeRef.current > 10000) {
            console.log('🔄 Off-route, recalculating...')
            lastRecalcTimeRef.current = now
            setView('recalculating')
            // Recalculate route
            recalculateRoute(newLoc, destination)
          }
        }
      },
      (error) => {
        console.warn('📍 Position error:', error.message)
        // Don't show error for intermittent failures
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    )
  }, [])

  const findNearestDistanceToRoute = (loc: Location, coords: [number, number][]): number => {
    let minDist = Infinity
    for (const coord of coords) {
      const dist = calculateDistance(loc.lat, loc.lng, coord[1], coord[0])
      if (dist < minDist) minDist = dist
    }
    return minDist
  }

  const recalculateRoute = async (currentLoc: Location, destination: SearchResult) => {
    try {
      const response = await fetch(
        `/api/route?start_lat=${currentLoc.lat}&start_lng=${currentLoc.lng}&end_lat=${destination.lat}&end_lng=${destination.lng}`
      )

      if (response.ok) {
        const routeData: Route = await response.json()
        console.log(`🧭 Route recalculated: ${routeData.distance}m`)
        setRoute(routeData)
        setCurrentStepIndex(0)
        setView('navigating')
      } else {
        console.error('❌ Recalculation failed')
        setView('navigating')
      }
    } catch (error) {
      console.error('❌ Recalculation error:', error)
      setView('navigating')
    }
  }

  // Go back to grid
  const goBack = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setSearchResults([])
    setSelectedDestination(null)
    setRoute(null)
    setSelectedAmenity(null)
    setView('grid')
  }, [])

  // Retry location
  const retryLocation = useCallback(() => {
    setView('loading')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const loc = { lat: position.coords.latitude, lng: position.coords.longitude }
        setLocation(loc)
        setView('grid')
      },
      () => setView('location_error'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }, [])

  // =============================================================================
  // Render Views
  // =============================================================================

  // Loading
  if (view === 'loading') {
    return (
      <div className="app-container">
        <div className="loading-indicator">
          <span className="pulse">📍</span>
        </div>
      </div>
    )
  }

  // Location error
  if (view === 'location_error') {
    return (
      <div className="app-container">
        <div className="error-container">
          <span className="error-icon">📍🚫</span>
          <button className="retry-button" onClick={retryLocation}>🔄</button>
        </div>
      </div>
    )
  }

  // Network error
  if (view === 'network_error') {
    return (
      <div className="app-container">
        <div className="error-container">
          <span className="error-icon">🌐❌</span>
          <button className="retry-button" onClick={() => window.location.reload()}>🔄</button>
        </div>
      </div>
    )
  }

  // Rate limited
  if (view === 'rate_limited') {
    return (
      <div className="app-container">
        <div className="error-container">
          <span className="error-icon">🐢</span>
          <button className="retry-button" onClick={goBack}>⬅️</button>
        </div>
      </div>
    )
  }

  // Searching
  if (view === 'searching' || view === 'recalculating') {
    const amenity = AMENITIES.find(a => a.id === selectedAmenity)
    return (
      <div className="app-container">
        <div className="searching-container">
          <span className="searching-icon bounce">{amenity?.emoji || '🔍'}</span>
          <span className="searching-indicator spin">
            {view === 'recalculating' ? '🔄' : '🔍'}
          </span>
        </div>
      </div>
    )
  }

  // No results
  if (view === 'no_results') {
    return (
      <div className="app-container">
        <div className="error-container">
          <span className="error-icon">🔍❌</span>
          <button className="retry-button" onClick={goBack}>⬅️</button>
        </div>
      </div>
    )
  }

  // Settings
  if (view === 'settings') {
    return (
      <div className="app-container">
        <div className="settings-container">
          <button className="back-button" onClick={() => setView('grid')}>⬅️</button>
          <div className="settings-title">⚙️</div>
          <div className="settings-options">
            <button
              className={`unit-button ${distanceUnit === 'feet' ? 'selected' : ''}`}
              onClick={() => setDistanceUnit('feet')}
            >
              🦶
            </button>
            <button
              className={`unit-button ${distanceUnit === 'meters' ? 'selected' : ''}`}
              onClick={() => setDistanceUnit('meters')}
            >
              Ⓜ️
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Arrived celebration
  if (view === 'arrived') {
    return (
      <div className="app-container celebration">
        <span className="celebration-emoji">🎉</span>
        <button className="retry-button" onClick={goBack}>🏠</button>
      </div>
    )
  }

  // Results map view
  if (view === 'results' && location && searchResults.length > 0) {
    const amenity = AMENITIES.find(a => a.id === selectedAmenity)
    const bounds: [number, number][] = [
      [location.lat, location.lng],
      ...searchResults.map(r => [r.lat, r.lng] as [number, number])
    ]

    return (
      <div className="map-view">
        <button className="map-back-button" onClick={goBack}>⬅️</button>
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className="copyright-button"
        >
          ©️
        </a>
        <MapContainer
          center={[location.lat, location.lng]}
          zoom={15}
          className="map-container"
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer
            url="https://tiles.stadiamaps.com/tiles/stamen_toner_background/{z}/{x}/{y}{r}.png"
          />
          <FitBounds bounds={bounds} />

          {/* User location */}
          <Marker position={[location.lat, location.lng]} icon={createEmojiIcon('📍', 40)}>
            <Popup>📍</Popup>
          </Marker>

          {/* Search results */}
          {searchResults.map((result) => {
            const dist = calculateDistance(location.lat, location.lng, result.lat, result.lng)
            return (
              <Marker
                key={result.id}
                position={[result.lat, result.lng]}
                icon={createEmojiIcon(amenity?.emoji || '📍', 36)}
                eventHandlers={{
                  click: () => handleDestinationSelect(result)
                }}
              >
                <Popup className="emoji-popup">
                  <div className="marker-popup">
                    <span className="popup-emoji">{amenity?.emoji}</span>
                    <span className="popup-distance">{formatDistance(dist, distanceUnit)}</span>
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>
      </div>
    )
  }

  // Navigation view
  if (view === 'navigating' && location && route && selectedDestination) {
    const amenity = AMENITIES.find(a => a.id === selectedAmenity)
    const currentStep = route.steps[currentStepIndex]
    const nextStep = route.steps[currentStepIndex + 1]
    const arrow = MANEUVER_ARROWS[currentStep?.type ?? 6] || '⬆️'
    const routeCoords = route.coordinates.map(c => [c[1], c[0]] as [number, number])

    return (
      <div className="navigation-view">
        <button className="map-back-button" onClick={goBack}>⬅️</button>
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className="copyright-button"
        >
          ©️
        </a>

        <div className="nav-map-section">
          <MapContainer
            center={[location.lat, location.lng]}
            zoom={17}
            className="map-container"
            zoomControl={false}
            attributionControl={false}
          >
            <TileLayer
              url="https://tiles.stadiamaps.com/tiles/stamen_toner_background/{z}/{x}/{y}{r}.png"
            />
            <MapUpdater center={[location.lat, location.lng]} />

            {/* Route line */}
            <Polyline positions={routeCoords} color="#4CAF50" weight={5} opacity={0.8} />

            {/* User location */}
            <Marker position={[location.lat, location.lng]} icon={createEmojiIcon('📍', 40)} />

            {/* Destination */}
            <Marker
              position={[selectedDestination.lat, selectedDestination.lng]}
              icon={createEmojiIcon(amenity?.emoji || '🏁', 36)}
            />
          </MapContainer>
        </div>

        <div className="nav-instructions">
          <div className="current-instruction">
            <span className="instruction-arrow">{arrow}</span>
            <span className="instruction-distance">
              {formatDistance(currentStep?.distance || 0, distanceUnit)}
            </span>
          </div>
          {nextStep && (
            <div className="next-instruction">
              <span className="next-arrow">{MANEUVER_ARROWS[nextStep.type] || '⬆️'}</span>
              <span className="next-distance">
                {formatDistance(nextStep.distance, distanceUnit)}
              </span>
            </div>
          )}
          <div className="total-distance">
            {formatDistance(route.distance, distanceUnit)}
          </div>
        </div>
      </div>
    )
  }

  // Main grid view
  return (
    <div className="app-container">
      <button className="settings-button" onClick={() => setView('settings')}>⚙️</button>
      <div className="grid-container">
        {AMENITIES.map((amenity) => (
          <button
            key={amenity.id}
            className="amenity-button"
            onClick={() => handleAmenitySelect(amenity.id)}
          >
            {amenity.emoji}
          </button>
        ))}
      </div>
      {location && <div className="location-indicator">📍</div>}
    </div>
  )
}

export default App
