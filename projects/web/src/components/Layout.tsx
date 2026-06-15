import { type ReactNode } from 'react'
import { LayoutDashboard, Send, Users, Settings } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '工作台' },
  { to: '/publish', icon: Send, label: '发布' },
  { to: '/accounts', icon: Users, label: '账号' },
  { to: '/settings', icon: Settings, label: '设置' },
]

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation()

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg)' }}>
      <header className="sticky top-0 z-40 border-b" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--color-accent)' }}
            >
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="font-semibold text-sm">Content Studio</span>
          </div>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const active = location.pathname === item.to
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150 cursor-pointer ${
                    active
                      ? 'text-white'
                      : 'hover:text-white'
                  }`}
                  style={active
                    ? { background: 'var(--color-accent)' }
                    : { color: 'var(--color-text-muted)' }
                  }
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </NavLink>
              )
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
