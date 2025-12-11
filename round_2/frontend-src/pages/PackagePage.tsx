import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'

interface PackageInfo {
  name: string
  title: string
  summary: string
  icon_url: string | null
  publisher: string
  verified: boolean
  star_developer: boolean
  store_url: string
}

interface RevisionScan {
  revision: number
  version: string
  architecture: string
  kev_count: number
  critical_count: number
  high_count: number
  medium_count: number
  low_count: number
  published_at: string | null
  scanned_at: string
}

function PackagePage() {
  const { name } = useParams<{ name: string }>()
  const [packageInfo, setPackageInfo] = useState<PackageInfo | null>(null)
  const [revisions, setRevisions] = useState<RevisionScan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    if (name) {
      fetchPackageData(name)
    }
  }, [name])

  const fetchPackageData = async (snapName: string) => {
    setLoading(true)
    setError(null)
    try {
      const [pkgRes, revsRes] = await Promise.all([
        fetch(`/api/packages/${snapName}`),
        fetch(`/api/packages/${snapName}/revisions`)
      ])

      if (pkgRes.status === 404) {
        setError('Package not found. Check the spelling or try searching for it.')
        setPackageInfo(null)
        setRevisions([])
        return
      }

      if (pkgRes.ok) {
        setPackageInfo(await pkgRes.json())
      }

      if (revsRes.ok) {
        setRevisions(await revsRes.json())
      }
    } catch (err) {
      console.error('Failed to fetch package data:', err)
      setError('Failed to load package data. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const requestScan = async () => {
    if (!name) return
    setScanning(true)
    try {
      const res = await fetch('/api/scans/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packages: [name] })
      })
      if (res.ok) {
        // Refresh data after a short delay
        setTimeout(() => fetchPackageData(name), 2000)
      }
    } catch (err) {
      console.error('Failed to request scan:', err)
    } finally {
      setScanning(false)
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString()
  }

  if (loading) {
    return (
      <div className="container">
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="skeleton" style={{ height: '64px', width: '64px', borderRadius: '8px' }} />
          <div className="skeleton" style={{ height: '2rem', width: '200px', marginTop: '1rem' }} />
          <div className="skeleton" style={{ height: '1rem', width: '150px', marginTop: '0.5rem' }} />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</p>
          <h2 style={{ marginBottom: '0.5rem' }}>Package Not Found</h2>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>{error}</p>
          <Link to="/" className="btn btn-primary">Back to Search</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      {/* Package Header */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {packageInfo?.icon_url ? (
            <img
              src={packageInfo.icon_url}
              alt=""
              style={{ width: 80, height: 80, borderRadius: 12 }}
            />
          ) : (
            <div style={{
              width: 80,
              height: 80,
              borderRadius: 12,
              background: 'var(--color-bg-tertiary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2.5rem'
            }}>
              📦
            </div>
          )}
          <div style={{ flex: 1, minWidth: '200px' }}>
            <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>
              {packageInfo?.title || name}
            </h1>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              color: 'var(--color-text-secondary)',
              marginBottom: '0.5rem'
            }}>
              <span>{packageInfo?.publisher}</span>
              {packageInfo?.verified && (
                <span className="trust-badge" title="Verified Publisher">✓ Verified</span>
              )}
              {packageInfo?.star_developer && (
                <span className="trust-badge" title="Star Developer" style={{ color: '#fbbf24' }}>★ Star Developer</span>
              )}
            </div>
            {packageInfo?.summary && (
              <p style={{ color: 'var(--color-text-secondary)' }}>{packageInfo.summary}</p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <a
              href={packageInfo?.store_url || `https://snapcraft.io/${name}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
            >
              View in Snap Store ↗
            </a>
            <button onClick={requestScan} disabled={scanning} className="btn btn-primary">
              {scanning ? 'Scanning...' : 'Scan Latest'}
            </button>
          </div>
        </div>
      </div>

      {/* Revisions Table */}
      <div className="card">
        <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>Scanned Revisions</h2>

        {revisions.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)', padding: '2rem', textAlign: 'center' }}>
            No scans yet for this package. Click "Scan Latest" to analyze the current version.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Revision</th>
                <th>Version</th>
                <th>Arch</th>
                <th>KEV</th>
                <th>Critical</th>
                <th>High</th>
                <th>Medium</th>
                <th>Low</th>
                <th>Published</th>
                <th>Scanned</th>
              </tr>
            </thead>
            <tbody>
              {revisions.map(rev => (
                <tr key={`${rev.revision}-${rev.architecture}`}>
                  <td>
                    <Link to={`/package/${name}/revision/${rev.revision}`}>
                      {rev.revision}
                    </Link>
                  </td>
                  <td>{rev.version}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{rev.architecture}</td>
                  <td>
                    {rev.kev_count > 0 ? (
                      <span className="badge badge-kev">{rev.kev_count}</span>
                    ) : (
                      <span style={{ color: 'var(--color-text-secondary)' }}>0</span>
                    )}
                  </td>
                  <td>
                    {rev.critical_count > 0 ? (
                      <span className="badge badge-critical">{rev.critical_count}</span>
                    ) : (
                      <span style={{ color: 'var(--color-text-secondary)' }}>0</span>
                    )}
                  </td>
                  <td>
                    {rev.high_count > 0 ? (
                      <span className="badge badge-high">{rev.high_count}</span>
                    ) : (
                      <span style={{ color: 'var(--color-text-secondary)' }}>0</span>
                    )}
                  </td>
                  <td>
                    {rev.medium_count > 0 ? (
                      <span className="badge badge-medium">{rev.medium_count}</span>
                    ) : (
                      <span style={{ color: 'var(--color-text-secondary)' }}>0</span>
                    )}
                  </td>
                  <td>
                    {rev.low_count > 0 ? (
                      <span className="badge badge-low">{rev.low_count}</span>
                    ) : (
                      <span style={{ color: 'var(--color-text-secondary)' }}>0</span>
                    )}
                  </td>
                  <td style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                    {formatDate(rev.published_at)}
                  </td>
                  <td style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                    {formatDate(rev.scanned_at)}
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

export default PackagePage
