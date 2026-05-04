"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getSession, signOut } from "next-auth/react"
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Minus,
  Package2,
  Plus,
  Repeat2,
  Search,
  Trash2,
  Wallet,
} from "lucide-react"

import { clientFetch, openBackendFile } from "@/lib/api-client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import {
  FALLBACK_STORE_PROFILE,
  storeInitials,
  usePublicStoreProfile,
  useSyncedDocumentTitle,
} from "@/components/store/StoreBrand"

interface Medicine {
  id: string
  name: string
  brand?: string | null
  category?: string | null
  composition?: string | null
  selling_price?: number | string | null
  gst_rate?: number | string | null
  stock_available?: number
  prescription_required: boolean
}

interface CartLine {
  medicine: Medicine
  quantity: number
  discount: string
}

type PaymentMethod = "cash" | "upi" | "card"
type PaymentStatus = "paid" | "due" | "partially_paid"

interface Order {
  id: string
  created_at: string
  total_amount: number | string
  tax_amount?: number | string
  discount_amount?: number | string
  bill_discount_amount?: number | string
  amount_paid?: number | string
  due_amount?: number | string
  payment_status?: PaymentStatus | string
  status: string
  type: string
  payment_method?: PaymentMethod
  customer_name?: string | null
  customer_phone?: string | null
}

