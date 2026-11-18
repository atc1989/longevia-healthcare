import { redirect } from 'next/navigation'
import { supabase } from './supabase/server'
import { ROLE_HOME } from './ui'

export async function me(role?: string) {
  const sb = await supabase()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await sb.from('profiles').select('role, full_name, center_id').eq('id', user.id).single()
  if (!profile) redirect('/login')
  if (role && profile.role !== role) redirect(ROLE_HOME[profile.role])
  return { sb, user, profile }
}
