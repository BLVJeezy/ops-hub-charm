# Solyn Global — Ops Hub: Build Plan

## Reality check on scope

The spec is a full re-platform of a mature internal tool: 8 database tables with RLS, 11 pages (Dashboard, Pipeline kanban, Clients list/detail, Actions, Invoices w/ PDF, Expenses, Search, public Onboarding form, Onboarding Queue, auth), realtime subscriptions on 3 pages, role-based permissions, PIN gate, jsPDF invoice generator with exact Dutch layout, revenue reports, MRR/margin math, and a full custom dark design system.

Realistically this is **multiple days of focused work**, not a single turn. I need to phase it and confirm a few things before writing code.

## Stack note

Your spec says "React 18 + Vite + React Router". This project is already scaffolded as **TanStack Start** (React 19, TanStack Router, file-based routes, SSR). I'll build on the existing stack — it gives you the same React/Tailwind/shadcn/Supabase capabilities with better routing and SSR — rather than tearing it down to plain Vite + React Router. All spec behavior can be met; only the routing file layout changes (e.g. `src/routes/clients.$id.tsx` instead of `src/pages/ClientDetail.jsx`).

If you truly need plain Vite + React Router, say so and I'll swap the scaffold first.

## Proposed phases

**Phase 1 — Foundations (this turn if you approve)**
- Enable Lovable Cloud (Supabase)
- Design system: dark theme tokens in `src/styles.css` (background, gold primary, silver secondary, sidebar tokens, status/stage color helpers)
- DB migration: all 8 tables + enums + RLS + `profiles` + `user_roles` + `has_role()` + auto-increment invoice number function + public INSERT policy for OnboardingSubmissions
- App shell: PIN gate (sessionStorage), Supabase auth (email/password + Google), `_authenticated` layout, sidebar + mobile bottom nav, TopBar with search, SolynLogo, StatusBadge/StageBadge/HealthDot, PhoneButtons, EmptyState, permission helpers
- Empty route stubs for all 11 pages

**Phase 2 — Core CRM**
- Clients list (filter tabs, sortable table, mobile cards, realtime)
- Client detail (all 8 sections) + ClientFormModal (with fee-pair auto-calc, stage↔status sync, write-off validation, status logging) + QuickAddProspect + LogContactModal + ClientStatusHistory

**Phase 3 — Pipeline + Actions**
- Pipeline kanban (`@hello-pangea/dnd`, 8 columns, drag updates stage, realtime)
- Action Planner + ActionFormModal (due-date auto-calc from waiting period)

**Phase 4 — Money**
- Invoices list + detail dialog + InvoiceFormModal (auto-numbering ≥26, line-item auto-suggest, auto-total)
- jsPDF invoice generator (`src/lib/invoicePdf.ts`) with exact FACTUUR layout, colors, Dutch labels, company footer
- Expenses list + ExpenseFormModal

**Phase 5 — Dashboard + Reports**
- Dashboard: This Week tasks, financial cards, Revenue Report (recharts monthly bar chart + KPIs), Pipeline Overview, Client Health
- Global Search page

**Phase 6 — Onboarding**
- Public `/onboarding` form (Dutch, no auth, no layout, no PIN gate)
- Onboarding Queue (admin-only nav badge with realtime pending count, approve → create client + redirect)

## Technical notes (skippable)

- **Routing:** file-based under `src/routes/`. Public: `/onboarding`, `/auth`, `/reset-password`. Protected: everything else under `src/routes/_authenticated/`. PIN gate wraps the root outlet in `__root.tsx`, checked before rendering any route including `/onboarding` per spec §7.2.
- **Data:** TanStack Query for fetching/caching (already in stack). Supabase realtime channels for Clients, OnboardingSubmissions, Invoices, Actions, Expenses. Invalidate queries on channel events.
- **Roles:** `app_role` enum (`admin`/`sales`/`ops`), `user_roles` table, `has_role()` security-definer function. RLS uses `has_role(auth.uid(),'admin')` for delete/admin-only ops.
- **Invoice numbering:** Postgres function `next_invoice_number()` returns `GREATEST(26, COALESCE(MAX(invoice_number),25)+1)`, called from a server function on insert to avoid races.
- **PDF:** pure client-side `jsPDF`, no server involvement.
- **Realtime:** `supabase.channel('table:changes').on('postgres_changes', …).subscribe()` inside a `useEffect`, calling `queryClient.invalidateQueries`.

## Questions before I start

1. **Stack:** OK to build on the existing TanStack Start scaffold (recommended), or do you want me to rip it out and go plain Vite + React Router first?
2. **Scope for this turn:** Should I do **Phase 1 only** (foundations + empty page stubs, ~1 turn), or push through **Phases 1–2** (foundations + full Clients CRUD, larger turn)?
3. **PIN gate on `/onboarding`:** The spec puts PinGate above the public onboarding route, which would block anonymous submissions. Should the PIN gate **exclude `/onboarding`** (recommended — otherwise no one can submit) or truly block everything?
4. **Auth signup:** Spec has `/register` but also says "Users cannot be created via API; they join via invite… non-admins cannot invite." Should I ship open email/password signup, admin-invite-only, or seed the first admin via SQL and disable public signup?

Once you answer I'll start executing.
