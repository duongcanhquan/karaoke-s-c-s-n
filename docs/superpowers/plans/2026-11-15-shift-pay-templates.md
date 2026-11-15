# Shift pay templates — Implementation Plan

> **For agentic workers:** `update_shift_templates.sql` must be run in Supabase SQL Editor after deploy.

**Goal:** Configurable shift templates + flexible SHIFT/MONTHLY pay with optional clock-in for monthly staff.

**Spec:** `docs/superpowers/specs/2026-11-15-shift-pay-templates-design.md`

## Files

- `update_shift_templates.sql` — migration
- `supabase_schema.sql`, `update_disable_rls_all.sql` — keep in sync
- `lib/shift-pay.ts` — resolve rate / clock-out total
- `app/actions/hr.ts` — template CRUD, rates, clockIn/Out, staff pay fields
- `components/hr/shift-board.tsx` — UI
- `app/admin/hr/page.tsx` — load templates/rates; monthly payroll
- `app/actions/manager-summary.ts` — include monthly salary in period totals

## Tasks

1. SQL + helpers
2. HR server actions
3. HR page data + payroll
4. Shift-board UI
5. Typecheck
