import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";

/**
 * Sign out and leave for the landing page.
 *
 * Clears the Supabase session as well as the local store: setSession(null)
 * alone only empties this tab's state, the token stays in storage and the next
 * load signs straight back in. The swallow is deliberate. A failed network
 * call must not strand someone on a page they asked to leave, and the local
 * session is cleared either way.
 */
export function useSignOut() {
  const setSession = useAuthStore((state) => state.setSession);
  const navigate = useNavigate();

  return useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      /* leaving anyway */
    }
    setSession(null);
    navigate("/", { replace: true });
  }, [setSession, navigate]);
}
