import {
  AlertTriangle,
  Flame,
  ShieldCheck,
  Thermometer,
  ThermometerSun,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { type NoaaOceanData } from "@/lib/noaa-api";

interface ThermalRegion {
  name: string;
  basin: string;
  currentTemp: number;
  baseline: number;
  anomaly: number;
  trend: "rising" | "falling" | "stable";
}

const THERMAL_REGIONS: ThermalRegion[] = [
  {
    name: "Gulf of Mexico",
    basin: "Atlantic",
    currentTemp: 29.4,
    baseline: 27.1,
    anomaly: +2.3,
    trend: "rising",
  },
  {
    name: "Coral Sea",
    basin: "Pacific",
    currentTemp: 28.8,
    baseline: 27.9,
    anomaly: +0.9,
    trend: "rising",
  },
  {
    name: "Bering Sea",
    basin: "Pacific",
    currentTemp: 7.2,
    baseline: 8.4,
    anomaly: -1.2,
    trend: "falling",
  },
  {
    name: "Red Sea",
    basin: "Indian",
    currentTemp: 31.2,
    baseline: 29.8,
    anomaly: +1.4,
    trend: "rising",
  },
  {
    name: "Labrador Sea",
    basin: "Atlantic",
    currentTemp: 4.1,
    baseline: 5.0,
    anomaly: -0.9,
    trend: "falling",
  },
  {
    name: "Bay of Bengal",
    basin: "Indian",
    currentTemp: 30.1,
    baseline: 28.9,
    anomaly: +1.2,
    trend: "stable",
  },
  {
    name: "North Sea",
    basin: "Atlantic",
    currentTemp: 15.8,
    baseline: 14.2,
    anomaly: +1.6,
    trend: "rising",
  },
  {
    name: "Caribbean Sea",
    basin: "Atlantic",
    currentTemp: 30.5,
    baseline: 28.4,
    anomaly: +2.1,
    trend: "rising",
  },
];

function getAnomalyColor(anomaly: number): {
  bg: string;
  text: string;
  border: string;
  label: string;
} {
  const abs = Math.abs(anomaly);
  if (anomaly > 2.0)
    return {
      bg: "bg-red-950/40",
      text: "text-red-400",
      border: "border-red-500/40",
      label: "Critical Warm",
    };
  if (anomaly > 1.0)
    return {
      bg: "bg-orange-950/30",
      text: "text-orange-400",
      border: "border-orange-500/30",
      label: "Warm Anomaly",
    };
  if (anomaly > 0.5)
    return {
      bg: "bg-yellow-950/30",
      text: "text-yellow-400",
      border: "border-yellow-500/30",
      label: "Slight Warm",
    };
  if (anomaly < -1.0)
    return {
      bg: "bg-blue-950/40",
      text: "text-blue-400",
      border: "border-blue-500/40",
      label: "Cold Anomaly",
    };
  if (anomaly < -0.5)
    return {
      bg: "bg-sky-950/30",
      text: "text-sky-400",
      border: "border-sky-500/30",
      label: "Slight Cool",
    };
  return {
    bg: "bg-secondary/30",
    text: "text-sea-green",
    border: "border-sea-green/30",
    label: "Normal",
  };
}

function getCriticalRegions(): ThermalRegion[] {
  return THERMAL_REGIONS.filter((r) => Math.abs(r.anomaly) > 1.5);
}

interface ThermalAnomalyPanelProps {
  noaaData?: NoaaOceanData | null;
  stationName?: string;
}

export function ThermalAnomalyPanel({ noaaData, stationName }: ThermalAnomalyPanelProps) {
  const critical = getCriticalRegions();
  const avgAnomaly = THERMAL_REGIONS.reduce((s, r) => s + r.anomaly, 0) / THERMAL_REGIONS.length;
  const warming = THERMAL_REGIONS.filter((r) => r.anomaly > 0).length;

  // Derive live station SST anomaly from NOAA data if available
  const liveTemp = noaaData?.metrics?.find((m) => m.label === "Sea Surface Temp")?.value;
  const liveAnomaly = liveTemp ? (parseFloat(liveTemp) - 27.2).toFixed(1) : null;

  return (
    <div className="glass mt-8 rounded-[2rem] p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ThermometerSun className="size-5 text-orange-400" />
            <h2 className="font-semibold text-foreground">Ocean Thermal Anomaly Detection</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Sea Surface Temperature vs. 1991–2020 climatological baseline across global regions
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {liveAnomaly && (
            <Badge
              className={`text-xs ${parseFloat(liveAnomaly) > 0 ? "bg-orange-500/20 text-orange-300" : "bg-blue-500/20 text-blue-300"}`}
            >
              {stationName || "Live Station"}: {liveAnomaly > "0" ? "+" : ""}
              {liveAnomaly}°C
            </Badge>
          )}
          <Badge
            className={`text-xs ${avgAnomaly > 0 ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"}`}
          >
            Global Avg: {avgAnomaly > 0 ? "+" : ""}
            {avgAnomaly.toFixed(2)}°C
          </Badge>
          <Badge className="bg-orange-500/20 text-orange-400 text-xs">
            {warming}/{THERMAL_REGIONS.length} Regions Warming
          </Badge>
        </div>
      </div>

      {/* Critical Anomaly Alert Banners */}
      {critical.length > 0 && (
        <div className="mt-5 space-y-2">
          {critical.map((r) => (
            <div
              key={r.name}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${r.anomaly > 0 ? "border-red-500/30 bg-red-950/20" : "border-blue-500/30 bg-blue-950/20"}`}
            >
              <span
                className={`size-2.5 animate-pulse rounded-full flex-shrink-0 ${r.anomaly > 0 ? "bg-red-500" : "bg-blue-500"}`}
              />
              <AlertTriangle
                className={`size-4 shrink-0 ${r.anomaly > 0 ? "text-red-400" : "text-blue-400"}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  {r.name} — Thermal Anomaly Alert
                </p>
                <p className="text-xs text-muted-foreground">
                  Current: {r.currentTemp}°C · Baseline: {r.baseline}°C ·{" "}
                  <strong className={r.anomaly > 0 ? "text-red-400" : "text-blue-400"}>
                    {r.anomaly > 0 ? "+" : ""}
                    {r.anomaly}°C deviation
                  </strong>
                </p>
              </div>
              <Badge
                className={`shrink-0 text-xs ${r.anomaly > 1.5 ? "bg-red-500/20 text-red-400" : "bg-orange-500/20 text-orange-400"}`}
              >
                {Math.abs(r.anomaly) > 2 ? "CRITICAL" : "WARNING"}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {/* Regional Comparison Grid */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {THERMAL_REGIONS.map((region) => {
          const style = getAnomalyColor(region.anomaly);
          const barPct = Math.min(Math.abs(region.anomaly) * 30, 100);
          return (
            <div key={region.name} className={`rounded-xl border ${style.border} ${style.bg} p-4`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-foreground">{region.name}</p>
                  <p className="text-[10px] text-muted-foreground">{region.basin}</p>
                </div>
                {region.trend === "rising" ? (
                  <TrendingUp className="size-4 shrink-0 text-red-400" />
                ) : region.trend === "falling" ? (
                  <TrendingDown className="size-4 shrink-0 text-blue-400" />
                ) : (
                  <ShieldCheck className="size-4 shrink-0 text-sea-green" />
                )}
              </div>

              <p className={`mt-3 text-xl font-bold ${style.text}`}>
                {region.anomaly > 0 ? "+" : ""}
                {region.anomaly}°C
              </p>
              <p className="text-xs text-muted-foreground">
                {region.currentTemp}°C vs {region.baseline}°C baseline
              </p>

              {/* Deviation bar */}
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary/60">
                <div
                  className={`h-full rounded-full transition-all ${region.anomaly > 0 ? "bg-gradient-to-r from-yellow-500 to-red-500" : "bg-gradient-to-r from-sky-500 to-blue-500"}`}
                  style={{ width: `${barPct}%` }}
                />
              </div>

              <p
                className="mt-2 text-[10px] font-medium"
                style={{ color: style.text.replace("text-", "").replace("-400", "") }}
              >
                <span className={style.text}>{style.label}</span>
              </p>
            </div>
          );
        })}
      </div>

      {/* Summary Bar */}
      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-border/40 bg-secondary/20 px-4 py-3 text-xs">
        <Thermometer className="size-4 text-ocean-cyan" />
        <span className="text-muted-foreground">
          Baseline: 1991–2020 NOAA Climatological Mean ·
        </span>
        <span className="text-muted-foreground">
          Coral bleaching threshold: +1°C above local max monthly mean
        </span>
        <span className="ml-auto font-mono text-ocean-cyan">NOAA OISST v2.1</span>
      </div>
    </div>
  );
}
