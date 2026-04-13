import { useState, useMemo } from "react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, Scale, Loader2, TriangleAlert, CheckCircle2,
  XCircle, AlertCircle, ChevronDown, ChevronUp, Users, Search,
  X, Check, FileText, History, Plus, Trash2
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Member {
  id: number;
  name: string;
  department: string | null;
  classification: string | null;
  seniorityDate: string | null;
  seniorityRank: number | null;
}

interface SeniorityOrderEntry {
  name: string;
  seniorityDate: string | null;
  seniorityRank: number | null;
  positionInOrder: number;
}

interface AnalysisResult {
  correctSeniorityOrder: SeniorityOrderEntry[];
  violationOccurred: boolean;
  violationLevel: "No Violation" | "Minor" | "Serious" | "Clear Violation";
  articleReference: string;
  explanation: string;
  recommendation: "No Action" | "Raise Informally" | "File Grievance";
  recommendationRationale: string;
  grievanceSummary: string;
}

interface AnalysisResponse {
  analysis: AnalysisResult;
  members: Member[];
  isPattern: boolean;
  patternType: string | null;
}

interface SavedDispute {
  id: number;
  disputeType: string;
  disputeTypeLabel: string;
  occurredAt: string;
  memberNames: string[];
  violationLevel: string | null;
  recommendation: string | null;
  patternFlag: boolean;
  createdByName: string | null;
  createdAt: string;
}

type DisputeType = "scheduling" | "overtime" | "shift_bid" | "layoff" | "recall" | "promotion" | "other";
type Phase = "form" | "analyzing" | "results";
type Tab = "analyze" | "history";

// ─── Constants ────────────────────────────────────────────────────────────────

const DISPUTE_TYPES: { value: DisputeType; label: string; hint: string }[] = [
  { value: "scheduling",  label: "Scheduling",           hint: "Was the most senior available member scheduled first?" },
  { value: "overtime",    label: "Overtime Distribution", hint: "Was overtime offered in seniority order?" },
  { value: "shift_bid",   label: "Shift Bid",             hint: "Did the most senior member get their preferred shift?" },
  { value: "layoff",      label: "Layoff Order",          hint: "Were the least senior members laid off first?" },
  { value: "recall",      label: "Recall Order",          hint: "Were the most senior laid off members recalled first?" },
  { value: "promotion",   label: "Promotion",             hint: "Was the most senior qualified member considered first?" },
  { value: "other",       label: "Other",                 hint: "Describe the seniority issue below." },
];

// ─── Badge helpers ─────────────────────────────────────────────────────────────

function ViolationBadge({ level }: { level: string }) {
  const cfg = {
    "No Violation":    { cls: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",  icon: CheckCircle2 },
    "Minor":           { cls: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",  icon: AlertCircle },
    "Serious":         { cls: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800", icon: TriangleAlert },
    "Clear Violation": { cls: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",             icon: XCircle },
  }[level] ?? { cls: "bg-muted text-muted-foreground border-border", icon: AlertCircle };
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border", cfg.cls)}>
      <Icon className="w-2.5 h-2.5" />
      {level}
    </span>
  );
}

function RecommendationBadge({ rec }: { rec: string }) {
  const cfg = {
    "No Action":        "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
    "Raise Informally": "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
    "File Grievance":   "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
  }[rec] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span className={cn("inline-flex items-center text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border", cfg)}>
      {rec}
    </span>
  );
}

// ─── Fetch helper ─────────────────────────────────────────────────────────────

const fetchJson = async (url: string, opts?: RequestInit) => {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body?.error ?? "Request failed"), { status: res.status, body });
  }
  return res.json();
};

// ─── Member multi-select ──────────────────────────────────────────────────────

