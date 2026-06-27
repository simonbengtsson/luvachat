export type AppErrorAction = {
  href: string
  label: string
}

export type AppErrorView = {
  action: AppErrorAction | null
  message: string
  title: string
}

export class AppError extends Error {
  readonly action: AppErrorAction | null
  readonly title: string

  constructor({
    action = null,
    message,
    title,
  }: {
    action?: AppErrorAction | null
    message: string
    title: string
  }) {
    super(message)
    this.name = "AppError"
    this.action = action
    this.title = title
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

export function getAppErrorView(error: AppError): AppErrorView {
  return {
    action: error.action,
    message: error.message,
    title: error.title,
  }
}
