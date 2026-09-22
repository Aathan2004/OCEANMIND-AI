import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { BarChart2, Fish, Globe, Leaf, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  globalCatchTrend,
  iucnBreakdown,
  regionalCatch,
  speciesTrends,
  type SpeciesTrend,
} from "@/lib/population-data";

export const Route = createFileRoute("/population-trends")({
  head: () => ({
    meta: [
      { title: "Fish Population Trends — OceanMind AI" },
      {
        name: "description",
        content:
          "Explore historical fish population data, catch statistics, IUCN conservation status, and regional fisheries trends.",
      },
      { property: "og:title", content: "Fish Population Trends — OceanMind AI" },
      {
        property: "og:description",
        content:
          "FAO-sourced population trends, regional catch analytics, and IUCN status breakdown.",
      },
    ],
  }),
  component: PopulationTrends,
});

const chartStyle = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: "0.75rem",
    fontSize: 12,
    color: "var(--foreground)",
  },
} as const;

function iucnColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("least")) return "#22c55e";
  if (s.includes("near")) return "#86efac";
  if (s.includes("vulnerable")) return "#f97316";
  if (s.includes("endangered") && !s.includes("critically")) return "#ef4444";
  if (s.includes("critically")) return "#dc2626";
  if (s.includes("deficient")) return "#6b7280";
  return "#374151";
}

const REGIONAL_COLORS = [
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#f97316",
  "#ef4444",
  "#22c55e",
  "#6366f1",
];

