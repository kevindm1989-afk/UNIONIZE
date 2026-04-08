# Union Local 1285 — Steward App

## Overview

Mobile PWA for Union Local 1285 stewards to manage member records, track grievances, post bulletins, and access CBA documents. Built as a pnpm monorepo with a React + Vite frontend and Express API server backed by PostgreSQL. Full RBAC system with role-configurable permissions. Includes a Claude AI assistant (CBA Q&A) powered by Anthropic via Replit AI Integrations.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
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
- **announcements** — bulletins/announcements (title, content, category, is_urgent, published_at)
- **member_files** — attached documents per member (category: general/discipline/grievance)
- **audit_logs** — immutable trail of create/update/delete on members & grievances
- **local_settings** — configurable key-value store (e.g. `grievance_deadline_step_N` days)

## API Routes

- `GET/POST /api/members` — member list & create
- `GET/PATCH/DELETE /api/members/:id` — member CRUD
- `GET /api/members/:id/grievances` — member's grievances
- `GET/POST /api/grievances` — grievance list & create
- `GET/PATCH/DELETE /api/grievances/:id` — grievance CRUD
- `GET /api/grievances/stats/summary` — grievance stats
- `GET/POST /api/announcements` — bulletin list & create
- `GET/PATCH/DELETE /api/announcements/:id` — bulletin CRUD
- `GET /api/dashboard/summary` — dashboard stats
- `GET /api/dashboard/recent-activity` — recent grievances & bulletins

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

## Security Features
- Password strength: min 12 chars, upper+lower+digit+special required (enforced on user create/reset)
- Idle auto-logout: 30 minutes of inactivity signs user out
- Audit logging: all member/grievance CRUD logged to `audit_logs` with IP, user, old/new values

## Grievance Enhancements
- Steps 1–5 (Step 5 = Arbitration with 30-day deadline)
- `accommodation_request` flag (ADA) on each grievance
- `isOverdue` computed field (due_date past + non-terminal status)
- Due dates auto-calculated from `local_settings` (`grievance_deadline_step_N`) on create or step change
- Overdue/ADA badges visible in list and detail views

## Announcement Categories
`general` | `urgent` | `contract` | `meeting` | `action`
