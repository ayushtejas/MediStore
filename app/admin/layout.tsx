import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { OperatorAccessPanel } from "@/components/auth/OperatorAccessPanel"
import { AdminSidebarBrand } from "@/components/admin/AdminSidebarBrand"
import { AdminSidebarNav } from "@/components/admin/AdminSidebarNav"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session || (session.user as any)?.role !== "admin") redirect("/login")

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside className="flex h-screen w-72 shrink-0 flex-col overflow-hidden border-r border-border bg-card text-card-foreground shadow-sm">
        {/* Logo */}
        <div className="shrink-0 border-b border-border p-6">
          <AdminSidebarBrand />
        </div>

        <AdminSidebarNav />

        {/* Footer */}
        <div className="shrink-0 border-t border-border p-4">
          <OperatorAccessPanel
            email={session.user?.email}
            role={(session.user as any)?.role}
            variant="sidebar"
            showNavigation={false}
            className="border-emerald-300/10 bg-slate-950 text-white shadow-xl shadow-emerald-950/15"
          />
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto bg-background">{children}</main>
    </div>
  )
}
