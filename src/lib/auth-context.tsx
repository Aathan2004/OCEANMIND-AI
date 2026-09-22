import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { getCurrentUserFn, loginFn, logoutFn, registerFn, type AuthUser } from "@/lib/auth-server";
import { setChatHistoryUser } from "@/lib/chat-history";

/**
 * The single source of authentication truth for the client.
 *
 * `user` is only ever set from a backend response — there is no client-side
 * "isLoggedIn" flag to forge, and nothing is read from localStorage.
 */
interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** True only during the initial session check, so guards can wait instead of
   *  bouncing a signed-in user to /login on first paint. */
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (
    name: string,
    email: string,
    password: string,
    confirmPassword: string,
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const current = await getCurrentUserFn();
      if (mounted.current) setUser(current);
    } catch {
      if (mounted.current) setUser(null);
    }
  }, []);

  // Verify the session once on mount. This is what makes a page refresh keep the
  // user signed in: the httpOnly cookie travels with the request and the backend
  // re-validates it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const current = await getCurrentUserFn();
        if (!cancelled && mounted.current) setUser(current);
      } catch {
        if (!cancelled && mounted.current) setUser(null);
      } finally {
        if (!cancelled && mounted.current) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginFn({ data: { email, password } });
    if (result.success && result.user) {
      setUser(result.user);
      return { success: true };
    }
    return { success: false, error: result.error ?? "Login failed." };
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string, confirmPassword: string) => {
      const result = await registerFn({ data: { name, email, password, confirmPassword } });
      if (result.success && result.user) {
        setUser(result.user);
        return { success: true };
      }
      return { success: false, error: result.error ?? "Registration failed." };
    },
    [],
  );

  const logout = useCallback(async () => {
    // Clear locally first so the UI flips to signed-out immediately, then let the
    // backend revoke the token.
    setUser(null);
    try {
      await logoutFn();
    } finally {
      await refresh();
    }
  }, [refresh]);

  // Point per-user local storage (chat history) at whoever is signed in, and
  // away from it on logout, so accounts sharing a browser stay separated.
  useEffect(() => {
    setChatHistoryUser(user?.id ?? null);
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      loading,
      login,
      register,
      logout,
      refresh,
    }),
    [user, loading, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>.");
  return context;
}
