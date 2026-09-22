import { AlertTriangle, Loader2 } from "lucide-react";

interface GradCamOverlayProps {
  /** Server-rendered Grad-CAM PNG as a data URL, or null if not loaded yet. */
  heatmapUrl: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * Displays the Grad-CAM attention map produced by the backend.
 *
 * This component deliberately does no image synthesis of its own: the heatmap
 * must reflect the model's actual gradients, so it can only ever show what the
 * server computed.
 */
export function GradCamOverlay({ heatmapUrl, loading, error }: GradCamOverlayProps) {
  if (loading) {
    return (
      <div
        className="grid aspect-[4/3] w-full place-items-center bg-secondary/40"
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="size-6 animate-spin text-ocean-cyan" />
          <p className="text-sm">Computing attention map…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid aspect-[4/3] w-full place-items-center bg-secondary/40 px-6 text-center">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <AlertTriangle className="size-6 text-amber-400" />
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!heatmapUrl) return null;

  return (
    <img
      src={heatmapUrl}
      alt="Grad-CAM attention map showing the image regions that drove the model's prediction"
      className="w-full"
    />
  );
}