function toAmount(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function orderPayable(order: Order): number {
  return (
    toAmount(order.total_amount) +
    toAmount(order.tax_amount) -
    toAmount(order.bill_discount_amount)
  )
}

function optionalText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function clampDiscount(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.min(value, Math.max(max, 0))
}

function toLocalInputIso(value: string): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

const PAYMENT_OPTIONS: { label: string; value: PaymentMethod }[] = [
  { label: "Cash", value: "cash" },
  { label: "UPI", value: "upi" },
  { label: "Card", value: "card" },
]

const PAYMENT_STATUS_OPTIONS: { label: string; value: PaymentStatus; help: string }[] = [
  { label: "Paid", value: "paid", help: "Full amount collected now" },
  { label: "Due", value: "due", help: "Nothing collected, reminder required" },
  { label: "Partial", value: "partially_paid", help: "Some amount collected" },
]

export default function POSPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const profileQuery = usePublicStoreProfile()
  const profile = profileQuery.data || FALLBACK_STORE_PROFILE
  useSyncedDocumentTitle(`${profile.app_name} POS`)
  const [operatorRole, setOperatorRole] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [activeCategory, setActiveCategory] = useState("All")
  const [cart, setCart] = useState<CartLine[]>([])
  const [completing, setCompleting] = useState(false)
  const [lastInvoiceOrderId, setLastInvoiceOrderId] = useState<string | null>(null)

  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [customerAddress, setCustomerAddress] = useState("")
  const [doctorName, setDoctorName] = useState("")
  const [doctorRegistration, setDoctorRegistration] = useState("")
  const [prescriptionNotes, setPrescriptionNotes] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash")
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("paid")
  const [billDiscount, setBillDiscount] = useState("")
  const [amountPaid, setAmountPaid] = useState("")
  const [dueReminderAt, setDueReminderAt] = useState("")
  const [dueNotes, setDueNotes] = useState("")

  useEffect(() => {
    let mounted = true
    getSession().then((session) => {
      if (!mounted) return
      setOperatorRole(((session?.user as any)?.role as string | undefined) ?? null)
    })
    return () => {
      mounted = false
    }
  }, [])

  const { data: catalog = [], isLoading: loadingCatalog } = useQuery({
    queryKey: ["pos-catalog", search],
    queryFn: () =>
      clientFetch<Medicine[]>(
        `/medicines?in_stock=true&limit=200${
          search.trim() ? `&q=${encodeURIComponent(search.trim())}` : ""
        }`
      ),
  })

  const { data: allInStock = [] } = useQuery({
    queryKey: ["pos-categories-catalog"],
    queryFn: () => clientFetch<Medicine[]>("/medicines?in_stock=true&limit=200"),
  })

  const { data: alerts } = useQuery({
    queryKey: ["pos-alerts"],
    queryFn: () =>
      clientFetch<{ low_stock_alerts: any[]; expiry_alerts: any[] }>(
        "/inventory/alerts"
      ),
  })

  const { data: recentOrders = [] } = useQuery({
    queryKey: ["pos-recent-orders"],
    queryFn: () => clientFetch<Order[]>("/orders?limit=30"),
  })

  const categories = useMemo(() => {
    const discovered = Array.from(
      new Set(allInStock.map((m) => m.category || "Uncategorized"))
    )
    return ["All", ...discovered]
  }, [allInStock])

  const visibleMedicines = useMemo(() => {
    if (activeCategory === "All") return catalog
    return catalog.filter((m) => (m.category || "Uncategorized") === activeCategory)
  }, [activeCategory, catalog])

  const quickTiles = useMemo(() => visibleMedicines.slice(0, 12), [visibleMedicines])

  const cartQuantityByMedicine = useMemo(() => {
    return new Map(cart.map((line) => [line.medicine.id, line.quantity]))
  }, [cart])

  const todayDate = new Date().toDateString()
  const todayOrders = recentOrders.filter(
    (o) => new Date(o.created_at).toDateString() === todayDate
  )
  const todayRevenue = todayOrders.reduce((sum, o) => sum + orderPayable(o), 0)

  const addToCart = (medicine: Medicine) => {
    const stock = Number(medicine.stock_available ?? 0)
    if (stock <= 0) {
      toast({
        title: "Out of stock",
        description: `${medicine.name} is currently out of stock.`,
        variant: "destructive",
      })
      return
    }

    setCart((current) => {
      const existing = current.find((line) => line.medicine.id === medicine.id)
      if (!existing) return [...current, { medicine, quantity: 1, discount: "" }]

      if (existing.quantity >= stock) {
        toast({
          title: "Stock limit reached",
          description: `Only ${stock} units available for ${medicine.name}.`,
          variant: "destructive",
        })
        return current
      }

      return current.map((line) =>
        line.medicine.id === medicine.id
          ? { ...line, quantity: line.quantity + 1 }
          : line
      )
    })
  }

  const updateQty = (medicineId: string, delta: number) => {
    setCart((current) =>
      current
        .map((line) => {
          if (line.medicine.id !== medicineId) return line
          const nextQty = line.quantity + delta
          const stock = Number(line.medicine.stock_available ?? 0)
          if (delta > 0 && nextQty > stock) {
            toast({
              title: "Stock limit reached",
              description: `Only ${stock} units available for ${line.medicine.name}.`,
              variant: "destructive",
            })
            return line
          }
          return { ...line, quantity: nextQty }
        })
        .filter((line) => line.quantity > 0)
    )
  }

  const updateLineDiscount = (medicineId: string, value: string) => {
    setCart((current) =>
      current.map((line) =>
        line.medicine.id === medicineId ? { ...line, discount: value } : line
      )
    )
  }

  const billMath = useMemo(() => {
    const lines = cart.map((line) => {
      const price = toAmount(line.medicine.selling_price)
      const gross = price * line.quantity
      const discount = clampDiscount(toAmount(line.discount), gross)
      const taxable = gross - discount
      const gst = (taxable * toAmount(line.medicine.gst_rate)) / 100
      return { ...line, gross, discount, taxable, gst, total: taxable + gst }
    })
    const grossSubtotal = lines.reduce((sum, line) => sum + line.gross, 0)
    const itemDiscount = lines.reduce((sum, line) => sum + line.discount, 0)
    const taxableSubtotal = lines.reduce((sum, line) => sum + line.taxable, 0)
    const taxTotal = lines.reduce((sum, line) => sum + line.gst, 0)
    const billDiscountValue = clampDiscount(
      toAmount(billDiscount),
      taxableSubtotal + taxTotal
    )
    const totalDiscount = itemDiscount + billDiscountValue
    const payable = Math.max(taxableSubtotal + taxTotal - billDiscountValue, 0)
    const collected =
      paymentStatus === "paid"
        ? payable
        : paymentStatus === "due"
          ? 0
          : clampDiscount(toAmount(amountPaid), payable)
    const due = Math.max(payable - collected, 0)

    return {
      lines,
      grossSubtotal,
      itemDiscount,
      taxableSubtotal,
      taxTotal,
      billDiscountValue,
      totalDiscount,
      payable,
      collected,
      due,
    }
  }, [amountPaid, billDiscount, cart, paymentStatus])

  const downloadInvoice = (orderId: string) => {
    openBackendFile(`/orders/${orderId}/invoice.pdf`).catch((error) =>
      toast({
        title: "Could not open invoice",
        description: error.message,
        variant: "destructive",
      })
    )
  }

  async function checkout() {
    if (cart.length === 0) return

    setCompleting(true)
    try {
      const order = await clientFetch<{ id: string }>("/orders", {
        method: "POST",
        body: JSON.stringify({
          type: "offline",
          customer_name: optionalText(customerName),
          customer_phone: optionalText(customerPhone),
          customer_address: optionalText(customerAddress),
          doctor_name: optionalText(doctorName),
          doctor_registration: optionalText(doctorRegistration),
          prescription_notes: optionalText(prescriptionNotes),
          payment_method: paymentMethod,
          payment_status: paymentStatus,
          bill_discount_amount: billMath.billDiscountValue.toFixed(2),
          amount_paid: billMath.collected.toFixed(2),
          due_reminder_at: toLocalInputIso(dueReminderAt),
          due_notes: optionalText(dueNotes),
        }),
      })

      for (const line of billMath.lines) {
        await clientFetch(`/orders/${order.id}/items`, {
          method: "POST",
          body: JSON.stringify({
            medicine_id: line.medicine.id,
            quantity: line.quantity,
            discount_amount: line.discount.toFixed(2),
          }),
        })
      }

      const completed = await clientFetch<any>(`/orders/${order.id}/complete`, {
        method: "POST",
      })

      setLastInvoiceOrderId(order.id)
      toast({
        title: "Sale completed",
        description: `Order ${order.id.slice(0, 8)} billed for ₹${(
          toAmount(completed.total_amount) +
          toAmount(completed.tax_amount) -
          toAmount(completed.bill_discount_amount)
        ).toFixed(2)}. Due: ₹${toAmount(completed.due_amount).toFixed(2)}. PDF invoice ready.`,
      })

      setCart([])
      setCustomerName("")
      setCustomerPhone("")
      setCustomerAddress("")
      setDoctorName("")
      setDoctorRegistration("")
      setPrescriptionNotes("")
      setPaymentMethod("cash")
      setPaymentStatus("paid")
      setBillDiscount("")
      setAmountPaid("")
      setDueReminderAt("")
      setDueNotes("")

      queryClient.invalidateQueries({ queryKey: ["pos-recent-orders"] })
      queryClient.invalidateQueries({ queryKey: ["pos-alerts"] })
      queryClient.invalidateQueries({ queryKey: ["pos-catalog"] })
      queryClient.invalidateQueries({ queryKey: ["pos-categories-catalog"] })

      downloadInvoice(order.id)
    } catch (error: any) {
      toast({
        title: "Billing failed",
        description: error?.message || "Unable to complete this sale.",
        variant: "destructive",
      })
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f7faf4]">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-[#fbfdf8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-3 px-4 py-3 lg:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
              <span className="text-sm font-black">{storeInitials(profile.app_name)}</span>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-700">
                {profile.app_name}
              </p>
              <h1 className="text-lg font-black tracking-tight text-slate-950">
                POS Billing
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="hidden items-center gap-2 xl:flex">
              <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1">
                {catalog.length} SKUs
              </Badge>
              <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1">
                {todayOrders.length} bills today
              </Badge>
              <Badge className="rounded-full bg-emerald-700 px-3 py-1 text-white hover:bg-emerald-700">
                ₹{todayRevenue.toFixed(0)}
              </Badge>
            </div>
            <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1">
              {operatorRole === "admin" ? "Admin" : "Staff"} session
            </Badge>
            {operatorRole === "admin" && (
              <Button asChild size="sm" variant="outline" className="rounded-full">
                <Link href="/admin/dashboard">
                  <LayoutDashboard className="mr-1.5 h-3.5 w-3.5" />
                  Admin
                </Link>
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <Repeat2 className="mr-1.5 h-3.5 w-3.5" />
              Switch role
            </Button>
            <Button
              size="sm"
              className="rounded-full bg-slate-950 text-white hover:bg-slate-800"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="mr-1.5 h-3.5 w-3.5" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1320px] gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_390px] lg:px-5">
        <section className="space-y-3">
          <Card className="overflow-hidden rounded-3xl border-slate-200 bg-white shadow-sm">
            <CardContent className="p-3">
              <div className="grid gap-3 xl:grid-cols-[1fr_420px] xl:items-center">
                <div>
                  <p className="text-sm font-black text-slate-950">
                    Search medicine, tap item, complete bill.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Designed for counter speed: catalog first, bill always visible.
                  </p>
                </div>
                <div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <Input
                      placeholder="Search by name, brand, composition..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-11 rounded-2xl border-slate-200 bg-slate-50 pl-9 text-slate-900 shadow-inner"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-slate-200 bg-white shadow-sm">
            <CardContent className="flex gap-2 overflow-x-auto p-3">
              {categories.map((category) => (
                <Button
                  key={category}
                  size="sm"
                  variant={activeCategory === category ? "default" : "outline"}
                  onClick={() => setActiveCategory(category)}
                  className="shrink-0 rounded-full"
                >
                  {category}
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-slate-200 bg-white shadow-sm">
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="flex items-center justify-between text-base">
                <span>Catalog</span>
                <span className="text-xs font-medium text-muted-foreground">
                  {visibleMedicines.length} matching
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {loadingCatalog ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Loading inventory...
                </p>
              ) : quickTiles.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No in-stock medicines found for this filter.
                  </p>
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {quickTiles.map((medicine) => {
                    const price = toAmount(medicine.selling_price)
                    const stock = Number(medicine.stock_available ?? 0)
                    const selectedQty = cartQuantityByMedicine.get(medicine.id) ?? 0
                    return (
                      <div
                        key={medicine.id}
                        onClick={() => addToCart(medicine)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            addToCart(medicine)
                          }
                        }}
                        className={`group cursor-pointer rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-900/10 ${
                          selectedQty > 0
                            ? "border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-100"
                            : "border-slate-200 bg-[#fcfefb] hover:border-emerald-500"
                        }`}
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-slate-900">{medicine.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {medicine.brand || "Generic"}
                            </p>
                          </div>
                          {medicine.prescription_required && (
                            <Badge variant="destructive" className="text-[10px]">
                              Rx
                            </Badge>
                          )}
                        </div>
                        <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
                          <span>{medicine.category || "Uncategorized"}</span>
                          <span>{stock} in stock</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-base font-semibold text-cyan-700">
                            ₹{price.toFixed(2)}
                          </p>
                          {selectedQty > 0 ? (
                            <div
                              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white p-1 shadow-sm"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 rounded-full text-emerald-800 hover:bg-emerald-100"
                                onClick={() => updateQty(medicine.id, -1)}
                                aria-label={`Decrease ${medicine.name} quantity`}
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </Button>
                              <span className="min-w-8 text-center text-sm font-black text-emerald-900">
                                {selectedQty}
                              </span>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 rounded-full text-emerald-800 hover:bg-emerald-100"
                                onClick={() => updateQty(medicine.id, 1)}
                                aria-label={`Increase ${medicine.name} quantity`}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                              <Plus className="h-3 w-3" />
                              Add
                            </span>
                          )}
                        </div>
                        {selectedQty > 0 && (
                          <p className="mt-2 rounded-full bg-emerald-600 px-2 py-1 text-center text-[11px] font-bold text-white">
                            {selectedQty} added to current bill
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="rounded-3xl border-slate-200 bg-white shadow-xl shadow-slate-950/5">
            <CardHeader className="px-4 pb-3 pt-4">
              <CardTitle className="flex items-center justify-between">
                <span className="text-base">Current Bill</span>
                <Badge variant="secondary">{cart.length} lines</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Optional Customer & Doctor Details
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Customer name"
                  />
                  <Input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Customer phone"
                  />
                  <Input
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    placeholder="Prescribed doctor"
                  />
                  <Input
                    value={doctorRegistration}
                    onChange={(e) => setDoctorRegistration(e.target.value)}
                    placeholder="Doctor registration no."
                  />
                </div>
                <div className="mt-2 grid gap-2">
                  <Input
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder="Customer address"
                  />
                  <Input
                    value={prescriptionNotes}
                    onChange={(e) => setPrescriptionNotes(e.target.value)}
                    placeholder="Prescription notes / remarks"
                  />
                </div>
                <div className="mt-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Payment Method
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {PAYMENT_OPTIONS.map((option) => (
                      <Button
                        key={option.value}
                        size="sm"
                        variant={paymentMethod === option.value ? "default" : "outline"}
                        onClick={() => setPaymentMethod(option.value)}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="mt-3 rounded-2xl border border-emerald-100 bg-white p-2">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Payment Status
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {PAYMENT_STATUS_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setPaymentStatus(option.value)}
                        className={`rounded-xl border px-2 py-2 text-left transition ${
                          paymentStatus === option.value
                            ? "border-emerald-500 bg-emerald-50 text-emerald-950"
                            : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300"
                        }`}
                      >
                        <span className="block text-xs font-black">{option.label}</span>
                        <span className="block text-[10px] leading-tight text-muted-foreground">
                          {option.help}
                        </span>
                      </button>
                    ))}
                  </div>
                  {paymentStatus === "partially_paid" && (
                    <div className="mt-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={amountPaid}
                        onChange={(event) => setAmountPaid(event.target.value)}
                        placeholder="Amount collected now"
                        className="h-9"
                      />
                    </div>
                  )}
                  {paymentStatus !== "paid" && (
                    <div className="mt-2 grid gap-2">
                      <Input
                        type="datetime-local"
                        value={dueReminderAt}
                        onChange={(event) => setDueReminderAt(event.target.value)}
                        className="h-9"
                      />
                      <Input
                        value={dueNotes}
                        onChange={(event) => setDueNotes(event.target.value)}
                        placeholder="Reminder note, e.g. call before closing"
                        className="h-9"
                      />
                    </div>
                  )}
                </div>
              </div>

              {cart.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    Add medicines from the quick grid to start billing.
                  </p>
                </div>
              ) : (
                <>
                  <div className="max-h-[320px] space-y-2 overflow-auto pr-1">
                    {billMath.lines.map((line) => (
                      <div
                        key={line.medicine.id}
                        className="rounded-lg border bg-slate-50 p-3"
                      >
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">{line.medicine.name}</p>
                            <p className="text-xs text-muted-foreground">
                              ₹{toAmount(line.medicine.selling_price).toFixed(2)} each
                            </p>
                          </div>
                          <button
                            onClick={() => updateQty(line.medicine.id, -line.quantity)}
                            className="rounded p-1 text-muted-foreground transition hover:bg-slate-200 hover:text-destructive"
                            aria-label="Remove item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="inline-flex items-center gap-1 rounded-md border bg-white p-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => updateQty(line.medicine.id, -1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center text-sm font-medium">
                              {line.quantity}
                            </span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => updateQty(line.medicine.id, 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">
                              ₹{line.total.toFixed(2)}
                            </p>
                            {line.discount > 0 && (
                              <p className="text-[11px] font-medium text-emerald-700">
                                -₹{line.discount.toFixed(2)} discount
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={cart.find((item) => item.medicine.id === line.medicine.id)?.discount ?? ""}
                            onChange={(event) =>
                              updateLineDiscount(line.medicine.id, event.target.value)
                            }
                            placeholder="Line discount"
                            className="h-9 bg-white"
                          />
                          <span className="rounded-full bg-white px-2 py-1 text-[11px] text-muted-foreground">
                            Gross ₹{line.gross.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl bg-gradient-to-br from-slate-950 to-emerald-950 p-4 text-slate-100 shadow-xl">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-slate-300">Gross subtotal</span>
                      <span>₹{billMath.grossSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-slate-300">Item discounts</span>
                      <span className="text-emerald-200">-₹{billMath.itemDiscount.toFixed(2)}</span>
                    </div>
                    <div className="mb-2 grid grid-cols-[1fr_120px] items-center gap-3 text-sm">
                      <span className="text-slate-300">Bill discount</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={billDiscount}
                        onChange={(event) => setBillDiscount(event.target.value)}
                        placeholder="₹0"
                        className="h-8 border-white/10 bg-white/10 text-right text-white placeholder:text-slate-400"
                      />
                    </div>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-slate-300">Taxable subtotal</span>
                      <span>₹{billMath.taxableSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-slate-300">GST</span>
                      <span>₹{billMath.taxTotal.toFixed(2)}</span>
                    </div>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-slate-300">Paid now</span>
                      <span>₹{billMath.collected.toFixed(2)}</span>
                    </div>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-slate-300">Due</span>
                      <span className={billMath.due > 0 ? "font-bold text-amber-200" : ""}>
                        ₹{billMath.due.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-700 pt-2 text-base font-semibold">
                      <span>Total Payable</span>
                      <span>₹{billMath.payable.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setCart([])
                        setBillDiscount("")
                        setAmountPaid("")
                        setPaymentStatus("paid")
                        setDueReminderAt("")
                        setDueNotes("")
                      }}
                      disabled={completing}
                    >
                      Clear Bill
                    </Button>
                    <Button
                      onClick={checkout}
                      disabled={completing || cart.length === 0}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      {completing ? "Processing..." : "Complete Sale"}
                    </Button>
                  </div>

                  {lastInvoiceOrderId && (
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => downloadInvoice(lastInvoiceOrderId)}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Download Last Invoice PDF
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs text-muted-foreground">Low Stock Alerts</p>
                  <p className="text-xl font-semibold">
                    {alerts?.low_stock_alerts?.length ?? 0}
                  </p>
                </div>
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs text-muted-foreground">In-stock SKUs</p>
                  <p className="text-xl font-semibold">{allInStock.length}</p>
                </div>
                <Package2 className="h-5 w-5 text-cyan-600" />
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs text-muted-foreground">Today's Revenue</p>
                  <p className="text-xl font-semibold">₹{todayRevenue.toFixed(0)}</p>
                </div>
                <Wallet className="h-5 w-5 text-emerald-600" />
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-3xl border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <History className="h-4 w-4" />
                    Past Bills
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Re-open counter bills and download the PDF bill again.
                  </p>
                </div>
                <Badge variant="secondary">{recentOrders.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {recentOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No recent bills to display.
                </p>
              ) : (
                <ul className="max-h-[420px] space-y-2 overflow-auto pr-1">
                  {recentOrders.slice(0, 12).map((order) => (
                    <li
                      key={order.id}
                      className="rounded-2xl border border-emerald-100 bg-white p-3 text-sm shadow-sm"
                    >
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-950">
                            #{order.id.slice(0, 8)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {order.customer_name || "Walk-in customer"}
                            {order.customer_phone ? ` · ${order.customer_phone}` : ""}
                          </p>
                        </div>
                        <Badge variant="outline" className="uppercase">
                          {order.payment_method || "cash"}
                        </Badge>
                        {order.payment_status && (
                          <Badge
                            className={
                              order.payment_status === "paid"
                                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                                : "bg-amber-50 text-amber-700 hover:bg-amber-50"
                            }
                          >
                            {order.payment_status.replace("_", " ")}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">
                            ₹{orderPayable(order).toFixed(2)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Discount ₹{toAmount(order.discount_amount).toFixed(2)} · Due ₹
                            {toAmount(order.due_amount).toFixed(2)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(order.created_at).toLocaleDateString("en-IN")} ·{" "}
                            {new Date(order.created_at).toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          onClick={() => downloadInvoice(order.id)}
                        >
                          <Download className="mr-2 h-3.5 w-3.5" />
                          PDF
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </aside>
      </main>
    </div>
  )
}
