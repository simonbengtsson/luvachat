import { logRequestError } from "@/core/error-reporting"
import { createMiddleware, createStart } from "@tanstack/react-start"

const requestErrorLogger = createMiddleware().server(
  async ({ next, request }) => {
    try {
      return await next()
    } catch (error) {
      logRequestError("tanstack.request", request, error)
      throw error
    }
  },
)

export const startInstance = createStart(() => ({
  defaultSsr: false,
  requestMiddleware: [requestErrorLogger],
}))
