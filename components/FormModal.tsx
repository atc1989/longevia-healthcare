import type { ReactNode } from 'react'
import Modal, { Cancel } from './Modal'

// A button that opens a dialog containing a form wired to a Server Action.
export default function FormModal({ label, cls = 'btn', title, desc, action, back, submit, notice, children }: {
  label: ReactNode; cls?: string; title: string; desc: string
  action: (f: FormData) => Promise<void>; back: string; submit: string; notice?: string; children: ReactNode
}) {
  return (
    <Modal label={label} cls={cls}>
      <div className="modal-head"><div><h2>{title}</h2><p>{desc}</p></div></div>
      <form action={action}>
        <input type="hidden" name="back" value={back} />
        {children}
        {notice && <div className="notice">{notice}</div>}
        <div className="modal-footer"><Cancel /><button className="btn">{submit}</button></div>
      </form>
    </Modal>
  )
}
