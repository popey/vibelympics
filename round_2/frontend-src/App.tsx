import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import PackagePage from './pages/PackagePage'
import RevisionPage from './pages/RevisionPage'
import Layout from './components/Layout'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/package/:name" element={<PackagePage />} />
        <Route path="/package/:name/revision/:revision" element={<RevisionPage />} />
      </Routes>
    </Layout>
  )
}

export default App
