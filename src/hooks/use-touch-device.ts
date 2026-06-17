import { useEffect, useState } from "react"

const TOUCH_DEVICE_QUERY = "(pointer: coarse), (hover: none)"

export function useIsTouchDevice() {
  const [isTouchDevice, setIsTouchDevice] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const mediaQuery = window.matchMedia(TOUCH_DEVICE_QUERY)
    const updateIsTouchDevice = () => {
      setIsTouchDevice(mediaQuery.matches || navigator.maxTouchPoints > 0)
    }

    updateIsTouchDevice()
    mediaQuery.addEventListener("change", updateIsTouchDevice)

    return () => {
      mediaQuery.removeEventListener("change", updateIsTouchDevice)
    }
  }, [])

  return isTouchDevice
}
