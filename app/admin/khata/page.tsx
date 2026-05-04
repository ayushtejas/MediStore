"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Eye,
  IndianRupee,
  PackageMinus,
  ReceiptText,
  Search,
  ShieldAlert,
  Trash2,
  WalletCards,
} from "lucide-react"

import { clientFetch } from "@/lib/api-client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PaginationControls, pageCount, pageItems } from "@/components/ui/pagination-controls"

function amount(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function inr(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
}

function orderPayable(order: any) {
  return amount(order.total_amount) + amount(order.tax_amount) - amount(order.bill_discount_amount)
}

function dueReminderState(order: any) {
  if (amount(order.due_amount) <= 0) return "cleared"
  if (!order.due_reminder_at) return "no_reminder"
  const reminderTime = new Date(order.due_reminder_at).getTime()
  if (Number.isNaN(reminderTime)) return "no_reminder"
  return reminderTime <= Date.now() ? "due_now" : "upcoming"
}

function prettyDate(value: string | null | undefined) {
  if (!value) return "Not set"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "Not set"
  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const FILTERS = [
  { key: "all", label: "All notifications" },
  { key: "unread", label: "Unread" },
  { key: "payment", label: "Payment reminders" },
  { key: "inventory", label: "Inventory alerts" },
  { key: "due_now", label: "Due now" },
  { key: "upcoming", label: "Upcoming" },
]

const ALERT_STATE_KEY = "medstore:khata-alert-state:v1"

type AlertState = {
  read: Record<string, string>
  deleted: Record<string, string>
}

const EMPTY_ALERT_STATE: AlertState = { read: {}, deleted: {} }

function loadAlertState(): AlertState {
  if (typeof window === "undefined") return EMPTY_ALERT_STATE
  try {
    const raw = window.localStorage.getItem(ALERT_STATE_KEY)
    if (!raw) return EMPTY_ALERT_STATE
    const parsed = JSON.parse(raw)
    return {
      read: parsed?.read && typeof parsed.read === "object" ? parsed.read : {},
      deleted: parsed?.deleted && typeof parsed.deleted === "object" ? parsed.deleted : {},
    }
  } catch {
    return EMPTY_ALERT_STATE
  }
}

function notificationReadLabel(isRead: boolean) {
  return isRead ? "Read" : "Unread"
}

export default function KhataAlertsPage() {
  const [filter, setFilter] = useState("all")
  const [query, setQuery] = useState("")
  const [selectedNotification, setSelectedNotification] = useState<any | null>(null)
  const [ledgerPage, setLedgerPage] = useState(1)
  const [ledgerPageSize, setLedgerPageSize] = useState(20)
  const [alertState, setAlertState] = useState<AlertState>(EMPTY_ALERT_STATE)

  useEffect(() => {
    setAlertState(loadAlertState())
  }, [])

  function updateAlertState(updater: (current: AlertState) => AlertState) {
    setAlertState((current) => {
      const next = updater(current)
      window.localStorage.setItem(ALERT_STATE_KEY, JSON.stringify(next))
      return next
    })
  }

  function markAlertRead(notificationId: string) {
    updateAlertState((current) => ({
      ...current,
      read: { ...current.read, [notificationId]: new Date().toISOString() },
    }))
  }

  function deleteAlert(notificationId: string) {
    updateAlertState((current) => ({
      read: { ...current.read, [notificationId]: new Date().toISOString() },
      deleted: { ...current.deleted, [notificationId]: new Date().toISOString() },
    }))
    setSelectedNotification((current: any | null) =>
      current?.id === notificationId ? null : current
    )
  }

  function openNotification(notification: any) {
    markAlertRead(notification.id)
    setSelectedNotification(notification)
  }

  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ["khata-orders"],
    queryFn: () => clientFetch<any[]>("/orders?limit=200"),
  })

  const { data: alerts } = useQuery({
    queryKey: ["khata-inventory-alerts"],
    queryFn: () =>
      clientFetch<{ low_stock_alerts: any[]; expiry_alerts: any[] }>(
        "/inventory/alerts"
      ),
  })

  const dueOrders = useMemo(
    () => orders.filter((order: any) => amount(order.due_amount) > 0),
    [orders]
  )

  const reminderBuckets = useMemo(() => {
    const dueNow = dueOrders.filter((order: any) => dueReminderState(order) === "due_now")
    const upcoming = dueOrders.filter((order: any) => dueReminderState(order) === "upcoming")
    const noReminder = dueOrders.filter((order: any) => dueReminderState(order) === "no_reminder")
    return { dueNow, upcoming, noReminder }
  }, [dueOrders])

  const paymentNotifications = useMemo(() => {
    return dueOrders.map((order: any) => {
      const state = dueReminderState(order)
      return {
        id: `payment-${order.id}`,
        type: "payment",
        state,
        title:
          state === "due_now"
            ? "Payment reminder due now"
            : state === "upcoming"
              ? "Upcoming payment reminder"
              : "Due bill needs reminder time",
        detail: `${order.customer_name || "Walk-in customer"} owes ${inr(amount(order.due_amount))}`,
        meta: order.due_reminder_at
          ? `Reminder: ${prettyDate(order.due_reminder_at)}`
          : "No reminder set yet",
        source: order,
        actionHref: "/admin/orders",
        actionLabel: "Open order archive",
        tone:
          state === "due_now"
            ? "border-rose-200 bg-rose-50 text-rose-800"
            : state === "upcoming"
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-slate-200 bg-slate-50 text-slate-700",
        sortAt: order.due_reminder_at
          ? new Date(order.due_reminder_at).getTime()
          : Number.MAX_SAFE_INTEGER,
      }
    })
  }, [dueOrders])

  const inventoryNotifications = useMemo(() => {
    const lowStock = (alerts?.low_stock_alerts ?? []).map((item: any) => ({
      id: `low-${item.inventory_id}`,
      type: "inventory",
      state: "low_stock",
      title: "Low inventory threshold crossed",
      detail: `${item.medicine_name} has ${item.quantity_available} left`,
      meta: `Batch ${item.batch_number} · threshold ${item.low_stock_threshold}`,
      source: item,
      actionHref: "/admin/inventory",
      actionLabel: "Open inventory",
      tone: "border-orange-200 bg-orange-50 text-orange-800",
      sortAt: 0,
    }))

    const expiry = (alerts?.expiry_alerts ?? []).map((item: any) => ({
      id: `expiry-${item.inventory_id || item.id}`,
      type: "inventory",
      state: "expiry",
      title: "Batch expiry watch",
      detail: `${item.medicine_name || "Medicine batch"} expires soon`,
      meta: `Batch ${item.batch_number} · expiry ${item.expiry_date}`,
      source: item,
      actionHref: "/admin/inventory",
      actionLabel: "Open inventory",
      tone: "border-yellow-200 bg-yellow-50 text-yellow-800",
      sortAt: 1,
    }))

    return [...lowStock, ...expiry]
  }, [alerts])

  const notifications = useMemo(() => {
    const all = [...paymentNotifications, ...inventoryNotifications].sort(
      (a, b) => a.sortAt - b.sortAt
    )
    return all.filter((notification) => {
      if (alertState.deleted[notification.id]) return false
      if (filter === "unread" && alertState.read[notification.id]) return false
      if (filter === "payment" && notification.type !== "payment") return false
      if (filter === "inventory" && notification.type !== "inventory") return false
      if (filter === "due_now" && notification.state !== "due_now") return false
      if (filter === "upcoming" && notification.state !== "upcoming") return false
      return true
    }).map((notification) => ({
      ...notification,
      isRead: Boolean(alertState.read[notification.id]),
    }))
  }, [alertState.deleted, alertState.read, filter, inventoryNotifications, paymentNotifications])

  const searchedDueOrders = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return dueOrders.filter((order: any) => {
      if (!needle) return true
      return [
        order.id,
        order.customer_name,
        order.customer_phone,
        order.payment_method,
        order.due_notes,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    })
  }, [dueOrders, query])

  const totalDue = dueOrders.reduce((sum: number, order: any) => sum + amount(order.due_amount), 0)
  const totalPaid = orders.reduce((sum: number, order: any) => sum + amount(order.amount_paid), 0)
  const visibleLowStockAlerts = (alerts?.low_stock_alerts ?? []).filter(
    (item: any) => !alertState.deleted[`low-${item.inventory_id}`]
  )
  const visibleExpiryAlerts = (alerts?.expiry_alerts ?? []).filter(
    (item: any) => !alertState.deleted[`expiry-${item.inventory_id || item.id}`]
  )
  const lowStockCount = visibleLowStockAlerts.length
  const expiryCount = visibleExpiryAlerts.length
  const unreadCount = [...paymentNotifications, ...inventoryNotifications].filter(
    (notification) => !alertState.deleted[notification.id] && !alertState.read[notification.id]
  ).length

  const statCards = [
    {
      label: "Khata Outstanding",
      value: inr(totalDue),
      sub: `${dueOrders.length} unpaid or partial bills`,
      icon: IndianRupee,
      tone: "bg-amber-50 text-amber-700",
    },
    {
      label: "Reminder Due Now",
      value: String(reminderBuckets.dueNow.length),
      sub: `${reminderBuckets.upcoming.length} upcoming · ${reminderBuckets.noReminder.length} unset`,
      icon: BellRing,
      tone: "bg-rose-50 text-rose-700",
    },
    {
      label: "Collected Ledger",
      value: inr(totalPaid),
      sub: "Based on orders created",
      icon: WalletCards,
      tone: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Inventory Notifications",
      value: String(lowStockCount + expiryCount),
      sub: `${lowStockCount} low stock · ${expiryCount} expiry watch`,
      icon: PackageMinus,
      tone: "bg-orange-50 text-orange-700",
    },
  ]
  const paginatedDueOrders = pageItems(searchedDueOrders, ledgerPage, ledgerPageSize)

  useEffect(() => {
    setLedgerPage(1)
  }, [query])

  useEffect(() => {
    setLedgerPage((current) => Math.min(current, pageCount(searchedDueOrders.length, ledgerPageSize)))
  }, [searchedDueOrders.length, ledgerPageSize])

  return (
    <div className="admin-page">
      <div className="admin-hero mb-6 overflow-hidden border-0 bg-[radial-gradient(circle_at_top_left,#fff7ed_0,#ecfeff_42%,#ffffff_78%)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="admin-eyebrow">Khata Book & Notifications</p>
            <h1 className="admin-title">Payment and Stock Reminder Centre</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              A dedicated offline command tab for due payments, reminder timing, order-linked
              khata entries, low inventory thresholds and expiry watch. This is the place the
              owner can manually check what needs action.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">
              {reminderBuckets.dueNow.length} reminders due now
            </Badge>
            <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">
              {unreadCount} unread alerts
            </Badge>
            <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">
              {lowStockCount} stock thresholds crossed
            </Badge>
            <Badge className="bg-white text-slate-700 hover:bg-white">
              Offline local data
            </Badge>
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map(({ label, value, sub, icon: Icon, tone }) => (
          <Card key={label} className="admin-stat-card">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
              </div>
              <div className={`rounded-2xl p-3 ${tone}`}>
                <Icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="space-y-6">
          <Card className="admin-card overflow-hidden">
            <CardHeader className="border-b border-amber-100 bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950 text-white">
              <CardTitle className="flex items-center gap-2 text-base">
                <BellRing className="h-4 w-4 text-amber-200" />
                Explicit Notification Feed
              </CardTitle>
              <p className="text-xs text-slate-300">
                Payment reminders, unset reminder warnings, low stock thresholds and expiry watch in one actionable feed.
              </p>
            </CardHeader>
            <CardContent className="p-4">
              <div className="mb-4 flex flex-wrap gap-2">
                {FILTERS.map((item) => (
                  <Button
                    key={item.key}
                    size="sm"
                    variant={filter === item.key ? "default" : "outline"}
                    onClick={() => setFilter(item.key)}
                    className="rounded-full"
                  >
                    {item.label}
                  </Button>
                ))}
              </div>

              <div className="space-y-3">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`w-full rounded-3xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${
                      notification.isRead ? "border-slate-200 bg-white text-slate-700 opacity-80" : notification.tone
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-2xl bg-white/70 p-2">
                        {notification.type === "payment" ? (
                          <CalendarClock className="h-4 w-4" />
                        ) : (
                          <ShieldAlert className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {!notification.isRead && (
                              <span className="h-2.5 w-2.5 rounded-full bg-cyan-500 shadow-[0_0_0_4px_rgba(6,182,212,0.14)]" />
                            )}
                            <p className="font-semibold">{notification.title}</p>
                            <Badge className={notification.isRead ? "bg-slate-100 text-slate-700 hover:bg-slate-100" : "bg-white/80 text-slate-900 hover:bg-white/80"}>
                              {notificationReadLabel(notification.isRead)}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-8 rounded-full bg-white/80 px-3 text-xs text-slate-900 hover:bg-white"
                              onClick={() => openNotification(notification)}
                            >
                              <Eye className="mr-1.5 h-3.5 w-3.5" />
                              View
                            </Button>
                            {!notification.isRead && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-full bg-white/70 px-3 text-xs"
                                onClick={() => markAlertRead(notification.id)}
                              >
                                Read
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-full border-rose-200 bg-white/70 px-3 text-xs text-rose-700 hover:bg-rose-50"
                              onClick={() => deleteAlert(notification.id)}
                            >
                              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                              Delete
                            </Button>
                          </div>
                        </div>
                        <p className="mt-1 text-sm opacity-90">{notification.detail}</p>
                        <p className="mt-1 text-xs opacity-75">{notification.meta}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {notifications.length === 0 && (
                  <div className="rounded-3xl border border-dashed border-emerald-200 bg-emerald-50/40 p-8 text-center">
                    <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                    <p className="mt-3 text-sm font-semibold text-slate-950">No notifications in this filter</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Payment reminders and stock thresholds will appear here automatically from local data.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-6">
          <Card className="admin-card overflow-hidden">
            <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-cyan-50 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Khata Book Ledger</p>
                  <p className="text-xs text-muted-foreground">
                    Every due or partial payment is tied back to the POS order that created it.
                  </p>
                </div>
                <div className="relative w-full lg:max-w-xs">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search customer, phone, order..."
                    className="h-10 rounded-2xl bg-white pl-9"
                  />
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order / Customer</TableHead>
                    <TableHead>Reminder</TableHead>
                    <TableHead className="text-right">Bill</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Due</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingOrders ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        Loading khata ledger...
                      </TableCell>
                    </TableRow>
                  ) : searchedDueOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        No pending khata entries found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedDueOrders.map((order: any) => {
                      const state = dueReminderState(order)
                      return (
                        <TableRow key={order.id}>
                          <TableCell>
                            <Link href="/admin/orders" className="font-mono text-xs font-semibold text-emerald-700 hover:underline">
                              #{order.id?.slice(0, 8)}
                            </Link>
                            <p className="mt-1 font-medium text-slate-950">
                              {order.customer_name || "Walk-in customer"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {order.customer_phone || "No phone"} · {new Date(order.created_at).toLocaleDateString("en-IN")}
                            </p>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm font-medium">{prettyDate(order.due_reminder_at)}</p>
                            <p className="text-xs text-muted-foreground">
                              {order.due_notes || "No reminder note"}
                            </p>
                          </TableCell>
                          <TableCell className="text-right font-semibold">{inr(orderPayable(order))}</TableCell>
                          <TableCell className="text-right text-emerald-700">{inr(amount(order.amount_paid))}</TableCell>
                          <TableCell className="text-right font-bold text-amber-700">{inr(amount(order.due_amount))}</TableCell>
                          <TableCell>
                            <Badge
                              className={
                                state === "due_now"
                                  ? "bg-rose-100 text-rose-800 hover:bg-rose-100"
                                  : state === "upcoming"
                                    ? "bg-amber-100 text-amber-800 hover:bg-amber-100"
                                    : "bg-slate-100 text-slate-700 hover:bg-slate-100"
                              }
                            >
                              {state === "due_now"
                                ? "Reminder due"
                                : state === "upcoming"
                                  ? "Scheduled"
                                  : "Set reminder"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            <PaginationControls
              page={ledgerPage}
              pageSize={ledgerPageSize}
              totalItems={searchedDueOrders.length}
              onPageChange={setLedgerPage}
              onPageSizeChange={setLedgerPageSize}
            />
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="admin-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <PackageMinus className="h-4 w-4 text-orange-700" />
                  Inventory Thresholds
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {visibleLowStockAlerts.slice(0, 8).map((item: any) => {
                  const alertId = `low-${item.inventory_id}`
                  const isRead = Boolean(alertState.read[alertId])
                  return (
                    <div key={item.inventory_id} className={`rounded-2xl border p-3 ${isRead ? "border-slate-200 bg-white" : "border-orange-100 bg-orange-50/60"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-950">{item.medicine_name}</p>
                          <p className="text-xs text-muted-foreground">Batch {item.batch_number}</p>
                          <Badge variant="outline" className="mt-2 text-[10px]">
                            {notificationReadLabel(isRead)}
                          </Badge>
                        </div>
                        <Badge variant="destructive">{item.quantity_available} left</Badge>
                      </div>
                      <p className="mt-2 text-xs font-medium text-orange-800">
                        Reorder threshold: {item.low_stock_threshold}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {!isRead && (
                          <Button size="sm" variant="outline" className="h-8 rounded-full bg-white text-xs" onClick={() => markAlertRead(alertId)}>
                            Mark read
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="h-8 rounded-full border-rose-200 bg-white text-xs text-rose-700 hover:bg-rose-50" onClick={() => deleteAlert(alertId)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  )
                })}
                {lowStockCount === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No stock thresholds are currently crossed.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="admin-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock3 className="h-4 w-4 text-yellow-700" />
                  Expiry Notifications
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {visibleExpiryAlerts.slice(0, 8).map((item: any) => {
                  const alertId = `expiry-${item.inventory_id || item.id}`
                  const isRead = Boolean(alertState.read[alertId])
                  return (
                    <div key={item.inventory_id || item.id} className={`rounded-2xl border p-3 ${isRead ? "border-slate-200 bg-white" : "border-yellow-100 bg-yellow-50/70"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-950">{item.medicine_name || "Medicine batch"}</p>
                          <p className="text-xs text-muted-foreground">Batch {item.batch_number}</p>
                          <Badge variant="outline" className="mt-2 text-[10px]">
                            {notificationReadLabel(isRead)}
                          </Badge>
                        </div>
                        <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
                          {item.expiry_date}
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {!isRead && (
                          <Button size="sm" variant="outline" className="h-8 rounded-full bg-white text-xs" onClick={() => markAlertRead(alertId)}>
                            Mark read
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="h-8 rounded-full border-rose-200 bg-white text-xs text-rose-700 hover:bg-rose-50" onClick={() => deleteAlert(alertId)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  )
                })}
                {expiryCount === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No batches are expiring in the alert window.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </div>

      <Dialog
        open={Boolean(selectedNotification)}
        onOpenChange={(open) => {
          if (!open) setSelectedNotification(null)
        }}
      >
        <DialogContent className="max-w-2xl border-emerald-100 bg-[linear-gradient(135deg,#ffffff_0%,#f8fffb_55%,#fff7ed_100%)]">
          {selectedNotification && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-2xl font-black tracking-tight text-slate-950">
                  {selectedNotification.type === "payment" ? (
                    <CalendarClock className="h-5 w-5 text-amber-700" />
                  ) : (
                    <ShieldAlert className="h-5 w-5 text-orange-700" />
                  )}
                  {selectedNotification.title}
                </DialogTitle>
                <DialogDescription>
                  {selectedNotification.type === "payment"
                    ? "Customer khata reminder with order-linked payment details."
                    : "Inventory notification details for stock or expiry action."}
                </DialogDescription>
              </DialogHeader>

              {selectedNotification.type === "payment" ? (
                <div className="space-y-4">
                  <div className="rounded-3xl border border-amber-100 bg-white/90 p-4 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-amber-700">
                          Customer
                        </p>
                        <p className="mt-2 text-xl font-black text-slate-950">
                          {selectedNotification.source.customer_name || "Walk-in customer"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {selectedNotification.source.customer_phone || "No phone captured"}
                        </p>
                      </div>
                      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                        Order #{selectedNotification.source.id?.slice(0, 8)}
                      </Badge>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs text-muted-foreground">Bill</p>
                        <p className="mt-1 font-bold text-slate-950">
                          {inr(orderPayable(selectedNotification.source))}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50 p-3">
                        <p className="text-xs text-muted-foreground">Paid</p>
                        <p className="mt-1 font-bold text-emerald-700">
                          {inr(amount(selectedNotification.source.amount_paid))}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-amber-50 p-3">
                        <p className="text-xs text-muted-foreground">Due</p>
                        <p className="mt-1 font-bold text-amber-700">
                          {inr(amount(selectedNotification.source.due_amount))}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-cyan-50 p-3">
                        <p className="text-xs text-muted-foreground">Payment</p>
                        <p className="mt-1 font-bold uppercase text-cyan-700">
                          {selectedNotification.source.payment_method || "cash"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-rose-100 bg-rose-50/50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-rose-700">
                      Reminder Details
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">
                      {prettyDate(selectedNotification.source.due_reminder_at)}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedNotification.source.due_notes || "No reminder note added yet."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-orange-100 bg-white/90 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-orange-700">
                    Inventory Item
                  </p>
                  <p className="mt-2 text-xl font-black text-slate-950">
                    {selectedNotification.source.medicine_name || "Medicine batch"}
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs text-muted-foreground">Batch</p>
                      <p className="mt-1 font-bold text-slate-950">
                        {selectedNotification.source.batch_number || "-"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-orange-50 p-3">
                      <p className="text-xs text-muted-foreground">Stock left</p>
                      <p className="mt-1 font-bold text-orange-700">
                        {selectedNotification.source.quantity_available ?? "-"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-amber-50 p-3">
                      <p className="text-xs text-muted-foreground">Threshold / Expiry</p>
                      <p className="mt-1 font-bold text-amber-700">
                        {selectedNotification.source.low_stock_threshold ??
                          selectedNotification.source.expiry_date ??
                          "-"}
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 rounded-2xl bg-orange-50 p-3 text-sm text-orange-900">
                    {selectedNotification.state === "low_stock"
                      ? "This batch has crossed the reorder threshold. Add purchase stock or adjust the threshold from Inventory."
                      : "This batch is inside the expiry alert window. Review sale priority, returns, or stock removal from Inventory."}
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                {!alertState.read[selectedNotification.id] && (
                  <Button variant="outline" onClick={() => markAlertRead(selectedNotification.id)}>
                    Mark read
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="border-rose-200 text-rose-700 hover:bg-rose-50"
                  onClick={() => deleteAlert(selectedNotification.id)}
                >
                  Delete alert
                </Button>
                <Button variant="outline" onClick={() => setSelectedNotification(null)}>
                  Close
                </Button>
                <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
                  <Link href={selectedNotification.actionHref}>
                    {selectedNotification.actionLabel}
                  </Link>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
