# Roster MS — Employee Roster Management System

A single-company, multi-role employee roster management system.
Built from scratch with **Next.js 16 (App Router) + TypeScript + MongoDB (Mongoose) + shadcn/ui (white mode)**.

> University demo project — all seeded data is fictional.

---

## Roles

| Role | Capabilities |
|---|---|
| **ADMIN** | Everything: users, teams, roster editing, approvals, CSV, audit log |
| **MANAGER** | Roster editing, request approvals, CSV import/export |
| **TEAM_LEADER** | Roster editing (shift cells) |
| **TEAM_LEADER** | View roster & requests (read-only) |
| **EMPLOYEE** | View own schedule, submit shift change / swap requests |

---

## Quick start

1. **Create a free MongoDB Atlas cluster** → [mongodb.com/atlas](https://www.mongodb.com/atlas)
   - Get the connection string (`mongodb+srv://user:pass@cluster0.xxx.mongodb.net/`)
2. **Fill in `.env.local`**:
   ```env
   MONGODB_URI=mongodb+srv://user:pass@cluster0.xxx.mongodb.net/
   MONGODB_DB=roster
   AUTH_SECRET=any-long-random-string
   ```
3. **Install & seed & run**:
   ```bash
   npm install
   npm run seed     # wipes + seeds demo data (3 teams, 15 users, Sep 2026 roster, sample requests)
   npm run dev
   ```
4. Open **http://localhost:3000**

### Demo logins (all seeded, password: `demo123`)

| Username | Role |
|---|---|
| `admin` | ADMIN |
| `manager` | MANAGER |
| `sll-10001` (Ayesha Rahman) | TEAM_LEADER |
| `sll-10002` … `sll-30004` | EMPLOYEE |

---

## Features

- **One login for all roles** — JWT httpOnly cookie sessions (bcrypt passwords, `jose` signed)
- **Roster grid** — employees × days, click any cell to set a shift (ADMIN/MANAGER)
- **Shift requests** — CHANGE (rewrite roster on approval) and SWAP (exchanges both shifts)
- **Teams** — create teams, promote leaders (auto TEAM_LEADER role), add/remove members
- **Users admin** — create accounts, change roles, reset passwords, enable/disable
- **Audit log** — every roster edit, approval, and user action recorded
- **CSV** — import a whole month (auto-creates missing employees with password `demo123`), export current month, download template

### Shift codes

`M2` 08–17 · `M3` 09–18 · `M4` 10–19 · `D1` 12–21 · `D2` 13–22 · `DO` day off · `SL` `CL` `EL` `HL` leaves

---

## Project structure

```
app/
  actions/        # server actions (auth, users, teams, roster, requests, csv)
  admin/          # admin console (role-guarded layout + 7 pages)
  api/csv/        # export & template download routes
  login/          # single sign-in page
  my-schedule/    # employee portal
components/
  ui/             # shadcn/ui primitives (white mode only)
  *.tsx           # app-shell, roster-grid, panels, dialogs
lib/
  auth.ts         # session (jose) + guards
  mongodb.ts      # cached Mongoose connection
  shifts.ts       # shift codes, month helpers
models/
  index.ts        # User, Team, RosterMonth, ShiftRequest, AuditLog
proxy.ts          # edge auth guard (Next 16 middleware)
scripts/seed.ts   # demo data seeder
```

---

## Tech notes

- **Next.js 16** — `proxy.ts` replaces `middleware.ts`; server components + server actions; async `cookies()` / `params`
- **shadcn/ui** (base-nova preset on Base UI) — `render` prop composition instead of `asChild`
- **Tailwind CSS v4** — CSS-first config in `globals.css`
- **Mongoose** models are registered synchronously; the connection is cached across hot reloads
- Mutations validate with **zod**, then `revalidatePath` refreshes affected views
