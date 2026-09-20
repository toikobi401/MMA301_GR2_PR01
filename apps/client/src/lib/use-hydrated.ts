import { useEffect, useState } from 'react';

/**
 * False during the first render, true afterwards.
 *
 * The web build is prerendered to static HTML with no URL parameters and no
 * session, so a screen that branches on either renders one thing at build
 * time and something else in the browser. React calls that a hydration
 * mismatch and throws away the server markup — error #418.
 *
 * Gating on this makes the first client render match the prerendered one, and
 * the real content appears immediately after. On native there is no
 * prerender, so the effect runs before anything is painted and this costs
 * nothing.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return hydrated;
}
