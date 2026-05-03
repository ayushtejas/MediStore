import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"

export default async function OfflineEntryPage() {
  const session = await auth()
  const role = (session?.user as any)?.role

  if (role === "admin") {
    redirect("/admin/dashboard")
  }

  if (role === "staff") {
    redirect("/pos")
  }

  redirect("/login")
}
