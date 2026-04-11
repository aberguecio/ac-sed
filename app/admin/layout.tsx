import { AdminSidebar } from '@/components/admin/sidebar'
import { SessionProvider } from 'next-auth/react'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div className="flex min-h-screen bg-gray-50">
        <AdminSidebar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </SessionProvider>
  )
}
