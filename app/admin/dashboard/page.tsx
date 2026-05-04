"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  AlertTriangle,
  Banknote,
  Boxes,
  CreditCard,
  IndianRupee,
  PackageCheck,
  PackageMinus,
  ReceiptText,
  TrendingUp,
} from "lucide-react"

import { clientFetch } from "@/lib/api-client"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

function money(value: number | string | null | undefined) {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

function inr(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
}

function orderPayable(order: any) {
  return money(order.total_amount) + money(order.tax_amount) - money(order.bill_discount_amount)
}

export default function DashboardPage() {
  const { data: alerts } = useQuery({
    queryKey: ["inventory-alerts"],
    queryFn: () =>
      clientFetch<{ low_stock_alerts: any[]; expiry_alerts: any[] }>(
        "/inventory/alerts"
      ),
  })

  const { data: orders = [] } = useQuery({
    queryKey: ["admin-orders-overview"],
    queryFn: () => clientFetch<any[]>("/orders?limit=80"),
  })

  const { data: medicines = [] } = useQuery({
    queryKey: ["admin-medicines-overview"],
    queryFn: () => clientFetch<any[]>("/medicines?limit=200"),
  })

  const todayKey = new Date().toDateString()
  const todayOrders = orders.filter(
    (order: any) => new Date(order.created_at).toDateString() === todayKey
  )
  const confirmedOrders = orders.filter((order: any) => order.status === "confirmed")
  const todayRevenue = todayOrders.reduce(
    (sum: number, order: any) => sum + orderPayable(order),
    0
  )
  const dueOrders = orders.filter((order: any) => money(order.due_amount) > 0)
  const dueAmount = dueOrders.reduce((sum: number, order: any) => sum + money(order.due_amount), 0)
  const dueReminders = dueOrders.filter((order: any) => {
    if (!order.due_reminder_at) return false
    return new Date(order.due_reminder_at).getTime() <= Date.now()
  })
  const discountGiven = todayOrders.reduce(
    (sum: number, order: any) => sum + money(order.discount_amount),
    0
  )
  const stockUnits = medicines.reduce(
    (sum: number, med: any) => sum + Number(med.stock_available ?? 0),
    0
  )
  const inventoryValue = medicines.reduce(
    (sum: number, med: any) =>
      sum + Number(med.stock_available ?? 0) * money(med.selling_price),
    0
  )
  const outOfStock = medicines.filter((med: any) => Number(med.stock_available ?? 0) === 0)

  const paymentBreakdown = useMemo(() => {
    return ["cash", "upi", "card"].map((method) => {
      const count = orders.filter((order: any) => order.payment_method === method).length
      const max = Math.max(orders.length, 1)
      return { method, count, pct: Math.round((count / max) * 100) }
    })
  }, [orders])

  const categoryBreakdown = useMemo(() => {
    const counts = new Map<string, number>()
    for (const med of medicines) {
      counts.set(med.category || "Uncategorized", (counts.get(med.category || "Uncategorized") || 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }, [medicines])

  const topStatCards = [
    {
      label: "Today Sales",
      value: inr(todayRevenue),
      sub: `${todayOrders.length} bills today`,
      icon: IndianRupee,
      tone: "text-emerald-700 bg-emerald-50",
    },
    {
      label: "Inventory Units",
      value: stockUnits.toLocaleString("en-IN"),
      sub: `${medicines.length} SKUs tracked`,
      icon: Boxes,
      tone: "text-cyan-700 bg-cyan-50",
    },
    {
      label: "Stock Value",
      value: inr(inventoryValue),
      sub: "Based on current selling price",
      icon: PackageCheck,
      tone: "text-blue-700 bg-blue-50",
    },
    {
      label: "Due Collection",
      value: inr(dueAmount),
      sub: `${dueReminders.length} reminders due`,
      icon: AlertTriangle,
      tone: "text-amber-700 bg-amber-50",
    },
    {
      label: "Stock Alerts",
      value: String((alerts?.low_stock_alerts?.length ?? 0) + outOfStock.length),
      sub: `${alerts?.expiry_alerts?.length ?? 0} batches expiring soon`,
      icon: PackageMinus,
      tone: "text-rose-700 bg-rose-50",
    },
  ]

  return (
    <div className="admin-page">
      <div className="admin-hero mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="admin-eyebrow">
            Back Office
          </p>
          <h1 className="admin-title">
            Store Operations Dashboard
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            A cleaner pharmacy command view for sales, stock risk, order movement and
            payment mix.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Live stock sync</Badge>
          <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">FIFO sale deduction</Badge>
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{dueOrders.length} due bills</Badge>
          <Badge className="bg-white text-slate-700 hover:bg-white">{confirmedOrders.length} confirmed orders</Badge>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {topStatCards.map(({ label, value, sub, icon: Icon, tone }) => (
          <Card key={label} className="admin-stat-card">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
              </div>
              <div className={`rounded-md p-3 ${tone}`}>
                <Icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="space-y-6">
          <Card className="admin-card">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-cyan-700" />
                Sales & Payment Mix
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              {paymentBreakdown.map(({ method, count, pct }) => (
                <div key={method} className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-white to-emerald-50/50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {method === "cash" ? (
                        <Banknote className="h-4 w-4 text-emerald-700" />
                      ) : method === "card" ? (
                        <CreditCard className="h-4 w-4 text-blue-700" />
                      ) : (
                        <ReceiptText className="h-4 w-4 text-cyan-700" />
                      )}
                      <span className="text-sm font-medium capitalize">{method}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-emerald-100">
                    <div className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{pct}% of recent bills</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="admin-card">
            <CardHeader>
              <CardTitle className="text-base">Recent Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {orders.slice(0, 8).map((order: any) => (
                  <div
                    key={order.id}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-2xl border border-emerald-100 bg-white/85 px-4 py-3 text-sm shadow-sm"
                  >
                    <div>
                      <p className="font-medium text-slate-900">#{order.id?.slice(0, 8)}</p>
                      <p className="text-xs text-muted-foreground">
                        {order.customer_name || "Walk-in customer"} ·{" "}
                        {new Date(order.created_at).toLocaleString("en-IN")}
                      </p>
                    </div>
                    <Badge variant={order.status === "confirmed" ? "secondary" : "outline"}>
                      {order.status}
                    </Badge>
                    <div className="text-right">
                      <p className="font-semibold text-slate-950">{inr(orderPayable(order))}</p>
                      <p className="text-xs text-muted-foreground">
                        Disc {inr(money(order.discount_amount))} · Due {inr(money(order.due_amount))}
                      </p>
                    </div>
                  </div>
                ))}
                {orders.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No orders yet.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="admin-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-700" />
                Payment Follow-up Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                <p className="text-sm text-muted-foreground">Due amount pending</p>
                <p className="mt-1 text-2xl font-black text-amber-800">{inr(dueAmount)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{dueOrders.length} unpaid or partial bills</p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                <p className="text-sm text-muted-foreground">Discounts today</p>
                <p className="mt-1 text-2xl font-black text-emerald-800">{inr(discountGiven)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Tracked across item and bill discounts</p>
              </div>
              {dueReminders.slice(0, 4).map((order: any) => (
                <div key={order.id} className="rounded-2xl border border-amber-100 bg-white p-3 text-sm shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">#{order.id?.slice(0, 8)}</p>
                      <p className="text-xs text-muted-foreground">{order.customer_name || "Walk-in customer"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{order.due_notes || "No reminder note"}</p>
                    </div>
                    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                      {inr(money(order.due_amount))}
                    </Badge>
                  </div>
                </div>
              ))}
              {dueReminders.length === 0 && (
                <p className="rounded-2xl border border-dashed border-emerald-200 bg-white p-4 text-center text-sm text-muted-foreground md:col-span-2">
                  No payment reminders are due right now.
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-6">
          <Card className="admin-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <PackageMinus className="h-4 w-4 text-amber-700" />
                Stock Worklist
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(alerts?.low_stock_alerts ?? []).slice(0, 6).map((item: any) => (
                <div key={item.inventory_id} className="rounded-2xl border border-amber-100 bg-amber-50/50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-sm">{item.medicine_name}</p>
                    <Badge variant="destructive">{item.quantity_available} left</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Batch {item.batch_number} · Reorder threshold {item.low_stock_threshold}
                  </p>
                </div>
              ))}
              {(alerts?.low_stock_alerts?.length ?? 0) === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Stock levels are above thresholds.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="admin-card">
            <CardHeader>
              <CardTitle className="text-base">Category Spread</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {categoryBreakdown.map(({ category, count }) => {
                const pct = Math.round((count / Math.max(medicines.length, 1)) * 100)
                return (
                  <div key={category}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span>{category}</span>
                      <span className="text-muted-foreground">{count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200">
                      <div className="h-2 rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card className="admin-card">
            <CardHeader>
              <CardTitle className="text-base">Expiry Watch</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(alerts?.expiry_alerts ?? []).slice(0, 6).map((item: any) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-2xl border border-amber-100 bg-white/90 px-3 py-2 text-sm"
                >
                  <span>{item.batch_number}</span>
                  <span className="font-medium text-amber-700">{item.expiry_date}</span>
                </div>
              ))}
              {(alerts?.expiry_alerts?.length ?? 0) === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No active batches expiring in the next 30 days.
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}
