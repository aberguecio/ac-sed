import { AdminSidebar } from '@/components/admin/sidebar'
import { SessionProvider } from 'next-auth/react'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div className="flex md:flex-row flex-col min-h-screen bg-gray-50">
        <AdminSidebar />
        <main className="flex-1 overflow-auto md:pb-0 pb-16">{children}</main>
      </div>
    </SessionProvider>
  )
}
