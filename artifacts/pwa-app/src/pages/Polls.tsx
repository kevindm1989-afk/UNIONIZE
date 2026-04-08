import { useState } from "react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Vote, Plus, Check, Loader2, Clock, Lock } from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { format, parseISO, isAfter } from "date-fns";
import { cn } from "@/lib/utils";
import { useAuth } from "@/App";

const fetchJson = async (url: string, opts?: RequestInit) => {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
};

interface Poll {
  id: number;
  title: string;
  description: string | null;
  pollType: "yes_no" | "multiple_choice";
  options: string[];
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  userResponse: string | null;
  isExpired: boolean;
  targetRole: "all" | "member" | "steward";
}

interface PollResults {
  poll: Poll;
  total: number;
  results: Array<{ response: string; count: number }>;
}

function PollCard({ poll, onVote, onViewResults, isAdmin }: {
  poll: Poll;
  onVote: (pollId: number, response: string) => void;
  onViewResults: (pollId: number) => void;
  isAdmin: boolean;
}) {
  const [localVote, setLocalVote] = useState<string | null>(null);
  const voted = poll.userResponse ?? localVote;
  const expired = poll.isExpired;
  const daysLeft = Math.ceil((new Date(poll.endsAt).getTime() - Date.now()) / 86400000);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-foreground leading-snug">{poll.title}</p>
            {poll.description && <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{poll.description}</p>}
          </div>
          {expired ? (
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border bg-gray-100 text-gray-600 border-gray-200 flex-shrink-0">
              <Lock className="w-2.5 h-2.5 inline mr-0.5" />Closed
            </span>
          ) : (
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border bg-green-100 text-green-700 border-green-200 flex-shrink-0">
              Active
            </span>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {expired ? `Closed ${format(parseISO(poll.endsAt), "MMM d, yyyy")}` : `Closes ${format(parseISO(poll.endsAt), "MMM d")} (${daysLeft}d left)`}
        </p>
      </div>

      {!expired && !voted && (
        <div className="px-4 pb-4 space-y-2">
          {poll.pollType === "yes_no" ? (
            <div className="flex gap-2">
              {["Yes", "No"].map((opt) => (
                <button
                  key={opt}
                  onClick={() => { setLocalVote(opt); onVote(poll.id, opt); }}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all active:scale-95",
                    opt === "Yes"
                      ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
                      : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              {poll.options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => { setLocalVote(opt); onVote(poll.id, opt); }}
                  className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors"
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {voted && !expired && (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-xl px-3 py-2.5 border border-green-200 dark:border-green-800">
            <Check className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm font-semibold">You voted: <strong>{voted}</strong></span>
          </div>
        </div>
      )}

      {(expired || isAdmin) && (
        <div className="border-t border-border px-4 py-2">
          <button
            onClick={() => onViewResults(poll.id)}
            className="text-xs font-semibold text-primary hover:underline"
          >
            View Results →
          </button>
        </div>
      )}
    </div>
  );
}

function ResultsModal({ pollId, onClose }: { pollId: number; onClose: () => void }) {
  const { data, isLoading } = useQuery<PollResults>({
    queryKey: ["poll-results", pollId],
    queryFn: () => fetchJson(`/api/polls/${pollId}/results`),
  });

  const max = data ? Math.max(...data.results.map((r) => r.count), 1) : 1;

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[80dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{data?.poll.title ?? "Poll Results"}</SheetTitle>
        </SheetHeader>
        {isLoading ? (
          <div className="pt-4 space-y-3"><Skeleton className="h-10 rounded-xl" /><Skeleton className="h-10 rounded-xl" /></div>
        ) : !data ? (
          <p className="text-center text-muted-foreground py-6">Results not available.</p>
        ) : (
          <div className="pt-4 space-y-3">
            <p className="text-xs text-muted-foreground">{data.total} total response{data.total !== 1 ? "s" : ""}</p>
            {data.results.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No responses yet</p>
            ) : (
              data.results.map((r) => (
                <div key={r.response} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{r.response}</span>
                    <span className="text-xs text-muted-foreground">{r.count} ({data.total > 0 ? Math.round((r.count / data.total) * 100) : 0}%)</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-2 bg-primary rounded-full transition-all"
                      style={{ width: `${(r.count / max) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
            <Button onClick={onClose} variant="outline" className="w-full rounded-xl mt-2">Close</Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function Polls() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "chair";
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [viewResultsId, setViewResultsId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState("yes_no");
  const [newOptions, setNewOptions] = useState("");
  const [newEndsAt, setNewEndsAt] = useState("");
  const [newTarget, setNewTarget] = useState("all");

  const { data: polls = [], isLoading } = useQuery<Poll[]>({
    queryKey: ["polls"],
    queryFn: () => fetchJson("/api/polls"),
    staleTime: 30_000,
  });

  const voteMutation = useMutation({
    mutationFn: ({ pollId, response }: { pollId: number; response: string }) =>
      fetchJson(`/api/polls/${pollId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["polls"] }),
  });

  const createMutation = useMutation({
    mutationFn: (body: object) => fetchJson("/api/polls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["polls"] });
      setShowCreate(false);
      setNewTitle(""); setNewDesc(""); setNewType("yes_no"); setNewOptions(""); setNewEndsAt(""); setNewTarget("all");
    },
  });

  const activePollCount = polls.filter((p) => !p.isExpired).length;

  return (
    <MobileLayout>
      <div className="min-h-full flex flex-col bg-background">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 h-14 flex items-center gap-3">
          <Link href="/" className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <Vote className="w-5 h-5 text-primary" />
          <span className="font-bold tracking-tight text-sm uppercase flex-1">Polls & Voting</span>
          {isAdmin && (
            <Button size="sm" onClick={() => setShowCreate(true)} className="rounded-xl gap-1.5 text-xs h-8 px-3">
              <Plus className="w-3.5 h-3.5" /> Poll
            </Button>
          )}
        </header>

        {activePollCount > 0 && (
          <div className="mx-5 mt-5 bg-primary/10 border border-primary/20 rounded-xl px-4 py-2.5">
            <p className="text-xs font-bold text-primary">{activePollCount} active poll{activePollCount !== 1 ? "s" : ""} — your voice counts</p>
          </div>
        )}

        <div className="p-5 space-y-4 pb-8">
          {isLoading ? (
            Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
          ) : polls.length === 0 ? (
            <div className="text-center py-16 bg-card rounded-xl border border-dashed border-border">
              <Vote className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-sm text-muted-foreground font-medium">No polls available</p>
            </div>
          ) : (
            polls.map((poll) => (
              <PollCard
                key={poll.id}
                poll={poll}
                onVote={(id, r) => voteMutation.mutate({ pollId: id, response: r })}
                onViewResults={setViewResultsId}
                isAdmin={isAdmin}
              />
            ))
          )}
        </div>

        {/* Create Poll Sheet */}
        <Sheet open={showCreate} onOpenChange={setShowCreate}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[92dvh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Create Poll</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 pt-4 pb-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Question</label>
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="What do members think about...?" className="h-12 rounded-xl bg-card" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description (optional)</label>
                <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Additional context..." className="rounded-xl bg-card resize-none min-h-[60px]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Poll Type</label>
                  <Select value={newType} onValueChange={setNewType}>
                    <SelectTrigger className="h-12 rounded-xl bg-card"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="yes_no">Yes / No</SelectItem>
                      <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Audience</label>
                  <Select value={newTarget} onValueChange={setNewTarget}>
                    <SelectTrigger className="h-12 rounded-xl bg-card"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="all">Everyone</SelectItem>
                      <SelectItem value="steward">Stewards Only</SelectItem>
                      <SelectItem value="member">Members Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {newType === "multiple_choice" && (
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Options (one per line)</label>
                  <Textarea value={newOptions} onChange={(e) => setNewOptions(e.target.value)} placeholder={"Option A\nOption B\nOption C"} className="rounded-xl bg-card resize-none min-h-[80px]" />
                </div>
              )}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Closes On</label>
                <Input type="date" value={newEndsAt} onChange={(e) => setNewEndsAt(e.target.value)} className="h-12 rounded-xl bg-card" min={new Date().toISOString().split("T")[0]} />
              </div>
              <Button
                onClick={() => createMutation.mutate({
                  title: newTitle,
                  description: newDesc || null,
                  pollType: newType,
                  options: newType === "multiple_choice" ? newOptions.split("\n").map((o) => o.trim()).filter(Boolean) : [],
                  endsAt: newEndsAt ? new Date(newEndsAt + "T23:59:59").toISOString() : null,
                  targetRole: newTarget,
                })}
                disabled={!newTitle.trim() || !newEndsAt || createMutation.isPending}
                className="w-full h-12 rounded-xl"
              >
                {createMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Create Poll"}
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        {viewResultsId !== null && (
          <ResultsModal pollId={viewResultsId} onClose={() => setViewResultsId(null)} />
        )}
      </div>
    </MobileLayout>
  );
}
