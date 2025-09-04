import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Dashboard - Pontifex Industries',
  description: 'Concrete Cutting Management System',
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      {children}
    </>
  )
}