import { useState, useRef } from "react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, Trophy, Plus, Check, Loader2, Clock, Lock, Shield,
  Printer, AlertCircle, CheckCircle2, XCircle, Info, X
} from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { useAuth } from "@/App";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type FormalVoteType =
  | "ratification"
  | "strike_vote"
  | "officer_election"
  | "return_to_work"
  | "special_resolution";

interface Election {
  id: number;
  title: string;
  description: string | null;
  formalVoteType: FormalVoteType;
  formalVoteTypeLabel: string;
  options: string[];
  quorumRequired: number | null;
  quorumMet: boolean | null;
  startsAt: string | null;
  endsAt: string;
  closedAt: string | null;
  outcome: string | null;
  resultsFinal: any | null;
  isActive: boolean;
  isClosed: boolean;
  hasCast: boolean;
  createdBy: number | null;
  createdAt: string | null;
}

interface TallyRow { choice: string; count: number }
interface TallyData {
  poll: {
    id: number; title: string; formalVoteType: string; formalVoteTypeLabel: string;
    quorumRequired: number | null; quorumMet: boolean | null; closedAt: string | null;
    outcome: string | null; endsAt: string;
  };
  tally: TallyRow[];
  total: number;
  quorumRequired: number | null;
  quorumMet: boolean | null;
}

interface Certificate {
  organization: string;
  voteId: number;
  title: string;
  description: string | null;
  formalVoteType: string;
  formalVoteTypeLabel: string;
  openedAt: string;
  closedAt: string;
  quorumRequired: number | null;
  quorumMet: boolean | null;
  totalBallotsCast: number;
  tally: TallyRow[];
  outcome: string | null;
  officialResult: string;
  createdBy: string;
  certificateGeneratedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fetchJson = async (url: string, opts?: RequestInit) => {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body?.error ?? "Request failed"), { status: res.status, body });
  }
  return res.json();
};

const VOTE_TYPE_COLORS: Record<FormalVoteType, string> = {
  ratification:      "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  strike_vote:       "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
  officer_election:  "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
  return_to_work:    "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
  special_resolution:"bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
};

