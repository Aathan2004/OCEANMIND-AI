import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  AlertTriangle,
  Brain,
  Camera,
  CheckCircle,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Image as ImageIcon,
  Leaf,
  ShieldAlert,
  Sparkles,
  Upload,
  ZoomIn,
} from "lucide-react";
import { useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  gradcamServerFn,
  identifyFishServerFn,
  type IdentificationResult,
} from "@/lib/identify-server";
import { GradCamOverlay } from "@/components/ocean/GradCamOverlay";
import { downloadFishReport } from "@/lib/report-generator";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { compressImage } from "@/lib/image-compression";

export const Route = createFileRoute("/fish-identification")({
  head: () => ({
    meta: [
      { title: "Fish Identification — OceanMind AI" },
      {
        name: "description",
        content:
          "Upload or capture a fish photo and get species identification, morphology analysis, habitat maps and an export-ready report.",
      },
    ],
  }),
  component: GuardedFishIdentification,
});

/** "LEAST_CONCERN" -> "Least Concern". */
function formatIucn(status: string): string {
  return status
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/** Colour cue matching Red List severity. */
function iucnTone(status?: string): string {
  const value = (status ?? "").toUpperCase();
  if (value.includes("CRITICALLY")) return "text-red-500";
  if (value.includes("ENDANGERED")) return "text-red-400";
  if (value.includes("VULNERABLE")) return "text-orange-400";
  if (value.includes("NEAR_THREATENED")) return "text-amber-400";
  if (value.includes("LEAST_CONCERN")) return "text-sea-green";
  return "text-muted-foreground";
}

const stages = [
  "Uploading image…",
  "Analyzing fish features with EfficientNet-B0…",
  "Querying GBIF & WoRMS species databases…",
];

function FishIdentification() {
  const [image, setImage] = useState<string | null>(null);
  const [stage, setStage] = useState(-1);
  const [zoom, setZoom] = useState(1);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapUrl, setHeatmapUrl] = useState<string | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [heatmapError, setHeatmapError] = useState<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const [result, setResult] = useState<IdentificationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageDataUrlRef = useRef<string | null>(null);
  const done = stage >= stages.length;

  /**
   * Monotonic id for the in-flight request. A slow upload that resolves after a
   * newer one must not write its result — that race is what used to mix one
   * fish's name with another fish's biology.
   */
  const requestIdRef = useRef(0);

  async function handleFile(file?: File | null) {
    if (!file) return;

    const requestId = ++requestIdRef.current;
    fileRef.current = file;

    // Wipe every trace of the previous identification before starting.
    const objectUrl = URL.createObjectURL(file);
    setImage((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return objectUrl;
    });
    setStage(0);
    setZoom(1);
    setShowHeatmap(false);
    setHeatmapUrl(null);
    setHeatmapError(null);
    setResult(null);
    setErrorMsg(null);
    imageDataUrlRef.current = null;

    // The data URL is only used for the printable report; a late read from an
    // abandoned upload must not overwrite the current one.
    const reader = new FileReader();
    reader.onload = (event) => {
      if (requestIdRef.current !== requestId) return;
      imageDataUrlRef.current = (event.target?.result as string | null) ?? null;
    };
    reader.readAsDataURL(file);

    // Shrink large camera photos before sending; the model only sees 224px.
    const uploadFile = await compressImage(file);
    if (requestIdRef.current !== requestId) return;

    const formData = new FormData();
    formData.append("image", uploadFile);

    try {
      setStage(1);
      const data: IdentificationResult = await identifyFishServerFn({ data: formData });

      // A newer upload started while this one was in flight — discard this one.
      if (requestIdRef.current !== requestId) return;

      setStage(2);
      if (!data.success) {
        setErrorMsg(data.error || "Failed to identify fish image.");
      }
      setResult(data);
      setStage(3);
    } catch (error: unknown) {
      if (requestIdRef.current !== requestId) return;
      console.error("Identification error:", error);
      setErrorMsg(`Connection error: ${error instanceof Error ? error.message : String(error)}`);
      setStage(3);
    }
  }

  /** Lazily fetch the real attention map the first time the user asks for it. */
  async function toggleHeatmap() {
    if (showHeatmap) {
      setShowHeatmap(false);
      return;
    }
    setShowHeatmap(true);
    if (heatmapUrl || heatmapLoading) return;

    const file = fileRef.current;
    if (!file) return;

    const requestId = requestIdRef.current;
    setHeatmapLoading(true);
    setHeatmapError(null);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const response = await gradcamServerFn({ data: formData });
      if (requestIdRef.current !== requestId) return;
      if (response.success && response.dataUrl) {
        setHeatmapUrl(response.dataUrl);
      } else {
        setHeatmapError(response.error ?? "Could not generate the attention map.");
      }
    } catch {
      if (requestIdRef.current !== requestId) return;
      setHeatmapError("Could not generate the attention map.");
    } finally {
      if (requestIdRef.current === requestId) setHeatmapLoading(false);
    }
  }

  const isIdentified = result?.identified === true;
  const isNotFish = result?.status === "not_fish";
  const isUnknown = result?.identified === false && !isNotFish;
  const pred = result?.prediction;
  const taxonomy = result?.taxonomy;
  const details = result?.details;
  const conservation = result?.conservation;
  const sources = result?.sources || [];

  const displayConfidence = pred?.confidence;

  // Build CSV export from real data only
  const handleDownloadCSV = () => {
    if (!result || !pred) return;
    const rows: [string, string][] = [
      ["Common Name", pred.common_name],
      ["Scientific Name", pred.scientific_name],
      ["Confidence", `${pred.confidence}%`],
    ];
    if (taxonomy) {
      Object.entries(taxonomy).forEach(
        ([k, v]) => v && rows.push([k.charAt(0).toUpperCase() + k.slice(1), v]),
      );
    }
    if (details) {
      Object.entries(details).forEach(
        ([k, v]) => v && rows.push([k.charAt(0).toUpperCase() + k.slice(1), v]),
      );
    }
    if (conservation?.iucn_status) rows.push(["IUCN Status", conservation.iucn_status]);

    const csv = rows.map(([k, v]) => `${k},"${String(v).replace(/"/g, '""')}"`).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${pred.common_name.replace(/\s+/g, "_")}_Report.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-12">
      {/* Mounted once for the whole page so "Upload another" works from the
          results view, not only from the empty drop zone. Resetting value on
          click lets the same file be re-selected. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onClick={(event) => {
          (event.target as HTMLInputElement).value = "";
        }}
        onChange={(event) => handleFile(event.target.files?.[0])}
      />

      <h1 className="text-3xl font-bold sm:text-4xl">Fish Identification</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Drag and drop a photo, upload a file or use your camera.
      </p>

      {!image && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFile(e.dataTransfer.files?.[0]);
          }}
          className="glass mt-8 grid place-items-center rounded-[2rem] border-dashed px-6 py-20 text-center"
        >
          <span className="grid size-16 place-items-center rounded-2xl bg-[image:var(--gradient-ocean)] text-primary-foreground">
            <Upload className="size-7" />
          </span>
          <p className="mt-6 text-lg font-semibold">Drop your fish image here</p>
          <p className="mt-2 text-sm text-muted-foreground">Max 10 MB · JPG, JPEG, PNG, WEBP</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button variant="ocean" onClick={() => inputRef.current?.click()}>
              <Upload className="size-4" /> Upload Image
            </Button>
            <Button variant="glass" onClick={() => inputRef.current?.click()}>
              <Camera className="size-4" /> Camera Capture
            </Button>
          </div>
        </motion.div>
      )}

      {image && !done && (
        <div className="glass mt-8 rounded-[2rem] p-8">
          <div className="flex items-center gap-3">
            <Sparkles className="size-5 animate-pulse-glow text-ocean-cyan" />
            <p className="font-display text-lg">{stages[Math.min(stage, stages.length - 1)]}</p>
          </div>
          <Progress value={((stage + 1) / stages.length) * 100} className="mt-6" />
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        </div>
      )}

      {image && done && (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* ── Left column: image + alternatives ── */}
          <div className="space-y-6">
            <div className="glass overflow-hidden rounded-[2rem] p-3">
              <div className="overflow-hidden rounded-[1.5rem]">
                {showHeatmap && (
                  <GradCamOverlay
                    heatmapUrl={heatmapUrl}
                    loading={heatmapLoading}
                    error={heatmapError}
                  />
                )}
                {!showHeatmap && (
                  <img
                    src={image}
                    alt="Uploaded fish"
                    loading="lazy"
                    className="w-full transition-transform duration-500"
                    style={{ transform: `scale(${zoom})` }}
                  />
                )}
              </div>
              <div className="flex flex-wrap gap-2 p-3">
                <Button
                  variant="glass"
                  size="sm"
                  onClick={() => setZoom((z) => (z >= 1.8 ? 1 : z + 0.4))}
                >
                  <ZoomIn className="size-4" /> Zoom {zoom.toFixed(1)}x
                </Button>
                <Button
                  variant={showHeatmap ? "ocean" : "glass"}
                  size="sm"
                  onClick={toggleHeatmap}
                  disabled={!isIdentified && !isUnknown}
                >
                  <Brain className="size-4" /> {showHeatmap ? "Hide" : "Grad-CAM"}
                </Button>
                <Button variant="ocean" size="sm" onClick={() => inputRef.current?.click()}>
                  <Upload className="size-4" /> Upload another
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    // Bump the request id so any in-flight response is ignored.
                    requestIdRef.current += 1;
                    setImage((previous) => {
                      if (previous) URL.revokeObjectURL(previous);
                      return null;
                    });
                    fileRef.current = null;
                    setResult(null);
                    setErrorMsg(null);
                    setShowHeatmap(false);
                    setHeatmapUrl(null);
                    setHeatmapError(null);
                    setStage(-1);
                  }}
                >
                  New scan
                </Button>
              </div>
            </div>

            {/* Error banner */}
            {errorMsg && (
              <div className="glass rounded-[2rem] border-red-500/30 p-6 text-red-200 bg-red-950/20">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="size-6 shrink-0 text-red-400 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-red-300">Identification Error</h4>
                    <p className="mt-1 text-sm text-red-200/90">{errorMsg}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Not-a-fish banner. Distinct from "unknown": there is no fish here at
                all, so no candidates and no biology are shown. */}
            {!errorMsg && isNotFish && (
              <div className="glass rounded-[2rem] border-sky-500/30 bg-sky-950/20 p-6">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="mt-0.5 size-6 shrink-0 text-sky-400" />
                  <div>
                    <h4 className="font-semibold text-sky-200">Not a fish</h4>
                    <p className="mt-1 text-sm text-sky-100/90">
                      {result?.message ?? "This image does not appear to contain a fish."}
                    </p>
                    <p className="mt-2 text-xs text-sky-100/70">
                      Upload a photo of a fish to run species identification.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Unknown state banner */}
            {!errorMsg && isUnknown && (
              <div className="glass rounded-[2rem] border-amber-500/30 p-6 bg-amber-950/20">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="size-6 shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-amber-300">Unknown Fish</h4>
                    <p className="mt-1 text-sm text-amber-200/90">
                      {result.message || "We couldn't confidently identify this fish."}
                    </p>
                    <p className="mt-2 text-xs text-amber-200/70">
                      Try uploading a clearer image showing the full fish in good lighting.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Top candidates for unknown */}
            {isUnknown && (result?.top_candidates?.length ?? 0) > 0 && (
              <div className="glass rounded-[2rem] p-6">
                <h3 className="font-semibold">Top Candidates (Low Confidence)</h3>
                <div className="mt-5 space-y-4">
                  {result!.top_candidates!.map((c) => (
                    <div key={c.scientific_name}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate italic">{c.scientific_name}</span>
                        <span className="shrink-0 text-muted-foreground">{c.confidence}%</span>
                      </div>
                      <Progress value={c.confidence} className="mt-2" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Alternatives for identified */}
            {isIdentified && (result?.alternatives?.length ?? 0) > 0 && (
              <div className="glass rounded-[2rem] p-6">
                <h3 className="font-semibold">Alternative Candidates</h3>
                <div className="mt-5 space-y-4">
                  {result!.alternatives!.map((a) => (
                    <div key={a.scientific_name}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate italic">{a.scientific_name}</span>
                        <span className="shrink-0 text-muted-foreground">{a.confidence}%</span>
                      </div>
                      <Progress value={a.confidence} className="mt-2" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Habitat visual */}
            {isIdentified && details?.distribution && (
              <div className="glass rounded-[2rem] p-6">
                <h3 className="font-semibold">Distribution</h3>
                <p className="mt-3 text-sm text-muted-foreground">{details.distribution}</p>
              </div>
            )}
          </div>

          {/* ── Right column: species info ── */}
          <div className="space-y-6">
            {/* Identified species card */}
            {isIdentified && pred && (
              <div className="glass rounded-[2rem] p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="size-5 text-sea-green shrink-0" />
                      <h2 className="text-2xl font-bold">{pred.common_name}</h2>
                    </div>
                    <p className="mt-1 italic text-muted-foreground">{pred.scientific_name}</p>
                    {(result?.common_name_alternatives?.length ?? 0) > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Also known as: {result!.common_name_alternatives!.join(", ")}
                      </p>
                    )}
                    {result?.engine && (
                      <p className="mt-1 text-xs text-ocean-cyan font-medium">⚡ {result.engine}</p>
                    )}
                  </div>
                  <Badge className="bg-[image:var(--gradient-ocean)] text-primary-foreground">
                    {pred.confidence}% confidence
                  </Badge>
                </div>

                {/* Taxonomy */}
                {taxonomy && Object.keys(taxonomy).length > 0 && (
                  <div className="mt-6">
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                      Taxonomy
                    </h4>
                    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                      {Object.entries(taxonomy).map(([key, val]) =>
                        val ? (
                          <div key={key}>
                            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                              {key.charAt(0).toUpperCase() + key.slice(1)}
                            </dt>
                            <dd className="mt-1 text-sm">{val}</dd>
                          </div>
                        ) : null,
                      )}
                    </dl>
                  </div>
                )}

                {/* About this fish */}
                {details && Object.keys(details).length > 0 && (
                  <div className="mt-6">
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                      About This Fish
                    </h4>
                    <dl className="space-y-4">
                      {details.description && (
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                            Description
                          </dt>
                          <dd className="mt-1 text-sm">{details.description}</dd>
                        </div>
                      )}
                      {(
                        ["habitat", "diet", "behavior", "size", "lifespan", "reproduction"] as const
                      ).map((key) =>
                        details[key] ? (
                          <div key={key}>
                            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                              {key.charAt(0).toUpperCase() + key.slice(1)}
                            </dt>
                            <dd className="mt-1 text-sm">{details[key]}</dd>
                          </div>
                        ) : null,
                      )}
                    </dl>
                  </div>
                )}

                {/* Species data unavailable notice */}
                {result?.species_data_available === false && (
                  <p className="mt-4 text-xs text-amber-400/80 italic">
                    ⚠{" "}
                    {result.species_data_message ||
                      "External species data temporarily unavailable."}
                  </p>
                )}
              </div>
            )}

            {/* Conservation. The previous "Disease Check" and "Freshness" tabs
                reported invented pathology risk and a fabricated quality grade —
                the model performs neither analysis, so they are gone. */}
            {isIdentified && (
              <div className="glass rounded-[2rem] p-6">
                <h3 className="font-semibold">Conservation</h3>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Leaf className={`size-5 ${iucnTone(conservation?.iucn_status)}`} />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      IUCN Red List status
                    </p>
                    {conservation?.iucn_status ? (
                      <p className={`text-lg font-semibold ${iucnTone(conservation.iucn_status)}`}>
                        {formatIucn(conservation.iucn_status)}
                        {conservation.iucn_code && (
                          <span className="ml-2 text-sm font-normal text-muted-foreground">
                            ({conservation.iucn_code})
                          </span>
                        )}
                      </p>
                    ) : (
                      <p className="text-sm italic text-muted-foreground">Data unavailable</p>
                    )}
                  </div>
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  Conservation status retrieved from the IUCN Red List via GBIF.
                </p>
              </div>
            )}

            {/* Data sources */}
            {isIdentified && sources.length > 0 && (
              <div className="glass rounded-[2rem] p-6">
                <h3 className="font-semibold mb-3">Data Sources</h3>
                <div className="flex flex-wrap gap-3">
                  {sources.map((s) => (
                    <a
                      key={s.name}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-xl bg-ocean-cyan/10 px-3 py-1.5 text-sm text-ocean-cyan hover:bg-ocean-cyan/20 transition-colors"
                    >
                      {s.name} <ExternalLink className="size-3" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Export */}
            {isIdentified && (
              <div className="glass flex flex-wrap gap-2 rounded-[2rem] p-6">
                <Button
                  variant="ocean"
                  size="sm"
                  onClick={() => result && downloadFishReport(result, imageDataUrlRef.current)}
                  disabled={!result}
                >
                  <Download className="size-4" /> PDF report
                </Button>
                <Button variant="glass" size="sm" onClick={handleDownloadCSV}>
                  <FileSpreadsheet className="size-4" /> CSV
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (!image) return;
                    const link = document.createElement("a");
                    link.href = image;
                    link.download = `fish_image_${Date.now()}.jpg`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                >
                  <ImageIcon className="size-4" /> Image
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Route entry point. The page itself is only mounted for a verified session. */
function GuardedFishIdentification() {
  return (
    <ProtectedRoute>
      <FishIdentification />
    </ProtectedRoute>
  );
}
