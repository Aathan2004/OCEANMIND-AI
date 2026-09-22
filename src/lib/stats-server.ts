import { createServerFn } from "@tanstack/react-start";

/**
 * Real platform figures, read from the backend.
 *
 * The landing page used to advertise invented numbers — "4,820 species",
 * "97.4% AI accuracy". Anything that cannot be substantiated is returned as
 * null here and simply not rendered.
 */
export interface PlatformStats {
  supported_species: number | null;
  top1_accuracy?: number | null;
  top5_accuracy?: number | null;
  macro_f1?: number | null;
  evaluated_on_images?: number | null;
  identifications_recorded: number | null;
}

export const getPlatformStatsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<PlatformStats | null> => {
    const mlServiceUrl = process.env["ML_SERVICE_URL"] || "http://127.0.0.1:8000";
    try {
      const response = await fetch(`${mlServiceUrl}/stats`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return null;
      return (await response.json()) as PlatformStats;
    } catch {
      // Backend down: render nothing rather than a plausible-looking number.
      return null;
    }
  },
);
