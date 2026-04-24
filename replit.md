# Unionize — Union Steward App

## Overview

Mobile PWA for union stewards to manage member records, track grievances, post bulletins, and access CBA documents. Built as a pnpm monorepo with a React + Vite frontend and Express API server backed by Neon cloud PostgreSQL. Full RBAC system with role-configurable permissions. Includes a Gemini AI assistant (CBA Q&A) and AI-powered grievance drafting.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **API framework**: Express 5
- **Database**: Neon cloud PostgreSQL (`NEON_DATABASE_URL`) via `drizzle-orm/neon-serverless`
- **ORM**: Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec) — **do NOT edit generated files in `lib/api-zod/`**
- **Frontend**: React + Vite + shadcn/ui + TanStack Query + Wouter
- **AI**: Google Gemini (`gemini-2.5-flash` for main, `gemini-2.5-flash-lite` for quick tasks)
- **Push notifications**: Web Push API (VAPID keys in secrets)
- **Email**: Resend (via Replit integration)

## Artifacts

| Artifact | Path | Description |
|----------|------|-------------|
| `pwa-app` | `/` | Mobile PWA — bottom tab nav (Dashboard, Members, Grievances, Bulletins) |
| `api-server` | `/api` | REST API server (Express) |

## Database Schema

- **members** — `seniority_rank`, `accommodation_active`, `steward_notes`, `card_signed` added
- **grievances** — `grievance_type`, `incident_date`, `remedy_requested`, `outcome` added
- **announcements** — `urgency_level`, `scheduled_for`, `is_published`, `expires_at` added; 10 categories
- **meetings** — `agenda_items` (jsonb), `attendance_data` (jsonb) added
- **documents** — `steward_only` (boolean), `version_number` (int default 1), `change_note` (text), `document_group_id` (int) added; `document_group_id` initialized to `id` for all existing rows; index `idx_docs_group_id` added
- **grievances** — `cba_document_id` (int) added; auto-populated with current CBA document ID on grievance creation
- **bulletin_acknowledgements** — tracks per-member bulletin reads
- **bulletin_responses** — tracks mobilization responses (`im_in`/`need_info`)
- **grievance_notes**, **audit_logs**, **local_settings**, **access_requests**, **member_files**, **discipline_records**, **push_subscriptions**
- **member_journal_entries** — member-private incident log (`incident_type`, `incident_date`, `incident_time`, `shift`, `location`, `department`, `description`, `persons_involved`, `management_documentation_issued`, `union_rep_present`, `steward_notified`, `urgent`, `shared`, `shared_at`, `locked`); created via `ensureMemberJournalTables()`
- **member_journal_addendums** — addendums to locked journal entries (`journal_entry_id`, `content`); created via same migration
- **member_complaints** — `source` (TEXT) and `journal_entry_id` (INT) columns added for journal-sourced complaints

All schema additions done via `ensureAdvancedFeatureTables()` raw SQL `ADD COLUMN IF NOT EXISTS` on startup (new journal tables via `ensureMemberJournalTables()`).

## API Routes (key)

- `GET/POST /api/members` — member list & create (cardSigned, seniorityRank, accommodationActive, stewardNotes)
- `GET/PATCH/DELETE /api/members/:id` — member CRUD (role-based field filtering)
- `GET/POST /api/grievances` — grievance list & create (grievanceType, incidentDate, remedyRequested from `req.body` not parsed `d`)
- `GET/PATCH/DELETE /api/grievances/:id` — grievance CRUD (same `req.body` pattern for extra fields)
- `GET/POST /api/announcements` — bulletin list (`?view=active|scheduled|archived`) & create (category bypass via rawCategory)
- `POST /api/announcements/:id/acknowledge` — member bulletin ack (uses `linkedMemberId ?? userId`)
- `POST /api/announcements/:id/respond` — mobilization response (uses `linkedMemberId ?? userId`)
- `GET /api/announcements/:id/acknowledgements` — steward: ack dashboard (rate, list)
- `GET /api/announcements/:id/responses` — steward: mobilization response breakdown
- `POST /api/announcements/:id/notify-unacknowledged` — send push to unacked members
- `GET /api/member-portal/bulletins` — member feed (isAcknowledged, myResponse, uses `linkedMemberId ?? userId`)
- `GET /api/member-journal` — list own journal entries with addendums (member-only, requires linkedMemberId)
- `POST /api/member-journal` — create locked journal entry (member-only)
- `POST /api/member-journal/:id/addendum` — add addendum to locked entry (member-only)
- `POST /api/member-journal/:id/share` — one-way share to steward; auto-creates complaint, sends push if urgent (member-only)
- `GET /api/member-journal/:id/export` — export single entry as print-ready HTML (member-only)
- `GET /api/member-journal/export` — export all own entries as print-ready HTML (member-only)
- `DELETE /api/member-journal/:id` — delete unshared entry only (member-only)

