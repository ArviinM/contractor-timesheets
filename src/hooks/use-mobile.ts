import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * False on the server and during hydration (so the markup matches), then the real value.
 * The first check runs in a frame callback rather than directly in the effect body.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => setIsMobile(mql.matches)
    const frame = requestAnimationFrame(onChange)
    mql.addEventListener("change", onChange)
    return () => {
      cancelAnimationFrame(frame)
      mql.removeEventListener("change", onChange)
    }
  }, [])

  return isMobile
}
