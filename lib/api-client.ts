import { getSession } from "next-auth/react"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"

async function authHeaders(options?: RequestInit) {
  const headers = new Headers(options?.headers)
  const session = await getSession()
  const token = (session as any)?.accessToken

  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  if (options?.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  return headers
}

async function parseError(res: Response): Promise<never> {
  let message = `API error ${res.status}`
  try {
    const text = await res.text()
    if (text) {
      try {
        const json = JSON.parse(text)
        if (typeof json?.detail === "string") {
          message = `${message}: ${json.detail}`
        } else {
          message = `${message}: ${text}`
        }
      } catch {
        message = `${message}: ${text}`
      }
    }
  } catch {
    // Keep fallback message above.
  }
  throw new Error(message)
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) {
    return null as T
  }
  const text = await res.text()
  if (!text) {
    return null as T
  }
  return JSON.parse(text) as T
}

// Server-side: calls FastAPI directly (used in Server Components)
export async function serverFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    next: { revalidate: 60 },
  })
  if (!res.ok) return parseError(res)
  return parseJsonResponse<T>(res)
}

// Client-side: calls the local FastAPI service directly.
export async function clientFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: await authHeaders(options),
  })
  if (!res.ok) return parseError(res)
  return parseJsonResponse<T>(res)
}

export async function openBackendFile(path: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: await authHeaders(),
  })
  if (!res.ok) return parseError(res)

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  window.open(url, "_blank", "noopener,noreferrer")
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
