// Exposes a small, fixed API to the page. The page never gets Node or the file system.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("poipiuHost", {
  isKiosk: true,
  storeGet: (key) => ipcRenderer.sendSync("store:get", key),
  storeSet: (key, json) => ipcRenderer.sendSync("store:set", key, json),
  storeRemove: (key) => ipcRenderer.sendSync("store:remove", key),
  contentList: () => ipcRenderer.invoke("content:list"),
  contentRead: (name) => ipcRenderer.invoke("content:read", name),
  contentAdd: (name, bytes) => ipcRenderer.invoke("content:add", name, bytes),
  contentRemove: (name) => ipcRenderer.invoke("content:remove", name),
  osuEnabled: () => ipcRenderer.invoke("osu:enabled"),
  osuPrepare: (skinFile) => ipcRenderer.invoke("osu:prepare", skinFile ?? null),
  osuStop: () => ipcRenderer.invoke("osu:stop"),
  osuFindReplay: (sinceMs) => ipcRenderer.invoke("osu:findReplay", sinceMs),
  osuStatus: () => ipcRenderer.invoke("osu:status"),
  quit: () => ipcRenderer.send("app:quit"),
});
