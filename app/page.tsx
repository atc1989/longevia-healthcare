import { redirect } from 'next/navigation'
import { me } from '@/lib/session'
import { ROLE_HOME } from '@/lib/ui'

export default async function Home() {
  const { profile } = await me()
  redirect(ROLE_HOME[profile.role])
}
