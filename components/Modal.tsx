'use client'
import { useRef, type ReactNode } from 'react'

// Button that opens a native <dialog>. Closes itself when a form inside is submitted.
export default function Modal({ label, cls = 'btn', children }: { label: ReactNode; cls?: string; children: ReactNode }) {
  const r = useRef<HTMLDialogElement>(null)
  return (
    <>
      <button type="button" className={cls} onClick={() => r.current?.showModal()}>{label}</button>
      <dialog
        ref={r}
        className="modal"
        onClick={(e) => { if (e.target === r.current) r.current.close() }}
        onSubmit={() => queueMicrotask(() => r.current?.close())}
      >
        {children}
      </dialog>
    </>
  )
}

export function Cancel() {
  return <button type="button" className="btn secondary" onClick={(e) => e.currentTarget.closest('dialog')?.close()}>Cancel</button>
}
