import { useState, useEffect, useCallback } from 'react'
import './App.css'

// Amenity configuration with emoji, OSM tags, and search radius
const AMENITIES = [
  { id: 'pub', emoji: '🍺', radius: 1000 },
  { id: 'cafe', emoji: '☕', radius: 800 },
  { id: 'train', emoji: '🚂', radius: 2000 },
  { id: 'pool', emoji: '🏊', radius: 2000 },
  { id: 'gym', emoji: '💪', radius: 1500 },
  { id: 'park', emoji: '🌳', radius: 1000 },
  { id: 'pizza', emoji: '🍕', radius: 1000 },
  { id: 'fastfood', emoji: '🍔', radius: 800 },
  { id: 'fuel', emoji: '⛽', radius: 2000 },
  { id: 'pharmacy', emoji: '💊', radius: 1500 },
  { id: 'atm', emoji: '🏧', radius: 1000 },
  { id: 'supermarket', emoji: '🛒', radius: 1500 },
  { id: 'toilet', emoji: '🚻', radius: 500 },
  { id: 'parking', emoji: '🅿️', radius: 800 },
  { id: 'library', emoji: '📚', radius: 2000 },
  { id: 'cinema', emoji: '🎬', radius: 2000 },
] as const

type AmenityId = typeof AMENITIES[number]['id']
type DistanceUnit = 'feet' | 'meters'

// App states
type AppView =
  | 'loading'           // Acquiring location
  | 'location_error'    // Location denied or failed
  | 'network_error'     // Backend unreachable
  | 'grid'              // Main amenity selection grid
  | 'searching'         // Searching for amenities
  | 'results'           // Showing map with results
  | 'no_results'        // No amenities found
  | 'navigating'        // Turn-by-turn navigation
  | 'arrived'           // Reached destination
  | 'settings'          // Settings panel

interface Location {
  lat: number
  lng: number
}

function App() {
  const [view, setView] = useState<AppView>('loading')
  const [location, setLocation] = useState<Location | null>(null)
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>(() => {
    const saved = localStorage.getItem('mojinav_unit')
    return (saved === 'feet' || saved === 'meters') ? saved : 'feet'
  })
  const [selectedAmenity, setSelectedAmenity] = useState<AmenityId | null>(null)

  // Save distance unit to localStorage
  useEffect(() => {
    localStorage.setItem('mojinav_unit', distanceUnit)
    console.log(`📏 Distance unit set to: ${distanceUnit}`)
  }, [distanceUnit])

  // Initialize: check backend and get location
  useEffect(() => {
    const initialize = async () => {
      console.log('🚀 MojiNav initializing...')

      // Check backend health
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

      // Request geolocation
      if (!navigator.geolocation) {
        console.error('❌ Geolocation not supported')
        setView('location_error')
        return
      }

      console.log('📍 Requesting location permission...')
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          }
          console.log('✅ Location acquired:', loc)
          setLocation(loc)
          setView('grid')
        },
        (error) => {
          console.error('❌ Location error:', error.message)
          setView('location_error')
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        }
      )
    }

    initialize()
  }, [])

  // Handle amenity selection
  const handleAmenitySelect = useCallback((amenityId: AmenityId) => {
    console.log(`🔍 Selected amenity: ${amenityId}`)
    setSelectedAmenity(amenityId)
    setView('searching')
    // TODO: Phase 3 - Connect to backend search
    // For now, simulate search and show grid again
    setTimeout(() => {
      console.log('⏳ Search would happen here...')
      setView('grid')
    }, 1500)
  }, [])

  // Retry location request
  const retryLocation = useCallback(() => {
    console.log('🔄 Retrying location request...')
    setView('loading')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const loc = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }
        console.log('✅ Location acquired:', loc)
        setLocation(loc)
        setView('grid')
      },
      (error) => {
        console.error('❌ Location error:', error.message)
        setView('location_error')
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0, // Force fresh location on retry
      }
    )
  }, [])

  // Loading state - pulsing location pin
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
          <button
            className="retry-button"
            onClick={retryLocation}
            aria-label="Retry location"
          >
            🔄
          </button>
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
          <button
            className="retry-button"
            onClick={() => window.location.reload()}
            aria-label="Retry"
          >
            🔄
          </button>
        </div>
      </div>
    )
  }

  // Searching state
  if (view === 'searching') {
    const amenity = AMENITIES.find(a => a.id === selectedAmenity)
    return (
      <div className="app-container">
        <div className="searching-container">
          <span className="searching-icon bounce">{amenity?.emoji || '🔍'}</span>
          <span className="searching-indicator spin">🔍</span>
        </div>
      </div>
    )
  }

  // Settings panel
  if (view === 'settings') {
    return (
      <div className="app-container">
        <div className="settings-container">
          <button
            className="back-button"
            onClick={() => setView('grid')}
            aria-label="Back"
          >
            ⬅️
          </button>
          <div className="settings-title">⚙️</div>
          <div className="settings-options">
            <button
              className={`unit-button ${distanceUnit === 'feet' ? 'selected' : ''}`}
              onClick={() => setDistanceUnit('feet')}
              aria-label="Feet"
            >
              🦶
            </button>
            <button
              className={`unit-button ${distanceUnit === 'meters' ? 'selected' : ''}`}
              onClick={() => setDistanceUnit('meters')}
              aria-label="Meters"
            >
              Ⓜ️
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Main grid view
  return (
    <div className="app-container">
      <button
        className="settings-button"
        onClick={() => setView('settings')}
        aria-label="Settings"
      >
        ⚙️
      </button>
      <div className="grid-container">
        {AMENITIES.map((amenity) => (
          <button
            key={amenity.id}
            className="amenity-button"
            onClick={() => handleAmenitySelect(amenity.id)}
            aria-label={amenity.id}
          >
            {amenity.emoji}
          </button>
        ))}
      </div>
      {location && (
        <div className="location-indicator">
          📍
        </div>
      )}
    </div>
  )
}

export default App
