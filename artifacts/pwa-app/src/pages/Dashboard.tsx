import { MobileLayout } from "@/components/layout/MobileLayout";
import {
  useGetDashboardSummary,
  useGetRecentActivity,
  getGetDashboardSummaryQueryKey,
  getGetRecentActivityQueryKey,
} from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  FileText,
  AlertTriangle,
  Clock,
  ChevronRight,
  Bell,
  CalendarClock,
  ShieldAlert,
  ArrowUpCircle,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

export const ALERTS_QUERY_KEY = ["grievance-alerts"] as const;

const statusColors: Record<string, string> = {
  member_requested: "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400",
  open: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400",
  pending_response: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400",
  pending_hearing: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400",
  resolved: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400",
  withdrawn: "bg-gray-100 text-gray-600 border-gray-200",
};

const categoryColors: Record<string, string> = {
  urgent: "bg-red-100 text-red-800 border-red-200",
  contract: "bg-blue-100 text-blue-800 border-blue-200",
  meeting: "bg-purple-100 text-purple-800 border-purple-200",
  action: "bg-orange-100 text-orange-800 border-orange-200",
  general: "bg-gray-100 text-gray-700 border-gray-200",
};

interface UpcomingGrievance {
  id: number;
  grievanceNumber: string;
  title: string;
  step: number;
  status: string;
  dueDate: string;
  isOverdue: boolean;
}

interface AlertGrievance {
  id: number;
  grievanceNumber: string;
  title: string;
  step: number;
  status: string;
  dueDate: string;
  memberId: number | null;
  memberName: string | null;
  urgency: "critical" | "warning";
  businessDaysUntilDue: number;
  aiMessage: string;
}

interface AlertsResponse {
  alerts: AlertGrievance[];
  counts: { critical: number; warning: number; total: number };
}

function stepLabel(step: number) {
  if (step >= 5) return "Arbitration";
  return `Step ${step}`;
}

function QuickActionButton({
  onClick,
  loading,
  done,
  icon: Icon,
  label,
  variant,
}: {
  onClick: () => void;
  loading: boolean;
  done: boolean;
  icon: React.ElementType;
  label: string;
  variant: "escalate" | "response" | "close";
}) {
  const colors = {
    escalate: "border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/30",
    response: "border-green-200 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950/30",
    close: "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800/30",
  };

  if (done) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 dark:text-green-400">
        <CheckCircle2 className="w-3 h-3" />
        Done
      </span>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        "flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wide transition-colors disabled:opacity-50",
        colors[variant]
      )}
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />}
      {label}
    </button>
  );
}

