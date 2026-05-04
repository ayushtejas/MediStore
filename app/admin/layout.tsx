import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { BellRing, LayoutDashboard, Package, ShoppingCart, Truck, Sparkles } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { OperatorAccessPanel } from "@/components/auth/OperatorAccessPanel"

const navItems = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/inventory", label: "Inventory", icon: Package },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCart },
  { href: "/admin/khata", label: "Khata & Alerts", icon: BellRing },
  { href: "/admin/suppliers", label: "Suppliers", icon: Truck },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session || (session.user as any)?.role !== "admin") redirect("/login")

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside className="flex h-screen w-72 shrink-0 flex-col overflow-hidden border-r border-border bg-card text-card-foreground shadow-sm">
        {/* Logo */}
        <div className="shrink-0 border-b border-border p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-cyan-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-700/20">
                <span className="text-white text-sm font-bold">Rx</span>
              </div>
              <div>
                <span className="font-semibold text-foreground">MedStore Admin</span>
                <p className="text-xs text-muted-foreground">Pharmacy command centre</p>
              </div>
            </div>
            <ThemeToggle />
          </div>

          <div className="mt-5 rounded-2xl border border-border bg-muted/50 p-3 text-xs text-muted-foreground shadow-sm">
            <div className="mb-1 flex items-center gap-2 font-semibold text-emerald-600 dark:text-emerald-400">
              <Sparkles className="h-3.5 w-3.5" />
              Live operations
            </div>
            Stock, billing and fulfilment are linked to the same inventory flow.
          </div>
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
