import { supabase } from '@/lib/supabase/server'

// Opens a lab report through a 60-second signed link. RLS decides who can see the row.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sb = await supabase()
  const { data: u } = await sb.from('lab_uploads').select('path').eq('id', id).maybeSingle()
  const { data } = u ? await sb.storage.from('lab-reports').createSignedUrl(u.path, 60) : { data: null }
  return data ? Response.redirect(data.signedUrl) : new Response('Not found', { status: 404 })
}
