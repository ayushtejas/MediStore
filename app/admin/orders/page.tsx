"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Download,
  FileText,
  Search,
  Truck,
  WalletCards,
} from "lucide-react"

import { clientFetch, openBackendFile } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PaginationControls, pageCount, pageItems } from "@/components/ui/pagination-controls"

const STATUS_OPTIONS = [
  "pending",
  "confirmed",
  "packed",
  "dispatched",
  "delivered",
  "cancelled",
]

function amount(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function total(order: any) {
  return amount(order.total_amount) + amount(order.tax_amount) - amount(order.bill_discount_amount)
}

function lineTotal(item: any) {
  const base = amount(item.unit_price) * Number(item.quantity || 0)
  const discount = Math.min(amount(item.discount_amount), base)
  const taxable = base - discount
  const gst = amount(item.medicine?.gst_rate)
  return taxable + (taxable * gst) / 100
}

function inr(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
}

function paymentStatus(order: any) {
  return String(order.payment_status || order.online_order?.payment_status || "pending")
}

function paymentStatusClass(status: string) {
  if (status === "paid") return "bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
  if (status === "failed") return "bg-rose-50 text-rose-700 hover:bg-rose-50"
  return "bg-amber-50 text-amber-700 hover:bg-amber-50"
}

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return ""
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ""
  const offsetMs = parsed.getTimezoneOffset() * 60_000
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 16)
}

function fromDateTimeLocal(value: string) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return `${value}:00`
}

