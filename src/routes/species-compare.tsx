import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  AlertTriangle,
  Camera,
  ArrowLeftRight,
  Leaf,
  Loader2,
  ShieldAlert,
  Sparkles,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { identifyFishServerFn } from "@/lib/identify-server";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { compressImage } from "@/lib/image-compression";

export const Route = createFileRoute("/species-compare")({
  head: () => ({
    meta: [
      { title: "Species Comparison — OceanMind AI" },
      {
        name: "description",
        content:
          "Upload two fish images for side-by-side species comparison of morphology, habitat, conservation status and more.",
      },
      { property: "og:title", content: "Species Comparison — OceanMind AI" },
      {
        property: "og:description",
        content: "Side-by-side AI fish species analysis and comparison.",
      },
    ],
  }),
  component: GuardedSpeciesCompare,
});

interface FishResult {
  image: string;
  loading: boolean;
  done: boolean;
  error: string;
  commonName: string;
  scientificName: string;
  confidence: number;
  kingdom: string;
  phylum: string;
  taxonomicClass: string;
  order: string;
  family: string;
  genus: string;
  habitat: string;
  diet: string;
  lifespan: string;
  size: string;
  distribution: string;
  reproduction: string;
  behavior: string;
  description: string;
  iucn: string;
  engine: string;
  /** "identified" | "unknown" | "not_fish" | "" */
  status: string;
}

const defaultResult = (): FishResult => ({
  image: "",
  loading: false,
  done: false,
  error: "",
  commonName: "—",
  scientificName: "—",
  confidence: 0,
  kingdom: "—",
  phylum: "—",
  taxonomicClass: "—",
  order: "—",
  family: "—",
  genus: "—",
  habitat: "—",
  diet: "—",
  lifespan: "—",
  size: "—",
  distribution: "—",
  reproduction: "—",
  behavior: "—",
  description: "—",
  iucn: "—",
  engine: "—",
  status: "",
});

function iucnColor(status: string) {
  const s = status.toLowerCase();
  if (s.includes("least")) return "text-sea-green";
  if (s.includes("near")) return "text-emerald-400";
  if (s.includes("vulnerable")) return "text-orange-400";
  if (s.includes("endangered") && !s.includes("critically")) return "text-red-400";
  if (s.includes("critically")) return "text-red-600";
  return "text-muted-foreground";
}

const COMPARE_ROWS: Array<{ key: keyof FishResult; label: string }> = [
  { key: "kingdom", label: "Kingdom" },
  { key: "phylum", label: "Phylum" },
  { key: "taxonomicClass", label: "Class" },
  { key: "order", label: "Order" },
  { key: "family", label: "Family" },
  { key: "genus", label: "Genus" },
  { key: "habitat", label: "Habitat" },
  { key: "distribution", label: "Distribution" },
  { key: "diet", label: "Diet" },
  { key: "behavior", label: "Behavior" },
  { key: "size", label: "Avg Size" },
  { key: "lifespan", label: "Avg Lifespan" },
  { key: "reproduction", label: "Reproduction" },
  { key: "iucn", label: "IUCN Status" },
];

