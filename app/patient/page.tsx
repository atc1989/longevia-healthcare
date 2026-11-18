import Portal from '@/components/Portal'

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <Portal role="patient" sp={await searchParams} />
}
