import { cp, mkdir, rm, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const standaloneDir = path.join(root, ".next", "standalone")
const staticDir = path.join(root, ".next", "static")
const publicDir = path.join(root, "public")
const outputDir = path.join(root, "desktop-dist")
const frontendOut = path.join(outputDir, "frontend")
const backendOut = path.join(outputDir, "backend")

async function exists(target) {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

async function copyIfPresent(from, to) {
  if (!(await exists(from))) return false
  await cp(from, to, { recursive: true })
  return true
}

if (!(await exists(path.join(standaloneDir, "server.js")))) {
  throw new Error("Missing .next/standalone/server.js. Run `npm run build` before desktop packaging.")
}

await rm(frontendOut, { recursive: true, force: true })
await mkdir(frontendOut, { recursive: true })
await cp(standaloneDir, frontendOut, { recursive: true })

await mkdir(path.join(frontendOut, ".next"), { recursive: true })
await copyIfPresent(staticDir, path.join(frontendOut, ".next", "static"))
await copyIfPresent(publicDir, path.join(frontendOut, "public"))

await mkdir(backendOut, { recursive: true })

const expectedBackend = process.platform === "win32"
  ? path.join(backendOut, "medstore-api.exe")
  : path.join(backendOut, "medstore-api")

if (!(await exists(expectedBackend))) {
  console.warn(
    `Backend executable not found at ${expectedBackend}. Build it with PyInstaller before running electron-forge make for an installable package.`
  )
}

console.log(`Prepared Electron frontend bundle at ${frontendOut}`)
