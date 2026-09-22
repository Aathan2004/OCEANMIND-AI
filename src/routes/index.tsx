import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  Activity,
  ArrowRight,
  Bot,
  Compass,
  Database,
  Fish,
  Satellite,
  ScanSearch,
  Upload,
  Waves,
} from "lucide-react";

import heroGlobe from "@/assets/hero-globe.jpg";
import { Button } from "@/components/ui/button";
import { getPlatformStatsFn, type PlatformStats } from "@/lib/stats-server";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OceanMind AI — AI-Powered Ocean Intelligence Platform" },
      {
        name: "description",
        content:
          "Identify fish species, explore live ocean conditions and research marine ecosystems with AI-powered ocean intelligence.",
      },
      { property: "og:title", content: "OceanMind AI — AI-Powered Ocean Intelligence Platform" },
      {
        property: "og:description",
        content:
          "Fish species recognition, ocean condition dashboards and a marine research assistant in one platform.",
      },
    ],
  }),
  component: Landing,
});

/** Built from the backend's real numbers; entries without data are dropped. */
function buildStats(stats: PlatformStats | null | undefined) {
  if (!stats) return [];
  const rows: Array<{ label: string; value: string }> = [];

  if (stats.supported_species != null) {
    rows.push({
      label: "Fish Species Supported",
      value: stats.supported_species.toLocaleString(),
    });
  }
  if (stats.top1_accuracy != null) {
    rows.push({
      label: "Top-1 Accuracy (held-out)",
      value: `${(stats.top1_accuracy * 100).toFixed(1)}%`,
    });
  }
  if (stats.top5_accuracy != null) {
    rows.push({
      label: "Top-5 Accuracy (held-out)",
      value: `${(stats.top5_accuracy * 100).toFixed(1)}%`,
    });
  }
  if (stats.identifications_recorded != null) {
    rows.push({
      label: "Identifications Run",
      value: stats.identifications_recorded.toLocaleString(),
    });
  }
  return rows;
}

const features = [
  {
    icon: ScanSearch,
    title: "Fish Recognition",
    body: "Upload or capture an image and get species, morphology and confidence scores in seconds.",
  },
  {
    icon: Waves,
    title: "Ocean Dashboard",
    body: "Ten live marine metrics, forecasts and alerts for any coordinate on the planet.",
  },
  {
    icon: Bot,
    title: "Marine AI Assistant",
    body: "Ask about currents, blooms or migration and get sourced, research-grade answers.",
  },
  {
    icon: Database,
    title: "Research Database",
    body: "Search and bookmark thousands of peer-reviewed marine science publications.",
  },
  {
    icon: Satellite,
    title: "Satellite Ocean Maps",
    body: "Temperature, chlorophyll and current layers rendered on an interactive world map.",
  },
  {
    icon: Activity,
    title: "Species Analytics",
    body: "Track identification history, distribution shifts and habitat suitability over time.",
  },
];

function Landing() {
  const platformStats = useQuery({
    queryKey: ["platform-stats"],
    queryFn: () => getPlatformStatsFn(),
    staleTime: 60_000,
  });
  const stats = buildStats(platformStats.data);

  return (
    <div>
      <section className="relative mx-auto max-w-7xl px-4 pt-14 sm:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-muted-foreground">
              <span className="size-2 animate-pulse-glow rounded-full bg-sea-green" />
              Live marine data · NOAA, GBIF & WoRMS
            </span>
            <h1 className="mt-6 text-4xl font-bold leading-[1.05] sm:text-5xl lg:text-6xl">
              AI-Powered <span className="text-gradient-ocean">Ocean Intelligence</span> Platform
            </h1>
            <p className="mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
              Identify fish species, explore ocean conditions, and research marine ecosystems with
              artificial intelligence.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" variant="ocean" asChild>
                <Link to="/fish-identification">
                  <Upload className="size-4" /> Upload Fish
                </Link>
              </Button>
              <Button size="lg" variant="glass" asChild>
                <Link to="/ocean-dashboard">
                  <Compass className="size-4" /> Explore Ocean
                </Link>
              </Button>
              <Button size="lg" variant="ghost" asChild>
                <Link to="/marine-ai">
                  <Bot className="size-4" /> Talk with Ocean AI
                </Link>
              </Button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.15 }}
            className="relative"
          >
            <div className="glass overflow-hidden rounded-[2rem] p-3">
              <img
                src={heroGlobe}
                alt="Holographic globe visualising global ocean current data"
                width={1200}
                height={1200}
                className="w-full rounded-[1.5rem]"
              />
            </div>
            <div className="glass absolute -bottom-6 left-4 flex items-center gap-3 rounded-2xl px-4 py-3">
              <Fish className="size-5 text-ocean-teal" />
              <div className="text-xs">
                <p className="font-semibold">EfficientNet-B0</p>
                <p className="text-muted-foreground">Species ID + GBIF/WoRMS</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Hidden entirely when the backend has no verifiable numbers to show. */}
      {stats.length > 0 && (
        <section className="mx-auto mt-28 max-w-7xl px-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.07 }}
                className="glass glass-hover rounded-2xl p-6"
              >
                <p className="font-display text-3xl font-bold text-gradient-ocean">{s.value}</p>
                <p className="mt-2 text-sm text-muted-foreground">{s.label}</p>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto mt-28 max-w-7xl px-4">
        <h2 className="max-w-2xl text-3xl font-bold sm:text-4xl">
          One platform for the whole ocean workflow
        </h2>
        <p className="mt-4 max-w-xl text-muted-foreground">
          From a single photo on a fishing boat to a full climate-scale research question.
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.article
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: (i % 3) * 0.08 }}
              className="glass glass-hover group rounded-2xl p-6"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-[image:var(--gradient-ocean)] text-primary-foreground">
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm text-ocean-cyan opacity-0 transition-opacity group-hover:opacity-100">
                Learn more <ArrowRight className="size-3.5" />
              </span>
            </motion.article>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-28 max-w-7xl px-4">
        <div className="glass relative overflow-hidden rounded-[2rem] px-6 py-14 text-center sm:px-16">
          <h2 className="text-3xl font-bold sm:text-4xl">Start with a single fish photo</h2>
          <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
            Species profile, habitat map, freshness and disease screening, and an export-ready
            report.
          </p>
          <Button size="lg" variant="ocean" className="mt-8" asChild>
            <Link to="/fish-identification">
              Identify a species <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
