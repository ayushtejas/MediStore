import type { Metadata } from "next"
import "./globals.css"
import { QueryProvider } from "@/lib/query-client"
import { Toaster } from "@/components/ui/toaster"
import { ThemeProvider } from "@/components/theme-provider"
import { LicenceActivationGate } from "@/components/licence/LicenceActivationGate"

export const metadata: Metadata = {
  title: "Pharmacy Billing",
  description: "Medical Store Management System",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <LicenceActivationGate>{children}</LicenceActivationGate>
            <Toaster />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
