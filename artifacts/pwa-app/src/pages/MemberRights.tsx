import { useState, useRef, useEffect } from "react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Scale,
  Send,
  Loader2,
  BookOpen,
  FileText,
  AlertTriangle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RightsAnswer {
  question: string;
  directAnswer: string;
  cbaReference: string;
  esaReference: string | null;
  disclaimer: string;
}

const QUICK_QUESTIONS = [
  "Can management change my shift?",
  "Do I have the right to a steward?",
  "What are my overtime rights?",
  "Can they discipline me without warning?",
  "What is my right to refuse unsafe work?",
  "How does seniority work for scheduling?",
];

function AnswerCard({ entry, index }: { entry: RightsAnswer; index: number }) {
  const [expanded, setExpanded] = useState(index === 0);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors gap-3"
      >
        <div className="flex items-start gap-2.5 min-w-0">
          <Scale className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <p className="text-sm font-semibold text-foreground leading-snug">{entry.question}</p>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border divide-y divide-border">
          <div className="px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1.5">
              Direct Answer
            </p>
            <p className="text-sm text-foreground leading-relaxed">{entry.directAnswer}</p>
          </div>

          {entry.cbaReference && (
            <div className="px-4 py-3 bg-blue-50/50 dark:bg-blue-950/20">
              <div className="flex items-center gap-1.5 mb-1.5">
                <BookOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                  Collective Agreement
                </p>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{entry.cbaReference}</p>
            </div>
          )}

          {entry.esaReference && (
            <div className="px-4 py-3 bg-violet-50/50 dark:bg-violet-950/20">
              <div className="flex items-center gap-1.5 mb-1.5">
                <FileText className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-400">
                  Ontario ESA
                </p>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{entry.esaReference}</p>
            </div>
          )}

          <div className="px-4 py-3 bg-amber-50/60 dark:bg-amber-950/20">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-400 font-medium leading-snug">
                {entry.disclaimer}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MemberRights() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RightsAnswer[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (history.length > 0) {
      setTimeout(() => {
        historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [history.length]);

  const handleAsk = async () => {
    const q = question.trim();
    if (!q || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/member-portal/rights", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      setHistory((prev) => [data as RightsAnswer, ...prev]);
      setQuestion("");
    } catch {
      setError("Could not connect to the service. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  const handleQuickQuestion = (q: string) => {
    setQuestion(q);
    textareaRef.current?.focus();
  };

  return (
    <MobileLayout>
      <div className="flex flex-col min-h-full">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Scale className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="font-extrabold text-sm tracking-tight leading-none">Member Rights</h1>
              <p className="text-[10px] text-muted-foreground mt-0.5">Powered by AI · Unifor 1285</p>
            </div>
          </div>
          {history.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setHistory([]); setQuestion(""); setError(null); }}
              className="gap-1.5 text-xs h-7 text-muted-foreground"
            >
              <RotateCcw className="w-3 h-3" />
              Clear
            </Button>
          )}
        </header>

        <div className="flex-1 px-4 py-5 space-y-4">
          {/* Input */}
          <div className="space-y-3">
            <Textarea
              ref={textareaRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your rights… e.g. Can they change my shift without notice?"
              rows={2}
              disabled={loading}
              className="resize-none text-sm rounded-xl bg-card border-border focus-visible:ring-1 min-h-[72px]"
            />

            {/* Quick question chips */}
            <div className="flex flex-wrap gap-2">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleQuickQuestion(q)}
                  disabled={loading}
                  className={cn(
                    "text-xs font-medium px-3 py-1.5 rounded-full border transition-colors",
                    "bg-muted border-border text-muted-foreground",
                    "hover:bg-primary/10 hover:border-primary/30 hover:text-primary",
                    "active:scale-95",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {q}
                </button>
              ))}
            </div>

            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-destructive/10 border border-destructive/20 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}

            <Button
              onClick={handleAsk}
              disabled={!question.trim() || loading}
              className="w-full h-12 rounded-xl font-bold text-sm gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Looking up your rights…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Ask My Rights
                </>
              )}
            </Button>

            <p className="text-[10px] text-muted-foreground/60 text-center">
              This AI assistant explains the CBA and ESA. It is not legal advice.
            </p>
          </div>

          {/* Answer history */}
          {history.length > 0 && (
            <div className="space-y-3" ref={historyRef}>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-border" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {history.length === 1 ? "Answer" : `${history.length} Answers`}
                </p>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="space-y-3">
                {history.map((entry, i) => (
                  <AnswerCard key={i} entry={entry} index={i} />
                ))}
              </div>
            </div>
          )}

          {history.length === 0 && !loading && (
            <div className="text-center py-10">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <Scale className="w-7 h-7 text-primary" />
              </div>
              <p className="text-sm font-semibold text-foreground">Member Rights Explainer</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[240px] mx-auto">
                Ask any question about workplace rights under the Collective Agreement or Ontario ESA.
              </p>
            </div>
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
