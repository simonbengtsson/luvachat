import { createFileRoute } from "@tanstack/react-router"
import { env } from "cloudflare:workers"

export const Route = createFileRoute("/assets/$")({
  server: {
    handlers: {
      GET: ({ params }) => serveAsset(params._splat, true),
      HEAD: ({ params }) => serveAsset(params._splat, false),
      ANY: () => new Response("Method Not Allowed", { status: 405 }),
    },
  },
})

async function serveAsset(key: string | undefined, includeBody: boolean) {
  const object = key ? await env.MAIN_BUCKET.get(key) : null
  if (!object) {
    return new Response("Not Found", { status: 404 })
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set("etag", object.httpEtag)
  headers.set("content-length", String(object.size))

  return new Response(includeBody ? object.body : null, {
    status: 200,
    headers,
  })
}
