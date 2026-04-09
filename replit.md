# Union Local 1285 — Steward App

## Overview

Mobile PWA for Union Local 1285 stewards to manage member records, track grievances, post bulletins, and access CBA documents. Built as a pnpm monorepo with a React + Vite frontend and Express API server backed by PostgreSQL. Full RBAC system with role-configurable permissions. Includes a Claude AI assistant (CBA Q&A) powered by Anthropic via Replit AI Integrations.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: Replit Helium PostgreSQL (internal, via `DATABASE_URL=postgresql://postgres@helium/heliumdb`)
- **ORM**: Drizzle ORM — **must use `drizzle-orm/neon-serverless`** (not `neon-http`) because the DB is Helium, not Neon cloud; the neon-http driver silently drops UPDATEs against Helium
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Frontend**: React + Vite + shadcn/ui + TanStack Query
- **Routing**: Wouter
- **Build**: esbuild (CJS bundle)

## Artifacts

| Artifact | Path | Description |
|----------|------|-------------|
| `pwa-app` | `/` | Mobile PWA — bottom tab nav (Dashboard, Members, Grievances, Bulletins) |
| `api-server` | `/api` | REST API server (Express) |

## Database Schema

- **members** — union member records (+ seniority_date, dues_status, dues_last_paid, shift, classification_date)
- **grievances** — grievance tracking (steps 1–5 incl. Arbitration, accommodation_request flag; due_date auto-calculated from local_settings)
- **grievance_notes** — per-grievance activity timeline (manual notes + auto-logged status/step changes)
- **announcements** — bulletins/announcements (title, content, category, is_urgent, published_at)
- **member_files** — attached documents per member (category: general/discipline/grievance)
- **audit_logs** — immutable trail of create/update/delete on members & grievances
- **local_settings** — configurable key-value store (e.g. `grievance_deadline_step_N` days)
- **access_requests** — member access request system (status: pending/approved/rejected, firstName, lastName, email, employeeId, department, requestedRole, roleJustification, reviewedBy, rejectionReason)

## API Routes

- `GET/POST /api/members` — member list & create
- `GET/PATCH/DELETE /api/members/:id` — member CRUD
- `GET /api/members/:id/grievances` — member's grievances
- `GET/POST /api/grievances` — grievance list & create
- `GET/PATCH/DELETE /api/grievances/:id` — grievance CRUD
- `GET /api/grievances/stats/summary` — grievance stats
- `GET /api/grievances/:id/notes` — per-grievance activity timeline
- `POST /api/grievances/:id/notes` — add a note (requires grievances.file); auto-notes on status/step changes
- `GET/POST /api/announcements` — bulletin list & create
- `GET/PATCH/DELETE /api/announcements/:id` — bulletin CRUD
- `GET /api/dashboard/summary` — dashboard stats
- `GET /api/dashboard/recent-activity` — recent grievances & bulletins
- `GET /api/audit-logs` — admin audit trail (requires members.edit); supports entityType filter

## PWA Pages

- **Dashboard** — stats tiles + recent grievances + recent bulletins
- **Members** — searchable directory + create/edit/delete
- **Grievances** — filtered list (by status) + create/edit/delete + step tracking
- **Bulletins** — announcement list (urgent pinned) + create/delete

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Grievance Statuses
`open` | `pending_response` | `pending_hearing` | `resolved` | `withdrawn`

## Dues Statuses
`current` | `delinquent` | `suspended` | `exempt`

## Required Secrets

The API server will **refuse to start** if any of these are missing in production:

| Secret | Where to set | Notes |
|---|---|---|
| `ADMIN_PASSWORD` | `fly secrets set ADMIN_PASSWORD=<value>` | **Mandatory.** No default. Server exits with a fatal error if unset. Use a strong random value (≥16 chars). |
| `ADMIN_USERNAME` | `fly secrets set ADMIN_USERNAME=<value>` | Optional — defaults to `"admin"` if unset. |
| `DATABASE_URL` | Neon dashboard → Connection string | PostgreSQL connection string. |
| `ANTHROPIC_API_KEY` | Replit Secrets (AI integration) | Required for the AI assistant feature. |

> **Never commit credential values.** `fly.toml` contains only a reference comment for `ADMIN_PASSWORD`.
> Run `fly secrets list` to verify secrets are present before deploying.

## Security Features
- Password strength: min 12 chars, upper+lower+digit+special required (enforced on user create/reset)
- Idle auto-logout: 30 minutes of inactivity signs user out
- Audit logging: all member/grievance CRUD logged to `audit_logs` with IP, user, old/new values
- **No hardcoded credentials** — `ADMIN_PASSWORD` has no fallback; server exits at startup if the env var is absent

## Grievance Enhancements
- Steps 1–5 (Step 5 = Arbitration with 30-day deadline)
- `accommodation_request` flag (ADA) on each grievance
- `isOverdue` computed field (due_date past + non-terminal status)
- Due dates auto-calculated from `local_settings` (`grievance_deadline_step_N`) on create or step change
- Overdue/ADA badges visible in list and detail views

## Email Notifications
- Provider: **Resend** (via Replit integration — no SMTP credentials needed)
- Trigger events: new grievance filed, grievance status changed, new access request
- Recipient: admin email — set in Admin → Config tab (stored in `local_settings.admin_email`) or `ADMIN_EMAIL` env var
- All notifications are fire-and-forget (never block the API response)
- Notifications silently skip if no admin email is configured

## Admin Panel Config Tab
New "Config" tab in the Admin panel (`/admin`) for:
- Admin notification email (stored in `local_settings`)
- Portal URL for email links (defaults to Fly.io URL)
- Grievance step deadlines (days per step 1–5)

## Settings API
- `GET /api/settings` — returns all local_settings as `{ key: { value, description } }`
- `PATCH /api/settings` — updates one or more allowed keys
- Requires `members.edit` permission

## Announcement Categories
`general` | `urgent` | `contract` | `meeting` | `action`
