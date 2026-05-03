module.exports = {
  packagerConfig: {
    asar: true,
    executableName: "MedStoreOffline",
    extraResource: [
      "desktop-dist/frontend",
      "desktop-dist/backend",
    ],
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "MedStoreOffline",
        authors: "MedStore",
        description: "Offline pharmacy POS and admin desktop application",
      },
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin", "linux"],
    },
  ],
}
