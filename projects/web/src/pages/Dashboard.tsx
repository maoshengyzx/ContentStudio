import { useState, useEffect } from 'react'
import { Send, CheckCircle, Clock, AlertTriangle, Users, FileText, TrendingUp } from 'lucide-react'
import { api } from '@/lib/api'

export function Dashboard() {
  const [stats, setStats] = useState({ totalAccounts: 0, publishedToday: 0, pendingPublish: 0, failedToday: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.get<any>('/accounts?pageSize=1'), api.get<any>('/publish?pageSize=100')])
      .then(([accRes, pubRes]) => {
        const records = pubRes?.data?.list || []
        const dayAgo = Date.now() - 86400000
        setStats({
          totalAccounts: accRes?.data?.total || 0,
          publishedToday: records.filter((r: any) => r.status === 'published' && r.updatedAt > dayAgo).length,
          pendingPublish: records.filter((r: any) => ['waiting', 'queued', 'publishing'].includes(r.status)).length,
          failedToday: records.filter((r: any) => r.status === 'failed' && r.updatedAt > dayAgo).length,
        })
      }).finally(() => setLoading(false))
  }, [])

  const cards = [
    { label: '绑定账号', value: stats.totalAccounts, icon: Users, accent: 'var(--color-accent)', bg: 'rgba(99,102,241,0.1)' },
    { label: '今日已发布', value: stats.publishedToday, icon: CheckCircle, accent: 'var(--color-success)', bg: 'rgba(34,197,94,0.1)' },
    { label: '待发布', value: stats.pendingPublish, icon: Clock, accent: 'var(--color-warning)', bg: 'rgba(245,158,11,0.1)' },
    { label: '今日失败', value: stats.failedToday, icon: AlertTriangle, accent: 'var(--color-danger)', bg: 'rgba(239,68,68,0.1)' },
  ]

  const actions = [
    { icon: Send, title: '内容发布', desc: '选择账号，上传内容，一键发布', to: '/publish' },
    { icon: Users, title: '账号管理', desc: '绑定和解绑社交媒体平台账号', to: '/accounts' },
    { icon: TrendingUp, title: '发布记录', desc: '查看历史发布记录和状态', to: '/publish' },
    { icon: FileText, title: 'API 文档', desc: 'API Key 管理和接口说明', to: '/settings' },
  ]

  return (
    <div className="animate-in space-y-6">
      <div>
        <h1 className="text-xl font-bold">工作台</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginTop: 2 }}>内容发布概览</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl p-4 border transition-colors duration-150"
            style={{ background: 'var(--color-bg-card)', borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>{card.label}</span>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: card.bg }}>
                <card.icon className="w-4 h-4" style={{ color: card.accent }} />
              </div>
            </div>
            <div className="text-2xl font-bold">
              {loading ? <div className="skeleton h-8 w-14" /> : card.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {actions.map((item) => (
          <a key={item.to} href={item.to}
            className="rounded-xl p-4 border cursor-pointer group transition-all duration-150"
            style={{ background: 'var(--color-bg-card)', borderColor: 'var(--color-border)' }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-accent)'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--color-border)'}
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(99,102,241,0.1)' }}>
                <item.icon className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
              </div>
              <div>
                <div className="font-medium text-sm">{item.title}</div>
                <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{item.desc}</div>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
