import { createServerFn } from "@tanstack/react-start";

// ─── Response types ────────────────────────────────────────────────────────────

export interface SpeciesTaxonomy {
  kingdom?: string;
  phylum?: string;
  class?: string;
  order?: string;
  family?: string;
  genus?: string;
}

export interface SpeciesDetails {
  description?: string;
  habitat?: string;
  distribution?: string;
  diet?: string;
  behavior?: string;
  size?: string;
  lifespan?: string;
  reproduction?: string;
}

export interface SpeciesConservation {
  iucn_status?: string | undefined;
  iucn_code?: string | undefined;
}

export interface SpeciesSource {
  name: string;
  url: string;
}

export interface IdentificationResult {
  success: boolean;
  identified?: boolean | undefined;
  status?: "identified" | "unknown" | "not_fish" | undefined;
  engine?: string | undefined;

  prediction?:
    | {
        scientific_name: string;
        common_name: string;
        confidence: number;
      }
    | null
    | undefined;

  taxonomy?: SpeciesTaxonomy | undefined;
  details?: SpeciesDetails | undefined;
  conservation?: SpeciesConservation | undefined;
  sources?: SpeciesSource[] | undefined;

  /** Other recorded English common names, most-used first. */
  common_name_alternatives?: string[] | undefined;

  species_data_available?: boolean | undefined;
  species_data_message?: string | undefined;

  alternatives?: Array<{ scientific_name: string; confidence: number }> | undefined;

  // Unknown / not-fish state
  message?: string | undefined;
  rejection_reasons?: string[] | undefined;
  top_candidates?: Array<{ scientific_name: string; confidence: number }> | undefined;

  // Error state
  error?: string | undefined;

  inference_time_seconds?: number | undefined;
}

// ─── Server function ───────────────────────────────────────────────────────────

export const identifyFishServerFn = createServerFn({ method: "POST" })
  .validator((formData: FormData) => formData)
  .handler(async ({ data: formData }): Promise<IdentificationResult> => {
    const mlServiceUrl = process.env["ML_SERVICE_URL"] || "http://127.0.0.1:8000";
    const imageFile = formData.get("image") as File | null;

    if (!imageFile) {
      return { success: false, error: "No image file provided" };
    }

    // Forward to /predict-full which handles ML + GBIF/WoRMS lookup
    let mlData: IdentificationResult | null = null;
    try {
      const forwardForm = new FormData();
      forwardForm.append("image", imageFile);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s for API calls

      // Pass the session token through so the backend can attribute this
      // identification to the signed-in user (and to nobody if there isn't one).
      // Loaded on demand to keep server-only cookie APIs out of the client bundle.
      const { readToken } = await import("@/lib/auth-cookies.server");
      const token = readToken();
      const headers = new Headers();
      if (token) headers.set("authorization", `Bearer ${token}`);

      const response = await fetch(`${mlServiceUrl}/predict-full`, {
        method: "POST",
        body: forwardForm,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        mlData = await response.json();
      } else {
        const errBody = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errBody?.error || `ML service returned ${response.status}`,
        };
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        return { success: false, error: "ML service request timed out." };
      }
      return {
        success: false,
        error:
          "ML service is offline. Start it with: cd ml-py && uvicorn app.main:app --reload --port 8000",
      };
    }

    if (!mlData || !mlData.success) {
      return { success: false, error: mlData?.error || "ML service error" };
    }

    // Identified — return the full profile.
    if (mlData.identified && mlData.prediction) {
      return {
        success: true,
        identified: true,
        status: "identified",
        engine: "PyTorch EfficientNet-B0 + GBIF/WoRMS",
        prediction: mlData.prediction,
        taxonomy: mlData.taxonomy,
        details: mlData.details,
        conservation: mlData.conservation,
        sources: mlData.sources,
        common_name_alternatives: mlData.common_name_alternatives,
        species_data_available: mlData.species_data_available,
        species_data_message: mlData.species_data_message,
        alternatives: mlData.alternatives,
        inference_time_seconds: mlData.inference_time_seconds,
      };
    }

    // Not a fish at all — no candidates to show, so don't invent any.
    if (mlData.status === "not_fish") {
      return {
        success: true,
        identified: false,
        status: "not_fish",
        engine: "ImageNet fish/non-fish gate",
        prediction: null,
        message: mlData.message || "This image does not appear to contain a fish.",
        inference_time_seconds: mlData.inference_time_seconds,
      };
    }

    // A fish, but not confidently nameable.
    return {
      success: true,
      identified: false,
      status: "unknown",
      engine: "PyTorch EfficientNet-B0",
      prediction: null,
      message: mlData.message || "Unable to confidently identify this fish.",
      rejection_reasons: mlData.rejection_reasons || [],
      top_candidates: mlData.top_candidates || [],
      inference_time_seconds: mlData.inference_time_seconds,
    };
  });

/**
 * Fetch a real Grad-CAM attention map for an image, as a data URL.
 *
 * The heatmap is computed from the model's gradients on the server; the old
 * client-side overlay was drawn from the confidence number alone and showed
 * nothing about what the network actually looked at.
 */
export const gradcamServerFn = createServerFn({ method: "POST" })
  .validator((formData: FormData) => formData)
  .handler(
    async ({ data: formData }): Promise<{ success: boolean; dataUrl?: string; error?: string }> => {
      const mlServiceUrl = process.env["ML_SERVICE_URL"] || "http://127.0.0.1:8000";
      const imageFile = formData.get("image") as File | null;
      if (!imageFile) return { success: false, error: "No image file provided" };

      try {
        const forwardForm = new FormData();
        forwardForm.append("image", imageFile);

        const response = await fetch(`${mlServiceUrl}/gradcam`, {
          method: "POST",
          body: forwardForm,
          signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
          return { success: false, error: "Could not generate the attention map." };
        }

        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        return { success: true, dataUrl: `data:image/png;base64,${base64}` };
      } catch {
        return { success: false, error: "Attention map service is unavailable." };
      }
    },
  );
