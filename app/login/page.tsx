import Link from 'next/link'
import { signIn } from '../actions'
import Toast from '@/components/Toast'

export default async function Login({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const q = await searchParams
  return (
    <div className="auth">
      <section className="panel">
        <div className="eyebrow">LONGEVIA</div>
        <h1>Sign in</h1>
        <form action={signIn}>
          <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
          <div className="field" style={{ marginTop: 12 }}><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div>
          <button className="btn" style={{ marginTop: 16, width: '100%' }}>Sign in</button>
        </form>
        <p className="sub">New here? <Link href="/signup" style={{ color: '#2c7757', fontWeight: 700 }}>Create a patient account</Link></p>
        <Toast ok={q.ok} err={q.err} />
      </section>
    </div>
  )
}
