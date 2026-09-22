import { createServerFn } from "@tanstack/react-start";

export interface HistoryRecord {
  id: number;
  status: string;
  scientific_name: string | null;
  common_name: string | null;
  confidence: number | null;
  created_at: string;
}

function mlServiceUrl(): string {
  return process.env["ML_SERVICE_URL"] || "http://127.0.0.1:8000";
}

/**
 * History is read with the caller's own token, so the backend decides which rows
 * belong to them. The user id is never sent from the client.
 */
export const getHistoryFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ history: HistoryRecord[] }> => {
    const { readToken } = await import("@/lib/auth-cookies.server");
    const token = readToken();
    if (!token) return { history: [] };

    try {
      const response = await fetch(`${mlServiceUrl()}/fish/history`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return { history: [] };
      const body = (await response.json()) as { history: HistoryRecord[] };
      return { history: body.history ?? [] };
    } catch {
      return { history: [] };
    }
  },
);

export const clearHistoryFn = createServerFn({ method: "POST" }).handler(async () => {
  const { readToken } = await import("@/lib/auth-cookies.server");
  const token = readToken();
  if (!token) return { success: false };

  try {
    const response = await fetch(`${mlServiceUrl()}/fish/history`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    return { success: response.ok };
  } catch {
    return { success: false };
  }
});
