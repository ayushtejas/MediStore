import { spawn } from "node:child_process"
import net from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const backendDir = path.join(root, "modern_medical_backend")
const frontendPort = Number(process.env.MEDSTORE_FRONTEND_PORT || 3000)
const backendPort = Number(process.env.MEDSTORE_BACKEND_PORT || 8000)
const backendUrl = `http://127.0.0.1:${backendPort}`
const frontendUrl = `http://127.0.0.1:${frontendPort}`

const children = []

function commandForNpm() {
  return process.platform === "win32" ? "npm.cmd" : "npm"
}

function pythonForBackend() {
  return process.platform === "win32"
    ? path.join(backendDir, ".venv", "Scripts", "python.exe")
    : path.join(backendDir, ".venv", "bin", "python")
}

function spawnNamed(name, command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    windowsHide: true,
    ...options,
    env: {
      ...process.env,
      ...options.env,
    },
  })

  child.on("exit", (code, signal) => {
    if (signal) return
    if (code && code !== 0) {
      console.error(`${name} exited with code ${code}`)
      stopAll(code)
    }
  })

  children.push(child)
  return child
}

function waitForPort(port, host = "127.0.0.1", timeoutMs = 30000) {
  const startedAt = Date.now()

  return new Promise((resolve, reject) => {
    const check = () => {
      const socket = net.createConnection({ port, host })
      socket.once("connect", () => {
        socket.end()
        resolve()
      })
      socket.once("error", () => {
        socket.destroy()
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for ${host}:${port}`))
          return
        }
        setTimeout(check, 350)
      })
    }

    check()
  })
}

function stopAll(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill()
  }
  process.exit(code)
}

process.on("SIGINT", () => stopAll(0))
process.on("SIGTERM", () => stopAll(0))

console.log(`Starting MedStore offline dev stack`)
console.log(`Backend:  ${backendUrl}`)
console.log(`Frontend: ${frontendUrl}`)

spawnNamed(
  "backend",
  pythonForBackend(),
  ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(backendPort), "--reload"],
  {
    cwd: backendDir,
    env: {
      DATABASE_URL: process.env.DATABASE_URL || "sqlite+aiosqlite:///./medical_store.db",
      BOOTSTRAP_ON_STARTUP: "true",
      SEED_DEMO_DATA: "true",
    },
  }
)

await waitForPort(backendPort)

spawnNamed(
  "frontend",
  commandForNpm(),
  ["run", "dev:web", "--", "--hostname", "127.0.0.1", "--port", String(frontendPort)],
  {
    cwd: root,
    env: {
      BACKEND_URL: backendUrl,
      NEXT_PUBLIC_API_URL: backendUrl,
      NEXTAUTH_URL: frontendUrl,
      AUTH_URL: frontendUrl,
    },
  }
)
