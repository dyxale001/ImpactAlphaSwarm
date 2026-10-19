import { useEffect, useState } from 'react'

export interface ViewportFrame {
  /** Distance from the top of the layout viewport to the visible area. */
  top: number
  /** Height of the visible area, which excludes an on-screen keyboard. */
  height: number
}

// The part of the page the reader can actually see. iPhone Safari does not
// shrink the page when the keyboard opens; it lays the keyboard over it and
// scrolls the page to keep the focused field in view, so anything pinned with
// position: fixed ends up under the keyboard or above the top edge.
// window.visualViewport reports the visible area instead, so a full-screen
// sheet placed at { top, height } always sits between the browser bar and the
// keyboard. Only listens while `active`; null when inactive or unsupported.
export function useVisualViewport(active: boolean): ViewportFrame | null {
  const [frame, setFrame] = useState<ViewportFrame | null>(null)

  useEffect(() => {
    const vv = typeof window === 'undefined' ? undefined : window.visualViewport
    if (!active || !vv) {
      setFrame(null)
      return
    }
    const update = () => setFrame({ top: vv.offsetTop, height: vv.height })
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [active])

  return frame
}
