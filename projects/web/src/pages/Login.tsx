import { useState, type FormEvent } from 'react'
import { useAuthStore } from '@/store/auth'
import { authApi } from '@/lib/api'

export function Login() {
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore((s) => s.setAuth)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = isRegister
        ? await authApi.register(email, password, name)
        : await authApi.login(email, password)
      setAuth(data.token, data.user)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-sm animate-in">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'var(--color-accent)' }}>
            <span className="text-white font-bold text-xl">C</span>
          </div>
          <h1 className="text-xl font-bold">Content Studio</h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: 4, fontSize: 14 }}>
            {isRegister ? '创建账号' : '登录到控制台'}
          </p>
        </div>

        <form onSubmit={handleSubmit}
          className="rounded-xl p-5 space-y-3"
          style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }}
        >
          {isRegister && (
            <div>
              <label htmlFor="name" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--color-text)' }}>昵称</label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm" required placeholder="你的昵称" />
            </div>
          )}
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1.5">邮箱</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm" required placeholder="your@email.com" />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1.5">密码</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-sm" required minLength={6} placeholder="至少 6 位" />
          </div>

          {error && (
            <div role="alert" className="text-sm rounded-lg px-3 py-2"
              style={{ color: 'var(--color-danger)', background: 'rgba(239,68,68,0.1)' }}>{error}</div>
          )}

          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-lg text-white text-sm font-semibold cursor-pointer transition-all duration-150 disabled:opacity-40"
            style={{ background: 'var(--color-accent)' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-accent-dark)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'var(--color-accent)'}
          >
            {loading ? '处理中...' : isRegister ? '注册' : '登录'}
          </button>

          <p className="text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {isRegister ? '已有账号？' : '没有账号？'}
            <button type="button" onClick={() => { setIsRegister(!isRegister); setError('') }}
              className="ml-1 font-medium hover:underline cursor-pointer"
              style={{ color: 'var(--color-accent)' }}>
              {isRegister ? '去登录' : '去注册'}
            </button>
          </p>
        </form>
      </div>
    </div>
  )
}
