import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { BellRing, LayoutDashboard, Package, Settings, ShoppingCart, Truck } from "lucide-react"
import { OperatorAccessPanel } from "@/components/auth/OperatorAccessPanel"
import { AdminSidebarBrand } from "@/components/admin/AdminSidebarBrand"

const navItems = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/inventory", label: "Inventory", icon: Package },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCart },
  { href: "/admin/khata", label: "Khata & Alerts", icon: BellRing },
  { href: "/admin/suppliers", label: "Suppliers", icon: Truck },
  { href: "/admin/settings", label: "Settings", icon: Settings },
]

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

        {/* Nav */}
        <nav className="min-h-0 flex-1 space-y-1 p-4">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors text-sm font-medium"
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </nav>

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
