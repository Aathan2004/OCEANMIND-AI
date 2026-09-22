import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Fish, HelpCircle, Sparkles, Upload, XCircle } from "lucide-react";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";
import { getHistoryFn, type HistoryRecord } from "@/lib/history-server";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Your Dashboard — OceanMind AI" },
      {
        name: "description",
        content: "Your identification history and species analytics on OceanMind AI.",
      },
    ],
  }),
  component: GuardedDashboard,
});

const chartTip = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: "0.75rem",
    fontSize: 12,
  },
} as const;

const pieColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/** Everything on this page is derived from the user's own stored rows — there
 *  are no sample figures and no placeholder analytics. */
function summarise(history: HistoryRecord[]) {
  const identified = history.filter((record) => record.status === "identified");

  const speciesCounts = new Map<string, number>();
  for (const record of identified) {
    const key = record.common_name || record.scientific_name;
    if (key) speciesCounts.set(key, (speciesCounts.get(key) ?? 0) + 1);
  }

  const speciesDistribution = [...speciesCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value]) => ({ name, value }));

  // Last six months of activity, oldest first.
  const months: Array<{ month: string; scans: number }> = [];
  const now = new Date();
  for (let offset = 5; offset >= 0; offset -= 1) {
    const point = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const label = point.toLocaleString(undefined, { month: "short" });
    const scans = history.filter((record) => {
      const created = new Date(record.created_at + "Z");
      return (
        created.getFullYear() === point.getFullYear() && created.getMonth() === point.getMonth()
      );
    }).length;
    months.push({ month: label, scans });
  }

  const confidences = identified
    .map((record) => record.confidence)
    .filter((value): value is number => value != null);

  return {
    total: history.length,
    identifiedCount: identified.length,
    unknownCount: history.filter((record) => record.status === "unknown").length,
    notFishCount: history.filter((record) => record.status === "not_fish").length,
    uniqueSpecies: speciesCounts.size,
    averageConfidence: confidences.length
      ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
      : null,
    speciesDistribution,
    months,
  };
}

function Dashboard() {
  const { user } = useAuth();

  const history = useQuery({
    queryKey: ["fish-history", user?.id],
    queryFn: () => getHistoryFn(),
    enabled: user != null,
  });

  // Memoised so the empty-array fallback doesn't create a new dependency on
  // every render.
  const records = useMemo(() => history.data?.history ?? [], [history.data]);
  const stats = useMemo(() => summarise(records), [records]);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-12">
      <div className="glass flex flex-wrap items-center justify-between gap-4 rounded-[2rem] p-6">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[image:var(--gradient-ocean)] text-xl font-bold text-primary-foreground">
            {user.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            {/* Read from the authenticated session, never hardcoded. */}
            <h1 className="truncate font-display text-2xl font-bold">Welcome back, {user.name}</h1>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <Badge className="shrink-0 bg-sea-green/20 text-sea-green">
          {history.isPending ? "…" : `${stats.total} identifications`}
        </Badge>
      </div>

      {history.isPending ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : history.isError ? (
        <div className="glass mt-6 flex items-center gap-3 rounded-2xl p-6 text-sm text-destructive">
          <AlertCircle className="size-5" />
          Could not load your identification history.
        </div>
      ) : stats.total === 0 ? (
        <div className="glass mt-6 grid place-items-center rounded-[2rem] px-6 py-16 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-[image:var(--gradient-ocean)] text-primary-foreground">
            <Upload className="size-6" />
          </span>
          <h2 className="mt-5 text-lg font-semibold">No identifications yet</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Your analytics appear here once you identify your first fish. Nothing on this page is
            sample data.
          </p>
          <Button variant="ocean" className="mt-6" asChild>
            <Link to="/fish-identification">Identify a fish</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: "Identified", value: String(stats.identifiedCount), icon: Fish },
              { label: "Unique species", value: String(stats.uniqueSpecies), icon: Sparkles },
              { label: "Unidentified", value: String(stats.unknownCount), icon: HelpCircle },
              { label: "Not a fish", value: String(stats.notFishCount), icon: XCircle },
              {
                label: "Avg. confidence",
                value:
                  stats.averageConfidence == null ? "—" : `${stats.averageConfidence.toFixed(1)}%`,
                icon: Sparkles,
              },
            ].map((stat) => (
              <div key={stat.label} className="glass glass-hover rounded-2xl p-5">
                <stat.icon className="size-4 text-ocean-cyan" />
                <p className="mt-3 font-display text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>

          <h2 className="mt-10 text-xl font-semibold">Your analytics</h2>
          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <div className="glass rounded-[2rem] p-6">
              <h3 className="text-sm font-semibold">Identifications per month</h3>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.months}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 10 }}
                      stroke="var(--muted-foreground)"
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      stroke="var(--muted-foreground)"
                      allowDecimals={false}
                    />
                    <Tooltip {...chartTip} />
                    <Bar dataKey="scans" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass rounded-[2rem] p-6">
              <h3 className="text-sm font-semibold">Your most identified species</h3>
              {stats.speciesDistribution.length === 0 ? (
                <p className="mt-6 text-sm text-muted-foreground">
                  No confident identifications yet.
                </p>
              ) : (
                <div className="mt-4 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.speciesDistribution}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                      >
                        {stats.speciesDistribution.map((_, index) => (
                          <Cell
                            key={index}
                            fill={pieColors[index % pieColors.length]}
                            stroke="transparent"
                          />
                        ))}
                      </Pie>
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Tooltip {...chartTip} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          <h2 className="mt-10 text-xl font-semibold">Recent activity</h2>
          <div className="glass mt-5 overflow-hidden rounded-[2rem]">
            <ul className="divide-y divide-border/60">
              {records.slice(0, 10).map((record) => (
                <li key={record.id} className="flex flex-wrap items-center gap-3 px-6 py-3">
                  <div className="min-w-0 flex-1">
                    {record.status === "identified" ? (
                      <>
                        <p className="truncate text-sm font-medium">{record.common_name}</p>
                        <p className="truncate text-xs italic text-muted-foreground">
                          {record.scientific_name}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {record.status === "not_fish" ? "Not a fish" : "Unidentified"}
                      </p>
                    )}
                  </div>
                  {record.confidence != null && (
                    <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
                      {record.confidence.toFixed(1)}%
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(record.created_at + "Z").toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function GuardedDashboard() {
  return (
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  );
}
