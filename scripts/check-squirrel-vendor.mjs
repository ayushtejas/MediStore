import { copyFile, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const vendorDir = path.join(root, "node_modules", "electron-winstaller", "vendor")

async function exists(filePath) {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

async function copyIfMissing(targetName, sourceNames) {
  const target = path.join(vendorDir, targetName)
  if (await exists(target)) return

  for (const sourceName of sourceNames) {
    const source = path.join(vendorDir, sourceName)
    if (await exists(source)) {
      await copyFile(source, target)
      console.log(`Restored ${targetName} from ${sourceName}`)
      return
    }
  }

  throw new Error(
    `Missing ${targetName} in ${vendorDir}. Run npm install, then retry.`
  )
}

async function requireFile(name) {
  const filePath = path.join(vendorDir, name)
  if (!(await exists(filePath))) {
    throw new Error(`Missing ${name} in ${vendorDir}. Run npm install, then retry.`)
  }
}

await requireFile("Squirrel.exe")
await requireFile("nuget.exe")
await requireFile("Setup.exe")
await copyIfMissing("7z.exe", ["7z-x64.exe", "7z-arm64.exe"])
await copyIfMissing("7z.dll", ["7z-x64.dll", "7z-arm64.dll"])

console.log("Squirrel.Windows vendor tools are present.")
