"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Building2, CalendarClock, KeyRound, LockKeyhole, Plus, Save, ShieldCheck, UserCog } from "lucide-react"

import { clientFetch } from "@/lib/api-client"
import { FALLBACK_STORE_PROFILE } from "@/components/store/StoreBrand"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
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
import { PaginationControls, pageCount, pageItems } from "@/components/ui/pagination-controls"
import { useToast } from "@/hooks/use-toast"

interface StoreProfile {
  app_name: string
  report_title: string
  tagline: string
  address: string
  phone?: string | null
  email: string
  gstin?: string | null
  drug_license?: string | null
  footer_note: string
}

interface LicenceStatus {
  active: boolean
  activated_at?: string | null
  expires_at?: string | null
  expired: boolean
  requires_activation: boolean
  licence_key_visible: boolean
}

interface UserRow {
  id: string
  name: string
  email: string
  phone?: string | null
  role: "admin" | "staff" | "customer"
  created_at: string
}

const EMPTY_PROFILE: StoreProfile = FALLBACK_STORE_PROFILE

function formatLicenceDate(value?: string | null) {
  if (!value) return "Not activated"
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export default function SettingsPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [profileForm, setProfileForm] = useState<StoreProfile>(EMPTY_PROFILE)
  const [selectedUserId, setSelectedUserId] = useState("")
  const [userForm, setUserForm] = useState({ name: "", email: "", phone: "", role: "staff", password: "" })
  const [newUserForm, setNewUserForm] = useState({ name: "", email: "", phone: "", role: "staff", password: "" })
  const [usersPage, setUsersPage] = useState(1)
  const [usersPageSize, setUsersPageSize] = useState(10)

  const { data: profile } = useQuery({
    queryKey: ["settings-store-profile"],
    queryFn: () => clientFetch<StoreProfile>("/settings/store-profile"),
  })

  const { data: users = [] } = useQuery({
    queryKey: ["settings-users"],
    queryFn: () => clientFetch<UserRow[]>("/users?limit=100"),
  })

  const { data: licenceStatus } = useQuery({
    queryKey: ["licence-status"],
    queryFn: () => clientFetch<LicenceStatus>("/settings/licence/status"),
  })

  useEffect(() => {
    if (profile) setProfileForm(profile)
  }, [profile])

  useEffect(() => {
    const selected = users.find((user) => user.id === selectedUserId)
    if (!selected) return
    setUserForm({
      name: selected.name,
      email: selected.email,
      phone: selected.phone || "",
      role: selected.role,
      password: "",
    })
  }, [selectedUserId, users])

  useEffect(() => {
    setUsersPage((current) => Math.min(current, pageCount(users.length, usersPageSize)))
  }, [users.length, usersPageSize])

  const saveProfile = useMutation({
    mutationFn: () => clientFetch("/settings/store-profile", { method: "PATCH", body: JSON.stringify(profileForm) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings-store-profile"] })
      toast({ title: "Store details updated" })
    },
    onError: (error: Error) => toast({ title: "Could not save store details", description: error.message, variant: "destructive" }),
  })

  const saveUser = useMutation({
    mutationFn: () => {
      const payload: Record<string, string> = {
        name: userForm.name,
        email: userForm.email,
        phone: userForm.phone,
        role: userForm.role,
      }
      if (userForm.password) payload.password = userForm.password
      return clientFetch(`/users/${selectedUserId}`, { method: "PATCH", body: JSON.stringify(payload) })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings-users"] })
      setUserForm((current) => ({ ...current, password: "" }))
      toast({ title: "User login updated" })
    },
    onError: (error: Error) => toast({ title: "Could not update user", description: error.message, variant: "destructive" }),
  })

  const createUser = useMutation({
    mutationFn: () => clientFetch("/users", { method: "POST", body: JSON.stringify(newUserForm) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings-users"] })
      setNewUserForm({ name: "", email: "", phone: "", role: "staff", password: "" })
      toast({ title: "User created" })
    },
    onError: (error: Error) => toast({ title: "Could not create user", description: error.message, variant: "destructive" }),
  })

  const profileFields: [keyof StoreProfile, string, string][] = [
    ["app_name", "App / Store Name", "CarePlus Pharmacy"],
    ["report_title", "Bill Title", "Retail Tax Bill"],
    ["tagline", "Tagline", "Pharmacy Billing & Retail Care"],
    ["address", "Address", "Full shop address"],
    ["phone", "Phone", "Shop phone"],
    ["email", "Email", "billing@example.com"],
    ["gstin", "GSTIN", "GST number"],
    ["drug_license", "Drug Licence", "Drug licence number"],
    ["footer_note", "Bill Footer", "Thank you note"],
  ]
  const paginatedUsers = pageItems(users, usersPage, usersPageSize)

  return (
    <div className="admin-page">
      <div className="admin-hero mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="admin-eyebrow">Owner Controls</p>
          <h1 className="admin-title">Settings, Users & Licence</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Customize app and bill branding, manage admin and staff login credentials, and monitor the offline licence activation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Bill branding</Badge>
          <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">User management</Badge>
          <Badge className="bg-slate-950 text-white hover:bg-slate-950">Offline licence</Badge>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="admin-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-emerald-700" />
              App Name & Bill Details
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {profileFields.map(([field, label, placeholder]) => (
              <div key={field} className={field === "address" || field === "footer_note" ? "md:col-span-2" : ""}>
                <Label>{label}</Label>
                <Input
                  value={profileForm[field] || ""}
                  onChange={(event) => setProfileForm((current) => ({ ...current, [field]: event.target.value }))}
                  placeholder={placeholder}
                  className="mt-1"
                />
              </div>
            ))}
            <div className="md:col-span-2">
              <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>
                <Save className="mr-2 h-4 w-4" />
                Save bill branding
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="admin-card overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-slate-950 to-emerald-950 text-white">
            <CardTitle className="flex items-center gap-2 text-base">
              <LockKeyhole className="h-4 w-4 text-emerald-200" />
              Offline Licence Activation
            </CardTitle>
            <p className="text-xs text-slate-300">
              The licence key is entered once on install, hidden after activation, and valid for two years.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
              <div>
                <p className="font-semibold text-slate-950">Activation status</p>
                <p className="text-xs text-muted-foreground">
                  {licenceStatus?.active ? "This desktop is licensed" : "Activation is required before login"}
                </p>
              </div>
              <Badge className={licenceStatus?.active ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-amber-100 text-amber-800 hover:bg-amber-100"}>
                {licenceStatus?.active ? "Active" : licenceStatus?.expired ? "Expired" : "Not active"}
              </Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <CalendarClock className="mb-3 h-5 w-5 text-emerald-700" />
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Activated on</p>
                <p className="mt-2 font-semibold text-slate-950">{formatLicenceDate(licenceStatus?.activated_at)}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <ShieldCheck className="mb-3 h-5 w-5 text-cyan-700" />
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Valid until</p>
                <p className="mt-2 font-semibold text-slate-950">{formatLicenceDate(licenceStatus?.expires_at)}</p>
              </div>
            </div>
            <p className="rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-muted-foreground">
              The licence key is not stored in plain text and is never displayed here. If the licence is missing or expired,
              the activation screen appears before the login page.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="admin-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4 text-cyan-700" />
              Add User
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Name" value={newUserForm.name} onChange={(event) => setNewUserForm((current) => ({ ...current, name: event.target.value }))} />
            <Input placeholder="Email / login ID" value={newUserForm.email} onChange={(event) => setNewUserForm((current) => ({ ...current, email: event.target.value }))} />
            <Input placeholder="Phone" value={newUserForm.phone} onChange={(event) => setNewUserForm((current) => ({ ...current, phone: event.target.value }))} />
            <Select value={newUserForm.role} onValueChange={(role) => setNewUserForm((current) => ({ ...current, role }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">admin</SelectItem>
                <SelectItem value="staff">staff</SelectItem>
                <SelectItem value="customer">customer</SelectItem>
              </SelectContent>
            </Select>
            <Input type="password" placeholder="Password" value={newUserForm.password} onChange={(event) => setNewUserForm((current) => ({ ...current, password: event.target.value }))} />
            <Button className="w-full" onClick={() => createUser.mutate()} disabled={createUser.isPending || !newUserForm.name || !newUserForm.email || !newUserForm.password}>
              Create user
            </Button>
          </CardContent>
        </Card>

        <Card className="admin-card overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCog className="h-4 w-4 text-amber-700" />
              Manage Existing Users
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto rounded-2xl border border-emerald-100">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Login ID</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell><Badge variant="outline">{user.role}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setSelectedUserId(user.id)}>
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <PaginationControls
                page={usersPage}
                pageSize={usersPageSize}
                totalItems={users.length}
                onPageChange={setUsersPage}
                onPageSizeChange={setUsersPageSize}
              />
            </div>

            {selectedUserId ? (
              <div className="grid gap-3 rounded-3xl border border-amber-100 bg-amber-50/50 p-4 md:grid-cols-2">
                <Input value={userForm.name} onChange={(event) => setUserForm((current) => ({ ...current, name: event.target.value }))} placeholder="Name" />
                <Input value={userForm.email} onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email / login ID" />
                <Input value={userForm.phone} onChange={(event) => setUserForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" />
                <Select value={userForm.role} onValueChange={(role) => setUserForm((current) => ({ ...current, role }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">admin</SelectItem>
                    <SelectItem value="staff">staff</SelectItem>
                    <SelectItem value="customer">customer</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="password" value={userForm.password} onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))} placeholder="New password (leave blank to keep same)" className="md:col-span-2" />
                <Button onClick={() => saveUser.mutate()} disabled={saveUser.isPending} className="md:col-span-2">
                  <KeyRound className="mr-2 h-4 w-4" />
                  Update login details
                </Button>
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-200 p-6 text-center text-sm text-muted-foreground">
                Select a user to change login ID, role or password.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
