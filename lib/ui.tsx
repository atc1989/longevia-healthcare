import type { ReactNode } from 'react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>
export type Role = 'patient' | 'doctor' | 'center' | 'admin'

export const ROLE_HOME: Record<string, string> = {
  patient: '/patient', doctor: '/doctor', center: '/center', admin: '/admin',
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Network administrator', center: 'Center manager', doctor: 'Physician', patient: 'Patient',
}

export const ICON: Record<string, string> = {
  overview: '◫', appointments: '▦', patients: '♙', consult: '▣', centers: '⌂', fulfillment: '◇',
  reports: '▥', care: '♡', records: '▤', labs: '⚗', shop: '◈', health: '♡', support: '☏',
}

export const MENU: Record<Role, [string, string][]> = {
  admin: [['overview', 'Overview'], ['appointments', 'Appointments'], ['patients', 'Patients'], ['consult', 'Teleconsultations'], ['centers', 'Center network'], ['fulfillment', 'Product fulfillment'], ['labs', 'Lab requests'], ['shop', 'Care products'], ['reports', 'Reports & insights'], ['support', 'GutGuard support']],
  center: [['overview', 'Overview'], ['appointments', 'Appointments'], ['patients', 'Patients'], ['consult', 'Teleconsultations'], ['fulfillment', 'Product fulfillment'], ['labs', 'Lab coordination'], ['shop', 'Care products'], ['support', 'GutGuard support']],
  doctor: [['overview', 'Overview'], ['appointments', 'My schedule'], ['consult', 'Consultation room'], ['patients', 'My patients'], ['labs', 'Diagnostics requests'], ['shop', 'Recommendations']],
  patient: [['overview', 'My care'], ['appointments', 'Appointments'], ['care', 'Care journey'], ['labs', 'Lab requests'], ['health', 'Health tracker'], ['records', 'My lab uploads'], ['shop', 'Health shop'], ['fulfillment', 'My orders']],
}

export const SERVICES = ['Initial consultation', 'Follow-up review', 'Lab result review']
export const CARE_STAGES = ['Initial assessment', 'Follow-up program', 'Diagnostics review']

export const fmt = (d?: string | null) =>
  d ? new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
export const hm = (t: string) => t.slice(0, 5)
export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
export const initials = (n?: string) => String(n || '?').split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase()
export const has = (q: string | undefined, ...parts: unknown[]) =>
  !q || parts.join(' ').toLowerCase().includes(q.toLowerCase())

export const Badge = ({ s }: { s: string }) => (
  <span className={`badge ${/pending/i.test(s) ? 'amber' : /progress|ready|approved/i.test(s) ? 'blue' : /declin|cancel/i.test(s) ? 'grey' : ''}`}>{s}</span>
)

export const Head = ({ k, title, sub, right }: { k: string; title: string; sub: string; right?: ReactNode }) => (
  <div className="page-intro">
    <div><div className="eyebrow">{k}</div><h1>{title}</h1><p className="sub">{sub}</p></div>
    {right}
  </div>
)

export const Metric = ({ label, value, foot, icon = '◈' }: { label: string; value: ReactNode; foot: string; icon?: string }) => (
  <div className="stat">
    <div className="top"><span>{label}</span><span className="symbol">{icon}</span></div>
    <div className="value">{value}</div>
    <div className="foot">{foot}</div>
  </div>
)

export const Hero = ({ k, title, children }: { k: string; title: string; children: ReactNode }) => (
  <div className="hero">
    <div><div className="eyebrow">{k}</div><h2>{title}</h2><p>{children}</p></div>
    <div className="hero-art"><div className="orbit" /><div className="dot" /></div>
  </div>
)
