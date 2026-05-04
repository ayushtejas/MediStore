"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  IndianRupee,
  PackagePlus,
  Pencil,
  Search,
  Trash2,
  Truck,
} from "lucide-react"

import { clientFetch } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { PaginationControls, pageCount, pageItems } from "@/components/ui/pagination-controls"
import { useToast } from "@/hooks/use-toast"

interface MedicineForm {
  name: string
  brand: string
  category: string
  image_url: string
  composition: string
  gst_rate: string
  low_stock_threshold: string
  prescription_required: string
  batch_number: string
  expiry_date: string
  cost_price: string
  selling_price: string
  quantity_available: string
  supplier_id: string
}

interface BatchForm {
  medicine_id: string
  batch_number: string
  expiry_date: string
  cost_price: string
  selling_price: string
  quantity_available: string
  supplier_id: string
}

type MedicineRecord = {
  id: string
  name: string
  brand?: string | null
  category?: string | null
  image_url?: string | null
  composition?: string | null
  gst_rate?: string | number | null
  low_stock_threshold?: string | number | null
  prescription_required?: boolean
  selling_price?: string | number | null
  stock_available?: string | number | null
  created_at?: string
}

const today = new Date()
const nextYear = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate())
const DEFAULT_EXPIRY = nextYear.toISOString().slice(0, 10)

const INITIAL_MEDICINE_FORM: MedicineForm = {
  name: "",
  brand: "",
  category: "",
  image_url: "",
  composition: "",
  gst_rate: "12",
  low_stock_threshold: "10",
  prescription_required: "false",
  batch_number: "",
  expiry_date: DEFAULT_EXPIRY,
  cost_price: "",
  selling_price: "",
  quantity_available: "",
  supplier_id: "none",
}

const INITIAL_BATCH_FORM: BatchForm = {
  medicine_id: "",
  batch_number: "",
  expiry_date: DEFAULT_EXPIRY,
  cost_price: "",
  selling_price: "",
  quantity_available: "",
  supplier_id: "none",
}

const MEDICINE_CATEGORY_GROUPS = [
  {
    label: "Everyday Care",
    categories: [
      "Fever",
      "Pain Relief",
      "Cold, Cough & Flu",
      "Allergy & Sinus",
      "Digestive Health",
      "Acidity & GERD",
      "Constipation",
      "Diarrhea & ORS",
      "Nausea & Motion Sickness",
      "Headache & Migraine",
      "Sleep & Relaxation",
      "Smoking Cessation",
      "First Aid",
      "Emergency Care",
    ],
  },
  {
    label: "Prescription Medicines",
    categories: [
      "Antibiotics",
      "Antivirals",
      "Antifungals",
      "Antiparasitics",
      "Anti-inflammatory",
      "Steroids",
      "Pain Management",
      "Anesthesia & Sedation",
      "Controlled Medicines",
      "Vaccines",
      "Injectables",
      "IV Fluids",
      "Special Order Medicines",
      "Compounded Medicines",
    ],
  },
  {
    label: "Chronic Care",
    categories: [
      "Diabetes Care",
      "Hypertension",
      "Cardiac Care",
      "Cholesterol & Lipids",
      "Thyroid Care",
      "Asthma & COPD",
      "Kidney & Renal Care",
      "Liver Care",
      "Neurology",
      "Epilepsy",
      "Parkinson's Care",
      "Mental Health",
      "Anxiety & Depression",
      "Bone, Joint & Arthritis",
      "Osteoporosis",
      "Autoimmune Care",
      "Rheumatology",
    ],
  },
  {
    label: "Specialty Care",
    categories: [
      "Oncology",
      "Immunology",
      "Transplant Care",
      "Hematology",
      "Hormonal Therapy",
      "Fertility & IVF",
      "Gynecology",
      "Pregnancy Care",
      "Contraception",
      "Urology",
      "Men's Health",
      "Women's Health",
      "Pediatrics",
      "Geriatric Care",
      "Palliative Care",
      "Rare Disease",
    ],
  },
  {
    label: "Body Systems",
    categories: [
      "Dermatology",
      "Skin & Allergy",
      "Hair Care",
      "Eye Care",
      "Ear Care",
      "Nasal Care",
      "Throat Care",
      "Dental & Oral Care",
      "Respiratory Care",
      "Gastroenterology",
      "Endocrinology",
      "Orthopedics",
      "Sports Medicine",
      "Wound Care",
      "Burn Care",
    ],
  },
  {
    label: "Nutrition & Wellness",
    categories: [
      "Wellness",
      "Vitamins & Supplements",
      "Multivitamins",
      "Minerals",
      "Calcium & Vitamin D",
      "Iron & Anemia",
      "Protein & Nutrition",
      "Weight Management",
      "Immunity Boosters",
      "Probiotics",
      "Omega & Heart Supplements",
      "Ayurveda",
      "Homeopathy",
      "Herbal & Natural",
      "Medical Nutrition",
    ],
  },
  {
    label: "Devices & Diagnostics",
    categories: [
      "Medical Devices",
      "Diabetes Devices",
      "Glucometers & Strips",
      "Blood Pressure Monitors",
      "Thermometers",
      "Pulse Oximeters",
      "Nebulizers",
      "Orthopedic Supports",
      "Mobility Aids",
      "Surgical Supplies",
      "Diagnostic Tests",
      "Home Healthcare",
      "Incontinence Care",
      "Compression Wear",
    ],
  },
  {
    label: "Personal & Family Care",
    categories: [
      "Personal Care",
      "Baby Care",
      "Mother Care",
      "Sexual Wellness",
      "Hygiene & Sanitization",
      "Feminine Hygiene",
      "Elder Care",
      "Nutrition Drinks",
      "Cosmeceuticals",
      "Sun Care",
      "Bath & Body",
      "Hand & Foot Care",
      "Travel Health",
      "Other / Miscellaneous",
    ],
  },
] as const

