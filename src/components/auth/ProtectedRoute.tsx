import { Navigate, useRouterState } from "@tanstack/react-router";
import { Waves } from "lucide-react";
import { useRef, type ReactNode } from "react";

import { useAuth } from "@/lib/auth-context";

/**
 * Gate for pages that require a signed-in user.
 *
 * While the initial session check is in flight we render a placeholder rather
 * than redirecting — redirecting during `loading` is what causes the classic
 * login/redirect loop on refresh.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  // Remember the first path this guard saw. Reading the live pathname at redirect
  // time yields "/login" once the navigation starts, which would send the user
  // back to the login page after they sign in.
  const originalPath = useRef(pathname);

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center" role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Waves className="size-8 animate-pulse text-ocean-cyan" />
          <p className="text-sm">Verifying your session…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Remember where they were headed so login can send them back.
    return <Navigate to="/login" search={{ redirect: originalPath.current }} replace />;
  }

  return <>{children}</>;
}
