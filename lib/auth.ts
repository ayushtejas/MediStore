import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"

const AUTH_API_URL =
  process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const res = await fetch(`${AUTH_API_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: credentials.email, password: credentials.password }),
        })
        if (!res.ok) return null
        const data = await res.json()
        return {
          id: data.user_id,
          email: credentials.email as string,
          role: data.role,
          accessToken: data.access_token,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
        token.accessToken = (user as any).accessToken
      }
      return token
    },
    async session({ session, token }) {
      ;(session.user as any).role = token.role
      ;(session as any).accessToken = token.accessToken
      return session
    },
  },
  pages: { signIn: "/login" },
})
