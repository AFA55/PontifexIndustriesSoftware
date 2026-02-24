'use client'

import AuthGuard from '@/components/AuthGuard'
import QueryProvider from '@/components/providers/QueryProvider'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthGuard>
      <QueryProvider>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
          {children}
        </div>
      </QueryProvider>
    </AuthGuard>
  )
}