function AlertCard({ alert, onActionDone }: { alert: AlertGrievance; onActionDone: () => void }) {
  const [escalateState, setEscalateState] = useState<"idle" | "loading" | "done">("idle");
  const [responseState, setResponseState] = useState<"idle" | "loading" | "done">("idle");
  const [closeState, setCloseState] = useState<"idle" | "loading" | "done">("idle");
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const isCritical = alert.urgency === "critical";
  const overdueDays = Math.abs(alert.businessDaysUntilDue);

  async function patchGrievance(body: Record<string, unknown>) {
    const res = await fetch(`/api/grievances/${alert.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    });
    if (!res.ok) throw new Error("Update failed");
    return res.json();
  }

  async function handleEscalate() {
    setEscalateState("loading");
    try {
      await patchGrievance({ step: alert.step + 1, status: "open" });
      setEscalateState("done");
      setTimeout(onActionDone, 800);
    } catch {
      setEscalateState("idle");
    }
  }

  async function handleMarkResponse() {
    setResponseState("loading");
    try {
      await patchGrievance({ status: "pending_hearing" });
      setResponseState("done");
      setTimeout(onActionDone, 800);
    } catch {
      setResponseState("idle");
    }
  }

  async function handleClose() {
    setCloseState("loading");
    try {
      await patchGrievance({ status: "resolved" });
      setCloseState("done");
      setTimeout(onActionDone, 800);
    } catch {
      setCloseState("idle");
    }
  }

  return (
    <div
      className={cn(
        "rounded-xl border p-4 space-y-3 relative",
        isCritical
          ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40"
          : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40"
      )}
    >
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors p-0.5"
        aria-label="Dismiss"
      >
        <XCircle className="w-3.5 h-3.5" />
      </button>

      <div className="flex items-start gap-2 pr-5">
        <div className={cn("mt-0.5 flex-shrink-0", isCritical ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-500")}>
          <AlertTriangle className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className={cn(
              "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border",
              isCritical
                ? "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
                : "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800"
            )}>
              {isCritical ? `Overdue ${overdueDays}d` : `Due in ${alert.businessDaysUntilDue}d`}
            </span>
            <span className="text-[9px] font-bold text-muted-foreground">{alert.grievanceNumber}</span>
            <span className="text-[9px] font-semibold text-muted-foreground">{stepLabel(alert.step)}</span>
          </div>
          <Link href={`/grievances/${alert.id}`}>
            <p className={cn(
              "text-sm font-bold leading-tight hover:underline",
              isCritical ? "text-red-900 dark:text-red-300" : "text-amber-900 dark:text-amber-300"
            )}>
              {alert.title}
            </p>
          </Link>
          {alert.memberName && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{alert.memberName}</p>
          )}
        </div>
      </div>

      <p className="text-xs text-foreground/80 leading-relaxed pl-6">
        {alert.aiMessage}
      </p>

      <div className="flex items-center gap-2 pl-6 flex-wrap">
        <QuickActionButton
          onClick={handleEscalate}
          loading={escalateState === "loading"}
          done={escalateState === "done"}
          icon={ArrowUpCircle}
          label={`Escalate to ${stepLabel(alert.step + 1)}`}
          variant="escalate"
        />
        <QuickActionButton
          onClick={handleMarkResponse}
          loading={responseState === "loading"}
          done={responseState === "done"}
          icon={CheckCircle2}
          label="Response Received"
          variant="response"
        />
        <QuickActionButton
          onClick={handleClose}
          loading={closeState === "loading"}
          done={closeState === "done"}
          icon={XCircle}
          label="Close"
          variant="close"
        />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const queryClient = useQueryClient();

  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() },
  });
  const { data: activity, isLoading: isLoadingActivity } = useGetRecentActivity({
    query: { queryKey: getGetRecentActivityQueryKey() },
  });
  const { data: upcoming = [], isLoading: isLoadingUpcoming } = useQuery<UpcomingGrievance[]>({
    queryKey: ["dashboard-upcoming"],
    queryFn: () => fetch("/api/dashboard/upcoming", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
  });

  const { data: alertsData, isLoading: isLoadingAlerts } = useQuery<AlertsResponse>({
    queryKey: ALERTS_QUERY_KEY,
    queryFn: () =>
      fetch("/api/grievances/alerts", { credentials: "include" }).then((r) => r.json()),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: cbaSettings } = useQuery<{ cba_expiry_date?: string; cba_name?: string }>({
    queryKey: ["cba-settings"],
    queryFn: () => fetch("/api/cba-info", { credentials: "include" }).then((r) => r.json()),
    staleTime: 5 * 60_000,
  });

  const today = new Date();

  function invalidateAlerts() {
    queryClient.invalidateQueries({ queryKey: ALERTS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: ["dashboard-upcoming"] });
  }

  const alerts = alertsData?.alerts ?? [];
  const alertCounts = alertsData?.counts ?? { critical: 0, warning: 0, total: 0 };

  return (
    <MobileLayout>
      <div className="p-5 space-y-7 animate-in fade-in slide-in-from-bottom-4 duration-400">
        <header className="mt-4 space-y-0.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            {format(new Date(), "EEEE, MMMM d")}
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            Unionize
          </h1>
          <p className="text-sm text-muted-foreground">Steward Dashboard</p>
        </header>

        {/* Stats Grid */}
        <section className="grid grid-cols-2 gap-3">
          {isLoadingSummary ? (
            Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
          ) : (
            <>
              <Link href="/members">
                <div className="bg-primary text-primary-foreground rounded-xl p-4 h-24 flex flex-col justify-between relative overflow-hidden cursor-pointer active:opacity-90 transition-opacity">
                  <div className="absolute -right-3 -bottom-3 opacity-10">
                    <Users className="w-20 h-20" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider opacity-80">Members</span>
                  <div>
                    <span className="text-3xl font-black tracking-tighter">{summary?.activeMembers ?? 0}</span>
                    <span className="text-xs opacity-70 ml-1">active</span>
                  </div>
                </div>
              </Link>

              <Link href="/grievances">
                <div className="bg-card border border-border rounded-xl p-4 h-24 flex flex-col justify-between cursor-pointer active:opacity-80 transition-opacity">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <FileText className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Open</span>
                  </div>
                  <div>
                    <span className="text-3xl font-black tracking-tighter text-foreground">{summary?.openGrievances ?? 0}</span>
                    <span className="text-xs text-muted-foreground ml-1">grievances</span>
                  </div>
                </div>
              </Link>

              <div className={cn(
                "rounded-xl p-4 h-24 flex flex-col justify-between",
                (summary?.overdueGrievances ?? 0) > 0
                  ? "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30"
                  : "bg-card border border-border"
              )}>
                <div className={cn("flex items-center gap-1.5", (summary?.overdueGrievances ?? 0) > 0 ? "text-red-700 dark:text-red-400" : "text-muted-foreground")}>
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Overdue</span>
                </div>
                <span className={cn("text-3xl font-black tracking-tighter", (summary?.overdueGrievances ?? 0) > 0 ? "text-red-800 dark:text-red-400" : "text-foreground")}>
                  {summary?.overdueGrievances ?? 0}
                </span>
              </div>

              <Link href="/bulletins">
                <div className={cn(
                  "rounded-xl p-4 h-24 flex flex-col justify-between cursor-pointer active:opacity-80 transition-opacity",
                  (summary?.urgentAnnouncements ?? 0) > 0
                    ? "bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30"
                    : "bg-card border border-border"
                )}>
                  <div className={cn("flex items-center gap-1.5", (summary?.urgentAnnouncements ?? 0) > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
                    <Bell className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Urgent</span>
                  </div>
                  <div>
                    <span className={cn("text-3xl font-black tracking-tighter", (summary?.urgentAnnouncements ?? 0) > 0 ? "text-amber-800 dark:text-amber-400" : "text-foreground")}>
                      {summary?.urgentAnnouncements ?? 0}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">bulletins</span>
                  </div>
                </div>
              </Link>
            </>
          )}
        </section>

        {/* Deadline Alerts */}
        {(isLoadingAlerts || alertCounts.total > 0) && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className={cn(
                  "w-4 h-4",
                  alertCounts.critical > 0 ? "text-red-500" : "text-amber-500"
                )} />
                <h2 className="text-xs font-bold tracking-widest uppercase text-muted-foreground">
                  Deadline Alerts
                </h2>
                {alertCounts.total > 0 && (
                  <span className={cn(
                    "text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                    alertCounts.critical > 0
                      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  )}>
                    {alertCounts.critical > 0 ? `${alertCounts.critical} critical` : `${alertCounts.warning} due soon`}
                  </span>
                )}
              </div>
              <Link href="/grievances" className="text-xs font-semibold text-primary flex items-center gap-0.5">
                View all <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {isLoadingAlerts ? (
              <div className="space-y-2">
                <Skeleton className="h-[120px] rounded-xl" />
                <Skeleton className="h-[120px] rounded-xl" />
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map((alert) => (
                  <AlertCard key={alert.id} alert={alert} onActionDone={invalidateAlerts} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* CBA Expiry Widget */}
        {cbaSettings?.cba_expiry_date && (() => {
          const expiryDate = parseISO(cbaSettings.cba_expiry_date);
          const daysLeft = differenceInCalendarDays(expiryDate, today);
          const isExpired = daysLeft < 0;
          const isUrgent = daysLeft <= 30 && !isExpired;
          const isWarning = daysLeft <= 90 && daysLeft > 30;
          const colorClass = isExpired
            ? "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900/30"
            : isUrgent
              ? "bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-900/30"
              : isWarning
                ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/30"
                : "bg-card border-border";
          const iconColor = isExpired ? "text-red-500" : isUrgent ? "text-orange-500" : isWarning ? "text-amber-500" : "text-muted-foreground";
          const labelColor = isExpired ? "text-red-700 dark:text-red-400" : isUrgent ? "text-orange-700 dark:text-orange-400" : isWarning ? "text-amber-700 dark:text-amber-400" : "text-foreground";
          return (
            <div className={cn("rounded-xl border p-4 flex items-center justify-between gap-4", colorClass)}>
              <div className="flex items-center gap-3">
                <ShieldAlert className={cn("w-8 h-8 flex-shrink-0", iconColor)} />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {cbaSettings.cba_name ?? "Collective Agreement"}
                  </p>
                  <p className={cn("text-sm font-bold", labelColor)}>
                    {isExpired
                      ? `Expired ${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? "s" : ""} ago`
                      : `Expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{format(expiryDate, "MMMM d, yyyy")}</p>
                </div>
              </div>
              {(isExpired || isUrgent || isWarning) && (
                <Link href="/admin">
                  <div className={cn("text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg border flex-shrink-0", isExpired ? "border-red-300 text-red-700 bg-red-100 dark:text-red-400 dark:border-red-800 dark:bg-red-900/30" : isUrgent ? "border-orange-300 text-orange-700 bg-orange-100 dark:text-orange-400 dark:border-orange-800 dark:bg-orange-900/30" : "border-amber-300 text-amber-700 bg-amber-100 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-900/30")}>
                    Update
                  </div>
                </Link>
              )}
            </div>
          );
        })()}

        {/* Due Soon */}
        {(isLoadingUpcoming || upcoming.length > 0) && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <CalendarClock className="w-4 h-4 text-amber-500" />
                <h2 className="text-xs font-bold tracking-widest uppercase text-muted-foreground">Due Within 14 Days</h2>
              </div>
              <Link href="/grievances" className="text-xs font-semibold text-primary flex items-center gap-0.5">
                View all <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="space-y-2">
              {isLoadingUpcoming ? (
                Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)
              ) : (
                upcoming.map((g) => {
                  const dueDate = parseISO(g.dueDate);
                  const daysUntil = differenceInCalendarDays(dueDate, today);
                  const urgent = daysUntil <= 3;
                  return (
                    <Link key={g.id} href={`/grievances/${g.id}`}>
                      <div className={cn(
                        "rounded-xl border px-4 py-3 flex items-center justify-between gap-3 active:opacity-80 transition-opacity",
                        g.isOverdue
                          ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/30"
                          : urgent
                            ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/30"
                            : "bg-card border-border",
                      )}>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground truncate">{g.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">{g.grievanceNumber}</span>
                            <span className={cn("text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border", statusColors[g.status])}>
                              {g.status.replace(/_/g, " ")}
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={cn(
                            "text-xs font-bold",
                            g.isOverdue ? "text-red-700" : urgent ? "text-amber-700" : "text-muted-foreground",
                          )}>
                            {g.isOverdue ? "Overdue" : daysUntil === 0 ? "Today" : daysUntil === 1 ? "Tomorrow" : `${daysUntil}d`}
                          </p>
                          <p className="text-[11px] text-muted-foreground">{format(dueDate, "MMM d")}</p>
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </section>
        )}

        {/* Recent Grievances */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold tracking-widest uppercase text-muted-foreground">Recent Grievances</h2>
            <Link href="/grievances" className="text-xs font-semibold text-primary flex items-center gap-0.5">
              View all <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-2.5">
            {isLoadingActivity ? (
              Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-[72px] rounded-xl" />)
            ) : (activity?.recentGrievances?.length ?? 0) === 0 ? (
              <div className="text-center py-8 bg-card rounded-xl border border-dashed border-border">
                <p className="text-sm text-muted-foreground">No grievances filed yet</p>
              </div>
            ) : (
              activity?.recentGrievances?.map((g) => (
                <Link key={g.id} href={`/grievances/${g.id}`}>
                  <div className="bg-card border border-border rounded-xl p-3.5 flex items-center justify-between active:bg-muted/50 transition-colors">
                    <div className="min-w-0 flex-1 mr-3">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-bold text-muted-foreground">{g.grievanceNumber}</span>
                        <span className={cn("text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border", statusColors[g.status])}>
                          {g.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-foreground truncate">{g.title}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* Recent Bulletins */}
        <section className="space-y-3 pb-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold tracking-widest uppercase text-muted-foreground">Latest Bulletins</h2>
            <Link href="/bulletins" className="text-xs font-semibold text-primary flex items-center gap=0.5">
              View all <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-2.5">
            {isLoadingActivity ? (
              Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-[72px] rounded-xl" />)
            ) : (activity?.recentAnnouncements?.length ?? 0) === 0 ? (
              <div className="text-center py-8 bg-card rounded-xl border border-dashed border-border">
                <p className="text-sm text-muted-foreground">No bulletins posted</p>
              </div>
            ) : (
              activity?.recentAnnouncements?.map((a) => (
                <Link key={a.id} href={`/bulletins/${a.id}`}>
                  <div className="bg-card border border-border rounded-xl p-3.5 active:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn("text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border", categoryColors[a.category])}>
                            {a.category}
                          </span>
                          {a.isUrgent && <span className="text-[9px] font-bold text-red-600 uppercase">Urgent</span>}
                        </div>
                        <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{a.title}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </MobileLayout>
  );
}
