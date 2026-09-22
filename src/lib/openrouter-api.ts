export type OpenRouterMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type OpenRouterResponse = {
  content: string;
  modelUsed: string;
  source: "OpenRouter DeepSeek (Live)" | "Marine AI Knowledge Engine";
  usage?:
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      }
    | undefined;
};

const STORAGE_KEY = "oceanmind_openrouter_api_key";

// Ids verified against https://openrouter.ai/api/v1/models. The backend keeps
// its own allowlist, so adding one here alone is not enough.
export const OPENROUTER_MODELS = [
  { id: "deepseek/deepseek-chat", name: "DeepSeek V3 Chat", provider: "DeepSeek" },
  { id: "deepseek/deepseek-chat-v3.1", name: "DeepSeek V3.1 Chat", provider: "DeepSeek" },
  { id: "deepseek/deepseek-chat-v3-0324", name: "DeepSeek V3 (03-24)", provider: "DeepSeek" },
  { id: "deepseek/deepseek-r1", name: "DeepSeek R1 Reasoning", provider: "DeepSeek" },
];

/**
 * Read the API key the *user* pasted into the UI, from this browser only.
 *
 * The project's own key deliberately is NOT read here. It lives in
 * `OPENROUTER_API_KEY` on the server and is applied by the server function in
 * openrouter-server.ts — a `VITE_`-prefixed key would be baked into the client
 * bundle and handed to every visitor.
 */
export function getOpenRouterApiKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() ?? "";
  } catch {
    // Storage can throw in private mode; treat that as "no user key".
    return "";
  }
}

export function setOpenRouterApiKey(key: string): void {
  if (typeof window !== "undefined") {
    if (key.trim()) {
      localStorage.setItem(STORAGE_KEY, key.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    window.dispatchEvent(new CustomEvent("openrouter-key-changed", { detail: key.trim() }));
  }
}

export function getOpenRouterModel(): string {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("oceanmind_openrouter_model");
    if (saved) return saved;
  }
  return "deepseek/deepseek-chat";
}

export function setOpenRouterModel(modelId: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("oceanmind_openrouter_model", modelId);
  }
}

/**
 * Send chat message history to OpenRouter DeepSeek Chat API
 */
export async function sendOpenRouterChatMessage(
  history: OpenRouterMessage[],
  selectedModel: string = getOpenRouterModel(),
  context?: string,
): Promise<import("@/lib/openrouter-server").MarineAiOutcome> {
  // Everything goes through the OceanMind backend so the deployment's provider
  // key is never shipped to the browser. A key the user pasted in themselves is
  // forwarded as a fallback and is only used if the server has none.
  const { chatWithMarineAiFn } = await import("@/lib/openrouter-server");
  const userApiKey = getOpenRouterApiKey();

  return chatWithMarineAiFn({
    data: {
      history,
      model: selectedModel,
      ...(context ? { context } : {}),
      ...(userApiKey ? { userApiKey } : {}),
    },
  });
}
