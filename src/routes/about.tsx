import { createFileRoute } from "@tanstack/react-router";
import { Leaf, Radar, ShieldAlert, Sparkles } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About OceanMind AI — Marine Intelligence for Everyone" },
      {
        name: "description",
        content:
          "OceanMind AI combines species recognition, ocean forecasting and conservation intelligence for researchers, fishers and students.",
      },
      { property: "og:title", content: "About OceanMind AI" },
      {
        property: "og:description",
        content: "Our mission, AI capabilities and conservation commitments.",
      },
    ],
  }),
  component: About,
});

const pillars = [
  {
    icon: Sparkles,
    title: "AI Recommendation Engine",
    body: "Best fishing locations, similar species, marine articles and live ocean alerts tailored to your coordinates.",
  },
  {
    icon: Radar,
    title: "Ocean Forecast",
    body: "Wave conditions, temperature, currents and fishing suitability up to 30 days ahead.",
  },
  {
    icon: ShieldAlert,
    title: "Conservation Guardrails",
    body: "Protected species alerts, illegal fishing warnings and endangered fish information at the point of catch.",
  },
  {
    icon: Leaf,
    title: "Sustainability Scoring",
    body: "Every identification carries a sustainability score combining stock health, gear impact and season.",
  },
];

function About() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-12">
      <h1 className="text-3xl font-bold sm:text-4xl">
        Marine intelligence, <span className="text-gradient-ocean">open to everyone</span>
      </h1>
      <p className="mt-5 max-w-2xl text-muted-foreground">
        OceanMind AI was built with marine biologists, small-scale fishers and classroom educators.
        The same models that support peer-reviewed research power a one-tap species check on a boat
        with patchy signal.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {pillars.map((p) => (
          <div key={p.title} className="glass glass-hover rounded-2xl p-6">
            <span className="grid size-11 place-items-center rounded-xl bg-[image:var(--gradient-ocean)] text-primary-foreground">
              <p.icon className="size-5" />
            </span>
            <h2 className="mt-5 text-lg font-semibold">{p.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{p.body}</p>
          </div>
        ))}
      </div>

      <div className="glass mt-8 rounded-[2rem] p-8">
        <h2 className="text-xl font-semibold">Data &amp; accuracy</h2>
        <div className="mt-3 space-y-3 text-sm text-muted-foreground">
          <p>
            Species identification uses an EfficientNet-B0 classifier fine-tuned on fish photographs
            harvested from{" "}
            <a
              href="https://www.gbif.org"
              target="_blank"
              rel="noreferrer"
              className="text-ocean-cyan hover:underline"
            >
              GBIF
            </a>{" "}
            occurrence records. The measured held-out accuracy and the number of supported species
            are published on the home page and come straight from the evaluation report — we do not
            quote figures we have not measured.
          </p>
          <p>
            The model reports a species only when its confidence, its margin over the runner-up and
            its prediction entropy all clear fixed thresholds. Otherwise it returns{" "}
            <strong className="text-foreground">Unknown</strong>, and a separate check returns{" "}
            <strong className="text-foreground">Not a fish</strong> for images that contain no fish
            at all. Taxonomy, common names and biology come from GBIF and{" "}
            <a
              href="https://www.marinespecies.org"
              target="_blank"
              rel="noreferrer"
              className="text-ocean-cyan hover:underline"
            >
              WoRMS
            </a>
            ; conservation status comes from the IUCN Red List. Fields those sources do not provide
            are shown as unavailable rather than filled in.
          </p>
          <p>
            Ocean conditions are live NOAA observations. The population-trend charts use an
            illustrative dataset, labelled as such on that page.
          </p>
        </div>
      </div>
    </div>
  );
}
