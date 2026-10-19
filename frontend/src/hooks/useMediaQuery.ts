import { useEffect, useState } from 'react'

// Whether a CSS media query matches, kept in step as the window changes.
// False where matchMedia is unavailable (node tests, very old browsers).
export function useMediaQuery(query: string): boolean {
  const read = () => {
    try {
      return window.matchMedia(query).matches
    } catch {
      return false
    }
  }
  const [matches, setMatches] = useState(read)

  useEffect(() => {
    let mql: MediaQueryList
    try {
      mql = window.matchMedia(query)
    } catch {
      return
    }
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}
