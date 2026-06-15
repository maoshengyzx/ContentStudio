import { useState, useEffect, useCallback } from 'react'
import { Send, Clock, CheckCircle, XCircle, Loader } from 'lucide-react'
import { api } from '@/lib/api'

interface PubRecord { id: string; platform: string; type: string; title: string; status: string; workUrl: string | null; errorMessage: string | null; createdAt: number }

const STATUS: Record<string, { label: string; icon: any; color: string }> = {
  waiting: { label: '等待中', icon: Clock, color: 'var(--color-warning)' },
  queued: { label: '已入队', icon: Clock, color: 'var(--color-accent)' },
  publishing: { label: '发布中', icon: Loader, color: 'var(--color-accent)' },
  published: { label: '已发布', icon: CheckCircle, color: 'var(--color-success)' },
  failed: { label: '失败', icon: XCircle, color: 'var(--color-danger)' },
}

const PLATFORM_LABELS: Record<string, string> = { bilibili: 'B站', douyin: '抖音', kuaishou: '快手', xiaohongshu: '小红书' }

export function Publish() {
  const [records, setRecords] = useState<PubRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api.get<any>(`/publish?pageSize=50${statusFilter ? `&status=${statusFilter}` : ''}`)
      .then(r => setRecords(r?.data?.list || [])).finally(() => setLoading(false))
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  return (
    <div className="animate-in space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">内容发布</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginTop: 2 }}>管理发布任务和记录</p>
        </div>
        <PublishForm onPublished={load} />
      </div>

      <div className="flex gap-2 flex-wrap">
        {['', 'waiting', 'queued', 'publishing', 'published', 'failed'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all border ${
              statusFilter === s
                ? 'text-white'
                : 'hover:text-white'
            }`}
            style={statusFilter === s
              ? { background: 'var(--color-accent)', borderColor: 'var(--color-accent)' }
              : { color: 'var(--color-text-muted)', borderColor: 'var(--color-border)', background: 'transparent' }}
          >
            {s ? STATUS[s]?.label || s : '全部'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
      ) : records.length === 0 ? (
        <div className="text-center py-16 rounded-xl border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-card)' }}>
          <Send className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--color-text-dim)' }} />
          <p style={{ color: 'var(--color-text-muted)' }}>暂无发布记录</p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map(r => {
            const st = STATUS[r.status] || STATUS.waiting
            return (
              <div key={r.id} className="rounded-xl p-4 border flex items-center gap-4 flex-wrap animate-in transition-all"
                style={{ background: 'var(--color-bg-card)', borderColor: 'var(--color-border)' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-border-light)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border)'}>
                <st.icon className="w-4 h-4 flex-shrink-0" style={{ color: st.color }} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{r.title}</div>
                  <div className="flex items-center gap-2 text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    <span className="px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-hover)' }}>{PLATFORM_LABELS[r.platform] || r.platform}</span>
                    <span>{r.type}</span>
                    <span>{new Date(r.createdAt).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span style={{ color: st.color }} className="font-medium">{st.label}</span>
                  {r.workUrl && <a href={r.workUrl} target="_blank" rel="noopener" className="cursor-pointer hover:underline" style={{ color: 'var(--color-accent)' }}>查看</a>}
                  {r.errorMessage && <span className="max-w-xs truncate" style={{ color: 'var(--color-danger)' }}>{r.errorMessage}</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PublishForm({ onPublished }: { onPublished: () => void }) {
  const [show, setShow] = useState(false)
  const [accounts, setAccounts] = useState<any[]>([])
  const [accountId, setAccountId] = useState('')
  const [type, setType] = useState('video')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (show) { api.get<any>('/accounts?pageSize=100').then(r => { const l = r?.data?.list || []; setAccounts(l); if (l[0]) setAccountId(l[0].id) }) }
  }, [show])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('')
    try { await api.post('/publish', { accountId, type, title, description: description || undefined, videoUrl: videoUrl || undefined }); setShow(false); setTitle(''); setDescription(''); setVideoUrl(''); onPublished() }
    catch (err: any) { setError(err.message) } finally { setSaving(false) }
  }

  return (<>
    <button onClick={() => setShow(true)} className="btn-primary"><Send className="w-4 h-4" />新建发布</button>
    {show && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShow(false)}>
        <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} />
        <div className="relative rounded-xl p-5 w-full max-w-sm animate-in" style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }}
          onClick={e => e.stopPropagation()}>
          <h2 className="text-base font-bold mb-4">新建发布任务</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div><label className="block text-sm font-medium mb-1.5">发布账号</label>
              <select value={accountId} onChange={e => setAccountId(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm">
                {accounts.map((a: any) => <option key={a.id} value={a.id}>{PLATFORM_LABELS[a.platform] || a.platform} - {a.nickname}</option>)}</select></div>
            <div><label className="block text-sm font-medium mb-1.5">类型</label>
              <select value={type} onChange={e => setType(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm">
                <option value="video">视频</option><option value="imgText">图文</option><option value="article">文章</option></select></div>
            <div><label className="block text-sm font-medium mb-1.5">标题</label>
              <input value={title} onChange={e => setTitle(e.target.value)} required className="w-full px-3 py-2.5 rounded-lg text-sm" /></div>
            <div><label className="block text-sm font-medium mb-1.5">描述</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full px-3 py-2.5 rounded-lg text-sm resize-none" /></div>
            <div><label className="block text-sm font-medium mb-1.5">视频/图片 URL</label>
              <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://..." className="w-full px-3 py-2.5 rounded-lg text-sm" /></div>
            {error && <div role="alert" className="text-sm rounded-lg px-3 py-2" style={{ color: 'var(--color-danger)', background: 'rgba(239,68,68,0.1)' }}>{error}</div>}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShow(false)} className="btn-ghost flex-1 justify-center">取消</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">{saving ? '创建中...' : '创建发布'}</button>
            </div>
          </form>
        </div>
      </div>
    )}</>
  )
}