## Key Bug Fixes

- **api-zod category bypass**: `CreateAnnouncementBody` only has 5 categories — strip category before parsing, validate separately with `ANNOUNCEMENT_CATEGORIES.includes()`
- **api-zod extra fields stripping**: `UpdateGrievanceBody` strips `incidentDate`/`remedyRequested` — always read these from `req.body` (`rawBody`) not from parsed `d`
- **Acknowledge/respond fallback**: Uses `linkedMemberId ?? userId` so unlinked member accounts still work

## Frontend Pages

- **BulletinCreate** (`/bulletins/new`) — 10 categories, urgencyLevel auto-set by category, scheduledFor + expiresAt fields, red/blue warning banners
- **Bulletins** (`/bulletins`) — Active/Scheduled/Archived tabs, Emergency overlay (full-screen red modal for critical), EmergencyBanner inline, category chips
- **BulletinDetail** (`/bulletins/:id`) — Steward Tools: Ack Dashboard (expandable, rate bar, notify button), Mobilization Responses (I'm In / Need Info counts)
- **MemberPortalBulletins** (`/portal/bulletins`) — Acknowledge button per card, I'm In/Need More Info for mobilization bulletins
- **GrievanceCreate** (`/grievances/new`) — grievanceType, incidentDate, remedyRequested fields
- **GrievanceDetail** (`/grievances/:id`) — step tracker (Steps 1-4+Arbitration), incidentDate + remedyRequested display fields, outcome select
- **MemberCreate** (`/members/new`) — shift, seniorityDate, duesStatus, cardSigned toggle
- **MemberDetail** (`/members/:id`) — all new fields + role-based visibility (stewardNotes admin-only)
- **MeetingDetail** (`/meetings/:id`) — agenda builder (add/remove items), attendance tracking
- **Documents** (`/documents`) — search bar, stewardOnly badge/toggle
- **CbaAssistant** (`/assistant`) — quick-action suggestion chips, Gemini AI chat about CBA
- **Elections** (`/elections`) — Elections & Vote Tracker (Active/Closed tabs, Cast Ballot, Live Tally, Close Vote, Certificate)
- **MemberPortalJournal** (`/portal/journal`) — private incident journal; list view + expandable cards, new-entry form, addendum, share-with-steward (one-way, confirm dialog), export single/all as print HTML, offline IndexedDB drafts with "Pending sync" badge, 25-day statute of limitations nudge (yellow banner on unshared entries)

## Election & Vote Tracker

### Architecture
- **Secret ballot**: `formal_vote_ballots` table stores `(poll_id, choice, cast_at)` — NO userId, completely anonymous
- **Double-vote prevention**: `formal_vote_cast` table stores `(poll_id, user_id)` — tracks WHO voted, not HOW
- **Formal votes stored in existing `polls` table** with `is_formal_vote = TRUE` and new columns:
  - `formal_vote_type`, `quorum_required`, `quorum_met`, `closed_at`, `outcome`, `results_final`
- **API route**: `/api/elections` (all authenticated users can vote, admin/chair can create/close)

### Formal Vote Types
- `ratification` → Accept / Reject ballot
- `strike_vote` → Authorize Strike / Do Not Authorize ballot
- `officer_election` → Candidate names + Write-in option
- `return_to_work` → Yes, Return to Work / No ballot
- `special_resolution` → In Favour / Opposed ballot

### Eligibility
- Members: must have a `linkedMemberId` and dues_status = 'current'
- Stewards/admins: always eligible

### Key API endpoints
- `GET /api/elections` — list (stewards: all; members: active+started only), includes `hasCast`
- `POST /api/elections` — create (admin/chair only), auto-appends write-in for officer elections
- `POST /api/elections/:id/ballot` — cast secret ballot (checks eligibility + dedup)
- `GET /api/elections/:id/tally` — tally (admin: anytime; members: only after closed)
- `POST /api/elections/:id/close` — close vote, auto-determine outcome, compute quorum
- `GET /api/elections/:id/certificate` — full official results certificate data
- `PATCH /api/elections/:id` — update title/endsAt/quorum (admin, before close only)
- `DELETE /api/elections/:id` — delete vote + ballots + cast records

### Election Card UI
- Active votes: type badge, title, closes date, quorum indicator, [Cast Your Ballot] or "Secret ballot cast" confirmation, admin [Live Tally] + [Close Vote] buttons
- Closed votes: type badge, title, date closed, outcome badge (Carried/Failed/Elected), quorum status, [View Official Certificate] button

### Certificate (printable)
- Opens as a bottom sheet with full official certificate layout
- Print button opens new window with print-optimized HTML (Georgia serif, structured layout)
- Contains: organization, vote type, question, dates, ballot count, quorum status, tally bars, official result

## Critical Patterns

- **api-zod generated files**: Do NOT modify `lib/api-zod/src/generated/`. Use `req.body` directly for fields not in generated schemas, cast with `as any` where needed.
- **New Drizzle fields**: Added `as any` casting for new columns not yet in generated types (e.g. `(updates as any).cardSigned`)
- **Pool usage**: `pool.connect()` → `client.query()` → `client.release()` in try/finally for raw SQL
- **Route ordering**: Sub-routes (`/scheduled`, `/archived`, `/acknowledge`) must be mounted BEFORE `/:id`
- **Gemini constants**: `GEMINI_FLASH_LITE_MODEL = 'gemini-2.5-flash-lite'`, `GEMINI_MODEL = 'gemini-2.5-flash'` in `artifacts/api-server/src/lib/anthropic/constants.ts`
- **Session fields**: `req.session.role`, `req.session.userId`, `req.session.linkedMemberId`

## Announcement Categories (10 total)

`general` | `urgent` | `contract` | `meeting` | `action` | `safety_alert` | `strike_action` | `job_action` | `vote_notice` | `policy_change`

Mobilization categories (show I'm In / Need More Info): `job_action`, `strike_action`, `action`
Critical/emergency categories (full-screen overlay): `safety_alert`, `strike_action`, `job_action`

## Executive Dashboard

High-level summary screen for the unit chairperson and executive committee at `/executive-dashboard`. Steward/admin only. Accessible via user menu → "Executive Dashboard" (first item, bold, ShieldCheck icon).

### API Endpoint
`GET /api/executive-dashboard` — single call, all queries run in parallel via `Promise.all`. Returns:
- `grievances`: totalOpen, byStatus, byStep, deadlinesIn7Days, overdue, closedRatio (win/loss/withdrawn)
- `complaints`: totalOpen, patterns (3+ same category in 30 days), byCategory, escalatedThisMonth
- `members`: totalActive, duesInArrears, bulletinAcknowledgements (last 3, ack rate %), lastVoteParticipation
- `mobilization`: lastBulletin, activeVotes (with live votesCast), activeElections, strikeOrJobActionBulletins
- `seniorityDisputes`: thisMonth, activePatterns (3+ same type in 60 days), mostCommonType
- `upcomingDeadlines`: next 5 grievances by due_date (with daysUntilDue), active poll closings
- `generatedAt`: timestamp

### Frontend (ExecutiveDashboard.tsx)
Seven card sections with color-coded left borders: Grievances (blue), Complaints (orange), Member Engagement (emerald), Mobilization Readiness (violet), Seniority Disputes (amber), Upcoming Deadlines (rose), Quick Actions.
- Critical alert banners at top for: overdue grievances, active strike/job action bulletins, complaint patterns, seniority patterns
- Color coding: red=overdue/critical, amber=warning, green=healthy
- Bulletin acknowledgement shown as progress bars with %
- Upcoming deadline cards color-coded by urgency (red ≤3 days, amber ≤7 days)
- Refresh button in header, "Updated at [time]" shown
- Quick Actions: File Grievance, Post Bulletin, Launch Vote, Seniority Tool

## Seniority Dispute Tool

Steward-only AI-powered tool at `/seniority-disputes`. Analyzes whether correct seniority order was followed for 7 dispute types.

### Dispute Types
`scheduling`, `overtime`, `shift_bid`, `layoff`, `recall`, `promotion`, `other`

### Database
- **seniority_disputes** — `id`, `dispute_type`, `occurred_at`, `member_ids` (jsonb), `member_names` (jsonb), `description`, `management_action`, `analysis` (jsonb — full Gemini response), `violation_level`, `recommendation`, `pattern_flag` (bool — true if 3+ same type in 60 days), `created_by`, `created_at`

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/seniority-disputes/analyze` | AI analysis (Gemini flash-lite), does NOT save |
| `GET` | `/api/seniority-disputes` | List all saved disputes |
| `POST` | `/api/seniority-disputes` | Save a dispute + analysis |
| `GET` | `/api/seniority-disputes/:id` | Get one dispute |
| `DELETE` | `/api/seniority-disputes/:id` | Delete a dispute from history |

### Analysis Response Shape
```json
{
  "correctSeniorityOrder": [{ "name": "...", "seniorityDate": "...", "seniorityRank": 1, "positionInOrder": 1 }],
  "violationOccurred": true,
  "violationLevel": "Clear Violation",
  "articleReference": "Article 9.04 — Overtime",
  "explanation": "...",
  "recommendation": "File Grievance",
  "recommendationRationale": "...",
  "grievanceSummary": "pre-filled text for grievance drafting assistant"
}
```

### Key Behaviors
- Pattern detection: if 3+ same-type disputes in 60 days → `pattern_flag=true` + banner shown
- "Send to Grievance Drafting Assistant" button (shown when `recommendation === "File Grievance"`) → populates `sessionStorage("grievance_prefill")` with `_fromSeniority: true` and navigates to `/grievances/new`
- GrievanceCreate handles `_fromSeniority` identically to `_fromDetector` (pre-fills AI intake form)
- Navigation: user menu dropdown → "Seniority Disputes" (Gavel icon)

## Deployment

**All deployments go through GitHub Actions → Fly.io. Do NOT use Replit's publish/deploy button.**

- Push to `main` triggers `.github/workflows/fly-deploy.yml` automatically
- Fly.io app: `union-local-1285`, region: `ord`
- Requires `FLY_API_TOKEN` set as a GitHub Actions secret
- The Dockerfile builds both the API server and PWA into a single production image on port 8080

## Required Secrets

| Secret | Notes |
|---|---|
| `ADMIN_PASSWORD` | Mandatory — no fallback. Server exits if absent. |
| `NEON_DATABASE_URL` | Neon cloud PostgreSQL connection string |
| `GEMINI_API_KEY` | Gemini AI for CBA assistant + grievance drafting |
| `ANTHROPIC_API_KEY` | Optional — legacy; Gemini is primary AI |
| `VAPID_PRIVATE_KEY` | Web Push notifications |

## Security Features

- Password strength: min 12 chars, upper+lower+digit+special required
- Idle auto-logout: 30 minutes of inactivity
- Audit logging: all member/grievance CRUD logged to `audit_logs`
- RBAC: permissions configurable per role in Admin panel
- stewardOnly documents hidden from member-role users

## Email Notifications

- Provider: Resend (via Replit integration)
- Events: grievance filed, status changed, new access request
- Admin email configured in Admin → Config (`local_settings.admin_email`)
