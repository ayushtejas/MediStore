const { app, BrowserWindow, dialog } = require("electron")
const path = require("node:path")
const fs = require("node:fs")
const { spawn } = require("node:child_process")
const net = require("node:net")

if (require("electron-squirrel-startup")) {
  app.quit()
}

if (process.platform === "win32") {
  app.setAppUserModelId("com.squirrel.MedStoreOffline.MedStoreOffline")
}

const FRONTEND_PORT = Number(process.env.MEDSTORE_FRONTEND_PORT || 3210)
const BACKEND_PORT = Number(process.env.MEDSTORE_BACKEND_PORT || 8000)
const APP_URL = `http://127.0.0.1:${FRONTEND_PORT}`
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`

const processes = []

function resourcePath(...segments) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...segments)
  }
  return path.join(__dirname, "..", ...segments)
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

function spawnProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: app.isPackaged ? "ignore" : "inherit",
    windowsHide: true,
    ...options,
    env: {
      ...process.env,
      ...options.env,
    },
  })

  processes.push(child)
  return child
}

function startBackend() {
  const dbPath = app.isPackaged
    ? path.join(app.getPath("userData"), "medical_store.db")
    : path.join(resourcePath("modern_medical_backend"), "medical_store.db")

  const env = {
    DATABASE_URL: `sqlite+aiosqlite:///${dbPath.replaceAll("\\", "/")}`,
    BOOTSTRAP_ON_STARTUP: "true",
    SEED_DEMO_DATA: "true",
    HOST: "127.0.0.1",
    PORT: String(BACKEND_PORT),
  }

  if (app.isPackaged) {
    const exeName = process.platform === "win32" ? "medstore-api.exe" : "medstore-api"
    const backendExe = resourcePath("backend", exeName)
    if (!fs.existsSync(backendExe)) {
      throw new Error(`Missing bundled backend executable: ${backendExe}`)
    }
    spawnProcess(backendExe, [], { env })
    return
  }

  const backendDir = resourcePath("modern_medical_backend")
  const python = process.platform === "win32"
    ? path.join(backendDir, ".venv", "Scripts", "python.exe")
    : path.join(backendDir, ".venv", "bin", "python")

  spawnProcess(python, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(BACKEND_PORT)], {
    cwd: backendDir,
    env,
  })
}

function startFrontend() {
  const env = {
    PORT: String(FRONTEND_PORT),
    HOSTNAME: "127.0.0.1",
    BACKEND_URL,
    NEXT_PUBLIC_API_URL: BACKEND_URL,
    NEXTAUTH_URL: APP_URL,
    AUTH_URL: APP_URL,
    AUTH_SECRET: process.env.AUTH_SECRET || "offline-desktop-medstore-secret",
  }

  if (app.isPackaged) {
    const serverJs = resourcePath("frontend", "server.js")
    if (!fs.existsSync(serverJs)) {
      throw new Error(`Missing bundled Next server: ${serverJs}`)
    }
    spawnProcess(process.execPath, [serverJs], {
      cwd: path.dirname(serverJs),
      env: {
        ...env,
        ELECTRON_RUN_AS_NODE: "1",
      },
    })
    return
  }

  spawnProcess("npm", ["run", "dev:web", "--", "--hostname", "127.0.0.1", "--port", String(FRONTEND_PORT)], {
    cwd: resourcePath(),
    env,
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    title: "MedStore Offline",
    backgroundColor: "#f7faf4",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.loadURL(APP_URL)
}

async function boot() {
  try {
    startBackend()
    await waitForPort(BACKEND_PORT)
    startFrontend()
    await waitForPort(FRONTEND_PORT)
    createWindow()
  } catch (error) {
    dialog.showErrorBox(
      "MedStore could not start",
      error instanceof Error ? error.message : String(error)
    )
    app.quit()
  }
}

app.whenReady().then(boot)

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("before-quit", () => {
  for (const child of processes) {
    if (!child.killed) {
      child.kill()
    }
  }
})
