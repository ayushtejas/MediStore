"use client"
import { signIn } from "next-auth/react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import {
  FALLBACK_STORE_PROFILE,
  storeInitials,
  usePublicStoreProfile,
  useSyncedDocumentTitle,
} from "@/components/store/StoreBrand"

const DEMO_CREDENTIALS = [
  { role: "Admin", email: "admin@medstore.dev", password: "Admin@123" },
  { role: "Staff", email: "staff@medstore.dev", password: "Staff@123" },
]

export default function LoginPage() {
  const router = useRouter()
  const profileQuery = usePublicStoreProfile()
  const profile = profileQuery.data || FALLBACK_STORE_PROFILE
  useSyncedDocumentTitle(profile.app_name)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: "/",
    })
    setLoading(false)
    if (result?.error) {
      setError("Invalid email or password")
      return
    }
    const nextUrl = result?.url
      ? result.url.startsWith("http")
        ? new URL(result.url).pathname
        : result.url
      : "/"
    router.replace(nextUrl)
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">{storeInitials(profile.app_name)}</span>
            </div>
            <span className="font-semibold text-lg">{profile.app_name}</span>
          </div>
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>
            Enter your admin or counter staff credentials to access {profile.tagline.toLowerCase()}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
          <div className="mt-6 border-t pt-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Demo credentials by role
            </p>
            {DEMO_CREDENTIALS.map((cred) => (
              <button
                key={cred.role}
                type="button"
                className="w-full text-left rounded-md border px-3 py-2 hover:bg-muted transition-colors"
                onClick={() => {
                  setEmail(cred.email)
                  setPassword(cred.password)
                }}
              >
                <p className="text-xs font-semibold">{cred.role}</p>
                <p className="text-xs text-muted-foreground">{cred.email}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