const MEDICINE_CATEGORY_VALUES: Set<string> = new Set(
  MEDICINE_CATEGORY_GROUPS.flatMap((group) => group.categories)
)

function amount(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCurrency(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
}

function parseNumberInput(value: string) {
  const normalized = value.replace(/,/g, "").trim()
  if (!normalized) return 0
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function medicineToForm(medicine: MedicineRecord): MedicineForm {
  return {
    ...INITIAL_MEDICINE_FORM,
    name: medicine.name || "",
    brand: medicine.brand || "",
    category: medicine.category || "",
    image_url: medicine.image_url || "",
    composition: medicine.composition || "",
    gst_rate: String(medicine.gst_rate ?? "12"),
    low_stock_threshold: String(medicine.low_stock_threshold ?? "10"),
    prescription_required: medicine.prescription_required ? "true" : "false",
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export default function InventoryPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [search, setSearch] = useState("")
  const [medicineOpen, setMedicineOpen] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedMedicine, setSelectedMedicine] = useState<MedicineRecord | null>(null)
  const [form, setForm] = useState<MedicineForm>(INITIAL_MEDICINE_FORM)
  const [editForm, setEditForm] = useState<MedicineForm>(INITIAL_MEDICINE_FORM)
  const [batchForm, setBatchForm] = useState<BatchForm>(INITIAL_BATCH_FORM)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const { data: medicines = [], isLoading } = useQuery({
    queryKey: ["medicines", search],
    queryFn: () =>
      clientFetch<any[]>(
        `/medicines?limit=200${search ? `&q=${encodeURIComponent(search)}` : ""}`
      ),
  })

  const { data: inventory = [] } = useQuery({
    queryKey: ["inventory-batches"],
    queryFn: () => clientFetch<any[]>("/inventory?limit=200"),
  })

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => clientFetch<any[]>("/suppliers"),
  })

  const stockUnits = medicines.reduce(
    (sum: number, med: any) => sum + Number(med.stock_available ?? 0),
    0
  )
  const stockValue = medicines.reduce(
    (sum: number, med: any) =>
      sum + Number(med.stock_available ?? 0) * amount(med.selling_price),
    0
  )
  const lowStock = medicines.filter(
    (med: any) =>
      Number(med.stock_available ?? 0) <= Number(med.low_stock_threshold ?? 0)
  )
  const outOfStock = medicines.filter((med: any) => Number(med.stock_available ?? 0) === 0)

  const medicineById = useMemo(() => {
    return new Map(medicines.map((m: any) => [m.id, m]))
  }, [medicines])
  const selectedBatches = useMemo(
    () =>
      selectedMedicine
        ? inventory.filter((batch: any) => batch.medicine_id === selectedMedicine.id)
        : [],
    [inventory, selectedMedicine]
  )
  const paginatedMedicines = pageItems(medicines, page, pageSize)

  useEffect(() => {
    setPage(1)
  }, [search])

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount(medicines.length, pageSize)))
  }, [medicines.length, pageSize])

  const invalidateInventory = () => {
    qc.invalidateQueries({ queryKey: ["medicines"] })
    qc.invalidateQueries({ queryKey: ["inventory-batches"] })
    qc.invalidateQueries({ queryKey: ["inventory-alerts"] })
  }

  const createMedicine = useMutation({
    mutationFn: async (data: MedicineForm) => {
      const openingQuantity = parseNumberInput(data.quantity_available)
      const openingCostPrice = parseNumberInput(data.cost_price)
      const openingSellingPrice = parseNumberInput(data.selling_price)
      const gstRate = parseNumberInput(data.gst_rate || "12")
      const lowStockThreshold = parseNumberInput(data.low_stock_threshold || "10")
      const hasOpeningStockIntent =
        data.quantity_available.trim() !== "" ||
        data.cost_price.trim() !== "" ||
        data.selling_price.trim() !== "" ||
        data.batch_number.trim() !== ""

      if (!Number.isFinite(openingQuantity) || openingQuantity < 0) {
        throw new Error("Enter a valid opening stock quantity.")
      }
      if (!Number.isFinite(gstRate) || gstRate < 0) {
        throw new Error("Enter a valid GST rate.")
      }
      if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0 || !Number.isInteger(lowStockThreshold)) {
        throw new Error("Low stock threshold must be a whole number.")
      }
      if (!Number.isInteger(openingQuantity)) {
        throw new Error("Opening stock quantity must be a whole number.")
      }
      if (!Number.isFinite(openingCostPrice) || openingCostPrice < 0) {
        throw new Error("Enter a valid cost price.")
      }
      if (!Number.isFinite(openingSellingPrice) || openingSellingPrice < 0) {
        throw new Error("Enter a valid selling price.")
      }
      if (hasOpeningStockIntent && openingQuantity <= 0) {
        throw new Error("Enter quantity received to save opening stock.")
      }
      if (openingQuantity > 0 && openingSellingPrice <= 0) {
        throw new Error("Enter a selling price greater than zero for opening stock.")
      }

      await clientFetch<any>("/medicines", {
        method: "POST",
        body: JSON.stringify({
          name: data.name,
          brand: data.brand || null,
          category: data.category || null,
          image_url: data.image_url || null,
          composition: data.composition || null,
          prescription_required: data.prescription_required === "true",
          gst_rate: gstRate,
          low_stock_threshold: lowStockThreshold,
          opening_batch_number: data.batch_number || null,
          opening_expiry_date: data.expiry_date || null,
          opening_cost_price: openingQuantity > 0 ? openingCostPrice : null,
          opening_selling_price: openingQuantity > 0 ? openingSellingPrice : null,
          opening_quantity_available: openingQuantity > 0 ? openingQuantity : null,
          opening_supplier_id: data.supplier_id === "none" ? null : data.supplier_id,
        }),
      })
    },
    onSuccess: () => {
      invalidateInventory()
      setMedicineOpen(false)
      setForm(INITIAL_MEDICINE_FORM)
      toast({ title: "Medicine and opening stock saved" })
    },
    onError: (error: Error) =>
      toast({
        title: "Failed to save medicine",
        description: error.message,
        variant: "destructive",
      }),
  })

  const updateMedicine = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: MedicineForm }) => {
      const gstRate = parseNumberInput(data.gst_rate || "12")
      const lowStockThreshold = parseNumberInput(data.low_stock_threshold || "10")
      if (!Number.isFinite(gstRate) || gstRate < 0) {
        throw new Error("Enter a valid GST rate.")
      }
      if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0 || !Number.isInteger(lowStockThreshold)) {
        throw new Error("Low stock threshold must be a whole number.")
      }

      return clientFetch(`/medicines/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: data.name,
          brand: data.brand || null,
          category: data.category || null,
          image_url: data.image_url || null,
          composition: data.composition || null,
          prescription_required: data.prescription_required === "true",
          gst_rate: gstRate,
          low_stock_threshold: lowStockThreshold,
        }),
      })
    },
    onSuccess: () => {
      invalidateInventory()
      setEditOpen(false)
      setSelectedMedicine(null)
      toast({ title: "Medicine updated" })
    },
    onError: (error: Error) =>
      toast({
        title: "Failed to update medicine",
        description: error.message,
        variant: "destructive",
      }),
  })

  const deleteMedicine = useMutation({
    mutationFn: (id: string) =>
      clientFetch(`/medicines/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      invalidateInventory()
      setDeleteOpen(false)
      setSelectedMedicine(null)
      toast({ title: "Medicine deleted" })
    },
    onError: (error: Error) =>
      toast({
        title: "Could not delete medicine",
        description: error.message,
        variant: "destructive",
      }),
  })

  const addBatch = useMutation({
    mutationFn: (data: BatchForm) =>
      {
        const quantity = parseNumberInput(data.quantity_available)
        const costPrice = parseNumberInput(data.cost_price)
        const sellingPrice = parseNumberInput(data.selling_price)
        if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
          throw new Error("Enter a whole-number quantity greater than zero.")
        }
        if (!Number.isFinite(costPrice) || costPrice < 0) {
          throw new Error("Enter a valid cost price.")
        }
        if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) {
          throw new Error("Enter a selling price greater than zero.")
        }
        return clientFetch("/inventory/add", {
        method: "POST",
        body: JSON.stringify({
          medicine_id: data.medicine_id,
          batch_number: data.batch_number,
          expiry_date: data.expiry_date,
          cost_price: costPrice,
          selling_price: sellingPrice,
          quantity_available: quantity,
          supplier_id: data.supplier_id === "none" ? null : data.supplier_id,
        }),
      })
    },
    onSuccess: () => {
      invalidateInventory()
      setBatchOpen(false)
      setBatchForm(INITIAL_BATCH_FORM)
      toast({ title: "Stock received and counts updated" })
    },
    onError: (error: Error) =>
      toast({
        title: "Failed to receive stock",
        description: error.message,
        variant: "destructive",
      }),
  })

  function openView(medicine: MedicineRecord) {
    setSelectedMedicine(medicine)
    setViewOpen(true)
  }

  function openEdit(medicine: MedicineRecord) {
    setSelectedMedicine(medicine)
    setEditForm(medicineToForm(medicine))
    setEditOpen(true)
  }

  function openDelete(medicine: MedicineRecord) {
    setSelectedMedicine(medicine)
    setDeleteOpen(true)
  }

  const summaryCards = [
    {
      label: "Units On Hand",
      value: stockUnits.toLocaleString("en-IN"),
      sub: `${medicines.length} SKUs`,
      icon: Boxes,
      tone: "bg-cyan-50 text-cyan-700",
    },
    {
      label: "Stock Value",
      value: formatCurrency(stockValue),
      sub: "Selling value",
      icon: IndianRupee,
      tone: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Low Stock",
      value: String(lowStock.length),
      sub: "At or below threshold",
      icon: AlertTriangle,
      tone: "bg-amber-50 text-amber-700",
    },
    {
      label: "Out of Stock",
      value: String(outOfStock.length),
      sub: "Needs receiving",
      icon: PackagePlus,
      tone: "bg-rose-50 text-rose-700",
    },
  ]

  return (
    <div className="admin-page">
      <div className="admin-hero mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="admin-eyebrow">
            Inventory Control
          </p>
          <h1 className="admin-title">
            Stock, Batches & Receiving
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Medicine counts now read from live batches, so every completed sale changes
            the stock picture admins see here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-emerald-200 bg-white/85 hover:bg-emerald-50">
                <Truck className="mr-2 h-4 w-4" />
                Receive Stock
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Receive Stock Batch</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <Label>Medicine</Label>
                  <Select
                    value={batchForm.medicine_id}
                    onValueChange={(value) =>
                      setBatchForm((f) => ({ ...f, medicine_id: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select medicine" />
                    </SelectTrigger>
                    <SelectContent>
                      {medicines.map((med: any) => (
                        <SelectItem key={med.id} value={med.id}>
                          {med.name} ({med.brand || "Generic"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <BatchFields
                  form={batchForm}
                  suppliers={suppliers}
                  onChange={(field, value) =>
                    setBatchForm((f) => ({ ...f, [field]: value }))
                  }
                />
                <Button
                  className="sm:col-span-2"
                  onClick={() => addBatch.mutate(batchForm)}
                  disabled={!batchForm.medicine_id || !batchForm.batch_number || addBatch.isPending}
                >
                  {addBatch.isPending ? "Receiving..." : "Receive Batch"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={medicineOpen} onOpenChange={setMedicineOpen}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700">
                <PackagePlus className="mr-2 h-4 w-4" />
                Add Medicine
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Add Medicine With Opening Stock</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <MedicineFields
                  form={form}
                  onChange={(field, value) =>
                    setForm((f) => ({ ...f, [field]: value }))
                  }
                />
                <div className="sm:col-span-2 border-t pt-3">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Opening Batch
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <BatchFields
                      form={form}
                      suppliers={suppliers}
                      onChange={(field, value) =>
                        setForm((f) => ({ ...f, [field]: value }))
                      }
                    />
                  </div>
                </div>
                <Button
                  className="sm:col-span-2"
                  onClick={() => createMedicine.mutate(form)}
                  disabled={!form.name || createMedicine.isPending}
                >
                  {createMedicine.isPending ? "Saving..." : "Save Medicine"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={viewOpen} onOpenChange={setViewOpen}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Medicine Details</DialogTitle>
                <DialogDescription>
                  Review product metadata, live stock, pricing and active batches.
                </DialogDescription>
              </DialogHeader>
              {selectedMedicine && (
                <div className="grid gap-5 lg:grid-cols-[180px_1fr]">
                  <div className="overflow-hidden rounded-[1.75rem] border bg-emerald-50">
                    {selectedMedicine.image_url ? (
                      <img
                        src={selectedMedicine.image_url}
                        alt={selectedMedicine.name}
                        className="h-44 w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-44 place-items-center text-sm font-semibold text-emerald-700">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
                        {selectedMedicine.category || "Uncategorized"}
                      </p>
                      <h2 className="mt-1 text-2xl font-black text-slate-950">
                        {selectedMedicine.name}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {selectedMedicine.brand || "Generic"} · {selectedMedicine.composition || "No composition"}
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <Metric label="On hand" value={String(selectedMedicine.stock_available ?? 0)} />
                      <Metric label="Price" value={formatCurrency(amount(selectedMedicine.selling_price))} />
                      <Metric label="GST" value={`${selectedMedicine.gst_rate ?? 0}%`} />
                      <Metric label="Threshold" value={String(selectedMedicine.low_stock_threshold ?? 0)} />
                    </div>
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-bold text-slate-950">Active batches</p>
                        <Badge variant="secondary">{selectedBatches.length}</Badge>
                      </div>
                      <div className="space-y-2">
                        {selectedBatches.map((batch: any) => (
                          <div
                            key={batch.id}
                            className="grid gap-2 rounded-xl bg-white/80 p-3 text-xs text-slate-600 sm:grid-cols-4"
                          >
                            <span className="font-semibold text-slate-950">{batch.batch_number}</span>
                            <span>Qty {batch.quantity_available}</span>
                            <span>Expiry {batch.expiry_date}</span>
                            <span className="sm:text-right">Sell {formatCurrency(amount(batch.selling_price))}</span>
                          </div>
                        ))}
                        {selectedBatches.length === 0 && (
                          <p className="rounded-xl bg-white/80 p-3 text-sm text-muted-foreground">
                            No stock batches have been received for this medicine.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (selectedMedicine) openDelete(selectedMedicine)
                    setViewOpen(false)
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (selectedMedicine) openEdit(selectedMedicine)
                    setViewOpen(false)
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Edit Medicine</DialogTitle>
                <DialogDescription>
                  Update product details. Stock quantities are managed through batches and receiving.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <MedicineFields
                  form={editForm}
                  onChange={(field, value) =>
                    setEditForm((f) => ({ ...f, [field]: value }))
                  }
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditOpen(false)}>
                  Cancel
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => {
                    if (selectedMedicine) {
                      updateMedicine.mutate({ id: selectedMedicine.id, data: editForm })
                    }
                  }}
                  disabled={!editForm.name || updateMedicine.isPending}
                >
                  {updateMedicine.isPending ? "Saving..." : "Save changes"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Medicine</DialogTitle>
                <DialogDescription>
                  This removes the medicine and unsold batches from inventory. Medicines already used in
                  bills are protected and cannot be deleted.
                </DialogDescription>
              </DialogHeader>
              {selectedMedicine && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                  Delete <span className="font-bold">{selectedMedicine.name}</span>? Current stock is{" "}
                  <span className="font-bold">{selectedMedicine.stock_available ?? 0}</span> units.
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (selectedMedicine) deleteMedicine.mutate(selectedMedicine.id)
                  }}
                  disabled={deleteMedicine.isPending}
                >
                  {deleteMedicine.isPending ? "Deleting..." : "Delete medicine"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map(({ label, value, sub, icon: Icon, tone }) => (
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

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search medicines, brand, composition..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 rounded-2xl border-emerald-100 bg-white/90 pl-9 shadow-sm"
          />
        </div>
        <p className="admin-soft-panel px-4 py-2 text-sm text-emerald-800">
          Counts are calculated from live inventory batches after every completed sale.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="admin-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medicine</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">On Hand</TableHead>
                <TableHead className="text-right">Threshold</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Loading inventory...
                  </TableCell>
                </TableRow>
              ) : medicines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No medicines found.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedMedicines.map((med: any) => {
                  const stock = Number(med.stock_available ?? 0)
                  const threshold = Number(med.low_stock_threshold ?? 0)
                  const status =
                    stock === 0 ? "out" : stock <= threshold ? "low" : "healthy"
                  return (
                    <TableRow
                      key={med.id}
                      className="cursor-pointer hover:bg-emerald-50/60"
                      onClick={() => openView(med)}
                      tabIndex={0}
                      role="button"
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault()
                          openView(med)
                        }
                      }}
                      aria-label={`View ${med.name}`}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 overflow-hidden rounded-2xl bg-emerald-50">
                            {med.image_url ? (
                              <img src={med.image_url} alt={med.name} className="h-full w-full object-cover" />
                            ) : null}
                          </div>
                          <div>
                            <p className="font-medium text-slate-950">{med.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {med.brand || "Generic"} · {med.composition || "No composition"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{med.category || "Uncategorized"}</TableCell>
                      <TableCell className="text-right font-semibold">{stock}</TableCell>
                      <TableCell className="text-right">{threshold}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(amount(med.selling_price))}
                      </TableCell>
                      <TableCell>
                        {status === "healthy" ? (
                          <Badge variant="secondary">Healthy</Badge>
                        ) : status === "low" ? (
                          <Badge variant="outline">Low</Badge>
                        ) : (
                          <Badge variant="destructive">Out</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
          <PaginationControls
            page={page}
            pageSize={pageSize}
            totalItems={medicines.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>

        <div className="space-y-4">
          <div className="admin-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-cyan-700" />
              <h2 className="font-semibold text-slate-950">Active Batches</h2>
            </div>
            <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
              {inventory.slice(0, 12).map((batch: any) => {
                const med = medicineById.get(batch.medicine_id) as any
                return (
                  <div key={batch.id} className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-white to-emerald-50/50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{med?.name || "Medicine"}</p>
                        <p className="text-xs text-muted-foreground">
                          Batch {batch.batch_number}
                        </p>
                      </div>
                      <Badge variant={batch.quantity_available > 0 ? "secondary" : "destructive"}>
                        {batch.quantity_available}
                      </Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <span>Expiry {batch.expiry_date}</span>
                      <span className="text-right">
                        Sell {formatCurrency(amount(batch.selling_price))}
                      </span>
                    </div>
                  </div>
                )
              })}
              {inventory.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No batches received yet.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-white/80 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  )
}

function MedicineFields({
  form,
  onChange,
}: {
  form: MedicineForm
  onChange: (field: keyof MedicineForm, value: string) => void
}) {
  return (
    <>
      <Field label="Medicine Name *" value={form.name} onChange={(v) => onChange("name", v)} />
      <Field label="Brand" value={form.brand} onChange={(v) => onChange("brand", v)} />
      <CategoryField value={form.category} onChange={(v) => onChange("category", v)} />
      <Field label="Composition" value={form.composition} onChange={(v) => onChange("composition", v)} />
      <div className="space-y-1 sm:col-span-2">
        <Label>Product Image</Label>
        <div className="grid gap-3 sm:grid-cols-[96px_1fr]">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border bg-emerald-50 text-xs text-emerald-700">
            {form.image_url ? (
              <img src={form.image_url} alt="Medicine preview" className="h-full w-full object-cover" />
            ) : (
              "Preview"
            )}
          </div>
          <div className="space-y-2">
            <Input
              value={form.image_url}
              onChange={(event) => onChange("image_url", event.target.value)}
              placeholder="Paste image URL or upload below"
            />
            <Input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={async (event) => {
                const file = event.target.files?.[0]
                if (!file) return
                onChange("image_url", await fileToDataUrl(file))
              }}
            />
          </div>
        </div>
      </div>
      <Field label="GST Rate (%)" type="number" value={form.gst_rate} onChange={(v) => onChange("gst_rate", v)} />
      <Field
        label="Low Stock Threshold"
        type="number"
        value={form.low_stock_threshold}
        onChange={(v) => onChange("low_stock_threshold", v)}
      />
      <div className="space-y-1 sm:col-span-2">
        <Label>Prescription Required</Label>
        <Select value={form.prescription_required} onValueChange={(v) => onChange("prescription_required", v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="false">No</SelectItem>
            <SelectItem value="true">Yes</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  )
}

function CategoryField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const hasLegacyCategory = value && !MEDICINE_CATEGORY_VALUES.has(value)

  return (
    <div className="space-y-1">
      <Label>Category</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select category" />
        </SelectTrigger>
        <SelectContent className="max-h-[420px]">
          {hasLegacyCategory && (
            <>
              <SelectItem value={value}>{value}</SelectItem>
              <SelectSeparator />
            </>
          )}
          {MEDICINE_CATEGORY_GROUPS.map((group, index) => (
            <SelectGroup key={group.label}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
              {index < MEDICINE_CATEGORY_GROUPS.length - 1 && <SelectSeparator />}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function BatchFields({
  form,
  suppliers,
  onChange,
}: {
  form: BatchForm | MedicineForm
  suppliers: any[]
  onChange: (field: keyof BatchForm, value: string) => void
}) {
  return (
    <>
      <Field label="Batch Number *" value={form.batch_number} onChange={(v) => onChange("batch_number", v)} />
      <Field label="Expiry Date" type="date" value={form.expiry_date} onChange={(v) => onChange("expiry_date", v)} />
      <Field label="Cost Price" type="number" value={form.cost_price} onChange={(v) => onChange("cost_price", v)} />
      <Field label="Selling Price" type="number" value={form.selling_price} onChange={(v) => onChange("selling_price", v)} />
      <Field
        label="Quantity Received"
        type="number"
        value={form.quantity_available}
        onChange={(v) => onChange("quantity_available", v)}
      />
      <div className="space-y-1">
        <Label>Supplier</Label>
        <Select value={form.supplier_id} onValueChange={(v) => onChange("supplier_id", v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No supplier</SelectItem>
            {suppliers.map((supplier: any) => (
              <SelectItem key={supplier.id} value={supplier.id}>
                {supplier.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  )
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}
