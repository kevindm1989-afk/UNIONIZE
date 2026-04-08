import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ShieldCheck, CheckCircle, ChevronLeft, ChevronRight, User, Mail, Phone, Briefcase, Clock, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

type Shift = "days" | "afternoons" | "nights" | "rotating";

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  employeeId: string;
  department: string;
  shift: Shift | "";
  message: string;
}

const SHIFTS: { value: Shift; label: string }[] = [
  { value: "days", label: "Days" },
  { value: "afternoons", label: "Afternoons" },
  { value: "nights", label: "Nights" },
  { value: "rotating", label: "Rotating" },
];

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export default function RequestAccess() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<FormState>({
    firstName: "", lastName: "", email: "", phone: "",
    employeeId: "", department: "", shift: "", message: "",
  });

  const set = (k: keyof FormState, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const step1Valid = form.firstName.trim().length > 0 && form.lastName.trim().length > 0 && isValidEmail(form.email);
  const step2Valid = true; // All optional
  const canSubmit = step1Valid;

  const handleSubmit = async () => {
    if (!step1Valid) return;
    setError(null);
    setLoading(true);
    try {
      const body: Record<string, string> = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
      };
      if (form.phone.trim()) body.phone = form.phone.trim();
      if (form.employeeId.trim()) body.employeeId = form.employeeId.trim();
      if (form.department.trim()) body.department = form.department.trim();
      if (form.shift) body.shift = form.shift;
      if (form.message.trim()) body.message = form.message.trim();

      const res = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429) {
          setError("Too many requests. Please try again in an hour.");
        } else if (res.status === 409) {
          setError(data.error ?? "An account with this email already exists or is pending review.");
        } else {
          setError(data.error ?? "Something went wrong. Please try again.");
        }
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-background p-6">
        <div className="w-full max-w-[380px] text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Request Submitted</h1>
            <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
              Thank you, <strong>{form.firstName}</strong>! Your membership access request has been received and will be reviewed by a union steward.
              You'll receive an email at <strong>{form.email}</strong> once it's been processed.
            </p>
          </div>
          <a
            href={BASE + "/"}
            className="block w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center hover:bg-primary/90 transition-colors"
          >
            Back to Sign In
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <a
          href={BASE + "/"}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-card border border-border shadow-sm"
        >
          <ChevronLeft className="w-4 h-4" />
        </a>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-extrabold leading-none text-foreground">Local 1285</p>
            <p className="text-[10px] text-muted-foreground">Membership Request</p>
          </div>
        </div>
        {/* Step indicator */}
        <div className="ml-auto flex items-center gap-1.5">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={cn(
                "h-1.5 rounded-full transition-all",
                s === step ? "w-6 bg-primary" : s < step ? "w-3 bg-primary/40" : "w-3 bg-muted"
              )}
            />
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 max-w-[480px] w-full mx-auto">
        {step === 1 && (
          <>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-foreground">Personal Information</h2>
              <p className="text-sm text-muted-foreground mt-1">Your contact details so we can reach you.</p>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">First Name *</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={form.firstName}
                      onChange={(e) => set("firstName", e.target.value)}
                      placeholder="Jane"
                      className="h-12 rounded-xl bg-card pl-9"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Last Name *</label>
                  <Input
                    value={form.lastName}
                    onChange={(e) => set("lastName", e.target.value)}
                    placeholder="Smith"
                    className="h-12 rounded-xl bg-card"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Email Address *</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="jane@example.com"
                    className="h-12 rounded-xl bg-card pl-9"
                    autoCapitalize="none"
                    inputMode="email"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground pl-1">You'll receive your login credentials at this address.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Phone (optional)</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    placeholder="(555) 123-4567"
                    className="h-12 rounded-xl bg-card pl-9"
                    inputMode="tel"
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-foreground">Employment Details</h2>
              <p className="text-sm text-muted-foreground mt-1">Help us verify your membership eligibility.</p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Employee ID (optional)</label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={form.employeeId}
                    onChange={(e) => set("employeeId", e.target.value)}
                    placeholder="EMP-12345"
                    className="h-12 rounded-xl bg-card pl-9 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Department (optional)</label>
                <Input
                  value={form.department}
                  onChange={(e) => set("department", e.target.value)}
                  placeholder="Assembly, Maintenance, Shipping..."
                  className="h-12 rounded-xl bg-card"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Shift (optional)</label>
                <div className="grid grid-cols-2 gap-2">
                  {SHIFTS.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => set("shift", form.shift === value ? "" : value)}
                      className={cn(
                        "h-11 rounded-xl text-sm font-bold border transition-all",
                        form.shift === value
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card border-border text-muted-foreground hover:border-primary/40"
                      )}
                    >
                      <Clock className="w-3.5 h-3.5 inline mr-1.5" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-foreground">Additional Information</h2>
              <p className="text-sm text-muted-foreground mt-1">Any other details you'd like to share.</p>
            </div>

            {/* Summary */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Your Request Summary</p>
              <div className="space-y-1.5">
                <SummaryRow label="Name" value={`${form.firstName} ${form.lastName}`} />
                <SummaryRow label="Email" value={form.email} />
                {form.phone && <SummaryRow label="Phone" value={form.phone} />}
                {form.employeeId && <SummaryRow label="Employee ID" value={form.employeeId} />}
                {form.department && <SummaryRow label="Department" value={form.department} />}
                {form.shift && <SummaryRow label="Shift" value={form.shift.charAt(0).toUpperCase() + form.shift.slice(1)} />}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Message (optional)</label>
              <div className="relative">
                <MessageSquare className="absolute left-3 top-3.5 w-4 h-4 text-muted-foreground" />
                <textarea
                  value={form.message}
                  onChange={(e) => set("message", e.target.value)}
                  placeholder="Any additional context for the steward reviewing your request..."
                  maxLength={1000}
                  rows={4}
                  className="w-full rounded-xl border border-input bg-card px-4 py-3 pl-9 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <p className="text-[11px] text-muted-foreground text-right">{form.message.length}/1000</p>
            </div>

            {error && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 text-sm text-destructive font-medium">
                {error}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer nav */}
      <div className="p-4 border-t border-border bg-background space-y-2">
        {error && step < 3 && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 text-sm text-destructive font-medium mb-2">
            {error}
          </div>
        )}
        <div className="flex gap-2.5 max-w-[480px] mx-auto">
          {step > 1 && (
            <Button
              variant="outline"
              className="h-12 rounded-xl flex-1 font-bold gap-1"
              onClick={() => setStep((s) => s - 1)}
              disabled={loading}
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </Button>
          )}
          {step < 3 ? (
            <Button
              className="h-12 rounded-xl flex-1 font-bold gap-1"
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 1 && !step1Valid}
            >
              Continue
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              className="h-12 rounded-xl flex-1 font-bold"
              onClick={handleSubmit}
              disabled={loading || !canSubmit}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit Request"}
            </Button>
          )}
        </div>
        {step === 1 && (
          <p className="text-center text-[11px] text-muted-foreground">
            Already have an account?{" "}
            <a href={BASE + "/"} className="font-bold text-primary underline">Sign in</a>
          </p>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground text-right">{value}</span>
    </div>
  );
}
