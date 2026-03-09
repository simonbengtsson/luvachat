import { conversationsQueryKey } from "./conversationsQuery"
import { generateShortId } from "./generateId"
import { queryClient } from "./queryClient"
import { ServerEventSchema, type ClientEvent } from "./sync-events"

let socket: WebSocket | null = null
let pingIntervalId: number | null = null
let currentClientId: string | null = null

export function initializeSyncConnection(): () => void {
  if (
    socket &&
    (socket.readyState === WebSocket.CONNECTING ||
      socket.readyState === WebSocket.OPEN)
  ) {
    return () => {
      closeSocket()
    }
  }

  const clientId = generateShortId().slice(0, 6)
  const ws = new WebSocket(getSyncUrl(clientId))
  currentClientId = clientId
  socket = ws

  ws.addEventListener("open", () => {
    if (socket !== ws) {
      return
    }

    console.log("[sync] websocket connected", { clientId })
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
  })

  ws.addEventListener("error", () => {
    console.error("[sync] websocket error", { clientId })
  })

  return () => {
    closeSocket(ws)
  }
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
