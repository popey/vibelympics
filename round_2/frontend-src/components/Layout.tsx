import { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface LayoutProps {
  children: ReactNode
}

function Layout({ children }: LayoutProps) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        borderBottom: '1px solid var(--color-border)',
        padding: '1rem 0',
        position: 'sticky',
        top: 0,
        background: 'var(--color-bg)',
        zIndex: 100
      }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
            <span style={{ fontSize: '1.5rem' }}>🔍🛡️</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text)' }}>SnapScope</span>
          </Link>
          <nav style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <a
              href="https://snapcraft.io"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}
            >
              Snap Store
            </a>
          </nav>
        </div>
      </header>

      <main style={{ flex: 1, padding: '2rem 0' }}>
        {children}
      </main>

      <footer style={{
        borderTop: '1px solid var(--color-border)',
        padding: '1.5rem 0',
        marginTop: 'auto'
      }}>
        <div className="container" style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
          <p>
            Built with{' '}
            <a href="https://www.chainguard.dev/" target="_blank" rel="noopener noreferrer">
              Chainguard
            </a>
            {' '}container images.
            Powered by{' '}
            <a href="https://github.com/anchore/syft" target="_blank" rel="noopener noreferrer">
              Syft
            </a>
            {' '}and{' '}
            <a href="https://github.com/anchore/grype" target="_blank" rel="noopener noreferrer">
              Grype
            </a>
            .
          </p>
          <p style={{ marginTop: '0.5rem' }}>
            An entry for{' '}
            <a href="https://www.chainguard.dev/vibelympics" target="_blank" rel="noopener noreferrer">
              Chainguard's Vibelympics
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}

export default Layout