function MemberPicker({ selected, onChange }: {
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);

  const { data: allMembers = [] } = useQuery<Member[]>({
    queryKey: ["members-picker"],
    queryFn: () => fetchJson("/api/members"),
    staleTime: 5 * 60_000,
  });

  const filtered = useMemo(() =>
    allMembers.filter((m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      (m.department ?? "").toLowerCase().includes(search.toLowerCase())
    ),
    [allMembers, search]
  );

  const selectedMembers = allMembers.filter((m) => selected.includes(m.id));

  const toggle = (id: number) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Members Involved
      </label>

      {/* Selected chips */}
      {selectedMembers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedMembers.map((m) => (
            <span key={m.id} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-medium px-2 py-1 rounded-full">
              {m.name}
              <button onClick={() => toggle(m.id)} className="hover:text-destructive transition-colors">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Expand/collapse picker */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-card border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Users className="w-4 h-4" />
          {selected.length === 0 ? "Select members..." : `${selected.length} selected`}
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {expanded && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or department..."
                className="pl-8 h-9 text-xs rounded-lg border-0 bg-muted/50"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto divide-y divide-border/50">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No members found</p>
            ) : (
              filtered.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggle(m.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
                >
                  <div className={cn(
                    "w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors",
                    selected.includes(m.id) ? "bg-primary border-primary" : "border-muted-foreground"
                  )}>
                    {selected.includes(m.id) && <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground truncate">{m.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {[m.department, m.seniorityRank ? `Rank #${m.seniorityRank}` : m.seniorityDate ? `Since ${m.seniorityDate}` : null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Analysis Results ─────────────────────────────────────────────────────────

function AnalysisResults({
  response,
  formData,
  onNewAnalysis,
  onSaved,
}: {
  response: AnalysisResponse;
  formData: { disputeType: DisputeType; occurredAt: string; memberNames: string[]; description: string; managementAction: string };
  onNewAnalysis: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { analysis, isPattern, patternType } = response;

  const saveMutation = useMutation({
    mutationFn: () => fetchJson("/api/seniority-disputes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        disputeType: formData.disputeType,
        occurredAt: formData.occurredAt,
        memberIds: response.members.map((m) => m.id),
        memberNames: formData.memberNames,
        description: formData.description,
        managementAction: formData.managementAction,
        analysis,
        violationLevel: analysis.violationLevel,
        recommendation: analysis.recommendation,
      }),
    }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["seniority-disputes"] });
      toast({
        title: data.patternFlag ? "Saved — Pattern Alert!" : "Analysis saved to history",
        description: data.patternFlag
          ? `This is the 3rd+ ${formData.disputeType.replace("_", " ")} dispute in 60 days.`
          : "Dispute has been added to your case history.",
      });
      onSaved();
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err?.body?.error ?? err?.message, variant: "destructive" });
    },
  });

  const handleFileGrievance = () => {
    sessionStorage.setItem("grievance_prefill", JSON.stringify({
      _fromSeniority: true,
      whatHappened: analysis.grievanceSummary || formData.description,
      incidentDate: formData.occurredAt,
      membersInvolved: formData.memberNames.join(", "),
      grievanceType: "seniority",
    }));
    navigate("/grievances/new");
  };

  return (
    <div className="space-y-4">
      {/* Pattern alert */}
      {isPattern && (
        <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-3 py-3">
          <TriangleAlert className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-bold text-red-700 dark:text-red-400">Pattern Detected</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
              This is the 3rd or more <strong>{patternType}</strong> seniority dispute in the past 60 days. Consider escalating this pattern to the union executive.
            </p>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="flex items-start gap-2 bg-muted/50 border border-border rounded-xl px-3 py-2.5">
        <Scale className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
        <p className="text-[10px] text-muted-foreground">
          This analysis assists the steward. <strong>The steward makes all final decisions.</strong>
        </p>
      </div>

      {/* Violation level + article */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="space-y-1">
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Violation Assessment</p>
            <ViolationBadge level={analysis.violationLevel} />
          </div>
          <div className="space-y-1 text-right">
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">CA Reference</p>
            <p className="text-xs font-semibold text-primary">{analysis.articleReference}</p>
          </div>
        </div>
        <p className="text-sm text-foreground leading-relaxed">{analysis.explanation}</p>
      </div>

      {/* Correct seniority order */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/30">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Correct Seniority Order</p>
        </div>
        <div className="divide-y divide-border/50">
          {analysis.correctSeniorityOrder.map((m, i) => (
            <div key={m.name} className="flex items-center gap-3 px-4 py-2.5">
              <span className={cn(
                "w-6 h-6 rounded-full text-[10px] font-black flex items-center justify-center flex-shrink-0",
                i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{m.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {m.seniorityRank ? `Rank #${m.seniorityRank}` : ""}
                  {m.seniorityRank && m.seniorityDate ? " · " : ""}
                  {m.seniorityDate ? `Since ${m.seniorityDate}` : ""}
                  {!m.seniorityRank && !m.seniorityDate ? "No seniority data" : ""}
                </p>
              </div>
              {i === 0 && (
                <span className="text-[9px] font-bold uppercase text-primary flex-shrink-0">Most Senior</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Recommendation */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Recommendation</p>
          <RecommendationBadge rec={analysis.recommendation} />
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{analysis.recommendationRationale}</p>
      </div>

      {/* Action buttons */}
      <div className="space-y-2 pt-1">
        {analysis.recommendation === "File Grievance" && (
          <Button
            onClick={handleFileGrievance}
            className="w-full h-11 rounded-xl gap-2 bg-destructive hover:bg-destructive/90"
          >
            <FileText className="w-4 h-4" />
            Send to Grievance Drafting Assistant
          </Button>
        )}
        <div className="flex gap-2">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || saveMutation.isSuccess}
            variant="outline"
            className="flex-1 h-11 rounded-xl gap-1.5"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : saveMutation.isSuccess ? <Check className="w-4 h-4 text-green-600" /> : <History className="w-4 h-4" />}
            {saveMutation.isSuccess ? "Saved" : "Save to History"}
          </Button>
          <Button onClick={onNewAnalysis} variant="outline" className="flex-1 h-11 rounded-xl gap-1.5">
            <Plus className="w-4 h-4" />
            New Analysis
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: disputes = [], isLoading } = useQuery<SavedDispute[]>({
    queryKey: ["seniority-disputes"],
    queryFn: () => fetchJson("/api/seniority-disputes"),
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => fetchJson(`/api/seniority-disputes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seniority-disputes"] });
      toast({ title: "Dispute removed from history" });
    },
  });

  // Find pattern types (3+ of same type in 60 days)
  const now = Date.now();
  const sixtyDays = 60 * 24 * 60 * 60 * 1000;
  const recentByType: Record<string, number> = {};
  for (const d of disputes) {
    const age = now - new Date(d.createdAt).getTime();
    if (age <= sixtyDays) {
      recentByType[d.disputeType] = (recentByType[d.disputeType] ?? 0) + 1;
    }
  }
  const patternTypes = Object.entries(recentByType).filter(([, count]) => count >= 3);

  if (isLoading) return (
    <div className="space-y-3">
      {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Pattern alerts */}
      {patternTypes.length > 0 && (
        <div className="space-y-2">
          {patternTypes.map(([type, count]) => (
            <div key={type} className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-3 py-3">
              <TriangleAlert className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-red-700 dark:text-red-400">Repeat Violation Pattern</p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                  <strong>{count} {type.replace("_", " ")} disputes</strong> recorded in the last 60 days. Escalate to union executive.
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {disputes.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-dashed border-border">
          <Scale className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground font-medium">No disputes saved yet</p>
          <p className="text-xs text-muted-foreground mt-1">Run an analysis and save it to track your cases.</p>
        </div>
      ) : (
        disputes.map((d) => (
          <div key={d.id} className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 pt-3 pb-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <span className="text-[9px] font-bold uppercase tracking-wider bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                  {d.disputeTypeLabel}
                </span>
                <div className="flex items-center gap-1.5">
                  {d.patternFlag && (
                    <span className="text-[9px] font-bold uppercase bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                      <TriangleAlert className="w-2.5 h-2.5" /> Pattern
                    </span>
                  )}
                  <button
                    onClick={() => {
                      if (window.confirm("Remove this dispute from history?")) deleteMutation.mutate(d.id);
                    }}
                    className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Occurred: {d.occurredAt ? format(parseISO(d.occurredAt as string), "MMM d, yyyy") : "—"}
                {" · "}Logged: {format(parseISO(d.createdAt), "MMM d, yyyy")}
              </p>
              {d.memberNames?.length > 0 && (
                <p className="text-xs text-foreground font-medium">{(d.memberNames as string[]).join(", ")}</p>
              )}
              <div className="flex items-center gap-2 flex-wrap pt-0.5">
                {d.violationLevel && <ViolationBadge level={d.violationLevel} />}
                {d.recommendation && <RecommendationBadge rec={d.recommendation} />}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SeniorityDispute() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("analyze");
  const [phase, setPhase] = useState<Phase>("form");
  const [analysisResponse, setAnalysisResponse] = useState<AnalysisResponse | null>(null);

  // Form state
  const [disputeType, setDisputeType] = useState<DisputeType>("scheduling");
  const [occurredAt, setOccurredAt] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [description, setDescription] = useState("");
  const [managementAction, setManagementAction] = useState("");

  const { data: allMembers = [] } = useQuery<Member[]>({
    queryKey: ["members-picker"],
    queryFn: () => fetchJson("/api/members"),
    staleTime: 5 * 60_000,
  });

  const selectedMemberNames = allMembers
    .filter((m) => selectedMemberIds.includes(m.id))
    .map((m) => m.name);

  const selectedHint = DISPUTE_TYPES.find((d) => d.value === disputeType)?.hint ?? "";

  const analyzeMutation = useMutation({
    mutationFn: () => fetchJson("/api/seniority-disputes/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        disputeType,
        occurredAt,
        memberIds: selectedMemberIds,
        description: description.trim(),
        managementAction: managementAction.trim(),
      }),
    }),
    onSuccess: (data: AnalysisResponse) => {
      setAnalysisResponse(data);
      setPhase("results");
    },
    onError: (err: any) => {
      setPhase("form");
      toast({
        title: "Analysis failed",
        description: err?.body?.error ?? err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAnalyze = () => {
    if (!occurredAt) { toast({ title: "Please enter the date the issue occurred.", variant: "destructive" }); return; }
    if (selectedMemberIds.length === 0) { toast({ title: "Please select at least one member.", variant: "destructive" }); return; }
    if (description.trim().length < 10) { toast({ title: "Please describe what happened (at least 10 characters).", variant: "destructive" }); return; }
    if (managementAction.trim().length < 10) { toast({ title: "Please describe what management did (at least 10 characters).", variant: "destructive" }); return; }
    setPhase("analyzing");
    analyzeMutation.mutate();
  };

  const resetForm = () => {
    setPhase("form");
    setAnalysisResponse(null);
    setDisputeType("scheduling");
    setOccurredAt("");
    setSelectedMemberIds([]);
    setDescription("");
    setManagementAction("");
  };

  return (
    <MobileLayout>
      <div className="min-h-full flex flex-col bg-background">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 h-14 flex items-center gap-3">
          <Link href="/" className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <Scale className="w-5 h-5 text-primary" />
          <span className="font-bold tracking-tight text-sm uppercase flex-1">Seniority Dispute Tool</span>
        </header>

        {/* Tabs */}
        <div className="px-5 pt-4">
          <div className="flex bg-muted rounded-xl p-1 gap-1">
            {(["analyze", "history"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 py-2 text-xs font-bold rounded-lg transition-all",
                  tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "analyze" ? "Analyze" : "History"}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5 pb-10 space-y-4">
          {tab === "history" ? (
            <HistoryTab />
          ) : phase === "analyzing" ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Scale className="w-6 h-6 text-primary" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-bold text-foreground">Analyzing seniority dispute...</p>
                <p className="text-xs text-muted-foreground">Pulling member seniority data and reviewing the collective agreement</p>
              </div>
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : phase === "results" && analysisResponse ? (
            <AnalysisResults
              response={analysisResponse}
              formData={{
                disputeType,
                occurredAt,
                memberNames: selectedMemberNames,
                description,
                managementAction,
              }}
              onNewAnalysis={resetForm}
              onSaved={() => setTab("history")}
            />
          ) : (
            /* Form */
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Type of Dispute</label>
                <Select value={disputeType} onValueChange={(v) => setDisputeType(v as DisputeType)}>
                  <SelectTrigger className="h-12 rounded-xl bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {DISPUTE_TYPES.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground px-1">{selectedHint}</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Date Issue Occurred</label>
                <Input
                  type="date"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                  className="h-12 rounded-xl bg-card"
                  max={new Date().toISOString().split("T")[0]}
                />
              </div>

              <MemberPicker selected={selectedMemberIds} onChange={setSelectedMemberIds} />

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">What Happened</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the seniority issue in plain language..."
                  className="rounded-xl bg-card resize-none min-h-[80px]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">What Management Did</label>
                <Textarea
                  value={managementAction}
                  onChange={(e) => setManagementAction(e.target.value)}
                  placeholder="What action did management take? Who was scheduled/selected/laid off?"
                  className="rounded-xl bg-card resize-none min-h-[80px]"
                />
              </div>

              <div className="flex items-start gap-2 bg-muted/40 border border-border rounded-xl px-3 py-2.5">
                <Scale className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-[10px] text-muted-foreground">
                  AI will pull seniority data from the member database and review the Collective Agreement. <strong>The steward makes all final decisions.</strong>
                </p>
              </div>

              <Button
                onClick={handleAnalyze}
                disabled={!occurredAt || selectedMemberIds.length === 0 || !description.trim() || !managementAction.trim()}
                className="w-full h-12 rounded-xl gap-2"
              >
                <Scale className="w-4 h-4" />
                Run Seniority Analysis
              </Button>
            </div>
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
