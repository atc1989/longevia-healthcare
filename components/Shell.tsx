import Link from 'next/link'
import type { ReactNode } from 'react'
import Toast from './Toast'
import { signOut } from '@/app/actions'
import { ICON, MENU, ROLE_LABEL, initials, type Role } from '@/lib/ui'

export default function Shell({ role, tab, name, ok, err, children }: {
  role: Role; tab: string; name: string; ok?: string; err?: string; children: ReactNode
}) {
  const menu = MENU[role]
  return (
    <div className="app">
      <input type="checkbox" id="menu" hidden />
      <aside className="sidebar" id="sidebar">
        <div className="brand"><div className="brand-logo">✚</div><div><strong>LONGEVIA</strong><small>PERSONALIZED HEALTH</small></div></div>
        <div className="nav-label">CARE PLATFORM</div>
        <nav className="nav">
          {menu.map(([id, label]) => (
            <Link key={id} href={`/${role}?tab=${id}`} className={tab === id ? 'active' : ''}>
              <span className="glyph">{ICON[id]}</span>{label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile">
            <div className="avatar">{initials(name)}</div>
            <div>
              <strong>{name || 'Signed in'}</strong>
              <small>{ROLE_LABEL[role]}</small><br />
              <form action={signOut} className="inline"><button className="signout">Sign out</button></form>
            </div>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label htmlFor="menu" className="icon-btn mobile-menu" aria-label="Menu">☰</label>
            <div className="crumb">LONGEVIA <span style={{ color: '#bdc9bd' }}> / </span> <strong>{menu.find((m) => m[0] === tab)?.[1]}</strong></div>
          </div>
        </header>
        <div className="content">{children}</div>
      </main>
      <Toast ok={ok} err={err} />
    </div>
  )
}