function PopulationTrends() {
  const [selectedSpecies, setSelectedSpecies] = useState<SpeciesTrend>(speciesTrends[0]!);

  const populationChange = selectedSpecies.data.at(-1)!.population - 100;
  const catchChange = selectedSpecies.data.at(-1)!.catch_mt - selectedSpecies.data[0]!.catch_mt;

  const summaryStats = [
    {
      label: "Species In This Chart",
      value: String(speciesTrends.length),
      icon: Fish,
      color: "text-ocean-cyan",
      delta: "Illustrative series on this page",
    },
    {
      label: "Threatened Species",
      value: "25.2%",
      icon: Leaf,
      color: "text-orange-400",
      delta: "Illustrative figure",
    },
    {
      label: "Global Marine Catch",
      value: "88.1M MT",
      icon: Globe,
      color: "text-sea-green",
      delta: "Illustrative figure",
    },
    {
      label: "Overfished Stocks",
      value: "35.4%",
      icon: BarChart2,
      color: "text-red-400",
      delta: "Illustrative figure",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 pt-12 pb-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold sm:text-4xl">Fish Population Trends</h1>
            <p className="mt-3 max-w-xl text-muted-foreground">
              Illustrative population indices and catch trends, shaped after published FAO and IUCN
              figures. These series are teaching data, not a live feed — see the note below.
            </p>
          </div>
          <Badge className="bg-amber-500/20 text-xs text-amber-300">Illustrative dataset</Badge>
        </div>
      </motion.div>

      {/* Summary Stats */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryStats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="glass glass-hover rounded-2xl p-5"
          >
            <div className="flex items-center gap-3">
              <s.icon className={`size-5 ${s.color}`} />
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
            <p className={`mt-3 font-display text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{s.delta}</p>
          </motion.div>
        ))}
      </div>

      <Tabs defaultValue="trends" className="mt-10">
        <TabsList className="mb-6">
          <TabsTrigger value="trends">Species Population Trends</TabsTrigger>
          <TabsTrigger value="global">Global Catch</TabsTrigger>
          <TabsTrigger value="regional">Regional Analysis</TabsTrigger>
          <TabsTrigger value="iucn">IUCN Status</TabsTrigger>
        </TabsList>

        {/* Species Population Trends */}
        <TabsContent value="trends">
          <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
            {/* Species Selector */}
            <div className="glass rounded-2xl p-4">
              <p className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
                Select Species
              </p>
              <div className="space-y-1">
                {speciesTrends.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSpecies(s)}
                    className={`w-full rounded-xl px-3 py-3 text-left text-sm transition-all ${
                      selectedSpecies.id === s.id
                        ? "bg-[image:var(--gradient-ocean)] text-primary-foreground shadow-[var(--shadow-glow)]"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    <p className="font-semibold leading-tight">{s.common_name}</p>
                    <p className="mt-0.5 text-[11px] opacity-80">{s.scientific_name}</p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: iucnColor(s.iucn_status) }}
                      />
                      <span className="text-[10px] opacity-80">{s.iucn_status}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Chart + Details */}
            <div className="space-y-5">
              {/* KPI Row */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  {
                    label: "Population Change",
                    value: `${populationChange > 0 ? "+" : ""}${populationChange}%`,
                    delta: "vs 1990 baseline",
                    trend: populationChange >= 0 ? "up" : "down",
                  },
                  {
                    label: "Latest Catch",
                    value: `${selectedSpecies.data.at(-1)!.catch_mt}k MT`,
                    delta: `${catchChange > 0 ? "+" : ""}${catchChange}k MT since 1990`,
                    trend: catchChange >= 0 ? "up" : "down",
                  },
                  {
                    label: "IUCN Status",
                    value: selectedSpecies.iucn_status,
                    delta: selectedSpecies.family,
                    trend: "neutral",
                  },
                ].map((kpi) => (
                  <div key={kpi.label} className="glass rounded-2xl p-4">
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    <div className="mt-2 flex items-center gap-2">
                      {kpi.trend === "down" && (
                        <TrendingDown className="size-4 text-red-400 shrink-0" />
                      )}
                      {kpi.trend === "up" && (
                        <TrendingUp className="size-4 text-sea-green shrink-0" />
                      )}
                      <p
                        className="font-display text-xl font-bold"
                        style={{ color: selectedSpecies.color }}
                      >
                        {kpi.value}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{kpi.delta}</p>
                  </div>
                ))}
              </div>

              {/* Population Index Chart */}
              <div className="glass rounded-2xl p-6">
                <h2 className="mb-1 text-sm font-semibold">
                  {selectedSpecies.common_name} — Population Index (1990 = 100)
                </h2>
                <p className="mb-5 text-xs text-muted-foreground">
                  {selectedSpecies.region} · {selectedSpecies.family}
                </p>
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={selectedSpecies.data}>
                      <defs>
                        <linearGradient id="speciesGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={selectedSpecies.color} stopOpacity={0.4} />
                          <stop offset="100%" stopColor={selectedSpecies.color} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="year"
                        tick={{ fontSize: 11 }}
                        stroke="var(--muted-foreground)"
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        stroke="var(--muted-foreground)"
                        domain={[0, 130]}
                      />
                      <Tooltip {...chartStyle} formatter={(v: number) => [`${v}`, "Pop. Index"]} />
                      {/* Baseline reference at 100 */}
                      <Area
                        type="monotone"
                        dataKey="population"
                        stroke={selectedSpecies.color}
                        strokeWidth={2.5}
                        fill="url(#speciesGrad)"
                        dot={{ r: 4, fill: selectedSpecies.color, strokeWidth: 0 }}
                        activeDot={{ r: 6 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Catch Volume Chart */}
              <div className="glass rounded-2xl p-6">
                <h2 className="mb-5 text-sm font-semibold">
                  Annual Catch Volume (thousand metric tons)
                </h2>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={selectedSpecies.data}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="year"
                        tick={{ fontSize: 11 }}
                        stroke="var(--muted-foreground)"
                      />
                      <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                      <Tooltip {...chartStyle} formatter={(v: number) => [`${v}k MT`, "Catch"]} />
                      <Bar
                        dataKey="catch_mt"
                        fill={selectedSpecies.color}
                        radius={[4, 4, 0, 0]}
                        opacity={0.8}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Global Catch */}
        <TabsContent value="global">
          <div className="glass rounded-2xl p-6">
            <h2 className="text-base font-semibold">Global Marine Capture Fisheries (1990–2026)</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Total marine catch in thousands of metric tons · illustrative series
            </p>
            <div className="mt-8 h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={globalCatchTrend}>
                  <defs>
                    <linearGradient id="globalGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    stroke="var(--muted-foreground)"
                    domain={[75000, 100000]}
                    tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}M`}
                  />
                  <Tooltip
                    {...chartStyle}
                    formatter={(v: number) => [`${(v / 1000).toFixed(1)}M MT`, "Global Catch"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#06b6d4"
                    strokeWidth={2.5}
                    fill="url(#globalGrad)"
                    dot={{ r: 4, fill: "#06b6d4", strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </TabsContent>

        {/* Regional Analysis */}
        <TabsContent value="regional">
          <div className="glass rounded-2xl p-6">
            <h2 className="text-base font-semibold">
              Regional Catch Comparison by FAO Major Fishing Area
            </h2>
            <p className="mt-1 mb-6 text-sm text-muted-foreground">
              Catch in thousands of metric tons · Years: 2000, 2010, 2020, 2026
            </p>
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={regionalCatch} layout="vertical">
                  <CartesianGrid stroke="var(--border)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10 }}
                    stroke="var(--muted-foreground)"
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}M`}
                  />
                  <YAxis
                    dataKey="region"
                    type="category"
                    tick={{ fontSize: 10 }}
                    stroke="var(--muted-foreground)"
                    width={140}
                  />
                  <Tooltip {...chartStyle} formatter={(v: number) => [`${v}k MT`]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="catch_2000" name="2000" fill="#8b5cf6" radius={[0, 2, 2, 0]} />
                  <Bar dataKey="catch_2010" name="2010" fill="#06b6d4" radius={[0, 2, 2, 0]} />
                  <Bar dataKey="catch_2020" name="2020" fill="#10b981" radius={[0, 2, 2, 0]} />
                  <Bar dataKey="catch_2026" name="2026" fill="#f59e0b" radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </TabsContent>

        {/* IUCN Status */}
        <TabsContent value="iucn">
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="glass rounded-2xl p-6">
              <h2 className="mb-1 text-base font-semibold">
                IUCN Red List Status — Marine Fish Species
              </h2>
              <p className="mb-6 text-sm text-muted-foreground">
                Distribution of ~14,700 evaluated marine fish species · IUCN 2026.1
              </p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={iucnBreakdown}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      outerRadius={120}
                      innerRadius={60}
                      paddingAngle={2}
                      label={({ status, percentage }) => `${percentage}%`}
                      labelLine={false}
                    >
                      {iucnBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      {...chartStyle}
                      formatter={(value: number, name: string) => [
                        `${value.toLocaleString()} species`,
                        name,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="space-y-3">
              {iucnBreakdown.map((item) => (
                <div key={item.status} className="glass rounded-xl p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="size-3 rounded-full shrink-0"
                        style={{ background: item.color }}
                      />
                      <p className="text-sm font-medium">{item.status}</p>
                    </div>
                    <p className="text-sm font-bold" style={{ color: item.color }}>
                      {item.percentage}%
                    </p>
                  </div>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary/60">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${item.percentage}%`, background: item.color }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {item.count.toLocaleString()} species
                  </p>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Data Attribution */}
      <div className="mt-10 rounded-xl border border-border/40 bg-secondary/20 px-4 py-3 text-xs text-muted-foreground">
        <strong className="text-foreground">About this data:</strong> the population indices and
        catch series on this page are an{" "}
        <strong className="text-foreground">illustrative dataset</strong> bundled with the project
        to demonstrate the charts. They are modelled on the broad shape of published FAO
        capture-production and IUCN Red List trends but are{" "}
        <strong className="text-foreground">not</strong> the official figures, and must not be cited
        as such. For authoritative numbers use{" "}
        <a
          href="https://www.fao.org/fishery/en/statistics"
          target="_blank"
          rel="noreferrer"
          className="text-ocean-cyan hover:underline"
        >
          FAO FishStat
        </a>{" "}
        and the{" "}
        <a
          href="https://www.iucnredlist.org"
          target="_blank"
          rel="noreferrer"
          className="text-ocean-cyan hover:underline"
        >
          IUCN Red List
        </a>
        . Species identification and the species profiles on the Fish ID page use live GBIF, WoRMS
        and IUCN data and are unaffected by this note. Indices are normalised to a 1990 baseline (=
        100).
      </div>
    </div>
  );
}
