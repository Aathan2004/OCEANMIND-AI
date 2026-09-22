import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";

/**
 * Server-only cookie helpers.
 *
 * `@tanstack/react-start/server` must never end up in the client bundle, so this
 * module is imported dynamically from inside server-function handlers (whose
 * bodies are stripped from the client build) rather than at the top level of a
 * file the client also imports.
 */

export const AUTH_COOKIE = "oceanmind_token";

export function storeToken(token: string, maxAgeSeconds: number): void {
  setCookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Vite serves dev over plain HTTP; a real deployment must be TLS-only.
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export function readToken(): string | undefined {
  return getCookie(AUTH_COOKIE);
}

export function clearToken(): void {
  deleteCookie(AUTH_COOKIE, { path: "/" });
}
