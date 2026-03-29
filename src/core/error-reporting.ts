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

export function createInternalErrorResponse(requestId: string): Response {
  return new Response(`Internal Server Error\nrequest_id=${requestId}`, {
    status: 500,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-request-id": requestId,
    },
  })
}
