self.addEventListener("push", (event) => {
  console.log("[push] push event", { event })
  if (!event.data) {
    return
  }

  let payload
  try {
    payload = event.data.json()
  } catch (error) {
    console.error("Failed to parse push payload:", error)
    return
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "New message", {
      body: payload.body || "New message",
      data: {
        url: payload.url || "/",
      },
      tag: payload.messageId || undefined,
      badge: "/logo192.png",
      icon: "/logo192.png",
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  const targetUrl = new URL(
    event.notification.data?.url || "/",
    self.location.origin,
  ).toString()

  event.waitUntil(
    self.clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then((clients) => {
        const existingClient = clients.find((client) =>
          client.url.startsWith(self.location.origin),
        )

        if (existingClient) {
          return existingClient.navigate(targetUrl).then((client) => {
            return client ? client.focus() : existingClient.focus()
          })
        }

        return self.clients.openWindow(targetUrl)
      }),
  )
})
