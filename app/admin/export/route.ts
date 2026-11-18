import { me } from '@/lib/session'

const cell = (x: unknown) => {
  let v = String(x ?? '')
  if (/^[=+\-@]/.test(v)) v = "'" + v // stop spreadsheet formula injection
  return '"' + v.replace(/"/g, '""') + '"'
}

export async function GET() {
  const { sb } = await me('admin')
  const [c, p, b] = await Promise.all([
    sb.from('centers').select('*').order('id'),
    sb.from('patients').select('center_id'),
    sb.from('bookings').select('center_id'),
  ])
  const count = (rows: { center_id: string | null }[] | null, id: string) => (rows ?? []).filter((r) => r.center_id === id).length
  const rows = [['Center ID', 'Center name', 'Type', 'City', 'Status', 'Patients', 'Visits'],
    ...(c.data ?? []).map((x) => [x.id, x.name, x.type, x.city, x.status, count(p.data, x.id), count(b.data, x.id)])]
  return new Response(rows.map((r) => r.map(cell).join(',')).join('\r\n'), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="longevia-centers.csv"' },
  })
}
