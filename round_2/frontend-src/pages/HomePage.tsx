import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import SearchBox from '../components/SearchBox'

interface RecentScan {
  snap_name: string
  title: string
  icon_url: string | null
  latest_revision: number
  kev_count: number
  critical_count: number
  high_count: number
  medium_count: number
  low_count: number
  scanned_at: string
}

function HomePage() {
  const [recentScans, setRecentScans] = useState<RecentScan[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRecentScans()
  }, [])

  const fetchRecentScans = async () => {
    try {
      const res = await fetch('/api/scans/recent')
      if (res.ok) {
        const data = await res.json()
        setRecentScans(data)
      }
    } catch (err) {
      console.error('Failed to fetch recent scans:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  return (
    <div className="container">
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>
          Snap Package Security Scanner
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.125rem', maxWidth: '600px', margin: '0 auto' }}>
          Search for any snap package, see its security posture, and dig into the CVEs.
          No judgement, just facts.
        </p>
      </div>

      <div style={{ maxWidth: '600px', margin: '0 auto 3rem' }}>
        <SearchBox />
      </div>

      <div className="card">
        <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>Recently Scanned</h2>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton" style={{ height: '48px' }} />
            ))}
          </div>
        ) : recentScans.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)', padding: '2rem', textAlign: 'center' }}>
            No scans yet. Try searching for a snap like Firefox, Spotify, or Nextcloud!
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '40%' }}>Package</th>
                <th>Revision</th>
                <th>KEV</th>
                <th>Critical</th>
                <th>High</th>
                <th>Medium</th>
                <th>Low</th>
                <th>Scanned</th>
              </tr>
            </thead>
            <tbody>
              {recentScans.map(scan => (
                <tr key={scan.snap_name}>
                  <td>
                    <Link
                      to={`/package/${scan.snap_name}`}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                    >
                      {scan.icon_url ? (
                        <img
                          src={scan.icon_url}
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
                      <span>{scan.title || scan.snap_name}</span>
                    </Link>
                  </td>
                  <td>{scan.latest_revision}</td>
                  <td>
                    {scan.kev_count > 0 ? (
                      <span className="badge badge-kev">{scan.kev_count}</span>
                    ) : (
                      <span style={{ color: 'var(--color-text-secondary)' }}>0</span>
                    )}
                  </td>
                  <td>
                    {scan.critical_count > 0 ? (
                      <span className="badge badge-critical">{scan.critical_count}</span>
                    ) : (
                      <span style={{ color: 'var(--color-text-secondary)' }}>0</span>
                    )}
                  </td>
                  <td>
                    {scan.high_count > 0 ? (
                      <span className="badge badge-high">{scan.high_count}</span>
                    ) : (
                      <span style={{ color: 'var(--color-text-secondary)' }}>0</span>
                    )}
                  </td>
                  <td>
                    {scan.medium_count > 0 ? (
                      <span className="badge badge-medium">{scan.medium_count}</span>
                    ) : (
                      <span style={{ color: 'var(--color-text-secondary)' }}>0</span>
                    )}
                  </td>
                  <td>
                    {scan.low_count > 0 ? (
                      <span className="badge badge-low">{scan.low_count}</span>
                    ) : (
                      <span style={{ color: 'var(--color-text-secondary)' }}>0</span>
                    )}
                  </td>
                  <td style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                    {formatTimeAgo(scan.scanned_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default HomePage
