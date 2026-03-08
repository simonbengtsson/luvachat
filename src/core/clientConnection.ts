import { handleMessage } from "./clientStore"
import { ServerEventSchema, type ClientEvent } from "./sync-events"

let socket: WebSocket | null = null
let pingIntervalId: number | null = null

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

  const ws = new WebSocket(getSyncUrl())
  socket = ws

  ws.addEventListener("open", () => {
    if (socket !== ws) {
      return
    }

    console.log("[sync] websocket connected")
    startPingInterval(ws)
  })

  ws.addEventListener("message", (messageEvent) => {
    if (socket !== ws) {
      return
    }

    if (typeof messageEvent.data !== "string") {
      console.warn("[sync] unsupported non-text websocket payload")
      return
    }

    let payload: unknown
    try {
      payload = JSON.parse(messageEvent.data)
    } catch {
      console.warn(
        "[sync] received invalid sync event payload",
        messageEvent.data,
      )
      return
    }

    const parsedEvent = ServerEventSchema.safeParse(payload)
    if (!parsedEvent.success) {
      console.warn("[sync] received invalid sync event payload", payload)
      return
    }

    console.log("[sync] client received event", parsedEvent.data)
    handleMessage(parsedEvent.data)
  })

  ws.addEventListener("close", (event) => {
    console.log("[sync] websocket closed", {
      code: event.code,
      reason: event.reason,
    })
    if (socket === ws) {
      clearPingInterval()
      socket = null
    }
  })

  ws.addEventListener("error", () => {
    console.error("[sync] websocket error")
  })

  return () => {
    closeSocket(ws)
  }
}

function getSyncUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${window.location.host}/sync`
}

function startPingInterval(ws: WebSocket): void {
  clearPingInterval()

  pingIntervalId = window.setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      return
    }

    const pingEvent: ClientEvent = {
      type: "ping",
      timestamp: new Date().toISOString(),
    }

    console.log("[sync] client sending event", pingEvent)
    ws.send(JSON.stringify(pingEvent))
  }, 5_000)
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
