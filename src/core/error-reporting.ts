type ErrorLogExtra = Record<string, unknown>

type SerializedError =
  | {
      name: string
      message: string
      stack?: string
      cause?: SerializedError | Record<string, unknown> | string | number | boolean
      details?: Record<string, unknown>
    }
  | Record<string, unknown>
  | string
  | number
  | boolean
  | null
  | undefined

function serializeObject(
  value: Record<string, unknown>,
  depth: number,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      serializeUnknownError(entry, depth + 1),
    ]),
  )
}

export function serializeUnknownError(
  error: unknown,
  depth = 0,
): SerializedError {
  if (depth >= 3) {
    return "[max error depth reached]"
  }

  if (error instanceof Error) {
    const details = serializeObject(
      Object.fromEntries(
        Object.entries(error).filter(([key]) => key !== "cause"),
      ),
      depth,
    )

    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause:
        error.cause === undefined
          ? undefined
          : serializeUnknownError(error.cause, depth + 1),
      details: Object.keys(details).length > 0 ? details : undefined,
    }
  }

  if (typeof error === "object" && error !== null) {
    return serializeObject(error as Record<string, unknown>, depth)
  }

  if (
    typeof error === "string" ||
    typeof error === "number" ||
    typeof error === "boolean" ||
    error == null
  ) {
    return error
  }

  return String(error)
}

export function getRequestId(request: Request): string {
  return (
    request.headers.get("x-request-id") ??
    request.headers.get("cf-ray") ??
    crypto.randomUUID()
  )
}

export function withRequestId(
  request: Request,
  requestId = getRequestId(request),
): Request {
  if (request.headers.get("x-request-id") === requestId) {
    return request
  }

  const headers = new Headers(request.headers)
  headers.set("x-request-id", requestId)
  return new Request(request, { headers })
}

function getRequestLogContext(request: Request) {
  const url = new URL(request.url)

  return {
    requestId: getRequestId(request),
    method: request.method,
    url: url.toString(),
    path: url.pathname,
    query: url.search || undefined,
    cfRay: request.headers.get("cf-ray") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  }
}

export function logRequestError(
  scope: string,
  request: Request,
  error: unknown,
  extra: ErrorLogExtra = {},
) {
  console.error({
    level: "error",
    event: "request_error",
    scope,
    request: getRequestLogContext(request),
    error: serializeUnknownError(error),
    ...extra,
  })
}

export function logRuntimeError(
  scope: string,
  error: unknown,
  extra: ErrorLogExtra = {},
) {
  console.error({
    level: "error",
    event: "runtime_error",
    scope,
    error: serializeUnknownError(error),
    ...extra,
  })
}

export function isDocumentRequest(request: Request): boolean {
  if (request.headers.get("sec-fetch-dest") === "document") {
    return true
  }

  const accept = request.headers.get("accept") ?? ""
  return request.method === "GET" && accept.includes("text/html")
}

export function createInternalErrorResponse(requestId: string): Response {
  return new Response("Internal Server Error", {
    status: 500,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-request-id": requestId,
    },
  })
}

export function createInternalErrorHtmlResponse(requestId: string): Response {
  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Luvachat</title>
    <style>
      :root {
        color-scheme: light;
        font-family: system-ui, sans-serif;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background: #f8f8f7;
        color: #161615;
      }

      main {
        width: min(100%, 420px);
        padding: 32px;
        border: 1px solid #e3e3df;
        border-radius: 16px;
        background: #fff;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.05);
      }

      h1 {
        margin: 0 0 12px;
        font-size: 24px;
        line-height: 1.2;
      }

      p {
        margin: 0;
        line-height: 1.5;
        color: #4d4d49;
      }

      small {
        display: block;
        margin-top: 16px;
        color: #6b6b67;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Something went wrong</h1>
      <p>Please try again.</p>
    </main>
  </body>
</html>`,
    {
      status: 500,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "x-request-id": requestId,
      },
    },
  )
}
