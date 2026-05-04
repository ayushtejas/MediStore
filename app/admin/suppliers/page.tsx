"use client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { clientFetch } from "@/lib/api-client"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Building2, Mail, Phone, Plus, Truck } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Badge } from "@/components/ui/badge"
import { PaginationControls, pageCount, pageItems } from "@/components/ui/pagination-controls"

interface SupplierForm {
  name: string
  contact: string
  email: string
}

const INITIAL_FORM: SupplierForm = {
  name: "",
  contact: "",
  email: "",
}

export default function SuppliersPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<SupplierForm>(INITIAL_FORM)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => clientFetch<any[]>("/suppliers"),
  })

  const createSupplier = useMutation({
    mutationFn: (data: SupplierForm) =>
      clientFetch("/suppliers", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] })
      setOpen(false)
      setForm(INITIAL_FORM)
      toast({ title: "Supplier added successfully" })
    },
    onError: () =>
      toast({ title: "Failed to add supplier", variant: "destructive" }),
  })

  const fields: [keyof SupplierForm, string][] = [
    ["name", "Company Name *"],
    ["contact", "Contact Person"],
    ["email", "Email"],
  ]
  const paginatedSuppliers = pageItems(suppliers, page, pageSize)

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount(suppliers.length, pageSize)))
  }, [suppliers.length, pageSize])

  return (
    <div className="admin-page">
      <div className="admin-hero mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="admin-eyebrow">Supplier Network</p>
          <h1 className="admin-title">Vendors & Purchase Sources</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Keep purchase contacts close to inventory receiving, batches and expiry
            tracking.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4 mr-2" />
              Add Supplier
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Supplier</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {fields.map(([field, label]) => (
                <div key={field} className="space-y-1">
                  <Label>{label}</Label>
                  <Input
                    value={form[field]}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [field]: e.target.value }))
                    }
                  />
                </div>
              ))}
              <Button
                className="w-full"
                onClick={() => createSupplier.mutate(form)}
                disabled={!form.name || createSupplier.isPending}
              >
                {createSupplier.isPending ? "Adding..." : "Add Supplier"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="admin-stat-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Active Suppliers</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">
                {suppliers.length}
              </p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
              <Building2 className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="admin-stat-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Contacts Listed</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">
                {suppliers.filter((supplier: any) => supplier.contact).length}
              </p>
            </div>
            <div className="rounded-2xl bg-cyan-50 p-3 text-cyan-700">
              <Phone className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="admin-stat-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Email Ready</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">
                {suppliers.filter((supplier: any) => supplier.email).length}
              </p>
            </div>
            <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
              <Mail className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>

      <div className="admin-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-center py-8 text-muted-foreground"
                >
                  Loading...
                </TableCell>
              </TableRow>
            ) : suppliers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-center py-8 text-muted-foreground"
                >
                  No suppliers found
                </TableCell>
              </TableRow>
            ) : (
              paginatedSuppliers.map((s: any) => (
                <TableRow key={s.id} className="hover:bg-emerald-50/60">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-emerald-50 p-2 text-emerald-700">
                        <Truck className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-950">{s.name}</p>
                        <Badge variant="outline" className="mt-1 border-emerald-200 text-emerald-700">
                          Purchase source
                        </Badge>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{s.contact || "Not added"}</TableCell>
                  <TableCell>{s.email || "Not added"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <PaginationControls
          page={page}
          pageSize={pageSize}
          totalItems={suppliers.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  )
}
