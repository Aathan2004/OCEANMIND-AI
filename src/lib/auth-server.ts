import { createServerFn } from "@tanstack/react-start";

/**
 * Authentication is owned by the Python service (ml-py). These server functions
 * are a thin, trusted proxy in front of it.
 *
 * The JWT is kept in an httpOnly cookie, so browser JavaScript can never read it
 * and the client has no way to fake a signed-in state: every answer to
 * "am I logged in?" comes from the backend verifying the token.
 */

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  created_at: string;
}

export interface AuthResult {
  success: boolean;
  user?: AuthUser | undefined;
  /** Safe, human-readable message. Never a raw database or stack error. */
  error?: string | undefined;
}

function mlServiceUrl(): string {
  return process.env["ML_SERVICE_URL"] || "http://127.0.0.1:8000";
}

/**
 * Cookie access is loaded on demand so the server-only Start APIs stay out of
 * the client bundle — this file is imported by client components for its types
 * and server-function references.
 */
async function cookies() {
  return import("@/lib/auth-cookies.server");
}

/** Turn any backend failure into one safe sentence for the UI. */
async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown; error?: unknown };
    const detail = body.detail ?? body.error;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && typeof detail[0] === "string") return detail[0];
  } catch {
    /* fall through to the generic message */
  }
  return fallback;
}

async function postJson(path: string, payload: unknown): Promise<Response> {
  return fetch(`${mlServiceUrl()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
}

const OFFLINE_MESSAGE =
  "Authentication service is unavailable. Start it with: cd ml-py && uvicorn app.main:app --reload --port 8000";

// ─── Register ──────────────────────────────────────────────────────────────────

export const registerFn = createServerFn({ method: "POST" })
  .validator(
    (data: { name: string; email: string; password: string; confirmPassword: string }) => data,
  )
  .handler(async ({ data }): Promise<AuthResult> => {
    let response: Response;
    try {
      response = await postJson("/auth/register", {
        name: data.name,
        email: data.email,
        password: data.password,
        confirm_password: data.confirmPassword,
      });
    } catch {
      return { success: false, error: OFFLINE_MESSAGE };
    }

    if (!response.ok) {
      return { success: false, error: await readError(response, "Could not create your account.") };
    }

    const body = (await response.json()) as {
      access_token: string;
      expires_in: number;
      user: AuthUser;
    };
    (await cookies()).storeToken(body.access_token, body.expires_in);
    return { success: true, user: body.user };
  });

// ─── Login ─────────────────────────────────────────────────────────────────────

export const loginFn = createServerFn({ method: "POST" })
  .validator((data: { email: string; password: string }) => data)
  .handler(async ({ data }): Promise<AuthResult> => {
    let response: Response;
    try {
      response = await postJson("/auth/login", { email: data.email, password: data.password });
    } catch {
      return { success: false, error: OFFLINE_MESSAGE };
    }

    if (!response.ok) {
      return { success: false, error: await readError(response, "Invalid email or password.") };
    }

    const body = (await response.json()) as {
      access_token: string;
      expires_in: number;
      user: AuthUser;
    };
    (await cookies()).storeToken(body.access_token, body.expires_in);
    return { success: true, user: body.user };
  });

// ─── Logout ────────────────────────────────────────────────────────────────────

export const logoutFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<AuthResult> => {
    const { readToken, clearToken } = await cookies();
    const token = readToken();
    // Revoke server-side first so the token dies even if the cookie somehow survives.
    if (token) {
      try {
        await fetch(`${mlServiceUrl()}/auth/logout`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        // Network failure must not trap the user in a signed-in UI; the cookie is
        // cleared regardless and the token expires on its own.
      }
    }
    clearToken();
    return { success: true };
  },
);

// ─── Current user ──────────────────────────────────────────────────────────────

export const getCurrentUserFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuthUser | null> => {
    const { readToken, clearToken } = await cookies();
    const token = readToken();
    if (!token) return null;

    try {
      const response = await fetch(`${mlServiceUrl()}/auth/me`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      });

      if (response.status === 401) {
        // Expired or revoked: drop the stale cookie so we don't ask again on
        // every navigation.
        clearToken();
        return null;
      }
      if (!response.ok) return null;
      return (await response.json()) as AuthUser;
    } catch {
      // Backend down: report signed-out rather than inventing a session.
      return null;
    }
  },
);
