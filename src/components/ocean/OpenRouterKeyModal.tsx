import {
  Bot,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getOpenRouterApiKey,
  getOpenRouterModel,
  OPENROUTER_MODELS,
  sendOpenRouterChatMessage,
  setOpenRouterApiKey,
  setOpenRouterModel,
} from "@/lib/openrouter-api";
import { useQuery } from "@tanstack/react-query";
import { getAiHealthFn } from "@/lib/openrouter-server";

interface OpenRouterKeyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}

export function OpenRouterKeyModal({ open, onOpenChange, onUpdated }: OpenRouterKeyModalProps) {
  // Read-only status from the backend. It never returns the key itself.
  const serverHealth = useQuery({
    queryKey: ["ai-health"],
    queryFn: () => getAiHealthFn(),
    enabled: open,
    staleTime: 15_000,
  });
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [selectedModel, setSelectedModel] = useState("deepseek/deepseek-chat");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      setKeyInput(getOpenRouterApiKey());
      setSelectedModel(getOpenRouterModel());
      setTestResult(null);
      setSavedSuccess(false);
    }
  }, [open]);

  const handleTest = async () => {
    if (!keyInput.trim()) {
      setTestResult({
        success: false,
        message: "Please enter an OpenRouter API Key before testing.",
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    try {
      // Persist the key first so the request picks it up, then do a real
      // round trip through the backend — this tests the whole path, not just
      // that a string was typed.
      setOpenRouterApiKey(keyInput);
      const outcome = await sendOpenRouterChatMessage(
        [{ role: "user", content: "Ping test: respond with 'DeepSeek Marine AI Operational'" }],
        selectedModel,
      );
      if (!outcome.ok) {
        setTestResult({ success: false, message: outcome.message });
      } else {
        setTestResult({
          success: true,
          message: `Connected successfully. Model used: ${outcome.result.modelUsed}`,
        });
      }
    } catch (err: unknown) {
      console.error("AI connection test failed:", err);
      setTestResult({
        success: false,
        message: "Connection test failed. Please try again.",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    setOpenRouterApiKey(keyInput);
    setOpenRouterModel(selectedModel);
    setSavedSuccess(true);
    if (onUpdated) onUpdated();
    setTimeout(() => {
      setSavedSuccess(false);
      onOpenChange(false);
    }, 1000);
  };

  const handleRemove = () => {
    setOpenRouterApiKey("");
    setKeyInput("");
    setTestResult(null);
    if (onUpdated) onUpdated();
  };

  const activeKey = getOpenRouterApiKey();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass border-border/60 max-w-lg rounded-3xl bg-background/95 p-6 backdrop-blur-xl sm:p-7">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-[image:var(--gradient-ocean)] text-primary-foreground shadow-[var(--shadow-glow)]">
              <Bot className="size-5" />
            </span>
            <div>
              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                OpenRouter DeepSeek AI Settings
                {activeKey ? (
                  <Badge className="bg-sea-green/20 text-sea-green border-sea-green/30">
                    Active Key
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Demo Knowledge Engine
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs text-muted-foreground">
                Marine AI runs through the OceanMind backend, which holds the provider key. A key
                entered here stays in this browser and is used only if the server has none of its
                own.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-4 space-y-5">
          {/* Server configuration status — tells the user whether they need a key at all. */}
          <div
            className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs ${
              serverHealth.data?.configured
                ? "border-sea-green/40 bg-sea-green/10 text-sea-green"
                : "border-amber-500/40 bg-amber-500/10 text-amber-200"
            }`}
          >
            {serverHealth.data?.configured ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 size-4 shrink-0" />
            )}
            <div>
              {serverHealth.data?.configured ? (
                <>
                  <p className="font-medium">Server AI provider is configured.</p>
                  <p className="mt-0.5 opacity-80">
                    Provider {serverHealth.data.provider} · model{" "}
                    <code>{serverHealth.data.model}</code>. No key needed here.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">Server AI provider is not configured.</p>
                  <p className="mt-0.5 opacity-80">
                    Add <code>OPENROUTER_API_KEY</code> to <code>ml-py/.env</code> and restart the
                    backend, or paste your own key below to use Marine AI from this browser.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Model Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              DeepSeek Model Selection
            </label>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="bg-secondary/40 border-border/80">
                <SelectValue placeholder="Select DeepSeek Model" />
              </SelectTrigger>
              <SelectContent>
                {OPENROUTER_MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <div className="flex items-center justify-between w-full">
                      <span className="font-medium">{m.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono ml-2">
                        ({m.id})
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* API Key Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Your own OpenRouter API Key (optional)</span>
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noreferrer"
                className="text-ocean-cyan hover:underline flex items-center gap-1 normal-case font-normal"
              >
                Get OpenRouter Key <ExternalLink className="size-3" />
              </a>
            </div>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                placeholder="sk-or-v1-..."
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                className="pr-24 font-mono text-sm bg-secondary/40 border-border/80 focus:border-ocean-cyan"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowKey((v) => !v)}
                >
                  {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </Button>
                {keyInput && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive hover:bg-destructive/10"
                    onClick={handleRemove}
                  >
                    <XCircle className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Test Connection Button & Result */}
          <div className="rounded-2xl border border-border bg-secondary/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-ocean-cyan" /> OpenRouter DeepSeek Endpoint
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isTesting || !keyInput.trim()}
                onClick={handleTest}
                className="h-8 text-xs border-border/80"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="mr-1.5 size-3 animate-spin" /> Testing...
                  </>
                ) : (
                  "Test Connection"
                )}
              </Button>
            </div>

            {testResult && (
              <div
                className={`rounded-xl border p-3 text-xs flex items-start gap-2.5 ${
                  testResult.success
                    ? "border-sea-green/40 bg-sea-green/10 text-sea-green"
                    : "border-destructive/40 bg-destructive/10 text-destructive"
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="size-4 shrink-0 mt-0.5" />
                )}
                <p className="font-medium">{testResult.message}</p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-6 flex justify-between items-center gap-2">
          <p className="text-[11px] text-muted-foreground">
            {savedSuccess
              ? "Saved successfully!"
              : "Server key: set OPENROUTER_API_KEY in ml-py/.env (never VITE_)"}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              className="bg-[image:var(--gradient-ocean)] text-primary-foreground shadow-[var(--shadow-glow)]"
            >
              <KeyRound className="mr-1.5 size-4" /> Save OpenRouter Key
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
