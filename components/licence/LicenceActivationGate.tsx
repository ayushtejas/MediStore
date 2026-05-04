"use client"

import { FormEvent, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { BadgeCheck, CalendarClock, KeyRound, LockKeyhole, RotateCcw, ShieldCheck } from "lucide-react"

import { publicFetch } from "@/lib/api-client"
import {
  FALLBACK_STORE_PROFILE,
  storeInitials,
  usePublicStoreProfile,
  useSyncedDocumentTitle,
} from "@/components/store/StoreBrand"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface LicenceStatus {
  active: boolean
  activated_at?: string | null
  expires_at?: string | null
  expired: boolean
  requires_activation: boolean
  licence_key_visible: boolean
}

function formatExpiry(value?: string | null) {
  if (!value) return "Not activated"
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export function LicenceActivationGate({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()
  const [licenceKey, setLicenceKey] = useState("")
  const [error, setError] = useState("")
  const [activating, setActivating] = useState(false)

  const profileQuery = usePublicStoreProfile()
  const profile = profileQuery.data || FALLBACK_STORE_PROFILE
  useSyncedDocumentTitle(profile.app_name)

  const licenceQuery = useQuery({
    queryKey: ["licence-status"],
    queryFn: () => publicFetch<LicenceStatus>("/settings/licence/status"),
    retry: 2,
    retryDelay: 800,
  })

  async function activate(event: FormEvent) {
    event.preventDefault()
    setError("")
    if (!/^\d{12}$/.test(licenceKey)) {
      setError("Enter the 12-digit licence key.")
      return
    }
    setActivating(true)
    try {
      await publicFetch<LicenceStatus>("/settings/licence/activate", {
        method: "POST",
        body: JSON.stringify({ licence_key: licenceKey }),
      })
      setLicenceKey("")
      await qc.invalidateQueries({ queryKey: ["licence-status"] })
    } catch (err: any) {
      setError(err?.message || "Invalid licence key")
    } finally {
      setActivating(false)
    }
  }

  if (licenceQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.06] px-6 py-5 text-sm shadow-2xl shadow-black/30">
          Starting offline licence service...
        </div>
      </div>
    )
  }

  if (licenceQuery.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <div className="max-w-md rounded-[2rem] border border-rose-300/20 bg-white/[0.07] p-8 shadow-2xl shadow-black/40">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-400/15 text-rose-100">
            <RotateCcw className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-black">Local service is not ready</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            The app could not check the offline licence database yet. Wait a moment and retry; if this keeps happening,
            the bundled backend is not running.
          </p>
          <Button className="mt-6 w-full rounded-2xl" onClick={() => licenceQuery.refetch()}>
            Retry licence check
          </Button>
        </div>
      </div>
    )
  }

  if (licenceQuery.data?.active && !licenceQuery.data.requires_activation) {
    return <>{children}</>
  }

  const expired = Boolean(licenceQuery.data?.expired)

  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#0f766e_0,#06131f_45%,#020617_100%)] p-5 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[2.25rem] border border-white/10 bg-white/[0.07] shadow-2xl shadow-black/35 backdrop-blur lg:grid-cols-[1.05fr_0.95fr]">
          <div className="relative hidden min-h-[560px] flex-col justify-between overflow-hidden bg-[linear-gradient(145deg,rgba(20,184,166,.28),rgba(14,116,144,.18))] p-10 lg:flex">
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl" />
            <div className="absolute -bottom-28 left-10 h-80 w-80 rounded-full bg-cyan-300/10 blur-3xl" />
            <div className="relative">
              <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-300/15 text-2xl font-black text-emerald-50 ring-1 ring-emerald-200/25">
                {storeInitials(profile.app_name)}
              </div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-emerald-200">
                One-Time Offline Activation
              </p>
              <h1 className="mt-4 max-w-xl text-5xl font-black leading-[0.98] tracking-tight">
                Activate {profile.app_name} on this computer.
              </h1>
              <p className="mt-5 max-w-md text-sm leading-6 text-slate-300">
                Enter the owner licence once after installation. After activation, the key is hidden and this desktop
                stays active for two years.
              </p>
            </div>
            <div className="relative grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                <ShieldCheck className="mb-3 h-5 w-5 text-emerald-200" />
                <p className="font-bold text-white">Offline SQLite activation</p>
                <p className="mt-1 text-slate-300">No cloud check required after install.</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
                <CalendarClock className="mb-3 h-5 w-5 text-cyan-200" />
                <p className="font-bold text-white">2-year validity</p>
                <p className="mt-1 text-slate-300">The licence key is not shown again.</p>
              </div>
            </div>
          </div>

          <form onSubmit={activate} className="p-7 sm:p-10">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-100">
                <LockKeyhole className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-200">
                  {expired ? "Licence Expired" : "Activation Required"}
                </p>
                <p className="text-sm text-slate-300">{profile.tagline}</p>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
              <p className="text-sm font-semibold text-slate-200">Licence status</p>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-2xl bg-white/10 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Current state</p>
                  <p className="mt-2 font-black text-white">{expired ? "Expired" : "Not activated"}</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Valid until</p>
                  <p className="mt-2 font-black text-white">{formatExpiry(licenceQuery.data?.expires_at)}</p>
                </div>
              </div>
            </div>

            <label className="mt-6 block text-sm font-semibold text-slate-200" htmlFor="licence-key">
              12-digit licence key
            </label>
            <Input
              id="licence-key"
              inputMode="numeric"
              maxLength={12}
              value={licenceKey}
              onChange={(event) => setLicenceKey(event.target.value.replace(/\D/g, "").slice(0, 12))}
              placeholder="000000000000"
              className="mt-2 h-14 rounded-2xl border-white/10 bg-white/10 text-center text-2xl font-black tracking-[0.35em] text-white placeholder:text-slate-500"
            />
            {error && <p className="mt-3 text-sm text-rose-200">{error}</p>}

            <Button
              type="submit"
              disabled={activating}
              className="mt-6 h-12 w-full rounded-2xl bg-emerald-400 font-black text-slate-950 hover:bg-emerald-300"
            >
              {activating ? (
                "Activating..."
              ) : (
                <>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Activate licence
                </>
              )}
            </Button>
            <div className="mt-4 flex items-start gap-2 rounded-2xl bg-emerald-400/10 p-3 text-xs leading-5 text-emerald-100">
              <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
              After this succeeds, regular admin and POS users will not see the licence key.
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
