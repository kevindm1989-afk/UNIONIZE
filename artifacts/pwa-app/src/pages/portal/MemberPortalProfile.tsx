import { useState, useRef } from "react";
import { MemberPortalLayout } from "@/components/layout/MemberPortalLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  User, Phone, Mail, Calendar, Shield, Award, CheckCircle2,
  Edit2, X, Save, Loader2, MapPin, AlertCircle, Globe,
  Bell, Lock, Camera, BellOff,
} from "lucide-react";
import { format, differenceInYears } from "date-fns";
import { cn } from "@/lib/utils";

type MemberProfile = {
  id: number;
  name: string;
  employeeId: string | null;
  department: string | null;
  classification: string | null;
  phone: string | null;
  email: string | null;
  joinDate: string | null;
  seniorityDate: string | null;
  seniorityRank: number | null;
  duesStatus: string | null;
  duesLastPaid: string | null;
  shift: string | null;
  classificationDate: string | null;
  isActive: boolean;
  signedAt: string | null;
  // Self-service fields
  homeAddress: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  preferredLanguage: string | null;
  profilePhotoUrl: string | null;
  notifBulletins: boolean;
  notifVotes: boolean;
  notifMeetings: boolean;
};

const duesBadge = (status: string | null) => {
  switch (status) {
    case "current": return { label: "Dues Current", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" };
    case "delinquent": return { label: "Dues Delinquent", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" };
    case "suspended": return { label: "Suspended", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" };
    case "exempt": return { label: "Dues Exempt", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" };
    default: return { label: "Status Unknown", color: "bg-muted text-muted-foreground" };
  }
};

async function fetchJson<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function StewardLabel() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-muted-foreground/70 ml-1">
      <Lock className="w-2.5 h-2.5" />Managed by steward
    </span>
  );
}

function NotifRow({
  icon: Icon,
  label,
  description,
  locked,
  checked,
  onChange,
}: {
  icon: typeof Bell;
  label: string;
  description: string;
  locked?: boolean;
  checked: boolean;
  onChange?: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5",
        checked ? "bg-primary/10" : "bg-muted")}>
        <Icon className={cn("w-4 h-4", checked ? "text-primary" : "text-muted-foreground")} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground leading-tight">{label}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{description}</p>
      </div>
      {locked ? (
        <div className="flex items-center gap-1 shrink-0 mt-1">
          <Lock className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] font-bold text-muted-foreground">Always on</span>
        </div>
      ) : (
        <Switch
          checked={checked}
          onCheckedChange={onChange}
          className="shrink-0 mt-1"
        />
      )}
    </div>
  );
}

