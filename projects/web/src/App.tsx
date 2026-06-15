import { Routes, Route } from 'react-router-dom'
import { AppLayout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Accounts } from './pages/Accounts'
import { Publish } from './pages/Publish'
import { Settings } from './pages/Settings'
import { Login } from './pages/Login'
import { useAuthStore } from './store/auth'

export default function App() {
  const token = useAuthStore((s) => s.token)

  if (!token) return <Login />

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/publish" element={<Publish />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </AppLayout>
  )
}
