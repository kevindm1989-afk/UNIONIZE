import { MemberPortalLayout } from "@/components/layout/MemberPortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, AlertTriangle, CheckCircle2, ThumbsUp, HelpCircle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type Bulletin = {
  id: number;
  title: string;
  content: string;
  category: string;
  isUrgent: boolean;
  urgencyLevel?: string;
  publishedAt: string;
  expiresAt?: string | null;
  isMobilization?: boolean;
  isAcknowledged?: boolean;
  myResponse?: string | null;
};

const categoryColors: Record<string, string> = {
  general:       "bg-muted text-muted-foreground",
  urgent:        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  safety_alert:  "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  strike_action: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  job_action:    "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  vote_notice:   "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  policy_change: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  contract:      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  meeting:       "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  action:        "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
};

const categoryLabel: Record<string, string> = {
  general: "General", urgent: "Urgent", contract: "Contract", meeting: "Meeting",
  action: "Action", safety_alert: "Safety Alert", strike_action: "Strike Action",
  job_action: "Job Action", vote_notice: "Vote Notice", policy_change: "Policy Change",
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function postJson(url: string, body: object) {
  const res = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function BulletinCard({ b, onAck, onRespond, ackPending, respPending }: {
  b: Bulletin;
  onAck: () => void;
  onRespond: (r: "im_in" | "need_info") => void;
  ackPending: boolean;
  respPending: boolean;
}) {
  const isUrgent = b.isUrgent || b.urgencyLevel === "critical" || b.urgencyLevel === "high";
  return (
    <Card className={cn(
      "border-border/50",
      isUrgent && "border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/10"
    )}>
      <CardContent className="px-4 py-3 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className={cn("shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full", categoryColors[b.category] ?? categoryColors.general)}>
                {categoryLabel[b.category] ?? b.category}
              </span>
              {b.isAcknowledged && (
                <span className="flex items-center gap-0.5 text-[10px] text-green-600 font-semibold">
                  <CheckCircle2 className="w-3 h-3" /> Read
                </span>
              )}
            </div>
            <p className="text-sm font-bold text-foreground leading-snug">{b.title}</p>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{b.content}</p>
            <p className="text-[10px] text-muted-foreground mt-1.5">{format(new Date(b.publishedAt), "MMM d, yyyy")}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-0.5">
          {!b.isAcknowledged && (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 rounded-lg" onClick={onAck} disabled={ackPending}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              {ackPending ? "Confirming…" : "Acknowledge"}
            </Button>
          )}
          {b.isMobilization && !b.myResponse && (
            <>
              <Button size="sm" className="h-8 text-xs gap-1.5 rounded-lg bg-green-600 hover:bg-green-700" onClick={() => onRespond("im_in")} disabled={respPending}>
                <ThumbsUp className="w-3.5 h-3.5" />
                I'm In
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 rounded-lg border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => onRespond("need_info")} disabled={respPending}>
                <HelpCircle className="w-3.5 h-3.5" />
                Need More Info
              </Button>
            </>
          )}
          {b.myResponse && (
            <span className={cn("flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg", b.myResponse === "im_in" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>
              {b.myResponse === "im_in" ? <><ThumbsUp className="w-3 h-3" /> I'm In</> : <><HelpCircle className="w-3 h-3" /> Need More Info</>}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const QUERY_KEY = ["/member-portal/bulletins"];

export default function MemberPortalBulletins() {
  const queryClient = useQueryClient();

  const { data: bulletins = [], isLoading } = useQuery<Bulletin[]>({
    queryKey: QUERY_KEY,
    queryFn: () => fetch(`${BASE}/api/member-portal/bulletins`, { credentials: "include" }).then((r) => r.json()),
    staleTime: 30_000,
  });

  const ackMutation = useMutation({
    mutationFn: (id: number) => postJson(`${BASE}/api/announcements/${id}/acknowledge`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const respondMutation = useMutation({
    mutationFn: ({ id, response }: { id: number; response: string }) => postJson(`${BASE}/api/announcements/${id}/respond`, { response }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const urgent   = bulletins.filter((b) => b.isUrgent || b.urgencyLevel === "critical" || b.urgencyLevel === "high");
  const regular  = bulletins.filter((b) => !b.isUrgent && b.urgencyLevel !== "critical" && b.urgencyLevel !== "high");

  return (
    <MemberPortalLayout>
      <div className="p-4 space-y-4 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
        <div>
          <h1 className="text-xl font-bold text-foreground">Bulletins</h1>
          <p className="text-xs text-muted-foreground">Union announcements</p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : bulletins.length === 0 ? (
          <Card className="border-dashed border-border/60">
            <CardContent className="p-8 flex flex-col items-center gap-3 text-center">
              <Bell className="w-10 h-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No bulletins yet</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {urgent.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Urgent
                </p>
                {urgent.map((b) => (
                  <BulletinCard
                    key={b.id}
                    b={b}
                    onAck={() => ackMutation.mutate(b.id)}
                    onRespond={(r) => respondMutation.mutate({ id: b.id, response: r })}
                    ackPending={ackMutation.isPending}
                    respPending={respondMutation.isPending}
                  />
                ))}
              </div>
            )}
            {regular.length > 0 && (
              <div className="space-y-2">
                {urgent.length > 0 && <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">All Bulletins</p>}
                {regular.map((b) => (
                  <BulletinCard
                    key={b.id}
                    b={b}
                    onAck={() => ackMutation.mutate(b.id)}
                    onRespond={(r) => respondMutation.mutate({ id: b.id, response: r })}
                    ackPending={ackMutation.isPending}
                    respPending={respondMutation.isPending}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </MemberPortalLayout>
  );
}
