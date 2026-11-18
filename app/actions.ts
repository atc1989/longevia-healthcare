'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { supabase } from '@/lib/supabase/server'

type Sb = Awaited<ReturnType<typeof supabase>>
type Res = PromiseLike<{ error: { message: string } | null }>

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const n = (f: FormData, k: string) => (s(f, k) === '' ? null : Number(s(f, k)))

// Runs one database call, then goes back to the page with a message the Toast shows.
async function run(f: FormData, ok: string, fn: (sb: Sb) => Res) {
  const back = /^\/[a-z]+(\?tab=[a-z]+)?$/.test(s(f, 'back')) ? s(f, 'back') : '/'
  const { error } = await fn(await supabase())
  revalidatePath('/', 'layout')
  redirect(`${back}${back.includes('?') ? '&' : '?'}${error ? 'err' : 'ok'}=${encodeURIComponent(error ? error.message : ok)}`)
}

// ---------- auth ----------

export async function signIn(f: FormData) {
  const sb = await supabase()
  const { error } = await sb.auth.signInWithPassword({ email: s(f, 'email'), password: s(f, 'password') })
  if (error) redirect(`/login?err=${encodeURIComponent(error.message)}`)
  redirect('/')
}

export async function signUp(f: FormData) {
  const sb = await supabase()
  const { data, error } = await sb.auth.signUp({
    email: s(f, 'email'),
    password: s(f, 'password'),
    options: { data: { full_name: s(f, 'name') } },
  })
  if (error) redirect(`/signup?err=${encodeURIComponent(error.message)}`)
  // No session yet means Supabase wants the email confirmed first.
  if (!data.session) redirect('/login?ok=' + encodeURIComponent('Check your email to confirm your account, then sign in.'))
  redirect('/')
}

export async function signOut() {
  const sb = await supabase()
  await sb.auth.signOut()
  redirect('/login')
}

// ---------- appointments ----------

export async function bookAppointment(f: FormData) {
  return run(f, 'Appointment booked. It starts as Pending.', (sb) =>
    sb.rpc('book_appointment', {
      p_patient: s(f, 'patient') || null, p_doctor: s(f, 'doctor'), p_center: s(f, 'center'),
      p_date: s(f, 'date'), p_time: s(f, 'time'), p_service: s(f, 'service'),
    }))
}

export async function advanceBooking(f: FormData) {
  return run(f, 'Appointment updated.', (sb) => sb.rpc('advance_booking', { p_id: s(f, 'id') }))
}

// ---------- patients and centers ----------

export async function registerPatient(f: FormData) {
  return run(f, 'Patient registered.', (sb) =>
    sb.rpc('register_patient', { p_name: s(f, 'name'), p_center: s(f, 'center') || null, p_care: s(f, 'care') }))
}

export async function addCenter(f: FormData) {
  return run(f, 'Center added as Pending.', (sb) =>
    sb.rpc('add_center', { p_name: s(f, 'name'), p_type: s(f, 'type'), p_city: s(f, 'city'), p_manager: s(f, 'manager') }))
}

export async function activateCenter(f: FormData) {
  return run(f, 'Center is now Active.', (sb) => sb.rpc('activate_center', { p_id: s(f, 'id') }))
}

// ---------- products ----------

export async function createOrder(f: FormData) {
  return run(f, 'Request created.', (sb) =>
    sb.rpc('create_order', {
      p_patient: s(f, 'patient') || null, p_product: s(f, 'product'), p_center: s(f, 'center'),
      p_qty: n(f, 'qty') ?? 1, p_purpose: s(f, 'purpose') || null,
    }))
}

export async function advanceOrder(f: FormData) {
  return run(f, 'Request updated.', (sb) => sb.rpc('advance_order', { p_id: s(f, 'id') }))
}

// ---------- labs and health tracker ----------

export async function requestLab(f: FormData) {
  return run(f, 'Lab request sent for clinician review.', (sb) =>
    sb.rpc('request_lab', { p_panel: n(f, 'panel'), p_center: s(f, 'center'), p_date: s(f, 'date'), p_note: s(f, 'note') || null }))
}

export async function reviewLab(f: FormData) {
  const approve = s(f, 'approve') === '1'
  return run(f, approve ? 'Lab request approved.' : 'Lab request declined.', (sb) =>
    sb.rpc('review_lab', { p_id: s(f, 'id'), p_approve: approve }))
}

const TYPES = ['application/pdf', 'image/jpeg', 'image/png']

export async function uploadLab(f: FormData) {
  const sb = await supabase()
  const { data: { user } } = await sb.auth.getUser()
  const file = f.get('file')
  const back = s(f, 'back')
  const fail = (m: string) => redirect(`${/^\/[a-z]+(\?tab=[a-z]+)?$/.test(back) ? back : '/'}${back.includes('?') ? '&' : '?'}err=${encodeURIComponent(m)}`)
  if (!user) redirect('/login')
  if (!(file instanceof File) || !file.size) return fail('Choose a file first.')
  if (file.size > 10 * 1024 * 1024) return fail('Choose a file under 10 MB.')
  if (!TYPES.includes(file.type)) return fail('Use a PDF, JPG or PNG file.')
  const path = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, '_').slice(-80)}`
  const up = await sb.storage.from('lab-reports').upload(path, file, { contentType: file.type })
  if (up.error) return fail(up.error.message)
  return run(f, 'Lab report uploaded.', async (sb2) => {
    const r = await sb2.rpc('add_upload', { p_path: path, p_name: file.name, p_label: s(f, 'label'), p_size: file.size })
    if (r.error) await sb2.storage.from('lab-reports').remove([path]) // don't leave an orphan file
    return r
  })
}

export async function addMarker(f: FormData) {
  return run(f, 'Biomarker added.', (sb) =>
    sb.rpc('add_marker', { p_type: n(f, 'type'), p_value: n(f, 'value'), p_date: s(f, 'date') }))
}
