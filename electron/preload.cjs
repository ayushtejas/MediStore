const { contextBridge } = require("electron")

contextBridge.exposeInMainWorld("medstoreDesktop", {
  platform: process.platform,
})
