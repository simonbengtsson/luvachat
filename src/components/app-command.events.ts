export const OPEN_APP_COMMAND_EVENT = "app-command:open"

export function dispatchOpenAppCommandEvent() {
  if (typeof window === "undefined") {
    return
  }

  window.dispatchEvent(new CustomEvent(OPEN_APP_COMMAND_EVENT))
}
