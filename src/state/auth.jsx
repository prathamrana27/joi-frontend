import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, loadAuth, saveAuth, clearAuth } from "../lib/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => loadAuth());
  const [ready, setReady] = useState(false);

  // Validate any persisted token on boot.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = loadAuth();
      if (stored?.access_token) {
        try {
          const { user } = await api.me(stored.access_token);
          if (!cancelled) setAuth({ ...stored, user });
        } catch {
          clearAuth();
          if (!cancelled) setAuth(null);
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({
      auth,
      ready,
      token: auth?.access_token || null,
      user: auth?.user || null,
      signIn(payload) {
        saveAuth(payload);
        setAuth(payload);
      },
      signOut() {
        clearAuth();
        setAuth(null);
      },
    }),
    [auth, ready]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
