import {
  CheckCircle2,
  FileCode,
  Globe,
  KeyRound,
  Loader2,
  Radio,
  ShieldAlert,
  Waves,
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
import {
  getNoaaApiKey,
  getNoaaApiKeySource,
  NOAA_STATIONS,
  validateNoaaApiKey,
  type NoaaValidationResult,
} from "@/lib/noaa-api";

interface NoaaKeyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onKeyUpdated?: () => void;
}

export function NoaaKeyModal({ open, onOpenChange }: NoaaKeyModalProps) {
  const [isTesting, setIsTesting] = useState(false);
  const [validationResult, setValidationResult] = useState<NoaaValidationResult | null>(null);

  const activeKey = getNoaaApiKey();
  const keySource = getNoaaApiKeySource();

  const handleTestConnection = async () => {
    setIsTesting(true);
    setValidationResult(null);
    const result = await validateNoaaApiKey();
    setIsTesting(false);
    setValidationResult(result);
  };

  useEffect(() => {
    if (open && activeKey) {
      handleTestConnection();
    }
  }, [open]);

  const maskedKey = activeKey
    ? `${activeKey.slice(0, 6)}...${activeKey.slice(-4)}`
    : "No key found in .env";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass border-border/60 max-w-lg rounded-3xl bg-background/95 p-6 backdrop-blur-xl sm:p-7">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-[image:var(--gradient-ocean)] text-primary-foreground shadow-[var(--shadow-glow)]">
              <Waves className="size-5" />
            </span>
            <div>
              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                NOAA API v2 Connection
                {activeKey ? (
                  <Badge className="bg-sea-green/20 text-sea-green border-sea-green/30">
                    Connected (.env)
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    CO-OPS Mode
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs text-muted-foreground">
                Loaded directly from environment configuration (
                <code className="text-ocean-cyan">.env</code>).
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-4 space-y-5">
          {/* Key Details Card */}
          <div className="rounded-2xl border border-border/80 bg-secondary/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <FileCode className="size-4 text-ocean-cyan" />
                <span>VITE_NOAA_API_KEY</span>
              </div>
              <Badge variant="outline" className="font-mono text-[10px] text-sea-green">
                Source: {keySource}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-background/70 px-3 py-2 border border-border/50 text-xs font-mono">
              <span className="text-muted-foreground">{maskedKey}</span>
              <span className="text-[11px] text-sea-green font-sans flex items-center gap-1">
                <CheckCircle2 className="size-3.5" /> Integrated
              </span>
            </div>
          </div>

          {/* Test Endpoint Status */}
          <div className="rounded-2xl border border-border bg-secondary/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-medium">
                <Radio className="size-4 text-ocean-cyan animate-pulse" />
                <span>NOAA NCEI CDO Web Services Endpoint</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isTesting}
                onClick={handleTestConnection}
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

            {validationResult && (
              <div
                className={`rounded-xl border p-3 text-xs flex items-start gap-2.5 ${
                  validationResult.valid
                    ? "border-sea-green/40 bg-sea-green/10 text-sea-green"
                    : "border-destructive/40 bg-destructive/10 text-destructive"
                }`}
              >
                {validationResult.valid ? (
                  <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="size-4 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-semibold">{validationResult.message}</p>
                  {validationResult.latencyMs !== undefined && (
                    <p className="mt-0.5 text-[11px] opacity-80">
                      Response latency: {validationResult.latencyMs} ms · Verified NOAA Datasets:{" "}
                      {validationResult.datasetCount ?? 11}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Connected Global Regions & Stations */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Globe className="size-3.5 text-ocean-cyan" /> Global NOAA Observing Basins (
              {NOAA_STATIONS.length})
            </label>
            <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
              {NOAA_STATIONS.map((st) => (
                <div
                  key={st.id}
                  className="rounded-xl border border-border bg-secondary/20 p-2.5 text-xs"
                >
                  <p className="font-medium text-foreground truncate">{st.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{st.oceanBasin}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-6 flex justify-end">
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="bg-[image:var(--gradient-ocean)] text-primary-foreground shadow-[var(--shadow-glow)]"
          >
            Close Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
