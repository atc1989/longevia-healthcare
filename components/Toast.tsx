'use client'
import { useEffect, useState } from 'react'

// Shows the ?ok= / ?err= message that actions redirect back with, then hides it.
export default function Toast({ ok, err }: { ok?: string; err?: string }) {
  const [shown, setShown] = useState(true)
  useEffect(() => {
    setShown(true)
    const t = setTimeout(() => setShown(false), err ? 6000 : 3400)
    return () => clearTimeout(t)
  }, [ok, err])
  const msg = err || ok
  if (!msg || !shown) return null
  return <div id="toast" aria-live="polite"><div className="toast" role="status">{msg}</div></div>
}
