import { createServerFn } from "@tanstack/react-start";

import type { OpenRouterMessage, OpenRouterResponse } from "@/lib/openrouter-api";

/**
 * Bridge from the browser to the Marine AI endpoint on the Python backend.
 *
 * The provider key lives only in the Python service's environment. This server
 * function forwards the user's session token so the backend can authenticate
 * the request; it never sees or handles the provider key itself.
 *
 *   Browser -> this server fn -> FastAPI /api/ai/chat -> OpenRouter -> DeepSeek
 *
 * An earlier version read `process.env.OPENROUTER_API_KEY` here. That could
 * never work from a `.env` file: Vite loads `.env` into `import.meta.env`, and
 * does not copy non-`VITE_` variables into `process.env`. Configuration now
 * lives in ml-py/.env, which python-dotenv does load.
 */

function mlServiceUrl(): string {
  return process.env["ML_SERVICE_URL"] || "http://127.0.0.1:8000";
}

export interface ChatRequest {
  history: OpenRouterMessage[];
  model: string;
  /** Text extracted from an uploaded PDF or data file. */
  context?: string;
  /** A key the user pasted into the UI, used only if the server has none. */
  userApiKey?: string;
}

/**
 * Failures are RETURNED, not thrown.
 *
 * A thrown class does not survive the server-function RPC boundary: the client
 * receives a plain Error, so `instanceof` is always false and the specific
 * message gets replaced by a generic one. A discriminated union serialises
 * cleanly and keeps the status and retryability intact.
 */
export type MarineAiFailure = {
  ok: false;
  message: string;
  status: number;
  retryable: boolean;
};

export type MarineAiSuccess = { ok: true; result: OpenRouterResponse };
export type MarineAiOutcome = MarineAiSuccess | MarineAiFailure;

function fail(message: string, status: number, retryable: boolean): MarineAiFailure {
  return { ok: false, message, status, retryable };
}

const GENERIC_MESSAGE = "Marine AI is temporarily unavailable. Please try again.";
/** Statuses where trying the same question again could plausibly succeed. */
const RETRYABLE = new Set([408, 429, 502, 503, 504]);

export const chatWithMarineAiFn = createServerFn({ method: "POST" })
  .validator((data: ChatRequest) => data)
  .handler(async ({ data }): Promise<MarineAiOutcome> => {
    const { readToken } = await import("@/lib/auth-cookies.server");
    const token = readToken();

    if (!token) {
      return fail("Please sign in to use Marine AI.", 401, false);
    }

    let response: Response;
    try {
      response = await fetch(`${mlServiceUrl()}/api/ai/chat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: data.history,
          model: data.model,
          ...(data.context ? { context: data.context } : {}),
          // Only used by the backend when it has no key of its own.
          ...(data.userApiKey ? { user_api_key: data.userApiKey } : {}),
        }),
        // Slightly longer than the backend's own timeout so the backend's
        // friendlier message wins the race.
        signal: AbortSignal.timeout(75000),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        return fail("Marine AI took too long to respond. Please try again.", 504, true);
      }
      return fail(
        "Cannot reach the OceanMind backend. Start it with: cd ml-py && uvicorn app.main:app --reload --port 8000",
        503,
        true,
      );
    }

    if (!response.ok) {
      // The backend already produced a safe, user-facing sentence.
      let message = GENERIC_MESSAGE;
      try {
        const body = (await response.json()) as { detail?: unknown };
        if (typeof body.detail === "string") message = body.detail;
      } catch {
        /* keep the generic message */
      }
      if (response.status === 401) {
        message = "Your session has expired. Please sign in again.";
      }
      return fail(message, response.status, RETRYABLE.has(response.status));
    }

    const body = (await response.json()) as {
      answer: string;
      model: string;
      provider: string;
      usage?: OpenRouterResponse["usage"];
    };

    return {
      ok: true,
      result: {
        content: body.answer,
        modelUsed: body.model,
        source: "OpenRouter DeepSeek (Live)",
        usage: body.usage,
      },
    };
  });

export interface AiHealth {
  configured: boolean;
  provider: string;
  model?: string | null;
}

/** Whether the server can reach the AI provider. Never exposes the key. */
export const getAiHealthFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AiHealth> => {
    try {
      const response = await fetch(`${mlServiceUrl()}/api/ai/health`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return { configured: false, provider: "openrouter" };
      return (await response.json()) as AiHealth;
    } catch {
      return { configured: false, provider: "openrouter" };
    }
  },
);

export type AttachmentOutcome = { ok: true; result: AttachmentResult } | MarineAiFailure;

export interface AttachmentResult {
  success: boolean;
  filename: string;
  kind: string;
  summary: string;
  context: string;
}

/** Upload a PDF or ocean-data file and get its extracted text back. */
export const uploadAttachmentFn = createServerFn({ method: "POST" })
  .validator((formData: FormData) => formData)
  .handler(async ({ data: formData }): Promise<AttachmentOutcome> => {
    const { readToken } = await import("@/lib/auth-cookies.server");
    const token = readToken();
    if (!token) return fail("Please sign in to upload a file.", 401, false);

    const file = formData.get("file") as File | null;
    if (!file) return fail("No file provided.", 400, false);

    const forward = new FormData();
    forward.append("file", file);

    let response: Response;
    try {
      response = await fetch(`${mlServiceUrl()}/api/ai/attachment`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: forward,
        signal: AbortSignal.timeout(60000),
      });
    } catch {
      return fail("Could not reach the OceanMind backend.", 503, true);
    }

    if (!response.ok) {
      let message = "That file could not be processed.";
      try {
        const body = (await response.json()) as { detail?: unknown };
        if (typeof body.detail === "string") message = body.detail;
      } catch {
        /* keep the generic message */
      }
      return fail(message, response.status, false);
    }

    return { ok: true, result: (await response.json()) as AttachmentResult };
  });
