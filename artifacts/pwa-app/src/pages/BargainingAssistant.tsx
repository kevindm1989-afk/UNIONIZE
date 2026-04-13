import { useState, useRef } from "react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  ChevronDown, ChevronUp, Plus, X, Sparkles, Printer,
  Save, Trash2, FileText, AlertTriangle, ChevronRight,
  RotateCcw, FolderOpen, CheckCircle, ArrowLeft,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface IssueEntry {
  id: number;
  title: string;
  description: string | null;
  status: string;
  step: number;
  remedy: string | null;
  article: string | null;
  memberName: string | null;
  department: string | null;
  filedDate: string;
}

interface IssueCategory {
  key: string;
  category: string;
  count: number;
  issues: IssueEntry[];
}

interface IssuesData {
  total: number;
  categories: IssueCategory[];
}

interface TopIssue {
  rank: number;
  title: string;
  category: string;
  summary: string;
  affectedMembers: string;
  currentLanguage: string;
  proposedLanguage: string;
  articleReference: string;
}

interface ReportData {
  topIssues: TopIssue[];
  bargainingStrategy: string;
  nationalPatternIssues: string[];
}

interface SavedReport {
  id: number;
  title: string;
  status: string;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

interface FullReport extends SavedReport {
  issuesData: unknown;
  reportData: ReportData;
  editedLanguage: Record<number, string> | null;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function CategoryCard({ cat, expanded, onToggle }: { cat: IssueCategory; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left active:bg-muted/40"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-xs font-black text-primary">{cat.count}</span>
          </div>
          <p className="font-semibold text-sm text-foreground">{cat.category}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-bold uppercase text-muted-foreground">
            {cat.count} grievance{cat.count !== 1 ? "s" : ""}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border divide-y divide-border/60">
          {cat.issues.slice(0, 6).map((issue) => (
            <div key={issue.id} className="px-4 py-2.5">
              <p className="text-xs font-semibold text-foreground leading-snug">{issue.title}</p>
              {(issue.memberName || issue.department) && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {[issue.memberName, issue.department].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          ))}
          {cat.issues.length > 6 && (
            <div className="px-4 py-2 text-center">
              <span className="text-[11px] text-muted-foreground">+{cat.issues.length - 6} more grievances</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IssueReportCard({
  issue,
  editedLanguage,
  onEdit,
}: {
  issue: TopIssue;
  editedLanguage: string | undefined;
  onEdit: (text: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(editedLanguage ?? issue.proposedLanguage);

  const rankColors = ["bg-red-100 text-red-800", "bg-orange-100 text-orange-800", "bg-amber-100 text-amber-800", "bg-blue-100 text-blue-800", "bg-purple-100 text-purple-800"];

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left active:bg-muted/30"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={cn("text-xs font-black px-2 py-0.5 rounded-lg shrink-0 mt-0.5", rankColors[issue.rank - 1] ?? rankColors[4])}>
          #{issue.rank}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-foreground leading-snug">{issue.title}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{issue.category}</p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
      </button>

      {expanded && (
        <div className="border-t border-border divide-y divide-border/50">
          <div className="px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Summary</p>
            <p className="text-sm text-foreground leading-relaxed">{issue.summary}</p>
          </div>

          <div className="px-4 py-3 flex items-start gap-3">
            <div className="flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Members Affected</p>
              <p className="text-sm text-foreground">{issue.affectedMembers}</p>
            </div>
            {issue.articleReference && (
              <div className="shrink-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">CA Article</p>
                <p className="text-xs font-mono bg-muted px-2 py-1 rounded-lg text-foreground">{issue.articleReference}</p>
              </div>
            )}
          </div>

          {issue.currentLanguage && (
            <div className="px-4 py-3 bg-red-50/50 dark:bg-red-950/10">
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400 mb-1.5">Current CA Language (Inadequate)</p>
              <p className="text-xs text-foreground/80 leading-relaxed italic">"{issue.currentLanguage}"</p>
            </div>
          )}

          <div className="px-4 py-3 bg-green-50/50 dark:bg-green-950/10">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-green-700 dark:text-green-400">Proposed New Language</p>
              {!editing && (
                <button onClick={() => { setDraft(editedLanguage ?? issue.proposedLanguage); setEditing(true); }}
                  className="text-[10px] font-bold text-primary uppercase tracking-wider">
                  Edit
                </button>
              )}
            </div>

            {editing ? (
              <div className="space-y-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="w-full text-xs font-mono bg-background border border-border rounded-lg p-2.5 min-h-[120px] focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { onEdit(draft); setEditing(false); }}
                    className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold"
                  >
                    Save Edit
                  </button>
                  <button
                    onClick={() => { setDraft(editedLanguage ?? issue.proposedLanguage); setEditing(false); }}
                    className="px-3 py-2 rounded-xl bg-muted text-muted-foreground text-xs font-bold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs font-mono text-foreground leading-relaxed whitespace-pre-wrap">
                {editedLanguage ?? issue.proposedLanguage}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function BargainingAssistant() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<"main" | "report" | "saved">("main");
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});
  const [manualIssues, setManualIssues] = useState<string[]>([]);
  const [newIssue, setNewIssue] = useState("");
  const [report, setReport] = useState<ReportData | null>(null);
  const [editedLanguage, setEditedLanguage] = useState<Record<number, string>>({});
  const [reportTitle, setReportTitle] = useState("");
  const [savingReport, setSavingReport] = useState(false);
  const [viewingReport, setViewingReport] = useState<FullReport | null>(null);

  const { data: issuesData, isLoading: issuesLoading } = useQuery<IssuesData>({
    queryKey: ["bargaining-issues"],
    queryFn: () => fetch("/api/bargaining/issues", { credentials: "include" }).then((r) => r.json()),
    staleTime: 5 * 60_000,
  });

  const { data: savedReports, isLoading: reportsLoading } = useQuery<SavedReport[]>({
    queryKey: ["bargaining-reports"],
    queryFn: () => fetch("/api/bargaining/reports", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
    enabled: view === "saved",
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const categories = issuesData?.categories ?? [];
      const res = await fetch("/api/bargaining/analyze", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories, manualIssues }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Analysis failed" }));
        throw new Error(err.error ?? "Analysis failed");
      }
      return res.json() as Promise<{ reportData: ReportData }>;
    },
    onSuccess: (data) => {
      setReport(data.reportData);
      setEditedLanguage({});
      setReportTitle(`Bargaining Prep Report — ${format(new Date(), "MMMM d, yyyy")}`);
      setView("report");
    },
    onError: (err: Error) => {
      toast({ title: "Analysis Failed", description: err.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/bargaining/reports", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: reportTitle,
          issuesData: { categories: issuesData?.categories, manualIssues },
          reportData: report,
          editedLanguage,
        }),
      });
      if (!res.ok) throw new Error("Failed to save report");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bargaining-reports"] });
      toast({ title: "Report Saved", description: "Bargaining prep report has been saved." });
      setSavingReport(false);
    },
    onError: () => {
      toast({ title: "Save Failed", description: "Could not save the report.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/bargaining/reports/${id}`, { method: "DELETE", credentials: "include" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bargaining-reports"] });
      toast({ title: "Report Deleted" });
    },
  });

  const patchMutation = useMutation({
    mutationFn: async ({ id, editedLanguage: el }: { id: number; editedLanguage: Record<number, string> }) => {
      const res = await fetch(`/api/bargaining/reports/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editedLanguage: el }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => toast({ title: "Changes Saved" }),
    onError: () => toast({ title: "Save Failed", variant: "destructive" }),
  });

  function toggleCat(key: string) {
    setExpandedCats((v) => ({ ...v, [key]: !v[key] }));
  }

  function addManualIssue() {
    const trimmed = newIssue.trim();
    if (!trimmed) return;
    setManualIssues((v) => [...v, trimmed]);
    setNewIssue("");
  }

  function handlePrint() {
    window.print();
  }

  async function loadReport(id: number) {
    const res = await fetch(`/api/bargaining/reports/${id}`, { credentials: "include" });
    const data: FullReport = await res.json();
    setViewingReport(data);
    setEditedLanguage(data.editedLanguage ?? {});
    setView("saved");
  }

  // ─── Saved Reports View ─────────────────────────────────────────────────────
  if (view === "saved" && viewingReport) {
    const reportData = viewingReport.reportData;
    return (
      <MobileLayout>
        <div className="p-4 space-y-4 pb-8 print:p-0">
          <div className="flex items-center gap-2 no-print">
            <button onClick={() => { setViewingReport(null); }} className="p-2 rounded-xl hover:bg-muted transition-colors">
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </button>
            <h1 className="text-lg font-extrabold tracking-tight flex-1 truncate">{viewingReport.title}</h1>
            <button onClick={handlePrint} className="p-2 rounded-xl hover:bg-muted">
              <Printer className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          <DisclaimerBanner />

          <div className="space-y-3">
            {reportData.topIssues?.map((issue) => (
              <IssueReportCard
                key={issue.rank}
                issue={issue}
                editedLanguage={editedLanguage[issue.rank]}
                onEdit={(text) => {
                  const updated = { ...editedLanguage, [issue.rank]: text };
                  setEditedLanguage(updated);
                  patchMutation.mutate({ id: viewingReport.id, editedLanguage: updated });
                }}
              />
            ))}
          </div>

          {reportData.bargainingStrategy && (
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-xl px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 mb-1.5">Bargaining Strategy</p>
              <p className="text-sm text-foreground leading-relaxed">{reportData.bargainingStrategy}</p>
            </div>
          )}

          {reportData.nationalPatternIssues?.length > 0 && (
            <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 rounded-xl px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400 mb-2">Escalate to Unifor National</p>
              <div className="space-y-1.5">
                {reportData.nationalPatternIssues.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-purple-200 dark:bg-purple-800 flex items-center justify-center text-[9px] font-black text-purple-800 dark:text-purple-200 shrink-0 mt-0.5">{i + 1}</span>
                    <p className="text-sm text-foreground">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </MobileLayout>
    );
  }

  // ─── Saved Reports List ─────────────────────────────────────────────────────
  if (view === "saved" && !viewingReport) {
    return (
      <MobileLayout>
        <div className="p-4 space-y-4 pb-8">
          <div className="flex items-center gap-2">
            <button onClick={() => setView("main")} className="p-2 rounded-xl hover:bg-muted transition-colors">
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </button>
            <h1 className="text-xl font-extrabold tracking-tight">Saved Reports</h1>
          </div>

          {reportsLoading ? (
            <div className="space-y-2">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : !savedReports?.length ? (
            <div className="text-center py-16 border border-dashed border-border rounded-xl">
              <FolderOpen className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-20" />
              <p className="text-sm text-muted-foreground">No saved reports yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {savedReports.map((r) => (
                <div key={r.id} className="bg-card border border-border rounded-xl overflow-hidden">
                  <button className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-muted/40" onClick={() => loadReport(r.id)}>
                    <FileText className="w-8 h-8 text-primary/60 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{r.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(r.createdAt), "MMM d, yyyy · h:mm a")}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      <button onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(r.id); }}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors">
                        <Trash2 className="w-3.5 h-3.5 text-destructive/70" />
                      </button>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </MobileLayout>
    );
  }

  // ─── Report View ─────────────────────────────────────────────────────────────
  if (view === "report" && report) {
    return (
      <MobileLayout>
        <div className="p-4 space-y-4 pb-24 print:p-0" ref={printRef}>
          {/* Header */}
          <div className="no-print flex items-center gap-2">
            <button onClick={() => setView("main")} className="p-2 rounded-xl hover:bg-muted transition-colors">
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </button>
            <h1 className="text-lg font-extrabold tracking-tight flex-1">Bargaining Prep Report</h1>
            <button onClick={handlePrint} className="p-2 rounded-xl hover:bg-muted">
              <Printer className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {/* Print header */}
          <div className="hidden print:block mb-6">
            <h1 className="text-2xl font-black">Unifor Local 1285</h1>
            <h2 className="text-xl font-bold mt-1">{reportTitle}</h2>
            <p className="text-sm text-gray-600 mt-1">Generated {format(new Date(), "MMMM d, yyyy")}</p>
          </div>

          <DisclaimerBanner />

          {/* Save panel */}
          {!savingReport ? (
            <button
              onClick={() => setSavingReport(true)}
              className="no-print w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-primary/30 text-primary font-bold text-sm hover:bg-primary/5 transition-colors"
            >
              <Save className="w-4 h-4" /> Save Report
            </button>
          ) : (
            <div className="no-print bg-card border border-border rounded-xl p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Save Report</p>
              <input
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Report title..."
              />
              <div className="flex gap-2">
                <button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending || !reportTitle.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50"
                >
                  {saveMutation.isPending ? "Saving…" : "Confirm Save"}
                </button>
                <button onClick={() => setSavingReport(false)} className="px-4 py-2.5 rounded-xl bg-muted text-sm font-bold">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Top 5 Issues */}
          <section className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Top 5 Priority Issues</p>
            {report.topIssues?.map((issue) => (
              <IssueReportCard
                key={issue.rank}
                issue={issue}
                editedLanguage={editedLanguage[issue.rank]}
                onEdit={(text) => setEditedLanguage((v) => ({ ...v, [issue.rank]: text }))}
              />
            ))}
          </section>

          {/* Strategy */}
          {report.bargainingStrategy && (
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-xl px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 mb-1.5">Bargaining Strategy</p>
              <p className="text-sm text-foreground leading-relaxed">{report.bargainingStrategy}</p>
            </div>
          )}

          {/* National pattern issues */}
          {report.nationalPatternIssues?.length > 0 && (
            <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 rounded-xl px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400 mb-2">Escalate to Unifor National</p>
              <div className="space-y-1.5">
                {report.nationalPatternIssues.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-purple-200 dark:bg-purple-800 flex items-center justify-center text-[9px] font-black text-purple-800 dark:text-purple-200 shrink-0 mt-0.5">{i + 1}</span>
                    <p className="text-sm text-foreground">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-center py-3">
            <p className="text-xs text-muted-foreground italic">
              Proposed language must be reviewed by your Unifor National Representative before tabling at the bargaining table.
            </p>
          </div>
        </div>
      </MobileLayout>
    );
  }

  // ─── Main View ──────────────────────────────────────────────────────────────
  return (
    <MobileLayout>
      <div className="p-4 space-y-5 pb-24">
        {/* Header */}
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Bargaining Prep</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Steward-only · AI-powered contract analysis</p>
          </div>
          <button
            onClick={() => setView("saved")}
            className="flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 px-3 py-2 rounded-xl"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Reports
          </button>
        </header>

        <DisclaimerBanner />

        {/* Auto-pulled issues */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Auto-Pulled Issues</p>
              <p className="text-xs text-muted-foreground mt-0.5">Patterns from your member complaint database</p>
            </div>
            {issuesData && (
              <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-1 rounded-lg">
                {issuesData.total} total
              </span>
            )}
          </div>

          {issuesLoading ? (
            <div className="space-y-2">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          ) : !issuesData?.categories?.length ? (
            <div className="text-center py-8 border border-dashed border-border rounded-xl">
              <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-20" />
              <p className="text-sm text-muted-foreground">No grievances on file yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {issuesData.categories.map((cat) => (
                <CategoryCard
                  key={cat.key}
                  cat={cat}
                  expanded={!!expandedCats[cat.key]}
                  onToggle={() => toggleCat(cat.key)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Manual issue input */}
        <section className="space-y-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Manual Issues</p>
            <p className="text-xs text-muted-foreground mt-0.5">Add any issues not yet in the complaint system</p>
          </div>

          <div className="flex gap-2">
            <input
              value={newIssue}
              onChange={(e) => setNewIssue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addManualIssue()}
              placeholder="Describe an issue (e.g. mandatory overtime without proper notice)…"
              className="flex-1 border border-border rounded-xl px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={addManualIssue}
              disabled={!newIssue.trim()}
              className="px-3 rounded-xl bg-primary text-primary-foreground disabled:opacity-40 transition-opacity"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {manualIssues.length > 0 && (
            <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
              {manualIssues.map((issue, i) => (
                <div key={i} className="flex items-start gap-2.5 px-4 py-2.5">
                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  <p className="flex-1 text-sm text-foreground leading-snug">{issue}</p>
                  <button onClick={() => setManualIssues((v) => v.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Analyze button */}
        <div className="fixed bottom-[76px] left-0 right-0 max-w-[480px] mx-auto px-4 pb-4 no-print">
          <button
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending || (!issuesData?.total && !manualIssues.length)}
            className={cn(
              "w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-black text-base tracking-wide transition-all",
              "bg-primary text-primary-foreground shadow-xl shadow-primary/30",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "active:scale-[0.98]"
            )}
          >
            {analyzeMutation.isPending ? (
              <>
                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Analyzing…
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Analyze for Bargaining
              </>
            )}
          </button>
        </div>
      </div>
    </MobileLayout>
  );
}

function DisclaimerBanner() {
  return (
    <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl px-3.5 py-3">
      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
        <strong>Disclaimer:</strong> Proposed language must be reviewed by your Unifor National Representative before tabling at the bargaining table.
      </p>
    </div>
  );
}
