"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { getSession, signOut } from "next-auth/react"
import {
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Package,
  ReceiptText,
  Repeat2,
  ShieldCheck,
  Truck,
  UserRound,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type OperatorRole = "admin" | "staff" | string
type PanelVariant = "sidebar" | "header"

interface OperatorAccessPanelProps {
  email?: string | null
  role?: OperatorRole | null
  variant?: PanelVariant
  showNavigation?: boolean
  className?: string
}

const ROLE_COPY: Record<string, { label: string; tone: string }> = {
  admin: {
    label: "Admin operator",
    tone: "bg-emerald-500/15 text-emerald-100 ring-emerald-400/30",
  },
  staff: {
    label: "Counter staff",
    tone: "bg-cyan-500/15 text-cyan-100 ring-cyan-400/30",
  },
}

function getNavigation(role?: OperatorRole | null) {
  if (role === "admin") {
    return [
      { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/inventory", label: "Inventory", icon: Package },
      { href: "/admin/orders", label: "Orders", icon: ClipboardList },
      { href: "/admin/suppliers", label: "Suppliers", icon: Truck },
      { href: "/pos", label: "POS", icon: ReceiptText },
    ]
  }

  if (role === "staff") {
    return [
      { href: "/pos", label: "POS", icon: ReceiptText },
    ]
  }

  return [{ href: "/login", label: "Sign in", icon: ReceiptText }]
}

export function OperatorAccessPanel({
  email: initialEmail,
  role: initialRole,
  variant = "sidebar",
  showNavigation = true,
  className,
}: OperatorAccessPanelProps) {
  const [email, setEmail] = useState(initialEmail ?? null)
  const [role, setRole] = useState<OperatorRole | null>(initialRole ?? null)
  const [loading, setLoading] = useState(!initialEmail && !initialRole)

  useEffect(() => {
    if (initialEmail || initialRole) return

    let mounted = true
    getSession()
      .then((session) => {
        if (!mounted) return
        setEmail(session?.user?.email ?? null)
        setRole(((session?.user as any)?.role as OperatorRole | undefined) ?? null)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [initialEmail, initialRole])

  const roleMeta = ROLE_COPY[String(role ?? "")] ?? {
    label: role ? `${role} account` : "Signed-in account",
    tone: "bg-white/10 text-slate-100 ring-white/20",
  }

  const navigation = useMemo(() => getNavigation(role), [role])
  const isSidebar = variant === "sidebar"

  return (
    <section
      className={cn(
        "rounded-2xl border p-3 shadow-sm",
        isSidebar
          ? "border-white/10 bg-white/[0.06] text-white"
          : "border-slate-200 bg-white/90 text-slate-900 shadow-lg shadow-cyan-950/5 backdrop-blur",
        className
      )}
      aria-label="Operator account controls"
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            isSidebar
              ? "bg-cyan-400/15 text-cyan-200"
              : "bg-cyan-50 text-cyan-700"
          )}
        >
          <UserRound className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={cn(
                "text-xs font-semibold uppercase tracking-[0.18em]",
                isSidebar ? "text-slate-400" : "text-slate-500"
              )}
            >
              Active Login
            </p>
            <Badge
              className={cn(
                "h-5 rounded-full px-2 text-[10px] uppercase tracking-wide ring-1 hover:bg-current/10",
                isSidebar ? roleMeta.tone : "bg-slate-900 text-white"
              )}
            >
              <ShieldCheck className="mr-1 h-3 w-3" />
              {roleMeta.label}
            </Badge>
          </div>
          <p
            className={cn(
              "mt-1 truncate text-sm font-medium",
              isSidebar ? "text-white" : "text-slate-950"
            )}
            title={email ?? undefined}
          >
            {loading ? "Checking session..." : email ?? "Authenticated operator"}
          </p>
        </div>
      </div>

      {showNavigation && (
        <div className={cn("mt-3 grid gap-2", isSidebar ? "grid-cols-1" : "sm:grid-cols-2")}>
          {navigation.map(({ href, label, icon: Icon }) => (
            <Button
              key={href}
              asChild
              size="sm"
              variant={isSidebar ? "ghost" : "outline"}
              className={cn(
                "justify-start gap-2",
                isSidebar && "text-slate-200 hover:bg-white/10 hover:text-white"
              )}
            >
              <Link href={href}>
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            </Button>
          ))}
        </div>
      )}

      <div className={cn("mt-3 grid gap-2", isSidebar ? "grid-cols-1" : "grid-cols-2")}>
        <Button
          size="sm"
          variant={isSidebar ? "secondary" : "default"}
          className="gap-2"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <Repeat2 className="h-4 w-4" />
          Switch role
        </Button>
        <Button
          size="sm"
          variant={isSidebar ? "ghost" : "outline"}
          className={cn(
            "gap-2",
            isSidebar && "text-slate-300 hover:bg-red-500/15 hover:text-red-100"
          )}
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          <LogOut className="h-4 w-4" />
          Log out
        </Button>
      </div>
    </section>
  )
}
