/**
 * Chat history is stored per browser, scoped to the signed-in user.
 *
 * The storage key carries the authenticated user's id, so two accounts sharing
 * one machine never read each other's conversations — previously both wrote to
 * a single global key. This is a privacy boundary between local profiles, not a
 * security control: anything in localStorage is readable by whoever has the
 * device. Nothing confidential should be kept here.
 */
const SESSIONS_PREFIX = "oceanmind_chat_sessions";
const PINNED_PREFIX = "oceanmind_pinned_topics";

/** Set from the auth context whenever the signed-in user changes. */
let activeUserId: string | null = null;

export function setChatHistoryUser(userId: number | string | null): void {
  const next = userId == null ? null : String(userId);
  activeUserId = next;
}

function scoped(prefix: string): string {
  return activeUserId ? `${prefix}:u${activeUserId}` : `${prefix}:anon`;
}
const MAX_SESSIONS = 20;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  timestamp?: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface PinnedTopic {
  id: string;
  title: string;
  sessionId: string | undefined;
  createdAt: number;
}

function generateId(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function deriveChatTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New Chat";
  const text = firstUser.content.slice(0, 48);
  return text.length < firstUser.content.length ? `${text}…` : text;
}

// ── Session CRUD ─────────────────────────────────────────────────────────────

export function getChatSessions(): ChatSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scoped(SESSIONS_PREFIX));
    return raw ? (JSON.parse(raw) as ChatSession[]) : [];
  } catch {
    return [];
  }
}

export function saveChatSession(session: ChatSession): void {
  if (typeof window === "undefined") return;
  const sessions = getChatSessions().filter((s) => s.id !== session.id);
  // Most recent first, cap at MAX_SESSIONS
  const updated = [session, ...sessions].slice(0, MAX_SESSIONS);
  localStorage.setItem(scoped(SESSIONS_PREFIX), JSON.stringify(updated));
}

export function deleteChatSession(id: string): void {
  if (typeof window === "undefined") return;
  const sessions = getChatSessions().filter((s) => s.id !== id);
  localStorage.setItem(scoped(SESSIONS_PREFIX), JSON.stringify(sessions));
}

export function createNewSession(): ChatSession {
  return {
    id: generateId(),
    title: "New Chat",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function updateSessionMessages(session: ChatSession, messages: ChatMessage[]): ChatSession {
  const updated: ChatSession = {
    ...session,
    messages,
    title: deriveChatTitle(messages),
    updatedAt: Date.now(),
  };
  saveChatSession(updated);
  return updated;
}

// ── Pinned Topics ─────────────────────────────────────────────────────────────

export function getPinnedTopics(): PinnedTopic[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scoped(PINNED_PREFIX));
    return raw ? (JSON.parse(raw) as PinnedTopic[]) : [];
  } catch {
    return [];
  }
}

export function pinTopic(title: string, sessionId?: string): PinnedTopic {
  const topic: PinnedTopic = {
    id: generateId(),
    title: title.slice(0, 60),
    sessionId,
    createdAt: Date.now(),
  };
  const existing = getPinnedTopics();
  localStorage.setItem(scoped(PINNED_PREFIX), JSON.stringify([topic, ...existing].slice(0, 10)));
  return topic;
}

export function unpinTopic(id: string): void {
  if (typeof window === "undefined") return;
  const topics = getPinnedTopics().filter((t) => t.id !== id);
  localStorage.setItem(scoped(PINNED_PREFIX), JSON.stringify(topics));
}

// ── Active Session in sessionStorage ─────────────────────────────────────────

const ACTIVE_SESSION_KEY = "aquaintel_active_session_id";

export function getActiveSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(ACTIVE_SESSION_KEY);
}

export function setActiveSessionId(id: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(ACTIVE_SESSION_KEY, id);
}
