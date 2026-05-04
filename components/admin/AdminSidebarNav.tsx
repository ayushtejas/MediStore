"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BellRing, LayoutDashboard, Package, Settings, ShoppingCart, Truck } from "lucide-react"

import { cn } from "@/lib/utils"

const navItems = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/inventory", label: "Inventory", icon: Package },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCart },
  { href: "/admin/khata", label: "Khata & Alerts", icon: BellRing },
  { href: "/admin/suppliers", label: "Suppliers", icon: Truck },
  { href: "/admin/settings", label: "Settings", icon: Settings },
]

export function AdminSidebarNav() {
  const pathname = usePathname()

  return (
    <nav className="min-h-0 flex-1 space-y-1 p-4" aria-label="Admin navigation">
      {navItems.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`)

        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
              "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              isActive &&
                "bg-gradient-to-r from-emerald-600 to-cyan-600 text-white shadow-lg shadow-emerald-900/15 hover:from-emerald-600 hover:to-cyan-600 hover:text-white"
            )}
          >
            <span
              className={cn(
                "absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-transparent transition-colors",
                isActive && "bg-white/90"
              )}
            />
            <Icon
              className={cn(
                "h-4 w-4 transition-transform group-hover:scale-110",
                isActive ? "text-white" : "text-muted-foreground group-hover:text-accent-foreground"
              )}
            />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
