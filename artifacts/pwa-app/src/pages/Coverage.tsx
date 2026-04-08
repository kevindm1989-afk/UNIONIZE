import { useState } from "react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, MapPin, Plus, Loader2, X } from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuth } from "@/App";

const fetchJson = async (url: string, opts?: RequestInit) => {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
};

interface CoverageRow {
  id: number;
  stewardId: number;
  stewardName: string | null;
  department: string;
  shift: "days" | "afternoons" | "nights" | "rotating";
  areaNotes: string | null;
}

interface UserOption {
  id: number;
  displayName: string;
  role: string;
}

const SHIFT_LABELS: Record<string, string> = {
  days: "Days",
  afternoons: "Afternoons",
  nights: "Nights",
  rotating: "Rotating",
};

const SHIFT_COLORS: Record<string, string> = {
  days: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300",
  afternoons: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300",
  nights: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300",
  rotating: "bg-gray-100 text-gray-700 border-gray-200",
};

export default function Coverage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "chair";
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newDept, setNewDept] = useState("");
  const [newStewardId, setNewStewardId] = useState("");
  const [newShift, setNewShift] = useState<string>("days");
  const [newNotes, setNewNotes] = useState("");

  const { data: coverage = [], isLoading } = useQuery<CoverageRow[]>({
    queryKey: ["coverage"],
    queryFn: () => fetchJson("/api/coverage"),
    staleTime: 60_000,
  });

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ["users-for-coverage"],
    queryFn: () => fetchJson("/api/auth/users"),
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const stewards = users.filter((u) => u.role !== "member");

  const addMutation = useMutation({
    mutationFn: (body: object) => fetchJson("/api/coverage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coverage"] });
      setShowAdd(false);
      setNewDept(""); setNewStewardId(""); setNewShift("days"); setNewNotes("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => fetch(`/api/coverage/${id}`, { method: "DELETE", credentials: "include" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["coverage"] }),
  });

  // Group by department
  const grouped: Record<string, CoverageRow[]> = {};
  for (const row of coverage) {
    if (!grouped[row.department]) grouped[row.department] = [];
    grouped[row.department].push(row);
  }

  return (
    <MobileLayout>
      <div className="min-h-full flex flex-col bg-background">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-md border-b border-border px-4 h-14 flex items-center gap-3">
          <Link href="/" className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <MapPin className="w-5 h-5 text-primary" />
          <span className="font-bold tracking-tight text-sm uppercase flex-1">Bargaining Unit Coverage</span>
          {isAdmin && (
            <Button size="sm" onClick={() => setShowAdd(true)} className="rounded-xl gap-1.5 text-xs h-8 px-3">
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>
          )}
        </header>

        <div className="p-5 space-y-4 pb-8">
          {isLoading ? (
            Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
          ) : Object.keys(grouped).length === 0 ? (
            <div className="text-center py-16 bg-card rounded-xl border border-dashed border-border">
              <MapPin className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-sm text-muted-foreground font-medium">No coverage areas defined</p>
              {isAdmin && (
                <Button onClick={() => setShowAdd(true)} variant="outline" className="mt-3 rounded-xl text-xs">
                  Add first coverage area
                </Button>
              )}
            </div>
          ) : (
            Object.entries(grouped).map(([dept, rows]) => (
              <div key={dept} className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-muted/40 border-b border-border">
                  <p className="text-xs font-bold uppercase tracking-wider text-foreground">{dept}</p>
                </div>
                {rows.map((row) => (
                  <div key={row.id} className="px-4 py-3 flex items-start justify-between gap-3 border-b border-border last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground">{row.stewardName ?? "Unknown Steward"}</p>
                        <span className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border", SHIFT_COLORS[row.shift])}>
                          {SHIFT_LABELS[row.shift]}
                        </span>
                      </div>
                      {row.areaNotes && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{row.areaNotes}</p>
                      )}
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => deleteMutation.mutate(row.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0 mt-0.5"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Add Coverage Sheet */}
        <Sheet open={showAdd} onOpenChange={setShowAdd}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[90dvh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Add Coverage Area</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Department / Area</label>
                <Input value={newDept} onChange={(e) => setNewDept(e.target.value)} placeholder="e.g. Warehouse, Office, Production" className="h-12 rounded-xl bg-card" />
              </div>
              {stewards.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Steward</label>
                  <Select value={newStewardId} onValueChange={setNewStewardId}>
                    <SelectTrigger className="h-12 rounded-xl bg-card"><SelectValue placeholder="Select steward" /></SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {stewards.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.displayName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Shift</label>
                <Select value={newShift} onValueChange={setNewShift}>
                  <SelectTrigger className="h-12 rounded-xl bg-card"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="days">Days</SelectItem>
                    <SelectItem value="afternoons">Afternoons</SelectItem>
                    <SelectItem value="nights">Nights</SelectItem>
                    <SelectItem value="rotating">Rotating</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notes (optional)</label>
                <Textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Area details, coverage notes..." className="rounded-xl bg-card resize-none min-h-[80px]" />
              </div>
              <Button
                onClick={() => addMutation.mutate({ department: newDept, stewardId: Number(newStewardId), shift: newShift, areaNotes: newNotes || null })}
                disabled={!newDept.trim() || !newStewardId || addMutation.isPending}
                className="w-full h-12 rounded-xl"
              >
                {addMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Add Coverage Area"}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </MobileLayout>
  );
}