function FishUploadSlot({
  slotLabel,
  result,
  onFile,
}: {
  slotLabel: string;
  result: FishResult;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-ocean-cyan">{slotLabel}</p>

      {!result.image && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) onFile(file);
          }}
          className="glass grid place-items-center rounded-2xl border-dashed px-4 py-14 text-center"
        >
          <span className="grid size-12 place-items-center rounded-xl bg-[image:var(--gradient-ocean)] text-primary-foreground">
            <Upload className="size-5" />
          </span>
          <p className="mt-4 text-sm font-semibold">{slotLabel}</p>
          <p className="mt-1 text-xs text-muted-foreground">Drop image or click Upload</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant="ocean" size="sm" onClick={() => inputRef.current?.click()}>
              <Upload className="size-3.5" /> Upload
            </Button>
            <Button variant="glass" size="sm" onClick={() => inputRef.current?.click()}>
              <Camera className="size-3.5" /> Camera
            </Button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
            }}
          />
        </motion.div>
      )}

      {result.image && result.loading && (
        <div className="glass rounded-2xl p-6">
          <img src={result.image} alt="" className="mb-4 w-full rounded-xl object-cover max-h-48" />
          <div className="flex items-center gap-2 text-muted-foreground">
            <Sparkles className="size-4 animate-pulse-glow text-ocean-cyan" />
            <span className="text-sm">Analyzing with AI…</span>
          </div>
          <Progress value={60} className="mt-3" />
          <div className="mt-4 space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-5 rounded-lg" />
            ))}
          </div>
        </div>
      )}

      {result.image && result.done && (
        <div className="space-y-3">
          <div className="glass overflow-hidden rounded-2xl">
            <img
              src={result.image}
              alt={result.commonName}
              className="w-full object-cover max-h-52"
              loading="lazy"
            />
          </div>

          {result.error && result.error !== "" && (
            <div className="glass rounded-xl border-amber-500/30 bg-amber-950/20 p-4">
              <div className="flex gap-2">
                <AlertTriangle className="size-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300">{result.error}</p>
              </div>
            </div>
          )}

          <div className="glass rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-lg font-bold">{result.commonName}</h3>
                <p className="text-sm italic text-muted-foreground">{result.scientificName}</p>
                {result.engine !== "—" && (
                  <p className="mt-1 text-xs text-ocean-cyan">⚡ {result.engine}</p>
                )}
              </div>
              <Badge className="bg-[image:var(--gradient-ocean)] text-primary-foreground">
                {result.confidence}%
              </Badge>
            </div>
          </div>

          {result.description !== "—" && result.description !== "Data unavailable" && (
            <div className="glass rounded-xl p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Description
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">{result.description}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SpeciesCompare() {
  const [fishA, setFishA] = useState<FishResult>(defaultResult());
  const [fishB, setFishB] = useState<FishResult>(defaultResult());

  async function identifyFish(
    file: File,
    setResult: React.Dispatch<React.SetStateAction<FishResult>>,
  ) {
    // Replace the slot outright rather than spreading the previous result:
    // spreading is what used to leave the old fish's biology next to the new
    // fish's name.
    const objectUrl = URL.createObjectURL(file);
    setResult({ ...defaultResult(), image: objectUrl, loading: true });

    const uploadFile = await compressImage(file);
    const formData = new FormData();
    formData.append("image", uploadFile);

    try {
      const data = await identifyFishServerFn({ data: formData });

      if (!data.success) {
        setResult({
          ...defaultResult(),
          image: objectUrl,
          done: true,
          error: data.error || "Identification failed.",
        });
        return;
      }

      const taxonomy = data.taxonomy ?? {};
      const details = data.details ?? {};
      const prediction = data.prediction;

      if (!prediction) {
        // Unknown or not-fish: report the status, never fabricated biology.
        setResult({
          ...defaultResult(),
          image: objectUrl,
          done: true,
          status: data.status ?? "unknown",
          error: data.message || "Could not identify this image.",
          engine: data.engine ?? "—",
        });
        return;
      }

      setResult({
        ...defaultResult(),
        image: objectUrl,
        done: true,
        status: "identified",
        commonName: prediction.common_name,
        scientificName: prediction.scientific_name,
        confidence: prediction.confidence,
        kingdom: taxonomy.kingdom ?? "Data unavailable",
        phylum: taxonomy.phylum ?? "Data unavailable",
        taxonomicClass: taxonomy.class ?? "Data unavailable",
        order: taxonomy.order ?? "Data unavailable",
        family: taxonomy.family ?? "Data unavailable",
        genus: taxonomy.genus ?? "Data unavailable",
        habitat: details.habitat ?? "Data unavailable",
        diet: details.diet ?? "Data unavailable",
        lifespan: details.lifespan ?? "Data unavailable",
        size: details.size ?? "Data unavailable",
        distribution: details.distribution ?? "Data unavailable",
        reproduction: details.reproduction ?? "Data unavailable",
        behavior: details.behavior ?? "Data unavailable",
        description: details.description ?? "Data unavailable",
        iucn: data.conservation?.iucn_status ?? "Data unavailable",
        engine: data.engine ?? "—",
      });
    } catch (error: unknown) {
      setResult({
        ...defaultResult(),
        image: objectUrl,
        done: true,
        error: `Error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  const bothDone = fishA.done && fishB.done;
  // The comparison table only means something when both images produced a
  // species. Otherwise it is a grid of dashes pretending to be a comparison.
  const bothIdentified = fishA.status === "identified" && fishB.status === "identified";

  return (
    <div className="mx-auto max-w-7xl px-4 pt-12 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Species Comparison</h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Upload two fish images for a side-by-side AI analysis and species attribute comparison.
          </p>
        </div>
        <Badge className="bg-ocean-cyan/20 text-ocean-cyan">
          <ArrowLeftRight className="size-3 mr-1" /> Dual Analysis
        </Badge>
      </div>

      {/* Upload slots */}
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <FishUploadSlot
          slotLabel="Fish A"
          result={fishA}
          onFile={(file) => identifyFish(file, setFishA)}
        />
        <FishUploadSlot
          slotLabel="Fish B"
          result={fishB}
          onFile={(file) => identifyFish(file, setFishB)}
        />
      </div>

      {/* Comparison table */}
      {bothDone && !bothIdentified && (
        <div className="glass mt-8 rounded-2xl p-6 text-center">
          <p className="text-sm text-muted-foreground">
            A side-by-side comparison needs a confident identification for both images.
            {fishA.status !== "identified" && " Image A could not be identified."}
            {fishB.status !== "identified" && " Image B could not be identified."}
          </p>
        </div>
      )}

      {bothDone && bothIdentified && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="glass mt-10 rounded-[2rem] p-6"
        >
          <h2 className="mb-6 flex items-center gap-2 text-lg font-semibold">
            <ArrowLeftRight className="size-5 text-ocean-cyan" />
            Side-by-Side Attribute Comparison
          </h2>

          {/* Header row */}
          <div className="mb-3 grid grid-cols-[140px_1fr_1fr] gap-4">
            <div />
            <div className="glass rounded-xl px-3 py-2 text-center">
              <p className="text-sm font-bold">{fishA.commonName}</p>
              <p className="text-xs italic text-muted-foreground">{fishA.scientificName}</p>
              <Badge className="mt-1 bg-[image:var(--gradient-ocean)] text-xs text-primary-foreground">
                {fishA.confidence}%
              </Badge>
            </div>
            <div className="glass rounded-xl px-3 py-2 text-center">
              <p className="text-sm font-bold">{fishB.commonName}</p>
              <p className="text-xs italic text-muted-foreground">{fishB.scientificName}</p>
              <Badge className="mt-1 bg-[image:var(--gradient-ocean)] text-xs text-primary-foreground">
                {fishB.confidence}%
              </Badge>
            </div>
          </div>

          {/* Attribute rows */}
          <div className="divide-y divide-border/40">
            {COMPARE_ROWS.map(({ key, label }) => {
              const valA = String(fishA[key]);
              const valB = String(fishB[key]);
              const same = valA === valB && valA !== "—";
              return (
                <div key={key} className="grid grid-cols-[140px_1fr_1fr] gap-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground self-center">
                    {label}
                  </p>
                  <p
                    className={`text-sm ${key === "iucn" ? iucnColor(valA) : "text-foreground/90"}`}
                  >
                    {valA}
                  </p>
                  <p
                    className={`text-sm ${same ? "text-sea-green" : ""} ${key === "iucn" ? iucnColor(valB) : "text-foreground/90"}`}
                  >
                    {valB}
                    {same && (
                      <span className="ml-1.5 text-[10px] text-sea-green opacity-70">(same)</span>
                    )}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Confidence comparison bar */}
          <div className="mt-6 rounded-xl border border-border/40 bg-secondary/20 p-4">
            <p className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Confidence Score
            </p>
            <div className="space-y-3">
              {[
                { slot: "A", label: fishA.commonName, value: fishA.confidence },
                { slot: "B", label: fishB.commonName, value: fishB.confidence },
              ].map((item) => (
                // Keyed by slot: both labels read "—" until a fish is identified,
                // so the label is not unique.
                <div key={item.slot} className="flex items-center gap-3">
                  <p className="w-32 truncate text-sm text-foreground">{item.label}</p>
                  <Progress value={item.value} className="flex-1" />
                  <span className="w-12 text-right text-sm font-bold text-ocean-cyan">
                    {item.value}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Conservation comparison */}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {[fishA, fishB].map((fish, idx) => (
              <div key={idx} className="glass flex items-start gap-3 rounded-xl p-4">
                {fish.iucn.toLowerCase().includes("least") ? (
                  <Leaf className="size-5 shrink-0 text-sea-green mt-0.5" />
                ) : (
                  <ShieldAlert className="size-5 shrink-0 text-orange-400 mt-0.5" />
                )}
                <div>
                  <p className="text-sm font-semibold">{fish.commonName}</p>
                  <p className={`text-sm font-medium ${iucnColor(fish.iucn)}`}>IUCN: {fish.iucn}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{fish.distribution}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Loading indicator while one is still being identified */}
      {(fishA.loading || fishB.loading) && (
        <div className="mt-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin text-ocean-cyan" />
          <span className="text-sm">Identifying species…</span>
        </div>
      )}
    </div>
  );
}

/** Route entry point. The page itself is only mounted for a verified session. */
function GuardedSpeciesCompare() {
  return (
    <ProtectedRoute>
      <SpeciesCompare />
    </ProtectedRoute>
  );
}
