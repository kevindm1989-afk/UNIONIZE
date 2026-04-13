import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { MobileLayout } from "@/components/layout/MobileLayout";
import {
  useGetAnnouncement,
  useDeleteAnnouncement,
  getGetAnnouncementQueryKey,
  getListAnnouncementsQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetRecentActivityQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, Trash2, Bell, Users, CheckCircle2, Clock, Send, ThumbsUp, HelpCircle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/App";

const categoryColors: Record<string, string> = {
  urgent:        "bg-red-100 text-red-800 border-red-200",
  safety_alert:  "bg-orange-100 text-orange-800 border-orange-200",
  strike_action: "bg-red-100 text-red-900 border-red-300",
  job_action:    "bg-red-100 text-red-800 border-red-300",
  vote_notice:   "bg-purple-100 text-purple-800 border-purple-200",
  policy_change: "bg-teal-100 text-teal-800 border-teal-200",
  contract:      "bg-blue-100 text-blue-800 border-blue-200",
  meeting:       "bg-purple-100 text-purple-800 border-purple-200",
  action:        "bg-orange-100 text-orange-800 border-orange-200",
  general:       "bg-gray-100 text-gray-700 border-gray-200",
};

const categoryLabels: Record<string, string> = {
  safety_alert:  "Safety Alert",
  strike_action: "Strike Action",
  job_action:    "Job Action",
  vote_notice:   "Vote Notice",
  policy_change: "Policy Change",
  urgent: "Urgent", contract: "Contract", meeting: "Meeting", action: "Action", general: "General",
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface AckData {
  totalMembers: number;
  acknowledgedCount: number;
  acknowledgedRate: number;
  acknowledged: { memberId: number; name: string; department: string | null; shift: string | null; acknowledgedAt: string }[];
  unacknowledged: { memberId: number; name: string; department: string | null; shift: string | null }[];
}

interface ResponseData {
  totalResponses: number;
  imIn: { memberId: number; name: string; department: string | null; respondedAt: string }[];
  needInfo: { memberId: number; name: string; department: string | null; respondedAt: string }[];
}

export default function BulletinDetail() {
  const { id } = useParams<{ id: string }>();
  const announcementId = parseInt(id || "0", 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const [showAck, setShowAck] = useState(false);
  const [showResponses, setShowResponses] = useState(false);
  const [notifyStatus, setNotifyStatus] = useState<string | null>(null);

  const isSteward = can("bulletins.manage") || can("members.view");

  const { data: announcement, isLoading } = useGetAnnouncement(announcementId, {
    query: { enabled: !!announcementId, queryKey: getGetAnnouncementQueryKey(announcementId) },
  });

  const deleteAnnouncement = useDeleteAnnouncement({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
        setLocation("/bulletins");
      },
    },
  });

  const { data: ackData, isLoading: ackLoading } = useQuery<AckData>({
    queryKey: ["bulletin-acks", announcementId],
    queryFn: () => fetch(`${BASE}/api/announcements/${announcementId}/acknowledgements`, { credentials: "include" }).then((r) => r.json()),
    enabled: isSteward && showAck && !!announcementId,
    staleTime: 30_000,
  });

  const { data: responseData, isLoading: respLoading } = useQuery<ResponseData>({
    queryKey: ["bulletin-responses", announcementId],
    queryFn: () => fetch(`${BASE}/api/announcements/${announcementId}/responses`, { credentials: "include" }).then((r) => r.json()),
    enabled: isSteward && showResponses && !!announcementId,
    staleTime: 30_000,
  });

  const notifyUnacked = useMutation({
    mutationFn: () => fetch(`${BASE}/api/announcements/${announcementId}/notify-unacknowledged`, {
      method: "POST", credentials: "include",
    }).then((r) => r.json()),
    onSuccess: (data: any) => {
      setNotifyStatus(`Push sent to ${data.notifiedCount} unacknowledged member${data.notifiedCount !== 1 ? "s" : ""}`);
      setTimeout(() => setNotifyStatus(null), 5000);
    },
  });

  const handleDelete = () => deleteAnnouncement.mutate({ id: announcementId });

  if (isLoading) {
    return (
      <MobileLayout>
        <div className="p-5 space-y-4">
          <Skeleton className="h-8 w-3/4 rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </MobileLayout>
    );
  }

  if (!announcement) return null;

  const isMobilization = (announcement as any).isMobilization ?? ["job_action", "strike_action", "action"].includes(announcement.category);

  return (
    <MobileLayout>
      <div className="min-h-full flex flex-col bg-background">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 h-14 flex items-center justify-between">
          <Link href="/bulletins" className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <span className="font-bold text-sm uppercase tracking-wider">Bulletin</span>
          {can("bulletins.manage") && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10">
                  <Trash2 className="w-5 h-5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-[320px] rounded-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this bulletin?</AlertDialogTitle>
                  <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col gap-2">
                  <AlertDialogCancel className="w-full">Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive w-full">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </header>

        <div className="p-5 space-y-5 flex-1">
          {announcement.isUrgent && (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/40 rounded-xl px-4 py-2.5">
              <Bell className="w-4 h-4 text-red-600 shrink-0" />
              <span className="text-sm font-bold text-red-700 dark:text-red-400 uppercase tracking-wider">Urgent Announcement</span>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("text-[10px] uppercase font-bold px-2 py-0.5 rounded border", categoryColors[announcement.category] ?? categoryColors.general)}>
                {categoryLabels[announcement.category] ?? announcement.category}
              </span>
              <span className="text-xs text-muted-foreground">{format(new Date(announcement.publishedAt), "MMMM d, yyyy 'at' h:mm a")}</span>
              {(announcement as any).scheduledFor && !(announcement as any).isPublished && (
                <span className="flex items-center gap-1 text-[10px] text-blue-600 font-semibold">
                  <Clock className="w-3 h-3" />Scheduled
                </span>
              )}
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-foreground leading-snug">{announcement.title}</h1>
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{announcement.content}</p>
          </div>

          {(announcement as any).expiresAt && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Expires {format(new Date((announcement as any).expiresAt), "MMM d, yyyy 'at' h:mm a")}
            </p>
          )}

          {isSteward && (
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Steward Tools</p>

              <button
                onClick={() => setShowAck((v) => !v)}
                className="w-full flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-semibold">Acknowledgement Dashboard</span>
                </div>
                {ackData && (
                  <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", ackData.acknowledgedRate >= 75 ? "bg-green-100 text-green-700" : ackData.acknowledgedRate >= 40 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700")}>
                    {ackData.acknowledgedRate}%
                  </span>
                )}
              </button>

              {showAck && (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  {ackLoading ? (
                    <div className="p-4 space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div>
                  ) : ackData ? (
                    <div>
                      <div className="p-4 border-b border-border">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="text-2xl font-black">{ackData.acknowledgedCount}<span className="text-sm font-normal text-muted-foreground">/{ackData.totalMembers}</span></p>
                            <p className="text-xs text-muted-foreground">members acknowledged</p>
                          </div>
                          <div className={cn("text-2xl font-black", ackData.acknowledgedRate >= 75 ? "text-green-600" : ackData.acknowledgedRate >= 40 ? "text-amber-600" : "text-red-600")}>
                            {ackData.acknowledgedRate}%
                          </div>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all", ackData.acknowledgedRate >= 75 ? "bg-green-500" : ackData.acknowledgedRate >= 40 ? "bg-amber-500" : "bg-red-500")}
                            style={{ width: `${ackData.acknowledgedRate}%` }} />
                        </div>
                        {ackData.unacknowledged.length > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-3 gap-2 text-xs"
                            disabled={notifyUnacked.isPending}
                            onClick={() => notifyUnacked.mutate()}
                          >
                            <Send className="w-3.5 h-3.5" />
                            {notifyUnacked.isPending ? "Sending…" : `Send follow-up push (${ackData.unacknowledged.length})`}
                          </Button>
                        )}
                        {notifyStatus && <p className="text-xs text-green-600 font-medium mt-2">{notifyStatus}</p>}
                      </div>
                      {ackData.unacknowledged.length > 0 && (
                        <div className="p-4">
                          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Not Yet Acknowledged ({ackData.unacknowledged.length})</p>
                          <div className="space-y-1">
                            {ackData.unacknowledged.slice(0, 10).map((m) => (
                              <div key={m.memberId} className="flex items-center justify-between py-1.5">
                                <span className="text-sm font-medium">{m.name}</span>
                                <span className="text-xs text-muted-foreground">{m.department ?? ""}</span>
                              </div>
                            ))}
                            {ackData.unacknowledged.length > 10 && (
                              <p className="text-xs text-muted-foreground pt-1">+{ackData.unacknowledged.length - 10} more</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}

              {isMobilization && (
                <>
                  <button
                    onClick={() => setShowResponses((v) => !v)}
                    className="w-full flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-semibold">Mobilization Responses</span>
                    </div>
                    {responseData && (
                      <span className="text-xs font-semibold text-muted-foreground">
                        {responseData.imIn.length} In · {responseData.needInfo.length} Need Info
                      </span>
                    )}
                  </button>

                  {showResponses && (
                    <div className="bg-card border border-border rounded-xl overflow-hidden">
                      {respLoading ? (
                        <div className="p-4 space-y-2"><Skeleton className="h-4 w-full" /></div>
                      ) : responseData ? (
                        <div className="p-4 space-y-4">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 rounded-xl p-3 text-center">
                              <ThumbsUp className="w-5 h-5 text-green-600 mx-auto mb-1" />
                              <p className="text-2xl font-black text-green-700">{responseData.imIn.length}</p>
                              <p className="text-xs text-green-600 font-semibold">I'm In</p>
                            </div>
                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-xl p-3 text-center">
                              <HelpCircle className="w-5 h-5 text-amber-600 mx-auto mb-1" />
                              <p className="text-2xl font-black text-amber-700">{responseData.needInfo.length}</p>
                              <p className="text-xs text-amber-600 font-semibold">Need Info</p>
                            </div>
                          </div>
                          {responseData.needInfo.length > 0 && (
                            <div>
                              <p className="text-xs font-bold uppercase tracking-wider text-amber-600 mb-2 flex items-center gap-1">
                                <HelpCircle className="w-3 h-3" /> Need Follow-up
                              </p>
                              <div className="space-y-1">
                                {responseData.needInfo.map((m) => (
                                  <div key={m.memberId} className="flex items-center justify-between py-1">
                                    <span className="text-sm font-medium">{m.name}</span>
                                    <span className="text-xs text-muted-foreground">{m.department ?? ""}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
