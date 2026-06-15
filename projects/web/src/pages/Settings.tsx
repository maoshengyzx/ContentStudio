import { useState, useEffect } from 'react'
import { Key, Copy, Check, Trash2, WalletCards } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth'

export function Settings() {
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const [keys, setKeys] = useState<any[]>([])
  const [credits, setCredits] = useState(0)
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [generatedKey, setGeneratedKey] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    Promise.all([api.get<any>('/credit/balance'), api.get<any>('/auth/api-key')])
      .then(([c, k]) => { setCredits(c?.credits || 0); setKeys(k || []) }).finally(() => setLoading(false))
  }, [])

  async function createKey() {
    if (!newName.trim()) return
    const r: any = await api.post('/auth/api-key', { name: newName })
    setGeneratedKey(r.apiKey); setNewName('')
    const kk: any = await api.get('/auth/api-key'); setKeys(kk || [])
  }

  async function delKey(id: string) {
    await api.del(`/auth/api-key/${id}`)
    const kk: any = await api.get('/auth/api-key'); setKeys(kk || [])
  }

  function copyKey(text: string) { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  const section = { background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: '0.75rem', padding: '1.25rem' }

  return (
    <div className="animate-in max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">设置</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginTop: 2 }}>积分、API Key 和账号管理</p>
      </div>

      <div style={section}>
        <div className="flex items-center gap-2 mb-3"><WalletCards className="w-4 h-4" style={{ color: 'var(--color-accent)' }} /><span className="font-semibold text-sm">积分余额</span></div>
        <div className="text-2xl font-bold">{loading ? '...' : credits}</div>
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>可用于发布任务和 AI 服务消耗</p>
      </div>

      <div style={section}>
        <div className="flex items-center gap-2 mb-3"><Key className="w-4 h-4" style={{ color: 'var(--color-accent)' }} /><span className="font-semibold text-sm">API Keys</span></div>
        {generatedKey && (
          <div className="mb-3 p-3 rounded-lg text-sm animate-in" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--color-accent-glow)' }}>新 Key（仅显示一次，请立即保存）</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-1.5 rounded text-xs break-all font-mono" style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }}>{generatedKey}</code>
              <button onClick={() => copyKey(generatedKey)} className="p-1.5 rounded cursor-pointer transition-colors" style={{ color: 'var(--color-accent-glow)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.15)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                {copied ? <Check className="w-4 h-4" style={{ color: 'var(--color-success)' }} /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
        <div className="flex gap-2 mb-3">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Key 名称..." className="flex-1 px-3 py-2 rounded-lg text-sm" />
          <button onClick={createKey} className="btn-primary">创建</button>
        </div>
        {keys.length > 0 && (
          <div className="space-y-1.5">
            {keys.map((k: any) => (
              <div key={k.id} className="flex items-center justify-between p-2 rounded-lg text-sm" style={{ background: 'var(--color-bg-elevated)' }}>
                <div>
                  <span className="font-medium">{k.name}</span>
                  <span className="ml-3 text-xs" style={{ color: 'var(--color-text-dim)' }}>{k.lastUsedAt ? `上次: ${new Date(k.lastUsedAt).toLocaleDateString()}` : '从未使用'}</span>
                </div>
                <button onClick={() => delKey(k.id)} className="p-1 rounded cursor-pointer transition-colors" style={{ color: 'var(--color-text-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-danger)'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = ''; e.currentTarget.style.background = '' }}><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={section}>
        <div className="font-semibold text-sm mb-1">账号</div>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{user?.email}</p>
        <button onClick={logout} className="btn-danger mt-3">退出登录</button>
      </div>
    </div>
  )
}
