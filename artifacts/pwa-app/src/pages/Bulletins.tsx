import { useState, useEffect } from "react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import {
  useListAnnouncements,
  getListAnnouncementsQueryKey,
  type ListAnnouncementsParams,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Bell, ChevronRight, AlertTriangle, Siren, X, Clock, Archive } from "lucide-react";

const CATEGORY_FILTERS = [
  { id: "all",          label: "All" },
  { id: "safety_alert", label: "Safety" },
  { id: "strike_action",label: "Strike" },
  { id: "job_action",   label: "Job Action" },
  { id: "vote_notice",  label: "Vote" },
  { id: "urgent",       label: "Urgent" },
  { id: "contract",     label: "Contract" },
  { id: "policy_change",label: "Policy" },
  { id: "meeting",      label: "Meeting" },
  { id: "action",       label: "Action" },
  { id: "general",      label: "General" },
];

const categoryColors: Record<string, string> = {
  urgent:        "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400",
  safety_alert:  "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400",
  strike_action: "bg-red-100 text-red-900 border-red-300 dark:bg-red-900/40 dark:text-red-300",
  job_action:    "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300",
  vote_notice:   "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400",
  policy_change: "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/30 dark:text-teal-400",
  contract:      "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400",
  meeting:       "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400",
  action:        "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400",
  general:       "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800/50 dark:text-gray-300",
};

const categoryLabels: Record<string, string> = {
  safety_alert:  "Safety Alert",
  strike_action: "Strike Action",
  job_action:    "Job Action",
  vote_notice:   "Vote Notice",
  policy_change: "Policy Change",
  general:       "General",
  urgent:        "Urgent",
  contract:      "Contract",
  meeting:       "Meeting",
  action:        "Action",
};

type Announcement = {
  id: number;
  title: string;
  content: string;
  category: string;
  isUrgent: boolean;
  urgencyLevel?: string;
  publishedAt: string;
  scheduledFor?: string | null;
  isPublished?: boolean;
  expiresAt?: string | null;
};

type ViewTab = "active" | "scheduled" | "archived";

function EmergencyBanner({ item }: { item: Announcement }) {
  const isStrike = item.category === "strike_action" || item.category === "job_action";
  return (
    <Link href={`/bulletins/${item.id}`}>
      <div className={cn(
        "rounded-2xl p-5 border-2 active:opacity-80 transition-opacity",
        isStrike ? "bg-red-700 border-red-800 text-white" : "bg-orange-500 border-orange-600 text-white"
      )}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            {isStrike ? <Siren className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] font-black uppercase tracking-widest opacity-80">
                {categoryLabels[item.category] ?? item.category}
              </span>
            </div>
            <p className="font-black text-base leading-snug">{item.title}</p>
            <p className="text-xs opacity-70 mt-1.5 line-clamp-2 leading-relaxed">{item.content}</p>
            <p className="text-xs opacity-60 mt-2">{format(new Date(item.publishedAt), "MMM d, yyyy · h:mm a")}</p>
          </div>
          <ChevronRight className="w-5 h-5 opacity-60 mt-0.5 shrink-0" />
        </div>
      </div>
    </Link>
  );
}

function EmergencyOverlay({ item, onDismiss }: { item: Announcement; onDismiss: () => void }) {
  const isStrike = item.category === "strike_action" || item.category === "job_action";
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6"
      style={{ background: isStrike ? "rgba(153,0,0,0.97)" : "rgba(194,65,12,0.97)" }}
    >
      <div className="w-full max-w-sm flex flex-col items-center text-white text-center">
        <div className={cn("w-20 h-20 rounded-full flex items-center justify-center mb-6 bg-white/20 border-4 border-white/30", isStrike && "animate-pulse")}>
          {isStrike ? <Siren className="w-10 h-10" /> : <AlertTriangle className="w-10 h-10" />}
        </div>
        <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-75 mb-2">
          {isStrike ? "⚡ Emergency Alert" : "⚠️ Safety Alert"}
        </span>
        <h1 className="text-2xl font-black leading-tight mb-4">{item.title}</h1>
        <p className="text-sm opacity-80 leading-relaxed mb-8 max-w-[280px]">
          {item.content.length > 200 ? item.content.slice(0, 200) + "…" : item.content}
        </p>
        <p className="text-xs opacity-60 mb-8">
          Posted {format(new Date(item.publishedAt), "MMM d, yyyy · h:mm a")}
        </p>
        <Link href={`/bulletins/${item.id}`} onClick={onDismiss} className="w-full mb-3">
          <div className="w-full py-4 rounded-2xl bg-white font-black text-base tracking-wide"
            style={{ color: isStrike ? "#991b1b" : "#9a3412" }}>
            Read Full Bulletin
          </div>
        </Link>
        <button onClick={onDismiss} className="flex items-center gap-2 text-sm font-bold opacity-70 hover:opacity-100 transition-opacity py-3">
          <X className="w-4 h-4" />
          Acknowledge & Continue
        </button>
      </div>
    </div>
  );
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function useBulletinView(view: ViewTab) {
  return useQuery<Announcement[]>({
    queryKey: ["bulletins", view],
    queryFn: () => fetch(`${BASE}/api/announcements?view=${view}`, { credentials: "include" }).then((r) => r.json()),
    enabled: view !== "active",
    staleTime: 30_000,
  });
}

