import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, RefreshCw, Users } from 'lucide-react'
import { api } from '@/lib/api'

interface Account { id: string; platform: string; platformUid: string; nickname: string; status: string }

const PLATFORM_LABELS: Record<string, string> = {
  bilibili: 'B站', douyin: '抖音', kuaishou: '快手', xiaohongshu: '小红书',
  youtube: 'YouTube', tiktok: 'TikTok', twitter: 'X', facebook: 'FB', instagram: 'IG',
}

export function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.get<any>('/accounts?pageSize=100').then((r) => setAccounts(r?.data?.list || [])).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDelete(id: string) {
    if (!confirm('确定删除？')) return
    await api.del(`/accounts/${id}`)
    load()
  }

  return (
    <div className="animate-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">账号管理</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginTop: 2 }}>管理已绑定的平台账号</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-ghost p-2"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => setShowAdd(true)} className="btn-primary"><Plus className="w-4 h-4" />绑定账号</button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-16 rounded-xl border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-card)' }}>
          <Users className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--color-text-dim)' }} />
          <p style={{ color: 'var(--color-text-muted)' }}>还没有绑定账号</p>
          <button onClick={() => setShowAdd(true)} className="btn-primary mt-3">绑定第一个账号</button>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--color-bg-elevated)', borderColor: 'var(--color-border)' }}>
              <tr className="border-b" style={{ borderColor: 'var(--color-border)' }}>
                {['平台', '昵称', 'UID', '状态', '操作'].map(h => (
                  <th key={h} className={`text-left px-4 py-3 font-semibold ${h === '操作' ? 'text-right' : ''}`} style={{ color: 'var(--color-text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accounts.map(a => (
                <tr key={a.id} className="border-b last:border-0 transition-colors" style={{ borderColor: 'var(--color-border)' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = ''}>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: 'var(--color-bg-hover)' }}>
                      {PLATFORM_LABELS[a.platform] || a.platform}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">{a.nickname}</td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--color-text-muted)' }}>{a.platformUid}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium flex items-center gap-1" style={{ color: a.status === 'active' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: a.status === 'active' ? 'var(--color-success)' : 'var(--color-danger)' }} />
                      {a.status === 'active' ? '正常' : '异常'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(a.id)} className="p-1.5 rounded cursor-pointer transition-colors" style={{ color: 'var(--color-text-muted)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-danger)'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = ''; e.currentTarget.style.background = '' }}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && <AddModal onClose={() => setShowAdd(false)} onAdded={load} />}
    </div>
  )
}

function AddModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [platform, setPlatform] = useState('bilibili')
  const [platformUid, setPlatformUid] = useState('')
  const [nickname, setNickname] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('')
    try { await api.post('/accounts', { platform, platformUid, nickname, accessToken }); onAdded(); onClose() }
    catch (err: any) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} />
      <div className="relative rounded-xl p-5 w-full max-w-sm animate-in" style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }}
        onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-bold mb-4">绑定平台账号</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">平台</label>
            <select value={platform} onChange={e => setPlatform(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm">
              {Object.entries(PLATFORM_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div><label className="block text-sm font-medium mb-1.5">平台 UID</label>
            <input value={platformUid} onChange={e => setPlatformUid(e.target.value)} required className="w-full px-3 py-2.5 rounded-lg text-sm" /></div>
          <div><label className="block text-sm font-medium mb-1.5">昵称</label>
            <input value={nickname} onChange={e => setNickname(e.target.value)} required className="w-full px-3 py-2.5 rounded-lg text-sm" /></div>
          <div><label className="block text-sm font-medium mb-1.5">Access Token</label>
            <input value={accessToken} onChange={e => setAccessToken(e.target.value)} required className="w-full px-3 py-2.5 rounded-lg text-sm font-mono" /></div>
          {error && <div role="alert" className="text-sm rounded-lg px-3 py-2" style={{ color: 'var(--color-danger)', background: 'rgba(239,68,68,0.1)' }}>{error}</div>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1 justify-center">取消</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">{saving ? '保存中...' : '绑定'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