function VoteTypeBadge({ type, label }: { type: FormalVoteType; label: string }) {
  return (
    <span className={cn(
      "text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border flex-shrink-0",
      VOTE_TYPE_COLORS[type] ?? "bg-muted text-muted-foreground border-border"
    )}>
      {label}
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const carried = outcome.toLowerCase().includes("carried") || outcome.toLowerCase().includes("elected");
  const failed = outcome.toLowerCase().includes("failed") || outcome.toLowerCase().includes("inquorate");
  return (
    <span className={cn(
      "text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border flex-shrink-0 flex items-center gap-0.5",
      carried && !failed
        ? "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800"
        : "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800"
    )}>
      {carried && !failed ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
      {outcome}
    </span>
  );
}

// ─── Cast Ballot Sheet ────────────────────────────────────────────────────────

function CastBallotSheet({ election, onClose }: { election: Election; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [writeIn, setWriteIn] = useState("");

  const isWriteInOption = selected === "Write-in (specify below)";
  const finalChoice = isWriteInOption ? (writeIn.trim() ? `Write-in: ${writeIn.trim()}` : null) : selected;

  const mutation = useMutation({
    mutationFn: (choice: string) =>
      fetchJson(`/api/elections/${election.id}/ballot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choice }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["elections"] });
      toast({ title: "Ballot cast", description: "Your secret ballot has been recorded." });
      onClose();
    },
    onError: (err: any) => {
      toast({
        title: "Could not cast ballot",
        description: err?.body?.error ?? err?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">{election.title}</SheetTitle>
        </SheetHeader>
        <div className="pt-3 space-y-4 pb-6">
          {/* Vote type + secret ballot notice */}
          <div className="flex items-start gap-3 bg-primary/5 border border-primary/15 rounded-xl px-3 py-3">
            <Shield className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <VoteTypeBadge type={election.formalVoteType} label={election.formalVoteTypeLabel} />
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                This is a <strong>secret ballot</strong>. Your vote is anonymous — only the final tally will be visible. No one can see how you voted.
              </p>
            </div>
          </div>

          {election.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{election.description}</p>
          )}

          {/* Ballot options */}
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Select Your Choice</p>
            {election.options.map((opt) => (
              <button
                key={opt}
                onClick={() => { setSelected(opt); setWriteIn(""); }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium border transition-all text-left",
                  selected === opt
                    ? "bg-primary/10 border-primary text-primary"
                    : "bg-card border-border text-foreground hover:bg-muted/50"
                )}
              >
                <div className={cn(
                  "w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center",
                  selected === opt ? "border-primary bg-primary" : "border-muted-foreground"
                )}>
                  {selected === opt && <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3} />}
                </div>
                {opt}
              </button>
            ))}

            {/* Write-in text input */}
            {isWriteInOption && (
              <div className="pt-1">
                <Input
                  value={writeIn}
                  onChange={(e) => setWriteIn(e.target.value)}
                  placeholder="Enter candidate name..."
                  className="h-11 rounded-xl bg-card"
                  autoFocus
                />
              </div>
            )}
          </div>

          {/* Submit */}
          <Button
            onClick={() => { if (finalChoice) mutation.mutate(finalChoice); }}
            disabled={!finalChoice || mutation.isPending}
            className="w-full h-12 rounded-xl gap-2"
          >
            {mutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-4 h-4" />}
            Submit Secret Ballot
          </Button>
          <p className="text-[10px] text-center text-muted-foreground">
            Once submitted, your ballot cannot be changed.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Tally Sheet (Admin live view) ───────────────────────────────────────────

function TallySheet({ electionId, onClose }: { electionId: number; onClose: () => void }) {
  const { data, isLoading } = useQuery<TallyData>({
    queryKey: ["election-tally", electionId],
    queryFn: () => fetchJson(`/api/elections/${electionId}/tally`),
    refetchInterval: 10_000,
  });

  const max = data ? Math.max(...data.tally.map((r) => r.count), 1) : 1;

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[80dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Live Tally — {data?.poll.title ?? "Vote Results"}</SheetTitle>
        </SheetHeader>
        {isLoading ? (
          <div className="pt-4 space-y-3">
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
          </div>
        ) : !data ? (
          <p className="text-center text-muted-foreground py-6">Results not available.</p>
        ) : (
          <div className="pt-4 space-y-4 pb-6">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{data.total} ballot{data.total !== 1 ? "s" : ""} cast</span>
              {data.quorumRequired && (
                <span className={cn(
                  "font-semibold",
                  data.total >= data.quorumRequired ? "text-green-600" : "text-amber-600"
                )}>
                  Quorum: {data.total}/{data.quorumRequired}
                  {data.total >= data.quorumRequired ? " ✓" : " (not yet met)"}
                </span>
              )}
            </div>
            {data.tally.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No ballots cast yet</p>
            ) : (
              data.tally.map((r) => (
                <div key={r.choice} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{r.choice}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {r.count} ({data.total > 0 ? Math.round((r.count / data.total) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${(r.count / max) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
            {data.poll.outcome && (
              <div className="border-t border-border pt-3 mt-2">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Official Outcome</p>
                <OutcomeBadge outcome={data.poll.outcome} />
              </div>
            )}
            <Button onClick={onClose} variant="outline" className="w-full rounded-xl">Close</Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Certificate View ─────────────────────────────────────────────────────────

function CertificateSheet({ electionId, onClose }: { electionId: number; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);
  const { data: cert, isLoading } = useQuery<Certificate>({
    queryKey: ["election-certificate", electionId],
    queryFn: () => fetchJson(`/api/elections/${electionId}/certificate`),
  });

  const handlePrint = () => {
    if (!printRef.current) return;
    const content = printRef.current.innerHTML;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>Official Vote Certificate — ${cert?.title ?? ""}</title>
          <style>
            body { font-family: Georgia, serif; max-width: 680px; margin: 40px auto; padding: 0 20px; color: #111; }
            .header { text-align: center; border-bottom: 3px double #000; padding-bottom: 16px; margin-bottom: 24px; }
            .org { font-size: 13px; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; color: #444; }
            .cert-title { font-size: 22px; font-weight: bold; margin: 8px 0 4px; }
            .cert-sub { font-size: 13px; color: #555; }
            .section { margin: 20px 0; }
            .section-title { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #666; margin-bottom: 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
            .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
            .row .label { color: #555; }
            .row .value { font-weight: bold; }
            .tally-bar { background: #eee; height: 16px; border-radius: 4px; overflow: hidden; margin: 4px 0 8px; }
            .tally-fill { height: 100%; background: #1a1a1a; border-radius: 4px; }
            .outcome { text-align: center; margin: 28px 0; padding: 16px; border: 2px solid #000; border-radius: 6px; }
            .outcome-label { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #666; }
            .outcome-value { font-size: 28px; font-weight: bold; margin: 6px 0 0; }
            .footer { text-align: center; margin-top: 40px; padding-top: 16px; border-top: 1px solid #ccc; font-size: 11px; color: #888; }
            .quorum-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
            .quorum-met { background: #dcfce7; color: #166534; }
            .quorum-not-met { background: #fee2e2; color: #991b1b; }
            .quorum-na { background: #f3f4f6; color: #6b7280; }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 300);
  };

  const max = cert ? Math.max(...cert.tally.map((r) => r.count), 1) : 1;

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[92dvh] overflow-y-auto">
        <SheetHeader className="flex-row items-center justify-between">
          <SheetTitle>Results Certificate</SheetTitle>
          <Button size="sm" variant="outline" onClick={handlePrint} className="rounded-xl gap-1.5 h-8 px-3 text-xs">
            <Printer className="w-3.5 h-3.5" /> Print
          </Button>
        </SheetHeader>

        {isLoading ? (
          <div className="pt-4 space-y-3">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
        ) : !cert ? (
          <p className="text-center text-muted-foreground py-6">Certificate not available.</p>
        ) : (
          <div className="pt-4 pb-6">
            <div ref={printRef}>
              {/* Certificate content — styled for both screen and print */}
              <div className="header text-center border-b-2 border-foreground pb-4 mb-5">
                <p className="org text-[10px] font-black uppercase tracking-[3px] text-muted-foreground">{cert.organization}</p>
                <p className="cert-title text-lg font-black mt-1 leading-tight">OFFICIAL VOTE RESULT CERTIFICATE</p>
                <p className="cert-sub text-xs text-muted-foreground mt-1">{cert.formalVoteTypeLabel}</p>
              </div>

              {/* Vote details */}
              <div className="section space-y-3 mb-5">
                <p className="section-title text-[9px] font-black uppercase tracking-wider text-muted-foreground border-b border-border pb-1">Vote Details</p>
                <div className="bg-muted/30 rounded-xl p-3 space-y-2">
                  <div className="row flex justify-between text-sm">
                    <span className="label text-muted-foreground">Question / Motion</span>
                    <span className="value font-bold text-right max-w-[55%]">{cert.title}</span>
                  </div>
                  {cert.description && (
                    <div className="row flex justify-between text-sm">
                      <span className="label text-muted-foreground">Description</span>
                      <span className="value text-right max-w-[55%] text-xs">{cert.description}</span>
                    </div>
                  )}
                  <div className="row flex justify-between text-sm">
                    <span className="label text-muted-foreground">Vote Opened</span>
                    <span className="value font-semibold">{format(parseISO(cert.openedAt), "MMM d, yyyy 'at' h:mm a")}</span>
                  </div>
                  <div className="row flex justify-between text-sm">
                    <span className="label text-muted-foreground">Vote Closed</span>
                    <span className="value font-semibold">{format(parseISO(cert.closedAt), "MMM d, yyyy 'at' h:mm a")}</span>
                  </div>
                </div>
              </div>

              {/* Participation & Quorum */}
              <div className="section space-y-3 mb-5">
                <p className="section-title text-[9px] font-black uppercase tracking-wider text-muted-foreground border-b border-border pb-1">Participation & Quorum</p>
                <div className="bg-muted/30 rounded-xl p-3 space-y-2">
                  <div className="row flex justify-between text-sm">
                    <span className="label text-muted-foreground">Total Ballots Cast</span>
                    <span className="value font-bold text-lg">{cert.totalBallotsCast}</span>
                  </div>
                  {cert.quorumRequired ? (
                    <>
                      <div className="row flex justify-between text-sm">
                        <span className="label text-muted-foreground">Quorum Required</span>
                        <span className="value font-semibold">{cert.quorumRequired} votes</span>
                      </div>
                      <div className="row flex justify-between text-sm items-center">
                        <span className="label text-muted-foreground">Quorum Status</span>
                        <span className={cn(
                          "quorum-badge text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                          cert.quorumMet === true
                            ? "quorum-met bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                            : cert.quorumMet === false
                              ? "quorum-not-met bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                              : "quorum-na bg-muted text-muted-foreground"
                        )}>
                          {cert.quorumMet === true ? "Quorum Met ✓" : cert.quorumMet === false ? "Inquorate ✗" : "N/A"}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="row flex justify-between text-sm">
                      <span className="label text-muted-foreground">Quorum</span>
                      <span className="value text-muted-foreground">Not required</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Tally */}
              <div className="section space-y-3 mb-5">
                <p className="section-title text-[9px] font-black uppercase tracking-wider text-muted-foreground border-b border-border pb-1">Ballot Tally</p>
                <div className="space-y-3">
                  {cert.tally.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-3">No ballots were cast.</p>
                  ) : (
                    cert.tally.map((r) => (
                      <div key={r.choice} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold">{r.choice}</span>
                          <span className="text-xs font-mono text-muted-foreground">
                            {r.count} votes ({cert.totalBallotsCast > 0 ? Math.round((r.count / cert.totalBallotsCast) * 100) : 0}%)
                          </span>
                        </div>
                        <div className="tally-bar h-3 bg-muted rounded-full overflow-hidden">
                          <div
                            className="tally-fill h-full bg-foreground rounded-full transition-all"
                            style={{ width: `${(r.count / max) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Official Result */}
              <div className="outcome text-center border-2 border-foreground rounded-xl px-4 py-5 mb-4">
                <p className="outcome-label text-[9px] font-black uppercase tracking-[3px] text-muted-foreground">Official Result</p>
                <p className="outcome-value text-3xl font-black mt-2 leading-tight">{cert.officialResult}</p>
              </div>

              {/* Footer */}
              <div className="footer text-center mt-6 pt-4 border-t border-border space-y-0.5">
                <p className="text-[10px] text-muted-foreground">Conducted by: <strong>{cert.createdBy}</strong> · {cert.organization}</p>
                <p className="text-[10px] text-muted-foreground">Certificate generated: {format(parseISO(cert.certificateGeneratedAt), "MMM d, yyyy 'at' h:mm a")}</p>
                <p className="text-[10px] text-muted-foreground italic mt-1">This certificate constitutes the official record of this vote as conducted under the union's bylaws.</p>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <Button onClick={handlePrint} className="flex-1 h-11 rounded-xl gap-2">
                <Printer className="w-4 h-4" /> Print Certificate
              </Button>
              <Button onClick={onClose} variant="outline" className="flex-1 h-11 rounded-xl">Close</Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Create Election Sheet ────────────────────────────────────────────────────

const VOTE_TYPE_OPTIONS = [
  { value: "ratification",      label: "Ratification Vote" },
  { value: "strike_vote",       label: "Strike Vote" },
  { value: "officer_election",  label: "Officer Election" },
  { value: "return_to_work",    label: "Return to Work Vote" },
  { value: "special_resolution",label: "Special Resolution" },
] as const;

function CreateElectionSheet({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [voteType, setVoteType] = useState<FormalVoteType>("ratification");
  const [candidates, setCandidates] = useState("");
  const [quorum, setQuorum] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const isOfficerElection = voteType === "officer_election";

  const mutation = useMutation({
    mutationFn: (body: object) => fetchJson("/api/elections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["elections"] });
      toast({ title: "Formal vote created", description: "Push notification sent to all members." });
      onClose();
    },
    onError: (err: any) => {
      toast({
        title: "Failed to create vote",
        description: err?.body?.error ?? err?.message,
        variant: "destructive",
      });
    },
  });

  const handleCreate = () => {
    const payload: any = {
      title: title.trim(),
      description: description.trim() || null,
      formalVoteType: voteType,
      endsAt: endsAt ? new Date(endsAt + "T23:59:59").toISOString() : null,
      quorumRequired: quorum ? parseInt(quorum, 10) : null,
    };
    if (isOfficerElection) {
      payload.options = candidates.split("\n").map((c) => c.trim()).filter(Boolean);
    }
    mutation.mutate(payload);
  };

  const canSubmit = title.trim() && endsAt
    && (!isOfficerElection || candidates.trim())
    && !mutation.isPending;

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Create Formal Vote</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 pt-4 pb-8">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Vote Type</label>
            <Select value={voteType} onValueChange={(v) => setVoteType(v as FormalVoteType)}>
              <SelectTrigger className="h-12 rounded-xl bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {VOTE_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {isOfficerElection ? "Position Being Elected" : "Question / Motion"}
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isOfficerElection ? "e.g. President, Your Local" : "e.g. Ratification of Proposed CBA 2025–2028"}
              className="h-12 rounded-xl bg-card"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description (optional)</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide any additional context for voters..."
              className="rounded-xl bg-card resize-none min-h-[64px]"
            />
          </div>

          {isOfficerElection && (
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Candidates (one per line)</label>
              <Textarea
                value={candidates}
                onChange={(e) => setCandidates(e.target.value)}
                placeholder={"John Smith\nMaria Garcia\nDavid Chen"}
                className="rounded-xl bg-card resize-none min-h-[80px]"
              />
              <p className="text-[10px] text-muted-foreground">A "Write-in" option is added automatically.</p>
            </div>
          )}

          {!isOfficerElection && (
            <div className="bg-muted/40 border border-border rounded-xl px-3 py-2.5">
              <p className="text-xs text-muted-foreground">
                <strong>Ballot options:</strong>{" "}
                {voteType === "ratification" && "Accept / Reject"}
                {voteType === "strike_vote" && "Authorize Strike / Do Not Authorize"}
                {voteType === "return_to_work" && "Yes, Return to Work / No"}
                {voteType === "special_resolution" && "In Favour / Opposed"}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Closes On</label>
              <Input
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="h-12 rounded-xl bg-card"
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Quorum Required</label>
              <Input
                type="number"
                value={quorum}
                onChange={(e) => setQuorum(e.target.value)}
                placeholder="e.g. 15"
                className="h-12 rounded-xl bg-card"
                min={1}
              />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground -mt-2">Leave quorum blank if not required.</p>

          <Button
            onClick={handleCreate}
            disabled={!canSubmit}
            className="w-full h-12 rounded-xl"
          >
            {mutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Create Formal Vote"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Election Card (Active) ───────────────────────────────────────────────────

function ActiveElectionCard({
  election,
  isAdmin,
  onCastBallot,
  onViewTally,
  onClose,
}: {
  election: Election;
  isAdmin: boolean;
  onCastBallot: (e: Election) => void;
  onViewTally: (id: number) => void;
  onClose: (id: number) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const daysLeft = Math.max(0, Math.ceil((new Date(election.endsAt).getTime() - Date.now()) / 86400000));

  const closeMutation = useMutation({
    mutationFn: () => fetchJson(`/api/elections/${election.id}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["elections"] });
      toast({ title: "Vote closed", description: `Outcome: ${data.outcome}` });
    },
    onError: (err: any) => {
      toast({ title: "Failed to close vote", description: err?.body?.error ?? err?.message, variant: "destructive" });
    },
  });

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 pt-4 pb-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <VoteTypeBadge type={election.formalVoteType} label={election.formalVoteTypeLabel} />
          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border bg-green-100 text-green-700 border-green-200 flex-shrink-0">
            Open
          </span>
        </div>
        <p className="font-bold text-sm text-foreground leading-snug">{election.title}</p>
        {election.description && (
          <p className="text-xs text-muted-foreground leading-snug">{election.description}</p>
        )}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {daysLeft > 0 ? `${daysLeft}d left` : "Closing today"} · {format(parseISO(election.endsAt), "MMM d")}
          </span>
          {election.quorumRequired && (
            <span className="flex items-center gap-1">
              <Shield className="w-3 h-3" />
              Quorum: {election.quorumRequired} votes needed
            </span>
          )}
        </div>
      </div>

      {/* Voting actions */}
      <div className="px-4 pb-4 space-y-2">
        {election.hasCast ? (
          <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-xl px-3 py-2.5 border border-green-200 dark:border-green-800">
            <Shield className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm font-semibold">Secret ballot cast</span>
          </div>
        ) : (
          <Button
            onClick={() => onCastBallot(election)}
            className="w-full h-11 rounded-xl gap-2"
          >
            <Shield className="w-4 h-4" />
            Cast Your Ballot
          </Button>
        )}

        {isAdmin && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewTally(election.id)}
              className="flex-1 h-9 rounded-xl text-xs gap-1.5"
            >
              <Info className="w-3.5 h-3.5" /> Live Tally
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (window.confirm("Close this vote and finalize results?")) {
                  closeMutation.mutate();
                }
              }}
              disabled={closeMutation.isPending}
              className="flex-1 h-9 rounded-xl text-xs gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              {closeMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
              Close Vote
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Election Card (Closed) ───────────────────────────────────────────────────

function ClosedElectionCard({
  election,
  onViewCertificate,
}: {
  election: Election;
  onViewCertificate: (id: number) => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden opacity-90">
      <div className="px-4 pt-4 pb-3 space-y-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <VoteTypeBadge type={election.formalVoteType} label={election.formalVoteTypeLabel} />
          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border bg-gray-100 text-gray-600 border-gray-200 flex-shrink-0 flex items-center gap-0.5">
            <Lock className="w-2.5 h-2.5" /> Closed
          </span>
        </div>
        <p className="font-bold text-sm text-foreground leading-snug">{election.title}</p>
        <p className="text-[10px] text-muted-foreground">
          Closed {election.closedAt
            ? format(parseISO(election.closedAt), "MMM d, yyyy")
            : format(parseISO(election.endsAt), "MMM d, yyyy")}
        </p>
        {election.outcome && (
          <div className="pt-0.5">
            <OutcomeBadge outcome={election.outcome} />
          </div>
        )}
        {election.quorumRequired && election.quorumMet !== null && (
          <p className={cn(
            "text-[10px] font-semibold",
            election.quorumMet ? "text-green-600" : "text-red-600"
          )}>
            Quorum: {election.quorumMet ? "Met ✓" : "Not met ✗"} (required {election.quorumRequired})
          </p>
        )}
      </div>
      <div className="border-t border-border px-4 py-2.5">
        <button
          onClick={() => onViewCertificate(election.id)}
          className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
        >
          <Trophy className="w-3 h-3" /> View Official Certificate →
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Elections() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "chair";
  const [tab, setTab] = useState<"active" | "closed">("active");
  const [showCreate, setShowCreate] = useState(false);
  const [ballotElection, setBallotElection] = useState<Election | null>(null);
  const [tallyId, setTallyId] = useState<number | null>(null);
  const [certificateId, setCertificateId] = useState<number | null>(null);

  const { data: elections = [], isLoading } = useQuery<Election[]>({
    queryKey: ["elections"],
    queryFn: () => fetchJson("/api/elections"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const active = elections.filter((e) => !e.isClosed);
  const closed = elections.filter((e) => e.isClosed);
  const list = tab === "active" ? active : closed;

  return (
    <MobileLayout>
      <div className="min-h-full flex flex-col bg-background">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 h-14 flex items-center gap-3">
          <Link href="/" className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <Trophy className="w-5 h-5 text-primary" />
          <span className="font-bold tracking-tight text-sm uppercase flex-1">Elections & Votes</span>
          {isAdmin && (
            <Button size="sm" onClick={() => setShowCreate(true)} className="rounded-xl gap-1.5 text-xs h-8 px-3">
              <Plus className="w-3.5 h-3.5" /> Vote
            </Button>
          )}
        </header>

        {/* Active vote banner */}
        {active.length > 0 && (
          <div className="mx-5 mt-5 bg-primary/10 border border-primary/20 rounded-xl px-4 py-2.5">
            <p className="text-xs font-bold text-primary">
              {active.length} formal vote{active.length !== 1 ? "s" : ""} open — every ballot counts
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="px-5 mt-4">
          <div className="flex bg-muted rounded-xl p-1 gap-1">
            {(["active", "closed"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
                  tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "active" ? `Active (${active.length})` : `Closed (${closed.length})`}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="p-5 space-y-4 pb-8">
          {isLoading ? (
            Array(2).fill(0).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)
          ) : list.length === 0 ? (
            <div className="text-center py-16 bg-card rounded-xl border border-dashed border-border">
              <Trophy className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-sm text-muted-foreground font-medium">
                {tab === "active" ? "No active votes" : "No closed votes yet"}
              </p>
              {tab === "active" && isAdmin && (
                <Button size="sm" variant="outline" onClick={() => setShowCreate(true)} className="mt-3 rounded-xl gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Create a Formal Vote
                </Button>
              )}
            </div>
          ) : tab === "active" ? (
            list.map((e) => (
              <ActiveElectionCard
                key={e.id}
                election={e}
                isAdmin={isAdmin}
                onCastBallot={setBallotElection}
                onViewTally={setTallyId}
                onClose={(id) => {}}
              />
            ))
          ) : (
            list.map((e) => (
              <ClosedElectionCard
                key={e.id}
                election={e}
                onViewCertificate={setCertificateId}
              />
            ))
          )}
        </div>

        {/* Modals */}
        {showCreate && <CreateElectionSheet onClose={() => setShowCreate(false)} />}
        {ballotElection && <CastBallotSheet election={ballotElection} onClose={() => setBallotElection(null)} />}
        {tallyId !== null && <TallySheet electionId={tallyId} onClose={() => setTallyId(null)} />}
        {certificateId !== null && <CertificateSheet electionId={certificateId} onClose={() => setCertificateId(null)} />}
      </div>
    </MobileLayout>
  );
}