export default function Bulletins() {
  const [filter, setFilter] = useState("all");
  const [viewTab, setViewTab] = useState<ViewTab>("active");
  const [overlayDismissed, setOverlayDismissed] = useState(false);

  const categoryParam = filter === "all" ? undefined : (filter as ListAnnouncementsParams["category"]);
  const { data: activeAnnouncements, isLoading: activeLoading } = useListAnnouncements(
    { category: categoryParam },
    { query: { queryKey: getListAnnouncementsQueryKey({ category: categoryParam }) } }
  );
  const { data: altAnnouncements, isLoading: altLoading } = useBulletinView(viewTab);

  const announcements = (viewTab === "active" ? activeAnnouncements : altAnnouncements) as Announcement[] | undefined;
  const isLoading = viewTab === "active" ? activeLoading : altLoading;

  const criticalItems = (activeAnnouncements as Announcement[] | undefined)?.filter(
    (a) => a.urgencyLevel === "critical" || ["safety_alert", "strike_action", "job_action"].includes(a.category)
  ) ?? [];
  const urgentItems = (announcements ?? []).filter(
    (a) => a.isUrgent && a.urgencyLevel !== "critical" && !["safety_alert", "strike_action", "job_action"].includes(a.category)
  );
  const regularItems = (announcements ?? []).filter(
    (a) => !a.isUrgent && a.urgencyLevel !== "critical" && !["safety_alert", "strike_action", "job_action"].includes(a.category)
  );
  const emergencyItems = viewTab === "active" ? criticalItems : [];

  const overlayItem = !overlayDismissed && criticalItems.length > 0 && viewTab === "active"
    ? (criticalItems.find((a) => ["strike_action", "job_action"].includes(a.category)) ?? criticalItems[0])
    : null;

  const [checkedSession, setCheckedSession] = useState(false);
  useEffect(() => {
    if (!checkedSession && criticalItems.length > 0) {
      setCheckedSession(true);
      const key = `emergency_ack_${criticalItems[0].id}`;
      if (sessionStorage.getItem(key)) setOverlayDismissed(true);
    }
  }, [criticalItems, checkedSession]);

  const handleDismiss = () => {
    if (criticalItems.length > 0) sessionStorage.setItem(`emergency_ack_${criticalItems[0].id}`, "1");
    setOverlayDismissed(true);
  };

  return (
    <MobileLayout>
      {overlayItem && <EmergencyOverlay item={overlayItem} onDismiss={handleDismiss} />}

      <div className="p-4 sm:p-5 space-y-5 pb-8">
        <header>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Bulletins</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Union announcements & news</p>
        </header>

        <div className="flex gap-1 bg-muted/60 rounded-xl p-1">
          {(["active", "scheduled", "archived"] as ViewTab[]).map((v) => (
            <button
              key={v}
              onClick={() => setViewTab(v)}
              className={cn(
                "flex-1 py-2 rounded-lg text-xs font-bold capitalize transition-all",
                viewTab === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              {v === "scheduled" ? <><Clock className="w-3 h-3 inline mr-1" />Scheduled</> :
               v === "archived" ? <><Archive className="w-3 h-3 inline mr-1" />Archived</> :
               "Active"}
            </button>
          ))}
        </div>

        {viewTab === "active" && (
          <div className="flex overflow-x-auto no-scrollbar gap-2 pb-1 -mx-4 px-4">
            {CATEGORY_FILTERS.map((c) => (
              <button key={c.id} onClick={() => setFilter(c.id)}
                className={cn(
                  "whitespace-nowrap px-4 py-2 rounded-full text-sm font-semibold transition-colors border shrink-0",
                  filter === c.id ? "bg-foreground text-background border-foreground" : "bg-card text-muted-foreground border-border hover:bg-muted"
                )}>
                {c.label}
              </button>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : (
          <div className="space-y-5">
            {viewTab === "scheduled" && (announcements?.length ?? 0) === 0 && (
              <div className="text-center py-12 text-muted-foreground bg-card rounded-xl border border-dashed border-border">
                <Clock className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="font-medium">No scheduled bulletins</p>
              </div>
            )}
            {viewTab === "archived" && (announcements?.length ?? 0) === 0 && (
              <div className="text-center py-12 text-muted-foreground bg-card rounded-xl border border-dashed border-border">
                <Archive className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="font-medium">No archived bulletins</p>
              </div>
            )}

            {viewTab === "scheduled" && (announcements ?? []).map((a) => (
              <Link key={a.id} href={`/bulletins/${a.id}`}>
                <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-xl p-4 active:opacity-80">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="text-[9px] text-blue-600 font-bold uppercase">Scheduled</span>
                        {a.scheduledFor && <span className="text-[10px] text-muted-foreground">{format(new Date(a.scheduledFor), "MMM d, h:mm a")}</span>}
                      </div>
                      <p className="font-bold text-foreground text-sm leading-snug line-clamp-2">{a.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn("text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border", categoryColors[a.category] ?? categoryColors.general)}>
                          {categoryLabels[a.category] ?? a.category}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  </div>
                </div>
              </Link>
            ))}

            {viewTab === "archived" && (announcements ?? []).map((a) => (
              <Link key={a.id} href={`/bulletins/${a.id}`}>
                <div className="bg-card border border-border rounded-xl p-4 active:opacity-80 opacity-70">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={cn("text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border", categoryColors[a.category] ?? categoryColors.general)}>
                          {categoryLabels[a.category] ?? a.category}
                        </span>
                        {a.expiresAt && <span className="text-[10px] text-muted-foreground">Expired {format(new Date(a.expiresAt), "MMM d")}</span>}
                      </div>
                      <p className="font-semibold text-foreground text-sm leading-snug line-clamp-2">{a.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{format(new Date(a.publishedAt), "MMM d, yyyy")}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  </div>
                </div>
              </Link>
            ))}

            {viewTab === "active" && (
              <>
                {emergencyItems.length > 0 && (
                  <section className="space-y-2.5">
                    <p className="text-xs font-bold uppercase tracking-widest text-red-600 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> Emergency
                    </p>
                    {emergencyItems.map((a) => <EmergencyBanner key={a.id} item={a} />)}
                  </section>
                )}

                {urgentItems.length > 0 && (
                  <section className="space-y-2.5">
                    <p className="text-xs font-bold uppercase tracking-widest text-red-600">Urgent</p>
                    {urgentItems.map((a) => (
                      <Link key={a.id} href={`/bulletins/${a.id}`}>
                        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-xl p-4 active:opacity-80 transition-opacity">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1.5">
                                <Bell className="w-3.5 h-3.5 text-red-600 shrink-0" />
                                <span className={cn("text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border", categoryColors[a.category])}>
                                  {categoryLabels[a.category] ?? a.category}
                                </span>
                              </div>
                              <p className="font-bold text-foreground leading-snug line-clamp-2 text-sm">{a.title}</p>
                              <p className="text-xs text-muted-foreground mt-1">{format(new Date(a.publishedAt), "MMM d, yyyy")}</p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                          </div>
                        </div>
                      </Link>
                    ))}
                  </section>
                )}

                {regularItems.length > 0 && (
                  <section className="space-y-2.5">
                    {(urgentItems.length > 0 || emergencyItems.length > 0) && (
                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">All Bulletins</p>
                    )}
                    {regularItems.map((a) => (
                      <Link key={a.id} href={`/bulletins/${a.id}`}>
                        <div className="bg-card border border-border rounded-xl p-4 active:opacity-80 transition-opacity">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className={cn("text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border", categoryColors[a.category] ?? categoryColors.general)}>
                                  {categoryLabels[a.category] ?? a.category}
                                </span>
                              </div>
                              <p className="font-semibold text-foreground leading-snug line-clamp-2 text-sm">{a.title}</p>
                              <p className="text-xs text-muted-foreground mt-1">{format(new Date(a.publishedAt), "MMM d, yyyy")}</p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                          </div>
                        </div>
                      </Link>
                    ))}
                  </section>
                )}

                {(announcements?.length ?? 0) === 0 && (
                  <div className="text-center py-12 text-muted-foreground bg-card rounded-xl border border-dashed border-border">
                    <Bell className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p className="font-medium">No bulletins posted</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
