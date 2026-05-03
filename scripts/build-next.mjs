import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const nextBin = process.platform === "win32"
  ? path.join(root, "node_modules", ".bin", "next.cmd")
  : path.join(root, "node_modules", ".bin", "next")
const command = process.platform === "win32" ? "cmd.exe" : nextBin
const args = process.platform === "win32" ? ["/d", "/s", "/c", nextBin, "build"] : ["build"]

const child = spawn(command, args, {
  cwd: root,
  stdio: "inherit",
  windowsHide: true,
  env: {
    ...process.env,
    NEXT_PRIVATE_BUILD_WORKER: process.env.NEXT_PRIVATE_BUILD_WORKER || "1",
  },
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
