import Link from 'next/link'
import type { ReactNode } from 'react'
import Shell from './Shell'
import FormModal from './FormModal'
import { me } from '@/lib/session'
import * as A from '@/app/actions'
import {
  Badge, CARE_STAGES, Head, Hero, MENU, Metric, SERVICES, fmt, has, hm, initials, today,
  type Role, type Row,
} from '@/lib/ui'

const rows = (r: { data: unknown }) => (r.data ?? []) as Row[]
const NEXT: Record<string, string> = { Pending: 'Confirm', Confirmed: 'Start visit', 'In progress': 'Complete' }
const Disclaimer = ({ children }: { children: ReactNode }) => <p className="disclaimer">{children}</p>
const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>

// One portal for all four roles. RLS decides which rows each role gets; the menu decides which tabs exist.
export default async function Portal({ role, sp }: { role: Role; sp: Record<string, string | undefined> }) {
  const { sb, user, profile } = await me(role)
  const tab = MENU[role].some(([id]) => id === sp.tab) ? sp.tab! : 'overview'
  const back = `/${role}?tab=${tab}`
  const staff = role === 'admin' || role === 'center'
  const clinical = role === 'admin' || role === 'doctor'

  const [bk, pt, od, lb, up, mk, ct, dr, pn, pr, mt] = (await Promise.all([
    sb.from('bookings').select('*, patient:patients(name), doctor:profiles(full_name), center:centers(name)').order('date').order('time'),
    sb.from('patients').select('*, center:centers(name)').order('created_at', { ascending: false }),
    sb.from('orders').select('*, patient:patients(name), product:products(name), center:centers(name)').order('created_at', { ascending: false }),
    sb.from('lab_requests').select('*, patient:patients(name), panel:lab_panels(name), center:centers(name)').order('created_at', { ascending: false }),
    sb.from('lab_uploads').select('*, patient:patients(name)').order('created_at', { ascending: false }),
    sb.from('markers').select('*, type:marker_types(name, unit)').order('date', { ascending: false }),
    sb.from('centers').select('*').order('id'),
    sb.from('profiles').select('id, full_name').eq('role', 'doctor').order('full_name'),
    sb.from('lab_panels').select('*').order('id'),
    sb.from('products').select('*').order('id'),
    sb.from('marker_types').select('*').order('id'),
  ])).map(rows)

  const active = ct.filter((c) => c.status === 'Active')
  const myCenter = ct.find((c) => c.id === profile.center_id)
  const bookCenters = role === 'center' ? active.filter((c) => c.id === profile.center_id) : active
  const meP = pt[0] // for patients: their own record
  const open = bk.filter((b) => b.status !== 'Completed')
  const Back = () => <input type="hidden" name="back" value={back} />

  const centerSelect = (name = 'center') => (
    <select name={name} required>{bookCenters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
  )

  const bookModal = (label: string, cls = 'btn') => (
    <FormModal label={label} cls={cls} title="Book a consultation" desc="Choose a physician, center and time." action={A.bookAppointment} back={back}
      submit="Book appointment" notice="New appointments start as Pending until a center or physician confirms them.">
      <div className="fields">
        {role !== 'patient' && (
          <div className="field full"><label>Patient</label>
            <select name="patient" required>{pt.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}</select></div>
        )}
        <div className="field full"><label>Center</label>{centerSelect()}</div>
        <div className="field"><label>Consultation type</label><select name="service">{SERVICES.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="field"><label>Physician</label>
          <select name="doctor" required>{dr.map((d) => <option key={d.id} value={d.id}>{d.full_name || 'Physician'}</option>)}</select></div>
        <div className="field"><label>Date</label><input name="date" type="date" min={today()} defaultValue={today()} required /></div>
        <div className="field"><label>Time (PHT)</label><input name="time" type="time" defaultValue="10:00" required /></div>
      </div>
    </FormModal>
  )

  const advance = (b: Row) =>
    role !== 'patient' && NEXT[b.status] && (role !== 'doctor' || b.doctor_id === user.id) ? (
      <form action={A.advanceBooking} className="inline"><Back /><input type="hidden" name="id" value={b.id} />
        <button className="linkbtn">{NEXT[b.status]} →</button></form>
    ) : null

  const bookingTable = (list: Row[]) => (
    <div className="tablewrap"><table>
      <thead><tr><th>Patient / Ref</th><th>Consultation</th><th>Assigned center</th><th>Schedule</th><th>Status</th><th></th></tr></thead>
      <tbody>{list.length ? list.map((b) => (
        <tr key={b.id}>
          <td><strong>{b.patient?.name}</strong><span className="muted">{b.id}</span></td>
          <td><strong>{b.service}</strong><span className="muted">{b.doctor?.full_name}</span></td>
          <td>{b.center?.name}</td>
          <td><strong>{fmt(b.date)}</strong><span className="muted">{hm(b.time)} PHT</span></td>
          <td><Badge s={b.status} /></td>
          <td>{advance(b)}</td>
        </tr>
      )) : <tr><td colSpan={6} className="empty">No appointments match this view.</td></tr>}</tbody>
    </table></div>
  )

  const searchBox = (
    <form action={`/${role}`}><input type="hidden" name="tab" value={tab} />
      {sp.status && <input type="hidden" name="status" value={sp.status} />}
      <input name="q" className="search" placeholder="Search…" defaultValue={sp.q} /></form>
  )

  const toolbar = (pills: string[], search = true) => (
    <div className="toolbar">
      {search ? searchBox : <span />}
      <div className="filtergroup">{pills.map((p) => (
        <Link key={p} className={`pill ${(sp.status || 'All') === p ? 'selected' : ''}`} href={`/${role}?tab=${tab}&status=${encodeURIComponent(p)}`}>{p}</Link>
      ))}</div>
    </div>
  )

  const labForm = (label: string, cls: string, preset?: number) => (
    <FormModal label={label} cls={cls} title="Request laboratory work-up" desc="A request for clinician review, not a laboratory order." action={A.requestLab} back={back}
      submit="Send request" notice="A physician must approve clinically indicated tests before a lab processes anything.">
      <div className="fields">
        <div className="field full"><label>Requested panel</label>
          <select name="panel" defaultValue={preset}>{pn.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="field full"><label>Preferred collection center</label>{centerSelect()}</div>
        <div className="field full"><label>Preferred date</label><input name="date" type="date" min={today()} defaultValue={today()} required /></div>
        <div className="field full"><label>Note for physician (optional)</label><textarea name="note" rows={2} maxLength={200} /></div>
      </div>
    </FormModal>
  )

  const inquiry = (p: Row) => (
    <FormModal label={`${p.requires_review ? 'Request review' : 'Inquire'} →`} cls="btn sm" title="Request product review" desc={`Request availability or a physician consultation for ${p.name}.`}
      action={A.createOrder} back="/patient?tab=fulfillment" submit="Send inquiry"
      notice="An inquiry is not a prescription, clinical approval, purchase or shipping order.">
      <input type="hidden" name="product" value={p.id} /><input type="hidden" name="qty" value="1" />
      <div className="fields">
        <div className="field full"><label>Preferred center</label>{centerSelect()}</div>
        <div className="field full"><label>Request purpose</label>
          <select name="purpose"><option>Ask my physician about suitability</option><option>Request center availability information</option><option>Arrange a follow-up consultation</option></select></div>
      </div>
    </FormModal>
  )

  // ---------- views ----------

  const centerList = (list: Row[]) => (
    <div className="center-list">{list.length ? list.slice(0, 4).map((c) => (
      <div key={c.id} className="center-item">
        <div className="center-icon">{c.type === 'Company-owned' ? '✚' : '⌂'}</div>
        <div className="center-details"><strong>{c.name}</strong><small>{c.type} · {c.city}</small></div>
        <div className="center-meta"><b>{pt.filter((p) => p.center_id === c.id).length}</b>patients</div>
      </div>
    )) : <Empty>No centers yet.</Empty>}</div>
  )

  const overview = () => {
    if (role === 'patient') return (
      <>
        <Head k="PERSONAL HEALTH DASHBOARD" title="Your health, all in one place." sub={`Welcome back${profile.full_name ? ', ' + profile.full_name.split(' ')[0] : ''}. Your LONGEVIA care journey at a glance.`}
          right={bookModal('＋  Book a consultation')} />
        <Hero k="YOUR CARE JOURNEY" title="A more personal kind of healthcare.">Meet your physician, request lab work, track your results and continue your personalized longevity care, all with LONGEVIA.</Hero>
        <div className="stats">
          <Metric label="Upcoming visits" value={open.length} foot="Your appointments" icon="▦" />
          <Metric label="Assigned care center" value={meP?.center ? '1' : '0'} foot={meP?.center?.name ?? 'Set when you book'} icon="⌂" />
          <Metric label="Care stage" value={meP?.care_stage?.split(' ')[0] ?? '—'} foot={meP?.care_stage ?? ''} icon="♡" />
          <Metric label="Lab files" value={up.length} foot="Uploaded reports" icon="⚗" />
        </div>
        <section className="panel" style={{ marginBottom: 20 }}>
          <div className="section-head"><h2>Your one-stop health hub</h2><small>Consult • Test • Track • Continue</small></div>
          <div className="grid3">
            <div className="small-card"><strong>⚗ Request blood work</strong><p>Choose a lab panel and a participating center.</p><Link className="btn sm soft" style={{ marginTop: 12 }} href="/patient?tab=labs">Request labs →</Link></div>
            <div className="small-card"><strong>♡ Health tracker</strong><p>Upload a report or enter a biomarker.</p><Link className="btn sm soft" style={{ marginTop: 12 }} href="/patient?tab=health">Open tracker →</Link></div>
            <div className="small-card"><strong>◈ Health shop</strong><p>Browse supplements and request physician-reviewed items.</p><Link className="btn sm soft" style={{ marginTop: 12 }} href="/patient?tab=shop">Browse products →</Link></div>
          </div>
        </section>
        <section className="panel">
          <div className="section-head"><h2>My appointments</h2><Link className="linkbtn" href="/patient?tab=appointments">View all →</Link></div>
          {bookingTable(bk.slice(0, 5))}
        </section>
      </>
    )
    if (role === 'doctor') return (
      <>
        <Head k="PHYSICIAN WORKSPACE" title={`Good day${profile.full_name ? ', ' + profile.full_name : ''}.`} sub="Your consultation schedule and patient follow-ups in one place."
          right={<Link className="btn" href="/doctor?tab=consult">▣ &nbsp; Open consultation room</Link>} />
        <Hero k="PHYSICIAN-LED CARE" title="More continuity. More context.">Review your upcoming consultations, care needs and partner-center coordination.</Hero>
        <div className="stats">
          <Metric label="Assigned appointments" value={bk.length} foot="Your schedule" icon="▦" />
          <Metric label="Waiting for confirmation" value={bk.filter((b) => b.status === 'Pending').length} foot="Pending consults" icon="◷" />
          <Metric label="My patients" value={pt.length} foot="Patients you are booked with" icon="♙" />
          <Metric label="Centers supported" value={new Set(bk.map((b) => b.center_id)).size} foot="Across network" icon="⌂" />
        </div>
        <section className="panel">
          <div className="section-head"><h2>Your consultation schedule</h2><Link className="linkbtn" href="/doctor?tab=appointments">View full schedule →</Link></div>
          {bookingTable(bk.slice(0, 8))}
        </section>
      </>
    )
    return (
      <>
        <Head k="NETWORK OPERATIONS" title={role === 'center' ? 'Your center, at a glance.' : 'Welcome back.'} sub="A clear view of consultations, care coordination and product centers."
          right={bookModal('＋  New appointment')} />
        {role === 'center' && !profile.center_id && <div className="notice">Your account is not assigned to a center yet. Ask a network administrator to assign one.</div>}
        <Hero k="CONNECTED CARE MODEL" title="Care that continues beyond the consultation.">One connected experience for physician consultations, diagnostics, care plans, product access and follow-up, across LONGEVIA care centers and participating partners.</Hero>
        <div className="stats">
          <Metric label="Patients" value={pt.length} foot="Patient profiles you can see" icon="♙" />
          <Metric label="Scheduled consultations" value={open.length} foot="Not yet completed" icon="▦" />
          <Metric label="Active centers" value={role === 'center' ? (myCenter ? 1 : 0) : active.length} foot="Company and partner sites" icon="⌂" />
          <Metric label="Product requests" value={od.length} foot="Pending, ready and fulfilled" icon="◇" />
        </div>
        <div className="panels">
          <section className="panel"><div className="section-head"><h2>Upcoming consultations</h2><Link className="linkbtn" href={`/${role}?tab=appointments`}>All appointments →</Link></div>{bookingTable(open.slice(0, 4))}</section>
          <section className="panel"><div className="section-head"><h2>{role === 'center' ? 'Your center' : 'Center network'}</h2>
            {role === 'admin' && <Link className="linkbtn" href="/admin?tab=centers">Explore →</Link>}</div>
            {centerList(role === 'center' ? (myCenter ? [myCenter] : []) : ct)}</section>
        </div>
      </>
    )
  }

  const appointments = () => {
    const list = bk.filter((b) => has(sp.q, b.patient?.name, b.id, b.doctor?.full_name, b.service, b.center?.name) && (!sp.status || sp.status === 'All' || b.status === sp.status))
    return (
      <>
        <Head k="CONSULTATION SCHEDULING" title={role === 'patient' ? 'My appointments' : role === 'doctor' ? 'My schedule' : 'Appointment management'} sub="Book, track and coordinate virtual physician visits across participating centers."
          right={role !== 'doctor' ? bookModal('＋  Book appointment') : undefined} />
        <section className="panel">{toolbar(['All', 'Pending', 'Confirmed', 'In progress', 'Completed'])}{bookingTable(list)}</section>
      </>
    )
  }

  const patients = () => {
    const list = pt.filter((p) => has(sp.q, p.name, p.id, p.care_stage, p.center?.name))
    return (
      <>
        <Head k="PATIENT COORDINATION" title={role === 'doctor' ? 'My patients' : 'Patient directory'} sub="Patients you can access through your center or your consultations."
          right={staff ? (
            <FormModal label="＋  Register patient" title="Register a patient" desc="Creates a patient record without a login." action={A.registerPatient} back={back} submit="Register patient"
              notice="The patient can create their own account later; staff-registered records are separate until you link them in the database.">
              <div className="fields">
                <div className="field full"><label>Patient full name</label><input name="name" required maxLength={70} /></div>
                <div className="field full"><label>Assigned center</label>{centerSelect()}</div>
                <div className="field full"><label>Care stage</label><select name="care">{CARE_STAGES.map((s) => <option key={s}>{s}</option>)}</select></div>
              </div>
            </FormModal>
          ) : undefined} />
        <section className="panel">
          <div className="toolbar">{searchBox}<span style={{ color: '#89998c', fontSize: 12 }}>{list.length} patient profiles</span></div>
          <div className="tablewrap"><table>
            <thead><tr><th>Patient</th><th>Patient ID</th><th>Care stage</th><th>Assigned center</th><th>Last activity</th><th>Status</th></tr></thead>
            <tbody>{list.length ? list.map((p) => (
              <tr key={p.id}>
                <td><div className="patient-name"><div className="initial">{initials(p.name)}</div><strong>{p.name}</strong></div></td>
                <td>{p.id}</td><td>{p.care_stage}</td><td>{p.center?.name ?? '—'}</td><td>{fmt(p.last_activity)}</td><td><Badge s={p.status} /></td>
              </tr>
            )) : <tr><td colSpan={6} className="empty">No patients found.</td></tr>}</tbody>
          </table></div>
        </section>
      </>
    )
  }

  const consult = () => {
    const list = bk.filter((b) => b.status !== 'Completed')
    return (
      <>
        <Head k="VIRTUAL CARE" title={role === 'patient' ? 'Join a consultation' : 'Teleconsultation room'} sub="Visit preparation and the doctor–patient workflow."
          right={role !== 'doctor' ? bookModal('＋  Schedule a visit') : undefined} />
        <div className="panels">
          <section className="panel">
            <div className="section-head"><h2>Consultation room</h2><Badge s="Video not connected" /></div>
            <div className="video-box"><div><div className="camera">▣</div><h2 style={{ fontSize: 20, margin: '5px 0' }}>Secure video visit</h2>
              <p style={{ maxWidth: 320, color: '#a8c0b2', fontSize: 12 }}>Video is not connected yet. Use the queue to move each visit through its status.</p></div></div>
            <div className="notice" style={{ marginTop: 18, marginBottom: 0 }}>Real telemedicine requires verified clinician credentials, consent, secure communications and appropriate medical record controls.</div>
          </section>
          <section className="panel">
            <div className="section-head"><h2>Consultation queue</h2><small>{list.length} visits</small></div>
            {list.length ? list.map((b) => (
              <div key={b.id} className="activity"><span className="symbol">▦</span>
                <div style={{ flex: 1 }}><strong>{b.patient?.name}</strong><small>{b.doctor?.full_name} · {fmt(b.date)} at {hm(b.time)}</small><div style={{ marginTop: 7 }}><Badge s={b.status} /></div></div>
                {advance(b)}
              </div>
            )) : <Empty>No visits in the queue.</Empty>}
          </section>
        </div>
      </>
    )
  }

  const centers = () => {
    const list = ct.filter((c) => !sp.status || sp.status === 'All' || c.type === sp.status)
    return (
      <>
        <Head k="MULTI-CENTER NETWORK" title="One network. Every center." sub="LONGEVIA-branded care centers and outsourced partners, supported operationally by GutGuard."
          right={
            <FormModal label="＋  Add center" title="Add a network center" desc="Register a LONGEVIA care center or an outsourced service partner." action={A.addCenter} back={back} submit="Register center"
              notice="New centers begin as Pending. Activation does not mean accreditation or contracting.">
              <div className="fields">
                <div className="field full"><label>Center name</label><input name="name" required maxLength={80} /></div>
                <div className="field"><label>Center type</label><select name="type"><option>Company-owned</option><option>Outsourced partner</option></select></div>
                <div className="field"><label>City / service area</label><input name="city" required maxLength={70} /></div>
                <div className="field full"><label>Center contact / lead</label><input name="manager" required maxLength={70} /></div>
              </div>
            </FormModal>
          } />
        <div className="stats">
          <Metric label="Network centers" value={ct.length} foot="Registered locations" icon="⌂" />
          <Metric label="Company-owned" value={ct.filter((c) => c.type === 'Company-owned').length} foot="GutGuard-supported sites" icon="✚" />
          <Metric label="Outsourced partners" value={ct.filter((c) => c.type === 'Outsourced partner').length} foot="External affiliated centers" icon="◇" />
          <Metric label="Active locations" value={active.length} foot="Ready for coordination" icon="✓" />
        </div>
        {toolbar(['All', 'Company-owned', 'Outsourced partner'], false)}
        {list.length ? (
          <div className="grid3">{list.map((c) => (
            <div key={c.id} className="network-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div className="tag">{c.type}</div><Badge s={c.status} /></div>
              <h3>{c.name}</h3><p>⌖ {c.city}<br />Center lead: {c.manager}</p>
              <div className="network-bottom"><span><strong>{pt.filter((p) => p.center_id === c.id).length}</strong> patient profiles</span>
                {c.status === 'Pending' && <form action={A.activateCenter} className="inline"><Back /><input type="hidden" name="id" value={c.id} /><button className="linkbtn">Mark active →</button></form>}</div>
            </div>
          ))}</div>
        ) : <Empty>No centers yet. Add the first one.</Empty>}
        <Disclaimer>Verify contracts, licenses, access rights and service agreements before onboarding real partner organizations. To give a center manager access, set their center in the database (see README).</Disclaimer>
      </>
    )
  }

  const fulfillment = () => (
    <>
      <Head k="PRODUCT COORDINATION" title={role === 'patient' ? 'My product requests' : 'Product fulfillment'} sub="Coordinate product availability and collection across LONGEVIA and partner centers."
        right={staff ? (
          <FormModal label="＋  Create request" title="Create product request" desc="Administrative request for coordinated center pickup." action={A.createOrder} back={back} submit="Create request"
            notice="For tracking only. This is not a prescription or dispensing approval.">
            <div className="fields">
              <div className="field full"><label>Patient</label><select name="patient" required>{pt.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}</select></div>
              <div className="field full"><label>Product</label><select name="product" required>{pr.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div className="field"><label>Fulfillment center</label>{centerSelect()}</div>
              <div className="field"><label>Quantity</label><select name="qty"><option>1</option><option>2</option><option>3</option></select></div>
            </div>
          </FormModal>
        ) : undefined} />
      <div className="stats">
        <Metric label="Total requests" value={od.length} foot="Across accessible centers" icon="◇" />
        <Metric label="Pending review" value={od.filter((o) => o.status === 'Pending review').length} foot="Needs review" icon="◷" />
        <Metric label="Ready at center" value={od.filter((o) => o.status === 'Ready at center').length} foot="For coordinated collection" icon="⌂" />
        <Metric label="Fulfilled" value={od.filter((o) => o.status === 'Fulfilled').length} foot="Completed requests" icon="✓" />
      </div>
      <section className="panel">
        <div className="section-head"><h2>Product request register</h2><small>Administrative coordination only</small></div>
        <div className="tablewrap"><table>
          <thead><tr><th>Request</th><th>Patient</th><th>Product</th><th>Collection center</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>{od.length ? od.map((o) => (
            <tr key={o.id}>
              <td><strong>{o.id}</strong><span className="muted">{fmt(o.created_at)}</span></td>
              <td>{o.patient?.name}</td>
              <td>{o.product?.name} · {o.qty}<span className="muted">{o.purpose}</span></td>
              <td>{o.center?.name}</td><td><Badge s={o.status} /></td>
              <td>{staff && o.status !== 'Fulfilled'
                ? <form action={A.advanceOrder} className="inline"><Back /><input type="hidden" name="id" value={o.id} /><button className="linkbtn">Advance →</button></form>
                : <span className="muted">{staff ? 'Done' : 'View only'}</span>}</td>
            </tr>
          )) : <tr><td colSpan={6} className="empty">No requests yet.</td></tr>}</tbody>
        </table></div>
      </section>
      <Disclaimer>No payment, dispensing or inventory reservation happens here. Product fulfillment requires clinician authorization and applicable Philippine requirements.</Disclaimer>
    </>
  )

  const labs = () => (
    <>
      <Head k="DIAGNOSTICS & BLOOD WORK" title={role === 'patient' ? 'Your labs, simplified.' : 'Lab requests'} sub="Requests go to a physician for review. Actual lab orders need authorized clinical approval."
        right={role === 'patient' ? labForm('＋  Request blood work', 'btn') : undefined} />
      <div className="stats">
        <Metric label="Lab requests" value={lb.length} foot="Visible to you" icon="⚗" />
        <Metric label="Awaiting review" value={lb.filter((x) => x.status === 'Pending clinical review').length} foot="No orders sent yet" icon="◷" />
        <Metric label="Uploaded reports" value={up.length} foot="Stored privately" icon="▤" />
        <Metric label="Active centers" value={active.length} foot="Collection sites" icon="⌂" />
      </div>
      <div className={role === 'patient' ? 'panels' : ''}>
        {role === 'patient' && (
          <section className="panel"><div className="section-head"><h2>Available diagnostic categories</h2><small>Not self-prescribed</small></div>
            <div className="center-list">{pn.map((x) => (
              <div key={x.id} className="center-item"><span className="center-icon">⚗</span>
                <div className="center-details"><strong>{x.name}</strong><small>{x.description}</small></div>
                {labForm('Request', 'btn sm secondary', x.id)}</div>
            ))}</div></section>
        )}
        <section className="panel">
          <div className="section-head"><h2>{role === 'patient' ? 'My lab request queue' : 'Request queue'}</h2></div>
          {lb.length ? (
            <div className="tablewrap"><table>
              <thead><tr><th>Patient</th><th>Panel</th><th>Center</th><th>Preferred date</th><th>Status</th><th></th></tr></thead>
              <tbody>{lb.map((r) => (
                <tr key={r.id}>
                  <td>{r.patient?.name}</td><td><strong>{r.panel?.name}</strong><span className="muted">{r.note}</span></td>
                  <td>{r.center?.name}</td><td>{fmt(r.preferred_date)}</td><td><Badge s={r.status} /></td>
                  <td>{clinical && r.status === 'Pending clinical review' && (
                    <span className="list-actions">
                      {[['1', 'Approve'], ['0', 'Decline']].map(([v, l]) => (
                        <form key={v} action={A.reviewLab} className="inline"><Back /><input type="hidden" name="id" value={r.id} /><input type="hidden" name="approve" value={v} />
                          <button className="linkbtn">{l}</button></form>
                      ))}
                    </span>)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <Empty>No requests yet.</Empty>}
          {role === 'patient' && <Link className="btn soft" style={{ width: '100%', marginTop: 16 }} href="/patient?tab=records">Upload an existing report →</Link>}
        </section>
      </div>
      {clinical && (
        <section className="panel" style={{ marginTop: 20 }}>
          <div className="section-head"><h2>Uploaded lab reports</h2></div>
          {uploadList()}
        </section>
      )}
      <Disclaimer>A clinician must determine whether testing is appropriate. No laboratory requisition is issued from this page.</Disclaimer>
    </>
  )

  const uploadList = () => up.length ? (
    <>{up.map((u) => (
      <div key={u.id} className="activity"><span className="symbol">▤</span>
        <div style={{ flex: 1 }}><strong>{u.label}</strong><small>{u.patient?.name} · {u.name} · {fmt(u.created_at)} · {(u.size_bytes / 1024).toFixed(0)} KB</small></div>
        <a className="btn sm secondary" href={`/files/${u.id}`} target="_blank" rel="noreferrer">Open</a>
      </div>
    ))}</>
  ) : <Empty>No lab documents yet.</Empty>

  const records = () => (
    <>
      <Head k="YOUR DOCUMENT VAULT" title="Upload your lab reports." sub="PDF, JPG or PNG up to 10 MB. Only you and your physicians can open them."
        right={
          <FormModal label="＋ Upload lab report" title="Attach a lab report" desc="The file is stored privately." action={A.uploadLab} back={back} submit="Upload"
            notice="Your report is only visible to you and physicians you are booked with.">
            <div className="fields">
              <div className="field full"><label>Lab report (PDF, JPG, PNG; max 10 MB)</label><input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required /></div>
              <div className="field full"><label>Description (optional)</label><input name="label" maxLength={80} placeholder="e.g., CBC panel" /></div>
            </div>
          </FormModal>} />
      <div className="two">
        <section className="panel"><div className="section-head"><h2>My lab documents</h2></div>{uploadList()}</section>
        <section className="panel">
          <div className="section-head"><h2>From results to care</h2></div>
          {[['1', 'Attach your result', 'Upload a laboratory PDF or image'], ['2', 'Get physician interpretation', 'Review ranges, units, clinical context and next steps'], ['3', 'Follow a personalized plan', 'Your physician confirms findings and next steps']].map(([n, t, s]) => (
            <div key={n} className="activity"><span className="symbol">{n}</span><div><strong>{t}</strong><small>{s}</small></div></div>
          ))}
          <Link className="btn soft" style={{ marginTop: 18, width: '100%' }} href="/patient?tab=health">View health tracker →</Link>
        </section>
      </div>
    </>
  )

  const health = () => (
    <>
      <Head k="PERSONALIZED WELLNESS" title="Your health tracker." sub="Your consultations, lab reports and wellness values in one place. Values are self-entered and not interpreted."
        right={
          <FormModal label="＋ Add biomarker" title="Add a biomarker" desc="A manual entry. No reference range or diagnosis is generated." action={A.addMarker} back={back} submit="Add to tracker">
            <div className="fields">
              <div className="field full"><label>Biomarker</label><select name="type">{mt.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}</select></div>
              <div className="field"><label>Value</label><input name="value" type="number" step="any" min="0" max="999999" required /></div>
              <div className="field"><label>Test date</label><input name="date" type="date" max={today()} defaultValue={today()} required /></div>
            </div>
          </FormModal>} />
      <div className="stats">
        <Metric label="Biomarkers" value={mk.length} foot="Self-entered values" icon="♡" />
        <Metric label="Lab reports" value={up.length} foot="Uploaded files" icon="▤" />
        <Metric label="Lab requests" value={lb.length} foot="Sent for review" icon="⚗" />
        <Metric label="Upcoming consults" value={open.length} foot="Your schedule" icon="▦" />
      </div>
      <div className="panels">
        <section className="panel"><div className="section-head"><h2>My biomarker timeline</h2><Badge s="Not clinically interpreted" /></div>
          {mk.length ? <div className="grid3">{mk.slice(0, 6).map((m) => (
            <div key={m.id} className="small-card"><strong>{m.type?.name}</strong>
              <div style={{ font: "750 23px Manrope", color: '#1e5e43' }}>{Number(m.value)} <span style={{ fontSize: 11, color: '#82958b' }}>{m.type?.unit}</span></div>
              <p>{fmt(m.date)} · Self-entered</p></div>
          ))}</div> : <Empty>No biomarkers yet. Add a value to start your timeline.</Empty>}
          <div className="notice" style={{ marginTop: 16 }}>Only a licensed professional can interpret results with the correct lab ranges and your history.</div></section>
        <section className="panel"><div className="section-head"><h2>Health journey</h2></div>
          {[['✓', 'Care profile ready', meP?.name ?? ''], ['⚗', 'Diagnostics', `${lb.length} request(s), ${up.length} report(s)`], ['♡', 'Personalized care plan', 'Prepared by your treating physician'], ['◷', 'Continued monitoring', 'Schedule check-ins and clinician reviews']].map(([i, t, s]) => (
            <div key={t} className="activity"><span className="symbol">{i}</span><div><strong>{t}</strong><small>{s}</small></div></div>
          ))}
          <Link className="btn soft" style={{ width: '100%', marginTop: 15 }} href="/patient?tab=records">View my lab uploads →</Link></section>
      </div>
    </>
  )

  const care = () => (
    <>
      <Head k="LONGITUDINAL CARE" title="Your care journey." sub="The pathway from first consultation to ongoing follow-up." />
      <section className="panel"><div className="section-head"><h2>Connected care milestones</h2></div>
        <div className="journey">{[['1', 'Discover', 'Find care'], ['2', 'Consult', 'Meet doctor'], ['3', 'Diagnose', 'Lab review'], ['4', 'Plan', 'Personalized care'], ['5', 'Track', 'Monitor progress'], ['6', 'Continue', 'Ongoing visits']].map(([n, t, s]) => (
          <div key={n} className="step"><i>{n}</i>{t}<br /><span>{s}</span></div>
        ))}</div></section>
      <div className="two" style={{ marginTop: 20 }}>
        <section className="panel"><div className="section-head"><h2>Care plan preview</h2></div>
          <div className="small-card"><strong>Initial medical consultation</strong><p>Discuss history and goals with your physician.</p></div>
          <div className="small-card" style={{ marginTop: 10 }}><strong>Follow-up planning</strong><p>Future diagnostics and treatments are determined by a licensed clinician.</p></div></section>
        <section className="panel"><div className="section-head"><h2>Next action</h2></div>
          <p className="sub" style={{ marginBottom: 20 }}>Arrange your next consultation at your preferred participating center.</p>{bookModal('Book a consultation →')}</section>
      </div>
    </>
  )

  const shop = () => (
    <>
      <Head k="PHYSICIAN-DIRECTED CARE" title={role === 'patient' ? 'Your health & longevity shop.' : 'Care products'} sub="Wellness support and any prescribed treatment, coordinated with licensed professionals and approved centers."
        right={role === 'patient' ? <Link className="btn secondary" href="/patient?tab=fulfillment">View my requests →</Link> : undefined} />
      <Hero k="CARE • SUPPORT • CONTINUITY" title="Care recommendations, connected to fulfillment.">Doctor visits, diagnostic review and appropriate products, coordinated across LONGEVIA and partner centers, with fulfillment support from GutGuard.</Hero>
      <div className="grid3">{pr.map((x) => (
        <div key={x.id} className="network-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span className="tag">{x.category}</span><Badge s={x.requires_review ? 'Review required' : 'Inquiry only'} /></div>
          <div className="product-icon">{x.category === 'Supplement' ? '✳' : x.category === 'Prescription' ? '✚' : '♡'}</div>
          <h3>{x.name}</h3><p style={{ minHeight: 55 }}>{x.description}</p>
          <div className="network-bottom"><span>No checkout or pricing</span>{role === 'patient' ? inquiry(x) : <span>Catalog</span>}</div>
        </div>
      ))}</div>
      {role !== 'doctor' && (
        <section className="panel" style={{ marginTop: 20 }}><div className="section-head"><h2>Review queue</h2></div>
          {od.filter((o) => o.status === 'Pending review').length ? od.filter((o) => o.status === 'Pending review').map((o) => (
            <div key={o.id} className="activity"><span className="symbol">◈</span>
              <div><strong>{o.product?.name}</strong><small>{o.patient?.name} · {o.center?.name} · {fmt(o.created_at)}</small><div style={{ marginTop: 6 }}><Badge s={o.status} /></div></div></div>
          )) : <Empty>No product inquiries yet.</Empty>}</section>
      )}
      <Disclaimer>This is not an online pharmacy. No prescription, payment, shipment, controlled product sale or dispensing occurs here. Medication and peptide products must pass applicable regulatory, licensing and physician-authorization checks.</Disclaimer>
    </>
  )

  const reports = () => {
    const per: Row[] = ct.map((c) => ({ ...c, n: pt.filter((p) => p.center_id === c.id).length }))
    const max = Math.max(1, ...per.map((s) => s.n))
    const owned = ct.filter((c) => c.type === 'Company-owned').length
    const done = bk.filter((x) => x.status === 'Completed').length
    return (
      <>
        <Head k="PERFORMANCE INSIGHTS" title="See the whole network." sub="Center utilization and patient access, computed from live records."
          right={<a className="btn secondary" href="/admin/export">↓ &nbsp; Export centers CSV</a>} />
        <div className="stats">
          <Metric label="Network patients" value={pt.length} foot="All patient profiles" icon="♙" />
          <Metric label="Recorded visits" value={bk.length} foot="All consultations" icon="▦" />
          <Metric label="Partner centers" value={ct.length - owned} foot="Outsourced partners" icon="⌂" />
          <Metric label="Completion ratio" value={Math.round((100 * done) / Math.max(1, bk.length)) + '%'} foot="Completed of all visits" icon="✓" />
        </div>
        <div className="two">
          <section className="panel"><div className="section-head"><h2>Patient reach by center</h2></div>
            {per.length ? <div className="bar-list">{per.map((s) => (
              <div key={s.id} className="bar-item"><span>{s.name.length > 21 ? s.name.slice(0, 20) + '…' : s.name}</span>
                <div className="bar-bg"><div className="bar-fill" style={{ width: `${Math.round((s.n / max) * 100)}%` }} /></div><strong>{s.n}</strong></div>
            ))}</div> : <Empty>No centers yet.</Empty>}</section>
          <section className="panel"><div className="section-head"><h2>Network composition</h2></div>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '15px 0' }}>
              <div style={{ width: 180, height: 180, borderRadius: '50%', background: `conic-gradient(#2f7353 0 ${ct.length ? (100 * owned) / ct.length : 0}%,#c7ddcb 0 100%)`, display: 'grid', placeItems: 'center' }}>
                <div style={{ width: 126, height: 126, background: 'white', borderRadius: '50%', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
                  <div><strong style={{ font: "800 33px Manrope" }}>{ct.length}</strong><br /><span style={{ fontSize: 11, color: '#8a9a8d' }}>Total sites</span></div></div></div></div>
            <div className="center-list"><div>🟩 Company-owned · {owned}</div><div>🟨 Outsourced partners · {ct.length - owned}</div></div></section>
        </div>
      </>
    )
  }

  const support = () => (
    <>
      <Head k="OPERATIONS & ENABLEMENT" title="GutGuard support infrastructure." sub="GutGuard is the operational backbone supporting LONGEVIA care delivery, not the front-facing patient care brand." />
      <Hero k="BRAND & OPERATING MODEL" title="LONGEVIA leads care. GutGuard enables the network.">Patients interact with LONGEVIA for consultations, diagnostics, personalized health tracking and physician-directed care. GutGuard supports products, participating centers and service operations behind the scenes.</Hero>
      <div className="grid3">{[
        ['◇ Product operations', 'Product sourcing, center inventory coordination, fulfillment workflows and physician-approved supply support.'],
        ['⌂ Center & partner network', 'Infrastructure for owned centers and outsourced clinics, partner onboarding, operations and service coordination.'],
        ['⚙ IT & platform support', 'Website operations, platform maintenance, technical assistance, integration and data protection controls.'],
        ['☏ CSR support', 'Customer support for appointment questions, laboratory coordination, product inquiries and follow-ups.'],
        ['✚ Clinical independence', 'Qualified physicians remain responsible for clinical decisions; GutGuard operational staff do not authorize treatment.'],
        ['▤ Network reporting', 'Operational performance and partner service reporting, with restricted access to patient information.'],
      ].map(([t, p]) => <div key={t} className="small-card"><strong>{t}</strong><p>{p}</p></div>)}</div>
    </>
  )

  const views: Record<string, () => ReactNode> = { overview, appointments, patients, consult, centers, fulfillment, labs, records, health, care, shop, reports, support }

  return <Shell role={role} tab={tab} name={profile.full_name ?? ''} ok={sp.ok} err={sp.err}>{views[tab]()}</Shell>
}
