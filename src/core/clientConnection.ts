import { conversationsQueryKey } from "./conversationsQuery"
import { generateShortId } from "./generateId"
import { queryClient } from "./queryClient"
import { applyMessageCreatedToCache } from "./realtimeCache"
import { ServerEventSchema, type ClientEvent } from "./sync-events"

export type SyncConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"

let socket: WebSocket | null = null
let pingIntervalId: number | null = null
let reconnectTimeoutId: number | null = null
let currentClientId: string | null = null
let hasConnectedOnce = false
let shouldReconnect = false
let syncConnectionStatus: SyncConnectionStatus = "disconnected"
let removeNetworkListeners: (() => void) | null = null

const syncConnectionListeners = new Set<() => void>()
const RECONNECT_DELAY_MS = 3_000

export function initializeSyncConnection(): () => void {
  shouldReconnect = true
  ensureNetworkListeners()
  connectSocket()

  return () => {
    shouldReconnect = false
    clearReconnectTimeout()
    closeSocket()
    removeNetworkListeners?.()
    removeNetworkListeners = null
    setSyncConnectionStatus("disconnected")
  }
}

export function subscribeToSyncConnectionStatus(
  listener: () => void,
): () => void {
  syncConnectionListeners.add(listener)
  return () => {
    syncConnectionListeners.delete(listener)
  }
}

export function getSyncConnectionStatus(): SyncConnectionStatus {
  return syncConnectionStatus
}

function connectSocket(): void {
  if (!window.navigator.onLine) {
    setSyncConnectionStatus("reconnecting")
    scheduleReconnect()
    return
  }

  if (
    socket &&
    (socket.readyState === WebSocket.CONNECTING ||
      socket.readyState === WebSocket.OPEN)
  ) {
    return
  }

  clearReconnectTimeout()
  const clientId = generateShortId().slice(0, 6)
  const ws = new WebSocket(getSyncUrl(clientId))
  currentClientId = clientId
  socket = ws
  setSyncConnectionStatus(hasConnectedOnce ? "reconnecting" : "connecting")

  ws.addEventListener("open", () => {
    if (socket !== ws) {
      return
    }

    console.log("[sync] websocket connected", { clientId })
    hasConnectedOnce = true
    setSyncConnectionStatus("connected")
    startPingInterval(ws, clientId)
  })

  ws.addEventListener("message", (messageEvent) => {
    if (socket !== ws) {
      return
    }

    if (typeof messageEvent.data !== "string") {
      console.warn("[sync] unsupported non-text websocket payload", {
        clientId,
      })
      return
    }

    let payload: unknown
    try {
      payload = JSON.parse(messageEvent.data)
    } catch {
      console.warn("[sync] received invalid sync event payload", {
        clientId,
        payload: messageEvent.data,
      })
      return
    }

    const parsedEvent = ServerEventSchema.safeParse(payload)
    if (!parsedEvent.success) {
      console.warn("[sync] received invalid sync event payload", {
        clientId,
        payload,
      })
      return
    }

    console.log("[sync] client received event", {
      clientId,
      event: parsedEvent.data,
    })

    if (parsedEvent.data.type === "workspaceUpdated") {
      void queryClient.invalidateQueries({ queryKey: conversationsQueryKey })
      return
    }

    if (parsedEvent.data.type === "messageCreated") {
      applyMessageCreatedToCache(queryClient, parsedEvent.data.message, {
        markViewed:
          getActiveConversationId() === parsedEvent.data.message.conversationId,
      })
    }
  })

  ws.addEventListener("close", (event) => {
    console.log("[sync] websocket closed", {
      clientId,
      code: event.code,
      reason: event.reason,
    })
    if (socket === ws) {
      clearPingInterval()
      socket = null
      currentClientId = null
    }

    if (shouldReconnect) {
      setSyncConnectionStatus("reconnecting")
      scheduleReconnect()
      return
    }

    setSyncConnectionStatus("disconnected")
  })

  ws.addEventListener("error", () => {
    console.error("[sync] websocket error", { clientId })
  })
}

export function createConversation(name: string): void {
  const ws = socket
  const clientId = currentClientId
  const channelName = name.trim()

  if (!channelName) {
    return
  }

  if (!ws || ws.readyState !== WebSocket.OPEN || !clientId) {
    console.warn(
      "[sync] cannot create conversation while websocket is disconnected",
      {
        channelName,
      },
    )
    return
  }

  sendEvent(ws, clientId, {
    type: "createConversation",
    name: channelName,
  })
}

function getSyncUrl(clientId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  const url = new URL(`${protocol}//${window.location.host}/sync`)
  url.searchParams.set("userId", clientId)
  return url.toString()
}

function getActiveConversationId(): string | null {
  const match = window.location.pathname.match(/^\/c\/([^/]+)$/)
  const activeConversationId = match?.[1]
  return activeConversationId ? decodeURIComponent(activeConversationId) : null
}

function startPingInterval(ws: WebSocket, clientId: string): void {
  clearPingInterval()

  pingIntervalId = window.setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      return
    }

    sendEvent(ws, clientId, {
      type: "ping",
      timestamp: new Date().toISOString(),
    })
  }, 5_000)
}

function sendEvent(ws: WebSocket, clientId: string, event: ClientEvent): void {
  console.log("[sync] client sending event", { clientId, event })
  ws.send(JSON.stringify(event))
}

function clearPingInterval(): void {
  if (pingIntervalId === null) {
    return
  }

  window.clearInterval(pingIntervalId)
  pingIntervalId = null
}

function scheduleReconnect(): void {
  if (reconnectTimeoutId !== null) {
    return
  }

  reconnectTimeoutId = window.setTimeout(() => {
    reconnectTimeoutId = null

    if (!shouldReconnect) {
      setSyncConnectionStatus("disconnected")
      return
    }

    connectSocket()
  }, RECONNECT_DELAY_MS)
}

function clearReconnectTimeout(): void {
  if (reconnectTimeoutId === null) {
    return
  }

  window.clearTimeout(reconnectTimeoutId)
  reconnectTimeoutId = null
}

function ensureNetworkListeners(): void {
  if (removeNetworkListeners) {
    return
  }

  const handleOffline = () => {
    setSyncConnectionStatus("reconnecting")
    clearReconnectTimeout()
    closeSocket()
  }

  const handleOnline = () => {
    clearReconnectTimeout()
    connectSocket()
  }

  window.addEventListener("offline", handleOffline)
  window.addEventListener("online", handleOnline)

  removeNetworkListeners = () => {
    window.removeEventListener("offline", handleOffline)
    window.removeEventListener("online", handleOnline)
  }
}

function closeSocket(target = socket): void {
  if (!target) {
    return
  }

  if (socket === target) {
    clearPingInterval()
  }

  if (
    target.readyState === WebSocket.OPEN ||
    target.readyState === WebSocket.CONNECTING
  ) {
    target.close(1000, "connection disposed")
  }
}

function setSyncConnectionStatus(status: SyncConnectionStatus): void {
  if (syncConnectionStatus === status) {
    return
  }

  syncConnectionStatus = status
  for (const listener of syncConnectionListeners) {
    listener()
  }
}
