"use client"

import { Sparkles } from "lucide-react"

import { ThemeToggle } from "@/components/theme-toggle"
import {
  FALLBACK_STORE_PROFILE,
  storeInitials,
  usePublicStoreProfile,
  useSyncedDocumentTitle,
} from "@/components/store/StoreBrand"

export function AdminSidebarBrand() {
  const profileQuery = usePublicStoreProfile()
  const profile = profileQuery.data || FALLBACK_STORE_PROFILE
  useSyncedDocumentTitle(`${profile.app_name} Admin`)

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-cyan-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-700/20">
            <span className="text-white text-sm font-bold">{storeInitials(profile.app_name)}</span>
          </div>
          <div>
            <span className="font-semibold text-foreground">{profile.app_name} Admin</span>
            <p className="text-xs text-muted-foreground">{profile.tagline}</p>
          </div>
        </div>
        <ThemeToggle />
      </div>

      <div className="mt-5 rounded-2xl border border-border bg-muted/50 p-3 text-xs text-muted-foreground shadow-sm">
        <div className="mb-1 flex items-center gap-2 font-semibold text-emerald-600 dark:text-emerald-400">
          <Sparkles className="h-3.5 w-3.5" />
          Live operations
        </div>
        Stock, billing and fulfilment are linked to the same inventory flow.
      </div>
    </>
  )
}
