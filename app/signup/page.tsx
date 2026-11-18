import Link from 'next/link'
import { signUp } from '../actions'
import Toast from '@/components/Toast'

export default async function Signup({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const q = await searchParams
  return (
    <div className="auth">
      <section className="panel">
        <div className="eyebrow">LONGEVIA</div>
        <h1>Create your account</h1>
        <form action={signUp}>
          <div className="field"><label htmlFor="name">Your name</label><input id="name" name="name" autoComplete="name" required /></div>
          <div className="field" style={{ marginTop: 12 }}><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
          <div className="field" style={{ marginTop: 12 }}><label htmlFor="password">Password (8 or more characters)</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required /></div>
          <button className="btn" style={{ marginTop: 16, width: '100%' }}>Create account</button>
        </form>
        <p className="sub">Already have an account? <Link href="/login" style={{ color: '#2c7757', fontWeight: 700 }}>Sign in</Link></p>
        <Toast err={q.err} />
      </section>
    </div>
  )
}
