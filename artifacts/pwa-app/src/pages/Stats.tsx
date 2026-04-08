import { useState } from "react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, BarChart2, TrendingUp, PieChart } from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart as RechartsPie, Pie, Cell, Legend,
  LineChart, Line, CartesianGrid,
} from "recharts";

const fetchJson = async (url: string) => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
};

interface StatsOverview {
  statusCounts: {
    total: number;
    open: number;
    pending_response: number;
    pending_hearing: number;
    resolved: number;
    withdrawn: number;
  };
  byDepartment: Array<{ department: string; count: number }>;
  byContractArticle: Array<{ contract_article: string; count: number }>;
  avgDaysToResolution: Array<{ step: number; avg_days: number }>;
  monthlyTrend: Array<{ month: string; count: number }>;
}

const STATUS_COLORS = [
  "#3b82f6", "#f59e0b", "#f97316", "#22c55e", "#6b7280",
];

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  pending_response: "Pending Response",
  pending_hearing: "Pending Hearing",
  resolved: "Resolved",
  withdrawn: "Withdrawn",
};

export default function Stats() {
  const [tab, setTab] = useState<"overview" | "trends" | "articles">("overview");

  const { data, isLoading } = useQuery<StatsOverview>({
    queryKey: ["stats-overview"],
    queryFn: () => fetchJson("/api/stats/overview"),
    staleTime: 5 * 60_000,
  });

  const statusPieData = data
    ? [
        { name: "Open", value: data.statusCounts.open },
        { name: "Pending Response", value: data.statusCounts.pending_response },
        { name: "Pending Hearing", value: data.statusCounts.pending_hearing },
        { name: "Resolved", value: data.statusCounts.resolved },
        { name: "Withdrawn", value: data.statusCounts.withdrawn },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <MobileLayout>
      <div className="min-h-full flex flex-col bg-background">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 h-14 flex items-center gap-3">
          <Link href="/" className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <BarChart2 className="w-5 h-5 text-primary" />
          <span className="font-bold tracking-tight text-sm uppercase flex-1">Grievance Statistics</span>
        </header>

        {/* Tab row */}
        <div className="flex border-b border-border bg-background sticky top-14 z-10">
          {(["overview", "trends", "articles"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors",
                tab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground"
              )}
            >
              {t === "overview" ? "Overview" : t === "trends" ? "Trend" : "Articles"}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-6 pb-8">
          {isLoading ? (
            Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)
          ) : !data ? (
            <p className="text-center text-muted-foreground py-10">No data available.</p>
          ) : tab === "overview" ? (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { label: "Total", value: data.statusCounts.total, color: "text-foreground" },
                  { label: "Open", value: data.statusCounts.open, color: "text-blue-600 dark:text-blue-400" },
                  { label: "Resolved", value: data.statusCounts.resolved, color: "text-green-600 dark:text-green-400" },
                ].map((c) => (
                  <div key={c.label} className="bg-card border border-border rounded-xl p-3 text-center">
                    <p className={cn("text-2xl font-black", c.color)}>{c.value}</p>
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">{c.label}</p>
                  </div>
                ))}
              </div>

              {/* Status Breakdown Pie */}
              {statusPieData.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Status Breakdown</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <RechartsPie>
                      <Pie data={statusPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={3}>
                        {statusPieData.map((_, i) => (
                          <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => [v, "Grievances"]} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: "10px" }} />
                    </RechartsPie>
                  </ResponsiveContainer>
                </div>
              )}

              {/* By Department */}
              {data.byDepartment.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">By Department</p>
                  <ResponsiveContainer width="100%" height={Math.max(120, data.byDepartment.length * 32)}>
                    <BarChart data={data.byDepartment} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="department" tick={{ fontSize: 10 }} width={90} />
                      <Tooltip formatter={(v: number) => [v, "Grievances"]} />
                      <Bar dataKey="count" fill="#b91c1c" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Avg Days to Resolution by Step */}
              {data.avgDaysToResolution.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Avg Days to Resolve (by Step)</p>
                  <div className="space-y-2.5">
                    {data.avgDaysToResolution.map((r) => (
                      <div key={r.step} className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-muted-foreground w-14">Step {r.step}</span>
                        <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                          <div
                            className="h-2 bg-primary rounded-full transition-all"
                            style={{ width: `${Math.min(100, ((r.avg_days ?? 0) / 60) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-foreground w-12 text-right">{r.avg_days ?? 0}d</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : tab === "trends" ? (
            <>
              {data.monthlyTrend.length > 0 ? (
                <div className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Grievances Filed — Last 12 Months</p>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={data.monthlyTrend} margin={{ left: 0, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tick={{ fontSize: 9 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip labelFormatter={(v: string) => `Month: ${v}`} formatter={(v: number) => [v, "Filed"]} />
                      <Line type="monotone" dataKey="count" stroke="#b91c1c" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <TrendingUp className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No monthly data yet</p>
                </div>
              )}
            </>
          ) : (
            <>
              {data.byContractArticle.length > 0 ? (
                <div className="bg-card border border-border rounded-xl divide-y divide-border">
                  <p className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Top Contract Articles</p>
                  {data.byContractArticle.map((a, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between">
                      <span className="text-sm font-semibold text-foreground">{a.contract_article}</span>
                      <span className="text-sm font-bold text-primary">{a.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <PieChart className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No article data yet</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
