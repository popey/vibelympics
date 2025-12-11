import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

interface SearchResult {
  name: string
  title: string
  icon_url: string | null
  publisher: string
  verified: boolean
  star_developer: boolean
}

function SearchBox() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }

    const timeoutId = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
        if (res.ok) {
          const data = await res.json()
          setResults(data)
          setShowResults(true)
          setSelectedIndex(-1)
        }
      } catch (err) {
        console.error('Search failed:', err)
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [query])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIndex >= 0 && results[selectedIndex]) {
        navigate(`/package/${results[selectedIndex].name}`)
      } else if (query.trim()) {
        navigate(`/package/${query.trim().toLowerCase()}`)
      }
    } else if (e.key === 'Escape') {
      setShowResults(false)
    }
  }

  const handleSelect = (name: string) => {
    navigate(`/package/${name}`)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search snaps... (Firefox, Spotify, Nextcloud)"
          style={{
            fontSize: '1.125rem',
            padding: '1rem 1.25rem',
            paddingRight: '3rem'
          }}
        />
        {loading && (
          <div
            className="spinner"
            style={{
              position: 'absolute',
              right: '1rem',
              top: '50%',
              transform: 'translateY(-50%)',
              width: 20,
              height: 20
            }}
          />
        )}
      </div>

      {showResults && results.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: '0.5rem',
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          overflow: 'hidden',
          zIndex: 50,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }}>
          {results.map((result, index) => (
            <div
              key={result.name}
              onClick={() => handleSelect(result.name)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                cursor: 'pointer',
                background: index === selectedIndex ? 'var(--color-bg-tertiary)' : 'transparent'
              }}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              {result.icon_url ? (
                <img
                  src={result.icon_url}
                  alt=""
                  style={{ width: 32, height: 32, borderRadius: 4 }}
                />
              ) : (
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: 4,
                  background: 'var(--color-bg-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1rem'
                }}>
                  📦
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{result.title || result.name}</div>
                <div style={{
                  fontSize: '0.875rem',
                  color: 'var(--color-text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span>{result.publisher}</span>
                  {result.verified && (
                    <span className="trust-badge" title="Verified Publisher">✓</span>
                  )}
                  {result.star_developer && (
                    <span className="trust-badge" title="Star Developer" style={{ color: '#fbbf24' }}>★</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default SearchBox
