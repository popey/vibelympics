import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'

interface PackageInfo {
  name: string
  title: string
  icon_url: string | null
  publisher: string
  verified: boolean
  star_developer: boolean
  store_url: string
}

interface Vulnerability {
  id: string
  severity: string
  cvss_score: number | null
  description: string | null
  affected_package: string
  affected_version: string
  is_kev: boolean
  data_source: string
}

interface ScanSummary {
  revision: number
  version: string
  architecture: string
  base: string | null
  total_components: number
  known_components: number
  unknown_components: number
  critical_count: number
  high_count: number
  medium_count: number
  low_count: number
  kev_count: number
  published_at: string | null
  sbom_generated_at: string | null
  syft_version: string | null
  scanned_at: string | null
  grype_db_version: string | null
  grype_version: string | null
}

type SortField = 'severity' | 'cvss' | 'id'

function RevisionPage() {
  const { name, revision } = useParams<{ name: string; revision: string }>()
  const [packageInfo, setPackageInfo] = useState<PackageInfo | null>(null)
  const [summary, setSummary] = useState<ScanSummary | null>(null)
  const [vulnerabilities, setVulnerabilities] = useState<Vulnerability[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortField>('severity')

  useEffect(() => {
    if (name && revision) {
      fetchData(name, revision)
    }
  }, [name, revision])

  const fetchData = async (snapName: string, rev: string) => {
    setLoading(true)
    try {
      const [pkgRes, summaryRes, vulnsRes] = await Promise.all([
        fetch(`/api/packages/${snapName}`),
        fetch(`/api/packages/${snapName}/revisions/${rev}`),
        fetch(`/api/packages/${snapName}/revisions/${rev}/vulnerabilities`)
      ])

      if (pkgRes.ok) setPackageInfo(await pkgRes.json())
      if (summaryRes.ok) setSummary(await summaryRes.json())
      if (vulnsRes.ok) setVulnerabilities(await vulnsRes.json())
    } catch (err) {
      console.error('Failed to fetch data:', err)
    } finally {
      setLoading(false)
    }
  }

  const severityOrder: Record<string, number> = {
    Critical: 0,
    High: 1,
    Medium: 2,
    Low: 3,
    Negligible: 4,
    Unknown: 5
  }

  const sortedVulns = [...vulnerabilities].sort((a, b) => {
    // KEVs always first
    if (a.is_kev !== b.is_kev) return a.is_kev ? -1 : 1

    if (sortBy === 'severity') {
      return (severityOrder[a.severity] || 5) - (severityOrder[b.severity] || 5)
    } else if (sortBy === 'cvss') {
      return (b.cvss_score || 0) - (a.cvss_score || 0)
    } else {
      return a.id.localeCompare(b.id)
    }
  })

  const getCveUrl = (id: string) => {
    if (id.startsWith('GHSA')) {
      return `https://github.com/advisories/${id}`
    }
    return `https://nvd.nist.gov/vuln/detail/${id}`
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString()
  }

  if (loading) {
    return (
      <div className="container">
        <div className="skeleton" style={{ height: '100px', marginBottom: '1rem' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '1.5rem' }}>
          <div className="skeleton" style={{ height: '400px' }} />
          <div className="skeleton" style={{ height: '300px' }} />
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      {/* Header */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <Link to={`/package/${name}`} style={{ color: 'var(--color-text-secondary)' }}>← Back</Link>
          {packageInfo?.icon_url ? (
            <img src={packageInfo.icon_url} alt="" style={{ width: 48, height: 48, borderRadius: 8 }} />
          ) : (
            <div style={{
              width: 48, height: 48, borderRadius: 8,
              background: 'var(--color-bg-tertiary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem'
            }}>📦</div>
          )}
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.5rem' }}>
              {packageInfo?.title || name} <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}>v{summary?.version}</span>
            </h1>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
              Revision {revision} · {summary?.architecture}
              {summary?.base && ` · Base: ${summary.base}`}
            </div>
          </div>
          <a
            href={`https://snapcraft.io/${name}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
          >
            Snap Store ↗
          </a>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '1.5rem' }}>
        {/* Vulnerabilities List */}
        <div className="card" style={{ maxHeight: 'calc(100vh - 280px)', overflow: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', position: 'sticky', top: 0, background: 'var(--color-bg-secondary)', padding: '0.5rem 0' }}>
            <h2 style={{ fontSize: '1.125rem' }}>
              Vulnerabilities ({vulnerabilities.length})
            </h2>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortField)}
              style={{
                background: 'var(--color-bg-tertiary)',
                border: '1px solid var(--color-border)',
                borderRadius: 4,
                padding: '0.25rem 0.5rem',
                color: 'var(--color-text)',
                fontSize: '0.875rem'
              }}
            >
              <option value="severity">Sort by Severity</option>
              <option value="cvss">Sort by CVSS</option>
              <option value="id">Sort by ID</option>
            </select>
          </div>

          {vulnerabilities.length === 0 ? (
            <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: '2rem' }}>
              No vulnerabilities found in this revision.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {sortedVulns.map((vuln, idx) => (
                <div
                  key={`${vuln.id}-${vuln.affected_package}-${idx}`}
                  style={{
                    background: vuln.is_kev ? 'var(--color-kev-bg)' : 'var(--color-bg-tertiary)',
                    borderRadius: 8,
                    padding: '1rem',
                    border: vuln.is_kev ? '1px solid var(--color-kev)' : '1px solid transparent'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <span className={`badge badge-${vuln.severity.toLowerCase()}`}>
                      {vuln.severity}
                    </span>
                    {vuln.is_kev && (
                      <span className="badge badge-kev" title="Known Exploited Vulnerability">
                        KEV
                      </span>
                    )}
                    <a
                      href={getCveUrl(vuln.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontWeight: 600, fontFamily: 'monospace' }}
                    >
                      {vuln.id}
                    </a>
                    {vuln.cvss_score && (
                      <span style={{ marginLeft: 'auto', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                        CVSS {vuln.cvss_score.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>
                    <strong>Affected:</strong> {vuln.affected_package} @ {vuln.affected_version}
                  </div>
                  {vuln.description && (
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                      {vuln.description.length > 200 ? vuln.description.slice(0, 200) + '...' : vuln.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Security Summary - Nutrition Label */}
        <div className="card" style={{ position: 'sticky', top: '80px', alignSelf: 'start' }}>
          <h2 style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>Security Summary</h2>

          {/* Component counts */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>Components</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
              <div style={{ background: 'var(--color-bg-tertiary)', padding: '0.75rem', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{summary?.total_components || 0}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Total</div>
              </div>
              <div style={{ background: 'var(--color-bg-tertiary)', padding: '0.75rem', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-success)' }}>{summary?.known_components || 0}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Known</div>
              </div>
              <div style={{ background: 'var(--color-bg-tertiary)', padding: '0.75rem', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: (summary?.unknown_components || 0) > 0 ? 'var(--color-medium)' : 'var(--color-text)' }}>
                  {summary?.unknown_components || 0}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Unknown</div>
              </div>
            </div>
          </div>

          {/* Vulnerability breakdown */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>Vulnerabilities</h3>

            {/* KEV warning */}
            {(summary?.kev_count || 0) > 0 && (
              <div style={{
                background: 'var(--color-kev-bg)',
                border: '1px solid var(--color-kev)',
                borderRadius: 8,
                padding: '0.75rem',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <span style={{ fontSize: '1.25rem' }}>⚠️</span>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--color-kev)' }}>
                    {summary?.kev_count} Known Exploited
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                    Actively exploited in the wild
                  </div>
                </div>
              </div>
            )}

            {/* Severity bars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[
                { label: 'Critical', count: summary?.critical_count || 0, color: 'var(--color-critical)' },
                { label: 'High', count: summary?.high_count || 0, color: 'var(--color-high)' },
                { label: 'Medium', count: summary?.medium_count || 0, color: 'var(--color-medium)' },
                { label: 'Low', count: summary?.low_count || 0, color: 'var(--color-low)' }
              ].map(({ label, count, color }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ width: '60px', fontSize: '0.875rem' }}>{label}</span>
                  <div style={{ flex: 1, height: 8, background: 'var(--color-bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      width: count > 0 ? `${Math.min(100, (count / Math.max(vulnerabilities.length, 1)) * 100)}%` : '0%',
                      minWidth: count > 0 ? '4px' : '0',
                      height: '100%',
                      background: color,
                      borderRadius: 4
                    }} />
                  </div>
                  <span style={{ width: '30px', textAlign: 'right', fontWeight: 600, color: count > 0 ? color : 'var(--color-text-secondary)' }}>
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Metadata */}
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.25rem 0.75rem' }}>
              <span>Published:</span>
              <span>{formatDate(summary?.published_at || null)}</span>
              <span>SBOM Generated:</span>
              <span>{formatDate(summary?.sbom_generated_at || null)}</span>
              {summary?.syft_version && (
                <>
                  <span>Syft Version:</span>
                  <span>{summary.syft_version}</span>
                </>
              )}
              <span>Scanned:</span>
              <span>{formatDate(summary?.scanned_at || null)}</span>
              {summary?.grype_version && (
                <>
                  <span>Grype Version:</span>
                  <span>{summary.grype_version}</span>
                </>
              )}
              {summary?.grype_db_version && (
                <>
                  <span>DB Version:</span>
                  <span>{summary.grype_db_version}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default RevisionPage
