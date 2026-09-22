import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  Copy,
  Download,
  FileUp,
  Loader2,
  RotateCcw,
  Mic,
  MicOff,
  Pin,
  PinOff,
  Plus,
  Send,
  Share2,
  StickyNote,
  Trash2,
  Waves,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { suggestedPrompts } from "@/lib/ocean-data";
import {
  getOpenRouterModel,
  sendOpenRouterChatMessage,
  type OpenRouterMessage,
} from "@/lib/openrouter-api";
import { getAiHealthFn, uploadAttachmentFn, type AttachmentResult } from "@/lib/openrouter-server";
import {
  createNewSession,
  getChatSessions,
  getPinnedTopics,
  pinTopic,
  unpinTopic,
  updateSessionMessages,
  type ChatMessage,
  type ChatSession,
  type PinnedTopic,
} from "@/lib/chat-history";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export const Route = createFileRoute("/marine-ai")({
  head: () => ({
    meta: [
      { title: "Marine AI Research Assistant — OceanMind AI" },
      {
        name: "description",
        content:
          "Ask AI marine research assistant about currents, coral reefs, species migration and oceanography.",
      },
      { property: "og:title", content: "Marine AI Research Assistant — OceanMind AI" },
      {
        property: "og:description",
        content: "Research-grade ocean science chat assistant.",
      },
    ],
  }),
  component: GuardedMarineAI,
});

const seedMessages: ChatMessage[] = [
  {
    role: "user",
    content: "How do ocean currents affect tuna migration?",
    timestamp: Date.now() - 80000,
  },
  {
    role: "assistant",
    content:
      "Tuna track thermal fronts rather than fixed routes. Western boundary currents such as the Kuroshio and Gulf Stream concentrate prey along sharp temperature gradients, so schools follow the 22–28 °C envelope as it shifts seasonally.\n\n| Driver | Effect on migration |\n| --- | --- |\n| Thermal fronts | Aggregation of prey and schooling |\n| Eddy fields | Localised feeding hotspots |\n| ENSO phase | Longitudinal displacement of stocks |\n\nReferences: Nakamura et al. 2026; Duarte & Mehta 2025.",
    timestamp: Date.now() - 79000,
  },
];

function formatInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={idx} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function renderContent(text: string) {
  return text.split("\n").map((line, i) => {
    const trimmed = line.trim();

    if (trimmed.startsWith("### ")) {
      return (
        <h4 key={i} className="mt-3 mb-1 text-sm font-bold text-ocean-cyan">
          {formatInlineMarkdown(trimmed.replace(/^###\s+/, ""))}
        </h4>
      );
    }

    if (trimmed.startsWith("## ")) {
      return (
        <h3 key={i} className="mt-4 mb-2 text-base font-bold text-foreground">
          {formatInlineMarkdown(trimmed.replace(/^##\s+/, ""))}
        </h3>
      );
    }

    if (trimmed.startsWith("# ")) {
      return (
        <h2 key={i} className="mt-4 mb-2 text-lg font-extrabold text-foreground">
          {formatInlineMarkdown(trimmed.replace(/^#\s+/, ""))}
        </h2>
      );
    }

    if (trimmed.startsWith("|")) {
      const cells = trimmed.split("|").filter((c) => c.trim());
      const divider = cells.every((c) => /^[-\s:]+$/.test(c));
      if (divider) return null;
      return (
        <div
          key={i}
          className="grid grid-cols-2 gap-2 border-b border-border/60 py-1.5 text-xs sm:text-sm"
        >
          {cells.map((c, j) => (
            <span
              key={j}
              className={j === 0 ? "font-semibold text-foreground" : "text-muted-foreground"}
            >
              {formatInlineMarkdown(c.trim())}
            </span>
          ))}
        </div>
      );
    }

    if (/^[-–*]\s+/.test(trimmed)) {
      return (
        <li key={i} className="ml-4 list-disc text-sm leading-relaxed text-foreground/90">
          {formatInlineMarkdown(trimmed.replace(/^[-–*]\s+/, ""))}
        </li>
      );
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      return (
        <div key={i} className="ml-2 font-medium text-sm leading-relaxed text-foreground mt-1">
          {formatInlineMarkdown(trimmed)}
        </div>
      );
    }

    if (!trimmed) return <div key={i} className="h-2" />;

    return (
      <p key={i} className="text-sm leading-relaxed text-foreground/90">
        {formatInlineMarkdown(line)}
      </p>
    );
  });
}

function MarineAI() {
  const [currentSession, setCurrentSession] = useState<ChatSession>(() => {
    // Try loading last session from storage
    const sessions = getChatSessions();
    if (sessions.length > 0 && sessions[0]!.messages.length > 0) return sessions[0]!;
    const s = createNewSession();
    s.messages = seedMessages;
    return s;
  });

  const [sessions, setSessions] = useState<ChatSession[]>(() => getChatSessions());
  const [pinnedTopics, setPinnedTopics] = useState<PinnedTopic[]>(() => getPinnedTopics());
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  /** Last question sent, so [Try again] can re-send exactly it. */
  const [lastQuestion, setLastQuestion] = useState("");
  const [canRetry, setCanRetry] = useState(false);
  const [attachment, setAttachment] = useState<AttachmentResult | null>(null);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const dataInputRef = useRef<HTMLInputElement>(null);

  // Tells the user up front whether the server can answer at all, instead of
  // only finding out after typing a question.
  const aiHealth = useQuery({
    queryKey: ["ai-health"],
    queryFn: () => getAiHealthFn(),
    staleTime: 30_000,
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messages = currentSession.messages;

  // Speech recognition
  const {
    isListening,
    isSupported,
    startListening,
    stopListening,
    status: speechStatus,
  } = useSpeechRecognition({
    onResult: (transcript) => {
      setInput((prev) => (prev ? prev + " " + transcript : transcript));
    },
    onError: (err) => {
      toast.error(err);
    },
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  // Persist sessions list whenever current session changes
  useEffect(() => {
    setSessions(getChatSessions());
    setPinnedTopics(getPinnedTopics());
  }, [currentSession]);

  function startNewChat() {
    const s = createNewSession();
    s.messages = [];
    setCurrentSession(s);
  }

  function loadSession(session: ChatSession) {
    setCurrentSession(session);
    setInput("");
  }

  function handlePinCurrentTopic() {
    const title =
      currentSession.title !== "New Chat"
        ? currentSession.title
        : input.slice(0, 48) || "Pinned Research";
    const topic = pinTopic(title, currentSession.id);
    setPinnedTopics((prev) => [topic, ...prev]);
    toast.success("Topic pinned to sidebar");
  }

  function handleUnpin(topicId: string) {
    unpinTopic(topicId);
    setPinnedTopics(getPinnedTopics());
  }

  function copyLastResponse() {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (!last) return;
    navigator.clipboard.writeText(last.content).then(() => toast.success("Copied to clipboard"));
  }

  /**
   * Send a question. `retryOf` re-sends an earlier question without appending a
   * duplicate user bubble, so [Try again] never doubles up the transcript.
   */
  async function send(text: string, retryOf?: ChatMessage[]) {
    const q = text.trim();
    // The `typing` guard is what stops a double-click or a fast Enter-Enter
    // from firing two paid requests for the same question.
    if (!q || typing) return;

    const updatedMsgs = retryOf ?? [
      ...messages,
      { role: "user", content: q, timestamp: Date.now() } as ChatMessage,
    ];

    const updatedSession = updateSessionMessages(currentSession, updatedMsgs);
    setCurrentSession(updatedSession);
    if (!retryOf) setInput("");
    setLastQuestion(q);
    setTyping(true);

    try {
      const historyPayload: OpenRouterMessage[] = updatedMsgs
        .filter((m) => !m.error)
        .map((m) => ({ role: m.role, content: m.content }));

      // Attached document text rides along once, with the question it belongs to.
      const outcome = await sendOpenRouterChatMessage(
        historyPayload,
        getOpenRouterModel(),
        attachment?.context,
      );

      if (!outcome.ok) {
        // The backend already produced a safe, user-facing sentence; show it
        // verbatim rather than a vaguer generic one.
        console.error("Marine AI request failed:", outcome.status, outcome.message);

        const errorMsg: ChatMessage = {
          role: "assistant",
          content: outcome.message,
          error: true,
          timestamp: Date.now(),
        };
        setCurrentSession(updateSessionMessages(updatedSession, [...updatedMsgs, errorMsg]));
        setCanRetry(outcome.retryable);
        // A failed turn may mean the key was just added or removed.
        void aiHealth.refetch();
        return;
      }

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: outcome.result.content,
        timestamp: Date.now(),
      };
      const finalMsgs = [...updatedMsgs, assistantMsg];
      const finalSession = updateSessionMessages(updatedSession, finalMsgs);
      setCurrentSession(finalSession);
      setSessions(getChatSessions());
      setCanRetry(false);
    } catch (err: unknown) {
      // Only genuinely unexpected faults land here now.
      console.error("Marine AI request failed unexpectedly:", err);
      const errorMsg: ChatMessage = {
        role: "assistant",
        content: "Marine AI is temporarily unavailable. Please try again.",
        error: true,
        timestamp: Date.now(),
      };
      setCurrentSession(updateSessionMessages(updatedSession, [...updatedMsgs, errorMsg]));
      setCanRetry(true);
    } finally {
      setTyping(false);
    }
  }

  /** Re-send the last question, dropping the failed reply from the transcript. */
  function retryLast() {
    if (typing || !lastQuestion) return;
    const withoutError = messages.filter((m) => !m.error);
    setCanRetry(false);
    void send(lastQuestion, withoutError);
  }

  async function handleAttachment(file: File | undefined | null, kindLabel: string) {
    if (!file) return;
    setAttachmentBusy(true);
    setAttachment(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const outcome = await uploadAttachmentFn({ data: formData });
      if (!outcome.ok) {
        toast.error("Upload failed", { description: outcome.message });
        return;
      }
      setAttachment(outcome.result);
      toast.success(`${kindLabel} attached`, { description: outcome.result.summary });
    } catch (err: unknown) {
      console.error("Attachment upload failed:", err);
      toast.error("Upload failed", { description: "That file could not be processed." });
    } finally {
      setAttachmentBusy(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 pt-12 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* Sidebar */}
      <aside className="glass hidden h-fit rounded-[2rem] p-5 lg:block">
        <Button variant="ocean" className="w-full" onClick={startNewChat}>
          <Plus className="size-4" /> New chat
        </Button>

        {/* Recent Sessions */}
        <div className="mt-6">
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground">Recent Chats</h3>
          <ul className="mt-3 space-y-1">
            {sessions.length === 0 && (
              <li className="px-2 py-1.5 text-xs text-muted-foreground">No saved chats yet</li>
            )}
            {sessions.slice(0, 8).map((s) => (
              <li
                key={s.id}
                onClick={() => loadSession(s)}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors ${
                  s.id === currentSession.id
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <span className="truncate">{s.title}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Pinned Topics */}
        <div className="mt-6">
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground">Pinned Research</h3>
          <ul className="mt-3 space-y-1">
            {pinnedTopics.length === 0 && (
              <li className="px-2 py-1.5 text-xs text-muted-foreground">No pinned topics</li>
            )}
            {pinnedTopics.map((t) => (
              <li
                key={t.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground group"
              >
                <Pin className="size-3.5 shrink-0" />
                <span className="flex-1 truncate">{t.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnpin(t.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Unpin"
                >
                  <PinOff className="size-3 text-muted-foreground hover:text-destructive" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Saved Notes */}
        <div className="mt-6">
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground">Saved Notes</h3>
          <ul className="mt-3 space-y-1">
            {["Survey plan Q3", "Sampling checklist"].map((note) => (
              <li
                key={note}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <StickyNote className="size-3.5 shrink-0" />
                <span className="truncate">{note}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Main Chat Container */}
      <section className="glass flex min-h-[75vh] flex-col rounded-[2rem] p-5">
        {/* Header */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between border-b border-border/50 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[image:var(--gradient-ocean)] text-primary-foreground shadow-[var(--shadow-glow)]">
              <Waves className="size-5" />
            </span>
            <div>
              <h1 className="truncate text-lg font-bold">OceanMind AI - Marine Assistant</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {currentSession.title !== "New Chat"
                  ? currentSession.title
                  : "Powered by OceanMind AI"}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Copy response"
              title="Copy last response"
              onClick={copyLastResponse}
            >
              <Copy className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Pin topic"
              title="Pin this topic"
              onClick={handlePinCurrentTopic}
            >
              <Pin className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Clear chat"
              title="Clear current chat"
              onClick={startNewChat}
            >
              <Trash2 className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Share" title="Share research">
              <Share2 className="size-4" />
            </Button>
          </div>
        </div>

        {/* Message History */}
        <ScrollArea className="mt-5 flex-1 pr-3">
          <div className="space-y-6">
            {messages.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Bot className="size-12 mx-auto text-ocean-cyan opacity-80 mb-3" />
                <p className="font-semibold text-foreground">
                  Welcome to OceanMind AI Marine Assistant
                </p>
                <p className="text-xs mt-1">
                  Ask any research question about oceanography, sea temperatures, marine biology, or
                  climate change.
                </p>
              </div>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl bg-[image:var(--gradient-ocean)] px-4 py-3 text-sm text-primary-foreground shadow-[var(--shadow-glow)]">
                    {m.content}
                  </p>
                </div>
              ) : (
                <div
                  key={i}
                  className={`max-w-[92%] rounded-2xl p-4 border ${
                    m.error
                      ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : "border-border/60 bg-secondary/30 text-foreground"
                  }`}
                >
                  <div className="space-y-1">{renderContent(m.content)}</div>
                </div>
              ),
            )}
            {typing && (
              <div className="flex items-center gap-2 text-muted-foreground p-3 rounded-2xl border border-border/40 bg-secondary/20 w-fit">
                <Loader2 className="size-4 animate-spin text-ocean-cyan" />
                <span className="text-xs">OceanMind AI analyzing ocean data…</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {attachmentBusy && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-border/60 bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin text-ocean-cyan" />
            Extracting text from your file…
          </div>
        )}

        {attachment && !attachmentBusy && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-ocean-cyan/40 bg-ocean-cyan/10 px-3 py-2 text-xs">
            <FileUp className="size-3.5 shrink-0 text-ocean-cyan" />
            <span className="font-medium">{attachment.filename}</span>
            <span className="text-muted-foreground">{attachment.summary}</span>
            <button
              type="button"
              onClick={() => setAttachment(null)}
              className="ml-auto text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Remove
            </button>
          </div>
        )}

        {canRetry && !typing && (
          <div className="mt-3">
            <Button variant="glass" size="sm" onClick={retryLast}>
              <RotateCcw className="size-3.5" /> Try again
            </Button>
          </div>
        )}

        {aiHealth.data && !aiHealth.data.configured && (
          <div
            role="status"
            className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">Marine AI is not configured.</p>
              <p className="mt-0.5 text-amber-200/80">
                The server has no AI provider key. Add{" "}
                <code className="rounded bg-black/30 px-1">OPENROUTER_API_KEY</code> to{" "}
                <code className="rounded bg-black/30 px-1">ml-py/.env</code> and restart the
                backend, or open AI Settings to use your own key in this browser.
              </p>
            </div>
          </div>
        )}

        {/* Suggested Prompts */}
        <div className="mt-4 flex flex-wrap gap-2">
          {suggestedPrompts.map((p) => (
            <button
              key={p}
              onClick={() => send(p)}
              disabled={typing}
              className="rounded-full border border-border/80 bg-secondary/30 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-ocean-cyan/60 hover:text-foreground disabled:opacity-50"
            >
              {p}
            </button>
          ))}
        </div>

        {/* Speech status banner */}
        {isListening && (
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-ocean-cyan/40 bg-ocean-cyan/10 px-3 py-2">
            <span className="size-2 animate-pulse rounded-full bg-ocean-cyan" />
            <span className="text-xs text-ocean-cyan">Listening… speak your question</span>
          </div>
        )}

        {/* Text Input Area */}
        <div className="mt-2 rounded-2xl border border-border bg-secondary/40 p-3">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Ask OceanMind AI about species, currents, climate or upload ocean data…"
            className="min-h-20 resize-none border-0 bg-transparent focus-visible:ring-0 text-sm"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <div className="flex gap-1">
              <Button
                variant={isListening ? "ocean" : "ghost"}
                size="icon"
                aria-label={isListening ? "Stop voice input" : "Start voice input"}
                title={
                  !isSupported
                    ? "Voice input not supported in this browser"
                    : isListening
                      ? "Stop listening"
                      : "Start voice input"
                }
                disabled={!isSupported}
                onClick={() => (isListening ? stopListening() : startListening())}
                className={isListening ? "animate-pulse-glow" : ""}
              >
                {isListening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </Button>
              {/* These two buttons had no handler at all before — they were
                  decoration. They now upload to /api/ai/attachment, which
                  extracts text and returns it as context for the next question. */}
              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onClick={(event) => {
                  (event.target as HTMLInputElement).value = "";
                }}
                onChange={(event) => handleAttachment(event.target.files?.[0], "PDF")}
              />
              <input
                ref={dataInputRef}
                type="file"
                accept=".csv,.tsv,.json,.txt,text/csv,application/json,text/plain"
                className="hidden"
                onClick={(event) => {
                  (event.target as HTMLInputElement).value = "";
                }}
                onChange={(event) => handleAttachment(event.target.files?.[0], "Ocean data")}
              />
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                disabled={attachmentBusy || typing}
                onClick={() => pdfInputRef.current?.click()}
              >
                <FileUp className="mr-1 size-3.5" /> PDF
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                disabled={attachmentBusy || typing}
                onClick={() => dataInputRef.current?.click()}
              >
                <FileUp className="mr-1 size-3.5" /> Ocean data
              </Button>
            </div>
            <Button
              variant="ocean"
              size="icon"
              disabled={typing || !input.trim()}
              aria-label="Send"
              onClick={() => send(input)}
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Route entry point. The page itself is only mounted for a verified session. */
function GuardedMarineAI() {
  return (
    <ProtectedRoute>
      <MarineAI />
    </ProtectedRoute>
  );
}