export default function OrdersPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [query, setQuery] = useState("")
  const [activeFilter, setActiveFilter] = useState("all")
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [paymentEditStatus, setPaymentEditStatus] = useState("paid")
  const [paymentEditAmount, setPaymentEditAmount] = useState("")
  const [paymentEditReminder, setPaymentEditReminder] = useState("")
  const [paymentEditNotes, setPaymentEditNotes] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: () => clientFetch<any[]>("/orders?limit=100"),
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      clientFetch(`/orders/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] })
      qc.invalidateQueries({ queryKey: ["admin-orders-overview"] })
      toast({ title: "Order status updated" })
    },
    onError: (error: Error) =>
      toast({
        title: "Failed to update status",
        description: error.message,
        variant: "destructive",
      }),
  })

  const updatePayment = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string
      payload: Record<string, string | number | null>
    }) =>
      clientFetch(`/orders/${id}/payment`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] })
      qc.invalidateQueries({ queryKey: ["admin-orders-overview"] })
      toast({ title: "Payment details updated" })
    },
    onError: (error: Error) =>
      toast({
        title: "Failed to update payment",
        description: error.message,
        variant: "destructive",
      }),
  })

  const filteredOrders = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return orders.filter((order: any) => {
      const matchesFilter =
        activeFilter === "all" ||
        (activeFilter === "pos" && order.type === "offline") ||
        (activeFilter === "dues" && amount(order.due_amount) > 0) ||
        (activeFilter === "delivered" && order.status === "delivered") ||
        (activeFilter === "open" &&
          ["pending", "confirmed", "packed", "dispatched"].includes(order.status))

      if (!matchesFilter) return false
      if (!needle) return true

      return [
        order.id,
        order.customer_name,
        order.customer_phone,
        order.payment_method,
        order.type,
        order.status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    })
  }, [activeFilter, orders, query])

  const offlineOrders = orders.filter((order: any) => order.type === "offline")
  const openOrders = orders.filter((order: any) =>
    ["pending", "packed", "dispatched"].includes(order.status)
  )
  const dueOrders = orders.filter((order: any) => amount(order.due_amount) > 0)
  const dueAmount = dueOrders.reduce((sum: number, order: any) => sum + amount(order.due_amount), 0)
  const discountGiven = orders.reduce((sum: number, order: any) => sum + amount(order.discount_amount), 0)
  const dueReminders = dueOrders.filter((order: any) => {
    if (!order.due_reminder_at) return false
    return new Date(order.due_reminder_at).getTime() <= Date.now()
  })
  const revenue = orders.reduce((sum: number, order: any) => sum + total(order), 0)
  const selectedOrder = useMemo(
    () => orders.find((order: any) => order.id === selectedOrderId) || null,
    [orders, selectedOrderId]
  )

  useEffect(() => {
    if (!selectedOrder) return
    setPaymentEditStatus(paymentStatus(selectedOrder))
    setPaymentEditAmount(String(amount(selectedOrder.amount_paid) || ""))
    setPaymentEditReminder(toDateTimeLocal(selectedOrder.due_reminder_at))
    setPaymentEditNotes(selectedOrder.due_notes || "")
  }, [selectedOrder])

  useEffect(() => {
    setPage(1)
  }, [activeFilter, query])

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount(filteredOrders.length, pageSize)))
  }, [filteredOrders.length, pageSize])

  const stats = [
    {
      label: "Total Revenue",
      value: inr(revenue),
      sub: `${orders.length} orders`,
      icon: WalletCards,
      tone: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Due Collection",
      value: inr(dueAmount),
      sub: `${dueOrders.length} bills · ${dueReminders.length} reminders due`,
      icon: Truck,
      tone: "bg-amber-50 text-amber-700",
    },
    {
      label: "Discount Given",
      value: inr(discountGiven),
      sub: `${offlineOrders.length} POS bills tracked`,
      icon: FileText,
      tone: "bg-cyan-50 text-cyan-700",
    },
  ]

  const downloadInvoice = (orderId: string) => {
    openBackendFile(`/orders/${orderId}/invoice.pdf`).catch((error) =>
      toast({
        title: "Could not open invoice",
        description: error.message,
        variant: "destructive",
      })
    )
  }

  const filters = [
    { key: "all", label: "All past orders", count: orders.length },
    { key: "open", label: "Open workflow", count: openOrders.length },
    { key: "dues", label: "Due / partial", count: dueOrders.length },
    { key: "pos", label: "POS bills", count: offlineOrders.length },
    {
      key: "delivered",
      label: "Delivered",
      count: orders.filter((order: any) => order.status === "delivered").length,
    },
  ]
  const paginatedOrders = pageItems(filteredOrders, page, pageSize)

  return (
    <div className="admin-page">
      <div className="admin-hero mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="admin-eyebrow">
            Past Bills
          </p>
          <h1 className="admin-title">
            Billing Archive
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            View every POS bill, inspect the counter workflow, and re-download a polished
            pharmacy bill whenever a customer needs it again.
          </p>
        </div>
        <div className="relative w-full lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search order, customer, payment..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-11 rounded-2xl border-emerald-100 bg-white/90 pl-9 shadow-sm"
          />
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stats.map(({ label, value, sub, icon: Icon, tone }) => (
          <div key={label} className="admin-stat-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
              </div>
              <div className={`rounded-md p-3 ${tone}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="admin-card overflow-hidden">
        <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-cyan-50 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-950">Bill archive</p>
              <p className="text-xs text-muted-foreground">
                Click any row to open the full bill snapshot and download the invoice again.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {filters.map((filter) => (
                <Button
                  key={filter.key}
                  size="sm"
                  variant={activeFilter === filter.key ? "default" : "outline"}
                  onClick={() => setActiveFilter(filter.key)}
                  className="rounded-full"
                >
                  {filter.label}
                  <span className="ml-2 rounded-full bg-white/60 px-1.5 text-[10px] text-slate-700">
                    {filter.count}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Invoice</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Loading orders...
                </TableCell>
              </TableRow>
            ) : filteredOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  No orders found.
                </TableCell>
              </TableRow>
            ) : (
              paginatedOrders.map((order: any) => (
                <TableRow
                  key={order.id}
                  className="cursor-pointer hover:bg-emerald-50/60"
                  onClick={() => setSelectedOrderId(order.id)}
                >
                  <TableCell>
                    <p className="font-mono text-xs font-semibold">
                      #{order.id?.slice(0, 8)}
                    </p>
                    <Badge
                      variant="secondary"
                      className="mt-1 capitalize"
                    >
                      {order.type === "online" ? "Legacy online" : "POS bill"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-slate-950">
                      {order.customer_name || "Walk-in"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {order.customer_phone || "No phone"} · {order.doctor_name || "No doctor"}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <Badge variant="outline" className="uppercase">
                        {order.payment_method || "cash"}
                      </Badge>
                      <Badge className={paymentStatusClass(paymentStatus(order))}>
                        {paymentStatus(order)}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {inr(total(order))}
                    <p className="text-xs font-normal text-muted-foreground">
                      Discount {inr(amount(order.discount_amount))} · Tax {inr(amount(order.tax_amount))}
                    </p>
                    <p className="text-xs font-normal text-amber-700">
                      Due {inr(amount(order.due_amount))}
                    </p>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">
                      {new Date(order.created_at).toLocaleDateString("en-IN")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(order.created_at).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div onClick={(event) => event.stopPropagation()}>
                      <Select
                        value={order.status}
                        onValueChange={(status) =>
                          updateStatus.mutate({ id: order.id, status })
                        }
                      >
                        <SelectTrigger className="h-8 w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation()
                        downloadInvoice(order.id)
                      }}
                    >
                      <Download className="mr-2 h-3.5 w-3.5" />
                      Bill PDF
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <PaginationControls
          page={page}
          pageSize={pageSize}
          totalItems={filteredOrders.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      <Dialog
        open={Boolean(selectedOrder)}
        onOpenChange={(open) => {
          if (!open) setSelectedOrderId(null)
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto border-emerald-100 bg-[linear-gradient(135deg,#ffffff_0%,#f4fbf8_55%,#ecfeff_100%)]">
          {selectedOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-col gap-2 text-2xl font-black tracking-tight text-slate-950 sm:flex-row sm:items-center sm:justify-between">
                  <span>Order #{selectedOrder.id.slice(0, 8)}</span>
                  <Button
                    className="rounded-full bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => downloadInvoice(selectedOrder.id)}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download bill again
                  </Button>
                </DialogTitle>
                <DialogDescription>
                  Full bill snapshot, payment mode, doctor details and line items.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-3xl border border-emerald-100 bg-white/90 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">
                    Customer
                  </p>
                  <p className="mt-2 font-semibold text-slate-950">
                    {selectedOrder.customer_name || "Walk-in customer"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selectedOrder.customer_phone || "No phone captured"}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {selectedOrder.customer_address || "No address captured"}
                  </p>
                </div>
                <div className="rounded-3xl border border-emerald-100 bg-white/90 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-cyan-700">
                    Payment
                  </p>
                  <p className="mt-2 text-2xl font-black text-slate-950">
                    {inr(total(selectedOrder))}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="outline" className="uppercase">
                      {selectedOrder.payment_method || "cash"}
                    </Badge>
                    <Badge className={paymentStatusClass(paymentStatus(selectedOrder))}>
                      {paymentStatus(selectedOrder).replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                    <p>Discount: {inr(amount(selectedOrder.discount_amount))}</p>
                    <p>Paid: {inr(amount(selectedOrder.amount_paid))}</p>
                    <p className={amount(selectedOrder.due_amount) > 0 ? "font-semibold text-amber-700" : ""}>
                      Due: {inr(amount(selectedOrder.due_amount))}
                    </p>
                    <p>
                      Reminder:{" "}
                      {selectedOrder.due_reminder_at
                        ? new Date(selectedOrder.due_reminder_at).toLocaleString("en-IN")
                        : "Not set"}
                    </p>
                  </div>
                </div>
                <div className="rounded-3xl border border-emerald-100 bg-white/90 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-amber-700">
                    Fulfilment
                  </p>
                  <p className="mt-2 font-semibold capitalize text-slate-950">
                    {selectedOrder.status}
                  </p>
                  <p className="text-sm capitalize text-muted-foreground">
                    {selectedOrder.type === "online" ? "Legacy online record" : "POS counter bill"}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(selectedOrder.created_at).toLocaleString("en-IN")}
                  </p>
                </div>
                <div className="rounded-3xl border border-emerald-100 bg-white/90 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-rose-700">
                    Doctor
                  </p>
                  <p className="mt-2 font-semibold text-slate-950">
                    {selectedOrder.doctor_name || "No doctor added"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selectedOrder.doctor_registration || "No registration"}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {selectedOrder.doctor_notes || "No doctor notes captured"}
                  </p>
                </div>
              </div>

              <div className="rounded-3xl border border-amber-100 bg-amber-50/60 p-4 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-amber-700">
                      Due & Reminder Control
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Owner-controlled follow-up for unpaid or partially paid bills.
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[150px_160px_220px_1fr_auto]">
                    <Select value={paymentEditStatus} onValueChange={setPaymentEditStatus}>
                      <SelectTrigger className="bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="paid">paid</SelectItem>
                        <SelectItem value="due">due</SelectItem>
                        <SelectItem value="partially_paid">partially paid</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentEditAmount}
                      onChange={(event) => setPaymentEditAmount(event.target.value)}
                      placeholder="Amount paid"
                      className="bg-white"
                    />
                    <Input
                      type="datetime-local"
                      value={paymentEditReminder}
                      onChange={(event) => setPaymentEditReminder(event.target.value)}
                      className="bg-white"
                    />
                    <Input
                      value={paymentEditNotes}
                      onChange={(event) => setPaymentEditNotes(event.target.value)}
                      placeholder="Reminder note"
                      className="bg-white"
                    />
                    <Button
                      disabled={updatePayment.isPending}
                      onClick={() =>
                        updatePayment.mutate({
                          id: selectedOrder.id,
                          payload: {
                            payment_status: paymentEditStatus,
                            amount_paid: amount(paymentEditAmount),
                            due_reminder_at: fromDateTimeLocal(paymentEditReminder),
                            due_notes: paymentEditNotes.trim() || null,
                          },
                        })
                      }
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-emerald-100 bg-white shadow-sm">
                <div className="border-b border-emerald-100 p-4">
                  <p className="font-semibold text-slate-950">Medicines billed</p>
                  <p className="text-xs text-muted-foreground">
                    Bill-ready line items with quantity, GST and payable amount.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Medicine</TableHead>
                        <TableHead>Brand / Category</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead className="text-right">Discount</TableHead>
                        <TableHead className="text-right">GST</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedOrder.items?.length ? (
                        selectedOrder.items.map((item: any) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <p className="font-medium text-slate-950">
                                {item.medicine?.name || `Medicine ${item.medicine_id?.slice(0, 8)}`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {item.medicine?.composition || "Composition not captured"}
                              </p>
                            </TableCell>
                            <TableCell>
                              <p>{item.medicine?.brand || "Generic"}</p>
                              <p className="text-xs text-muted-foreground">
                                {item.medicine?.category || "Uncategorized"}
                              </p>
                            </TableCell>
                            <TableCell className="text-right">{item.quantity}</TableCell>
                            <TableCell className="text-right">
                              {inr(amount(item.unit_price))}
                            </TableCell>
                            <TableCell className="text-right text-emerald-700">
                              {inr(amount(item.discount_amount))}
                            </TableCell>
                            <TableCell className="text-right">
                              {amount(item.medicine?.gst_rate).toFixed(2)}%
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {inr(lineTotal(item))}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                            No line items captured for this order.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
