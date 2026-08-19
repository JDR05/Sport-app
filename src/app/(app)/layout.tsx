import { BottomNav } from '@/components/BottomNav'

export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <main>{children}</main>
      <BottomNav />
    </>
  )
}