export default function MemberPortalProfile() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("en");
  const [photoUploading, setPhotoUploading] = useState(false);

  const { data: profile, isLoading } = useQuery<MemberProfile>({
    queryKey: ["/member-portal/profile"],
    queryFn: () => fetchJson("/api/member-portal/profile"),
  });

  const updateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJson("/api/member-portal/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/member-portal/profile"] });
      setEditing(false);
      toast({ title: "Profile updated" });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const notifMutation = useMutation({
    mutationFn: (body: Record<string, boolean>) =>
      fetchJson("/api/member-portal/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/member-portal/profile"] });
      toast({ title: "Notifications updated" });
    },
    onError: () => toast({ title: "Failed to save preferences", variant: "destructive" }),
  });

  const startEdit = () => {
    setPhone(profile?.phone ?? "");
    setEmail(profile?.email ?? "");
    setHomeAddress(profile?.homeAddress ?? "");
    setEmergencyContactName(profile?.emergencyContactName ?? "");
    setEmergencyContactPhone(profile?.emergencyContactPhone ?? "");
    setPreferredLanguage(profile?.preferredLanguage ?? "en");
    setEditing(true);
  };

  const handleSave = () => {
    updateMutation.mutate({
      phone, email, homeAddress,
      emergencyContactName, emergencyContactPhone, preferredLanguage,
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/storage/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { objectPath } = await res.json();
      await updateMutation.mutateAsync({ profilePhotoUrl: `/api/storage${objectPath}` });
      toast({ title: "Photo updated" });
    } catch {
      toast({ title: "Photo upload failed", variant: "destructive" });
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const seniority = profile?.seniorityDate
    ? differenceInYears(new Date(), new Date(profile.seniorityDate))
    : null;

  const dues = duesBadge(profile?.duesStatus ?? null);

  return (
    <MemberPortalLayout>
      <div className="p-4 space-y-4 animate-in fade-in-0 slide-in-from-bottom-4 duration-300">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">My Profile</h1>
            <p className="text-xs text-muted-foreground">Unionize</p>
          </div>
          {!editing && (
            <Button size="sm" variant="outline" onClick={startEdit} className="gap-1.5 text-xs h-8">
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : profile ? (
          <>
            {/* ── Identity card ─────────────────────────────────────────────── */}
            <Card className="border-border/50">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center gap-3">
                  {/* Profile photo */}
                  <div className="relative shrink-0">
                    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                      {profile.profilePhotoUrl ? (
                        <img
                          src={profile.profilePhotoUrl}
                          alt="Profile"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User className="w-7 h-7 text-primary" />
                      )}
                    </div>
                    <button
                      onClick={() => photoInputRef.current?.click()}
                      disabled={photoUploading}
                      className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm hover:bg-primary/90 transition-colors"
                      title="Upload photo"
                    >
                      {photoUploading
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Camera className="w-3 h-3" />}
                    </button>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handlePhotoUpload}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base">{profile.name}</CardTitle>
                    {profile.employeeId && <p className="text-xs text-muted-foreground">#{profile.employeeId}</p>}
                    <div className="flex gap-1 mt-1 flex-wrap">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${dues.color}`}>{dues.label}</span>
                      {profile.signedAt && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 flex items-center gap-0.5">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Card Signed
                        </span>
                      )}
                      {!profile.isActive && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Inactive</span>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-1">
                {profile.department && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    {profile.department}{profile.classification ? ` — ${profile.classification}` : ""}
                    <StewardLabel />
                  </p>
                )}
                {profile.shift && (
                  <p className="text-xs text-muted-foreground capitalize flex items-center gap-1">
                    {profile.shift} shift <StewardLabel />
                  </p>
                )}
              </CardContent>
            </Card>

            {/* ── Seniority card ────────────────────────────────────────────── */}
            {seniority !== null && (
              <Card className="border-border/50">
                <CardContent className="px-4 py-3 flex items-center gap-3">
                  <Award className="w-8 h-8 text-amber-500 shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-foreground flex items-center gap-1">
                      Seniority <StewardLabel />
                    </p>
                    <p className="text-lg font-bold text-amber-600">
                      {seniority} year{seniority !== 1 ? "s" : ""}
                      {profile.seniorityRank ? ` · Rank #${profile.seniorityRank}` : ""}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Since {format(new Date(profile.seniorityDate!), "MMMM d, yyyy")}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Last dues payment ─────────────────────────────────────────── */}
            {profile.duesLastPaid && (
              <Card className="border-border/50">
                <CardContent className="px-4 py-3 flex items-center gap-3">
                  <Shield className="w-7 h-7 text-primary shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-foreground flex items-center gap-1">
                      Last Dues Payment <StewardLabel />
                    </p>
                    <p className="text-sm text-foreground">{format(new Date(profile.duesLastPaid), "MMMM d, yyyy")}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Contact & Personal Information ────────────────────────────── */}
            <Card className="border-border/50">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-sm">Contact & Personal Information</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                {editing ? (
                  <>
                    <p className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                      You can update your contact details. Name, employee ID, department, and seniority are managed by your steward.
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Phone</Label>
                        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className="h-9 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Personal Email</Label>
                        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" className="h-9 text-sm" />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Home Address</Label>
                      <Input
                        value={homeAddress}
                        onChange={(e) => setHomeAddress(e.target.value)}
                        placeholder="Street, City, Province, Postal Code"
                        className="h-9 text-sm"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Emergency Contact Name</Label>
                      <Input
                        value={emergencyContactName}
                        onChange={(e) => setEmergencyContactName(e.target.value)}
                        placeholder="Full name"
                        className="h-9 text-sm"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Emergency Contact Phone</Label>
                      <Input
                        value={emergencyContactPhone}
                        onChange={(e) => setEmergencyContactPhone(e.target.value)}
                        placeholder="Phone number"
                        className="h-9 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Preferred Language</Label>
                      <div className="flex gap-2">
                        {[{ value: "en", label: "English" }, { value: "fr", label: "Français" }].map((l) => (
                          <button
                            key={l.value}
                            type="button"
                            onClick={() => setPreferredLanguage(l.value)}
                            className={cn(
                              "flex-1 py-2 rounded-xl border text-sm font-semibold transition-colors",
                              preferredLanguage === l.value
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background border-border text-foreground hover:bg-muted"
                            )}
                          >
                            {l.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending} className="flex-1 gap-1.5 text-xs h-8">
                        {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(false)} className="flex-1 gap-1.5 text-xs h-8">
                        <X className="w-3.5 h-3.5" /> Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-2 text-sm">
                      <Phone className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <span className={profile.phone ? "text-foreground" : "text-muted-foreground italic"}>
                        {profile.phone ?? "Not set"}
                      </span>
                    </div>
                    <div className="flex items-start gap-2 text-sm">
                      <Mail className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <span className={profile.email ? "text-foreground" : "text-muted-foreground italic"}>
                        {profile.email ?? "Not set"}
                      </span>
                    </div>
                    <div className="flex items-start gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <span className={profile.homeAddress ? "text-foreground" : "text-muted-foreground italic"}>
                        {profile.homeAddress ?? "No address on file"}
                      </span>
                    </div>
                    {(profile.emergencyContactName || profile.emergencyContactPhone) && (
                      <div className="flex items-start gap-2 text-sm">
                        <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div>
                          <span className="text-foreground">
                            {profile.emergencyContactName ?? ""}
                            {profile.emergencyContactName && profile.emergencyContactPhone ? " · " : ""}
                            {profile.emergencyContactPhone ?? ""}
                          </span>
                          <p className="text-[10px] text-muted-foreground">Emergency contact</p>
                        </div>
                      </div>
                    )}
                    {!profile.emergencyContactName && !profile.emergencyContactPhone && (
                      <div className="flex items-start gap-2 text-sm">
                        <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <span className="text-muted-foreground italic">No emergency contact set</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm">
                      <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-foreground">
                        {profile.preferredLanguage === "fr" ? "Français" : "English"}
                      </span>
                    </div>
                    {profile.joinDate && (
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-foreground">Joined {format(new Date(profile.joinDate), "MMMM d, yyyy")}</span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Notification Preferences ──────────────────────────────────── */}
            <Card className="border-border/50">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bell className="w-4 h-4 text-primary" />
                  Notification Preferences
                </CardTitle>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Control which push notifications you receive. Urgent alerts and grievance updates cannot be turned off.
                </p>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="divide-y divide-border/50">
                  <NotifRow
                    icon={Bell}
                    label="General Bulletins"
                    description="New announcements and notices from your union"
                    checked={profile.notifBulletins ?? true}
                    onChange={(v) => notifMutation.mutate({ notifBulletins: v })}
                  />
                  <NotifRow
                    icon={AlertCircle}
                    label="Urgent & Emergency Alerts"
                    description="Strike notices, emergency bulletins, and critical updates"
                    locked
                    checked={true}
                  />
                  <NotifRow
                    icon={Bell}
                    label="Vote & Election Notices"
                    description="Ratification votes, union elections, and referendums"
                    checked={profile.notifVotes ?? true}
                    onChange={(v) => notifMutation.mutate({ notifVotes: v })}
                  />
                  <NotifRow
                    icon={Bell}
                    label="Meeting Reminders"
                    description="Upcoming union meeting notifications"
                    checked={profile.notifMeetings ?? true}
                    onChange={(v) => notifMutation.mutate({ notifMeetings: v })}
                  />
                  <NotifRow
                    icon={BellOff}
                    label="Grievance Status Updates"
                    description="Updates on grievances filed on your behalf"
                    locked
                    checked={true}
                  />
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card className="border-destructive/30">
            <CardContent className="p-4 text-center text-sm text-muted-foreground">
              No member record linked. Contact your steward.
            </CardContent>
          </Card>
        )}
      </div>
    </MemberPortalLayout>
  );
}
