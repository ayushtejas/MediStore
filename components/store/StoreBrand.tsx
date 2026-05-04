"use client"

import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"

import { publicFetch } from "@/lib/api-client"

export interface PublicStoreProfile {
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

export const FALLBACK_STORE_PROFILE: PublicStoreProfile = {
  app_name: "MedStore",
  report_title: "Pharmacy Tax Bill",
  tagline: "Pharmacy Billing & Retail Care",
  address: "123 Health Avenue, Mumbai",
  phone: "",
  email: "support@medstore.local",
  gstin: "27AAECM0000A1Z5",
  drug_license: "MH-MED-2026",
  footer_note: "Thank you for choosing MedStore.",
}

export function usePublicStoreProfile() {
  return useQuery({
    queryKey: ["public-store-profile"],
    queryFn: () => publicFetch<PublicStoreProfile>("/settings/store-profile/public"),
    staleTime: 60_000,
  })
}

export function useSyncedDocumentTitle(appName?: string) {
  useEffect(() => {
    if (!appName) return
    document.title = appName
  }, [appName])
}

export function storeInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase()
  return (words[0]?.slice(0, 2) || "MS").toUpperCase()
}
