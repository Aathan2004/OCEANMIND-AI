import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Globe, Radio, RefreshCw, Search, ShieldCheck, Waves } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OceanLeafletMap } from "@/components/ocean/OceanLeafletMap";
import { ThermalAnomalyPanel } from "@/components/ocean/ThermalAnomalyPanel";
import {
  fetchNoaaOceanConditions,
  NOAA_STATIONS,
  searchNoaaStationsAndRegions,
  type NoaaOceanData,
  type NoaaStation,
} from "@/lib/noaa-api";

type TimeRange = "24h" | "7d" | "30d";

export const Route = createFileRoute("/ocean-dashboard")({
  head: () => ({
    meta: [
      { title: "Ocean Conditions Dashboard — OceanMind AI" },
      {
        name: "description",
        content:
          "Live sea surface temperature, salinity, waves, currents and NOAA station observational alerts.",
      },
      { property: "og:title", content: "Ocean Conditions Dashboard — OceanMind AI" },
      {
        property: "og:description",
        content:
          "Ten live marine metrics powered by NOAA API and real-time station observing buoys.",
      },
    ],
  }),
  component: OceanDashboard,
});

const chartStyle = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: "0.75rem",
    fontSize: 12,
  },
} as const;

function OceanDashboard() {
  const [selectedStationId, setSelectedStationId] = useState("8724580");
  const [regionQuery, setRegionQuery] = useState("");
  const [live, setLive] = useState(true);
  const [noaaData, setNoaaData] = useState<NoaaOceanData | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("24h");
  const [loading, setLoading] = useState(false);
  const [searchLat, setSearchLat] = useState("24.55");
  const [searchLon, setSearchLon] = useState("-81.80");

  const loadData = async (stationId: string, range: "24h" | "7d" | "30d") => {
    setLoading(true);
    try {
      const data = await fetchNoaaOceanConditions(stationId, range);
      setNoaaData(data);
    } catch (err) {
      console.error("Failed to load NOAA data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedStationId, timeRange);
  }, [selectedStationId, timeRange]);

  // Filter stations based on region query ("if i type region i want all region")
  const filteredStations: NoaaStation[] = searchNoaaStationsAndRegions(regionQuery);

  const activeStation = noaaData?.station || NOAA_STATIONS[0]!;
  const metrics = noaaData?.metrics || [];
  const trend = noaaData?.trend || [];
  const alerts = noaaData?.alerts || [];

  const handleStationSelect = (st: NoaaStation) => {
    setSelectedStationId(st.id);
    setSearchLat(st.lat.toString());
    setSearchLon(st.lon.toString());
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pt-12">
      {/* Clean Header */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-bold sm:text-4xl">Ocean Conditions</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Station {activeStation.name} ({activeStation.id}) · {activeStation.region} (
            {activeStation.oceanBasin}) · updated{" "}
            {noaaData?.timestamp ? new Date(noaaData.timestamp).toLocaleTimeString() : "2 min ago"}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => loadData(selectedStationId, timeRange)}
            disabled={loading}
            className="size-9 rounded-xl"
            title="Refresh NOAA Data"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin text-ocean-cyan" : ""}`} />
          </Button>

          <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-secondary/30 px-3 py-1.5">
            <Radio className={live ? "size-4 animate-pulse-glow text-sea-green" : "size-4"} />
            <span className="text-xs text-muted-foreground">Live Feed</span>
            <Switch checked={live} onCheckedChange={setLive} />
          </div>
        </div>
      </div>

      {/* Global Ocean Regions Search & Filter Bar */}
      <div className="glass mt-6 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Globe className="size-5 text-ocean-cyan" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Global Ocean Regions Search</h2>
              <p className="text-xs text-muted-foreground">
                Type any ocean, sea, or coastal region (e.g. Atlantic, Pacific, Indian, Gulf,
                Caribbean, Arctic)
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs text-ocean-cyan border-ocean-cyan/30">
            Showing {filteredStations.length} of {NOAA_STATIONS.length} Regions
          </Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search all ocean regions (e.g. Pacific, Atlantic, Gulf of Mexico, Indian Ocean...)"
              value={regionQuery}
              onChange={(e) => setRegionQuery(e.target.value)}
              className="pl-9 bg-secondary/40 border-border/80 focus:border-ocean-cyan"
            />
          </div>
          <Input
            placeholder="Latitude · 24.55"
            value={searchLat}
            onChange={(e) => setSearchLat(e.target.value)}
          />
          <Input
            placeholder="Longitude · -81.80"
            value={searchLon}
            onChange={(e) => setSearchLon(e.target.value)}
          />
        </div>

        {/* Dynamic Station & Region Pills */}
        <div className="pt-1">
          {filteredStations.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              No specific station found for &quot;{regionQuery}&quot;. Showing all global ocean
              regions below:
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-1">
            {(filteredStations.length > 0 ? filteredStations : NOAA_STATIONS).map((st) => (
              <button
                key={st.id}
                onClick={() => handleStationSelect(st)}
                className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                  selectedStationId === st.id
                    ? "bg-[image:var(--gradient-ocean)] text-primary-foreground shadow-[var(--shadow-glow)] scale-[1.02]"
                    : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground border border-border/40"
                }`}
              >
                {st.name} <span className="opacity-75">({st.oceanBasin})</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 10 Ocean Metrics */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {metrics.map((m) => (
          <div key={m.label} className="glass glass-hover rounded-2xl p-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <span className="text-[10px] text-ocean-cyan opacity-80 font-mono">NOAA</span>
            </div>
            <p className="mt-2 font-display text-2xl font-bold">
              {m.value}
              <span className="ml-1 text-sm font-normal text-muted-foreground">{m.unit}</span>
            </p>
            <p className="mt-1 text-xs text-ocean-teal">{m.delta}</p>
          </div>
        ))}
      </div>

      {/* Interactive Map & NOAA Marine Alerts */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="glass rounded-[2rem] p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">Live NOAA Station Map</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Selected: <strong className="text-foreground">{activeStation.name}</strong> (
                {activeStation.oceanBasin})
              </p>
            </div>
            <Badge className="bg-sea-green/20 text-sea-green">
              {activeStation.lat.toFixed(2)}°N, {Math.abs(activeStation.lon).toFixed(2)}°
              {activeStation.lon < 0 ? "W" : "E"}
            </Badge>
          </div>
          <div className="relative">
            <OceanLeafletMap
              stations={NOAA_STATIONS}
              selectedStationId={selectedStationId}
              onStationSelect={handleStationSelect}
              stationName={activeStation.name}
            />
          </div>
        </div>

        <div className="glass rounded-[2rem] p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">NOAA Marine Alerts</h2>
            <Badge variant="outline" className="text-xs">
              Station Warnings
            </Badge>
          </div>

          <div className="mt-5 space-y-3">
            {alerts.map((a) => (
              <div key={a.title} className="rounded-2xl border border-border bg-secondary/40 p-4">
                <div className="flex items-start gap-3">
                  {a.level === "safe" ? (
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-sea-green" />
                  ) : (
                    <AlertTriangle
                      className={`mt-0.5 size-4 shrink-0 ${
                        a.level === "critical" ? "text-destructive" : "text-chart-4"
                      }`}
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{a.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{a.region}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Badge className="mt-5 bg-sea-green/20 text-sea-green">
            NOAA Observation Confidence 96%
          </Badge>
        </div>
      </div>

      {/* Forecast Charts */}
      <Tabs
        value={timeRange}
        onValueChange={(value) => setTimeRange(value as TimeRange)}
        className="mt-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">
            {timeRange === "24h" ? "24-Hour" : timeRange === "7d" ? "7-Day" : "30-Day"} Regional
            Forecast & Observations
          </h2>
          <TabsList>
            <TabsTrigger value="24h">24 Hours</TabsTrigger>
            <TabsTrigger value="7d">7 Days</TabsTrigger>
            <TabsTrigger value="30d">30 Days</TabsTrigger>
          </TabsList>
        </div>
      </Tabs>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        {[
          { title: "Temperature Trend (°C)", key: "temperature", color: "var(--chart-1)" },
          { title: "Salinity (PSU)", key: "salinity", color: "var(--chart-2)" },
          { title: "Wave Height (m)", key: "wave", color: "var(--chart-3)" },
          { title: "Current Speed (m/s)", key: "current", color: "var(--chart-4)" },
        ].map((c, i) => (
          <div key={c.key} className="glass rounded-[2rem] p-6">
            <h3 className="text-sm font-semibold">{c.title}</h3>
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                {i % 2 === 0 ? (
                  <AreaChart data={trend}>
                    <defs>
                      <linearGradient id={`g-${c.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={c.color} stopOpacity={0.5} />
                        <stop offset="100%" stopColor={c.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 10 }}
                      interval={5}
                      stroke="var(--muted-foreground)"
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      stroke="var(--muted-foreground)"
                      domain={["auto", "auto"]}
                    />
                    <Tooltip {...chartStyle} />
                    <Area
                      type="monotone"
                      dataKey={c.key}
                      stroke={c.color}
                      strokeWidth={2}
                      fill={`url(#g-${c.key})`}
                    />
                  </AreaChart>
                ) : (
                  <LineChart data={trend}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 10 }}
                      interval={5}
                      stroke="var(--muted-foreground)"
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      stroke="var(--muted-foreground)"
                      domain={["auto", "auto"]}
                    />
                    <Tooltip {...chartStyle} />
                    <Line
                      type="monotone"
                      dataKey={c.key}
                      stroke={c.color}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>

      {/* Habitat model */}
      <div className="glass mt-8 rounded-[2rem] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">NOAA Regional Habitat & Upwelling Model</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Predictive ocean heatmap for {activeStation.name} ({activeStation.oceanBasin})
            </p>
          </div>
          <Button variant="glass" size="sm" onClick={() => loadData(selectedStationId, timeRange)}>
            <Waves className="size-4" /> Recompute Model
          </Button>
        </div>
        <div className="relative mt-5 aspect-[3/1] overflow-hidden rounded-2xl bg-secondary/40">
          <div className="absolute inset-0 [background:radial-gradient(circle_at_25%_55%,color-mix(in_oklab,var(--sea-green)_65%,transparent),transparent_35%),radial-gradient(circle_at_55%_35%,color-mix(in_oklab,var(--ocean-cyan)_60%,transparent),transparent_30%),radial-gradient(circle_at_78%_65%,color-mix(in_oklab,var(--chart-4)_55%,transparent),transparent_28%)]" />
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 300 100" aria-hidden="true">
            <path
              d="M20 70 C90 40 160 80 280 35"
              fill="none"
              stroke="var(--foreground)"
              strokeWidth="1"
              strokeDasharray="4 4"
              opacity="0.6"
            />
          </svg>
          <span className="glass absolute bottom-3 left-3 rounded-xl px-3 py-2 text-xs">
            Suitability Index 0.88 · {activeStation.name} · {activeStation.oceanBasin}
          </span>
        </div>
      </div>

      {/* Thermal Anomaly Panel */}
      <ThermalAnomalyPanel noaaData={noaaData} stationName={activeStation.name} />
    </div>
  );
}
