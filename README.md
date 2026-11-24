# Contractor Timesheets and Invoices

A small full-stack app with two roles. **Contractors** log time and submit their week.
**Clients** approve or reject those weeks and see an invoice.

Next.js 16 (App Router, Server Actions) · TypeScript · SQLite (better-sqlite3, plain SQL) · Luxon · shadcn/ui · Vitest · Playwright

## Run it

Needs Node 24 (there's an `.nvmrc`).

```bash
nvm use              # Node 24
npm install
npm run db:reset     # creates data/app.db and loads the seed data
npm run dev          # http://localhost:3000
```

Open http://localhost:3000 and pick a user. **Take the tour** in the top bar walks through the screens
for that role in about a minute. `npm run dev` also creates and seeds the database if it's missing, so a
skipped `db:reset` still works. Run `npm run db:reset` any time to start fresh.

### Tests

```bash
npm test                          # Vitest: time, money, rules and permission checks (in-memory SQLite)
npx playwright install chromium   # first time only, for the browser tests
npm run test:e2e                  # Playwright: the main flows in a real browser
npm run typecheck                 # generates Next's route types, then runs tsc
```

The browser tests start their own server on port 3100 with a separate database (`data/e2e.db`) and a
fixed clock (`APP_NOW`), so they don't depend on today's date or touch your local data.

## Seed data (all synthetic)

Dates are relative to the current week in Jakarta, so the app always looks current.

| User | Role | Time zone | What's there |
|---|---|---|---|
| Ayu Pratama | Contractor | Asia/Jakarta | Northwind at $33.33/h. Works afternoons plus evenings (New York mornings). This week has an entry that crosses midnight. Last week is waiting for review. |
| Budi Santoso | Contractor | Asia/Jakarta | Northwind, rate raised from $24.00 to $25.00. Last week was **rejected** over a "Team offsite" entry. |
| Citra Wijaya | Contractor | Asia/Jakarta | Two clients: Northwind ($40.00/h) and Bluefin ($30.00/h). Each client approves its own hours. |
| Northwind Labs | Client | America/New_York | Two weeks waiting for review. |
| Bluefin Studio | Client | Europe/London | One week waiting for review. |

A short path through it:
1. Sign in as **Budi**. Read the rejection, open last week, delete Thursday's "Team offsite", resubmit.
2. Switch to **Northwind Labs**. Approve Budi's week (or reject one with a comment).
3. Open **Invoice**. Budi's older weeks still bill at $24.00, the rate they were approved at.
4. Sign in as **Ayu** and try to break the rules: overlap an entry, go past 12 hours, end before start.

## Which time zone defines the week, and why

All times are stored in UTC. This choice only decides which calendar groups them into days and weeks.

**The contractor's time zone defines the day and the week (Monday to Sunday).**

1. The contractor works the day, logs it and submits the week, so the week should match their calendar.
2. The 12-hour cap is about one person's working day. It only makes sense in that person's day.
3. Each entry belongs to exactly one day and one week, whoever is looking. If the client's zone decided,
   a contractor with clients in New York and London would have two different "weeks" for the same hours.
4. A UTC week (some marketplaces bill this way) gives one global cutoff. But here the days must be the
   contractor's and there's a daily cap: 6 AM Monday in Jakarta is 11 PM Sunday UTC, so Monday-morning
   work would land in last week, possibly one that's already submitted and locked.

Trade-off: a Jakarta week starts at noon on Sunday, New York time. Client screens say so ("contractor's
week, Asia/Jakarta") and show each entry's times in the client's own zone, grouped by the client's own
days, with the contractor's times beside them. Invoice date ranges use the same contractor work date, so
an entry has one date everywhere.

**An entry that crosses midnight counts on the day it starts.** Splitting it at midnight would be stricter
for the daily cap, but one entry could then sit across two weeks and be half locked.

Durations are real elapsed minutes between the two UTC instants, so a 25-hour daylight-saving day counts
correctly (tested with a contractor in New York on 1 Nov 2026). A wall time that doesn't exist (skipped
when clocks go forward) or happens twice (when clocks go back) is refused instead of being guessed.

## How it works

```
src/server/          all rules live here, framework-free and tested directly
  schema.sql         4 tables: users, engagements (contractor + client + rate), time_entries, weeks
  time.ts            zone rules: work date, week start, durations
  money.ts           integer-cents maths and formatting
  entries.ts         create / edit / delete entries: all entry rules, in one transaction each
  weeks.ts           submit / approve / reject
  invoice.ts         invoice for one client and date range
  queries.ts         read models for the screens, scoped to the signed-in user
  seed.ts            synthetic data, created through the same services
  session.ts         dev login (cookie -> user)
src/app/actions.ts   Server Actions: who's signed in, then call a service. Nothing else.
src/app/...          pages: sign-in, timesheet (list / table / timeline), review, invoice
src/components/      shadcn/ui based components, the entry dialog, the guided tour
tests/               Vitest: time, money, entries, weeks, invoice, permissions, input, seed,
                     zones (the same hours seen by clients in other zones), random (see below)
e2e/                 Playwright: entries and their errors, fixing a rejected week, approve and
                     reject, the invoice, permissions, the tour
```

**Randomised tests** (`tests/random.test.ts`) run about 6,000 random operations (add, edit, delete,
submit, approve, reject, and attempts by the wrong user) against the real services and a small separate
model of the rules, which uses the platform's own time zone data instead of Luxon. After every step they
must agree, the database must match the model, and no contractor may have overlapping entries or more than
12:00 on a day. They run with contractors in Jakarta, New York and London (across the night clocks go
back), Kolkata (UTC+5:30) and Lord Howe Island (clocks move 30 minutes). Seeded, so a failure replays.

**Entry rules**, checked on the server inside one `BEGIN IMMEDIATE` transaction with the save, so two
requests can't both pass a check and then both save:
- End after start (equal is refused). An entry can't end in the future.
- No overlaps with any of the contractor's entries, **across all their clients**. Touching is fine (9-10, then 10-11).
- At most **12:00 per work date** across all clients. Exactly 12:00 is allowed, 12:01 isn't.
- The week must be open. An edit checks both the week it leaves and the week it moves into.

**Weeks** are per contractor and client. No row means draft. Submitting locks the entries. The client
approves (final; the hourly rate is locked into the week) or rejects with a required comment, which
reopens the week for the contractor to fix and resubmit. An empty week can't be submitted.

**Money** is integer cents per hour and integer minutes. No floats touch money.
An invoice line is one approved week: `minutes x rate / 60`, rounded **once per line**, half up, to the cent
(`Math.floor((minutes * rateCents + 30) / 60)`). The total is the sum of the lines. Hours show as `7:20`,
never as a rounded decimal. Submitted or rejected weeks in the range are listed under "Not on this
invoice", so nothing silently disappears.

**Permissions** are enforced on the server. Server Actions are public POST endpoints that anyone can call
with any arguments, so each action only works out who's signed in (from the cookie, never from the form)
and calls a service. The service checks role and ownership in SQL: a contractor can only touch entries
and weeks on their own engagements, and a client can only see and decide weeks for their own contractors.
The wrong user gets "Not allowed". Reads are scoped the same way. `tests/permissions.test.ts` covers each
rule, and each one fails if its check is removed.

## Decisions and trade-offs

- **SQLite with plain SQL.** One file, no Docker, no cloud account, so a clean clone runs with
  `npm install`. Synchronous transactions make "check, then save" atomic. Postgres would be the move for
  real concurrency; the SQL is ordinary.
- **Derived columns saved with each entry** (`minutes`, `work_date`, `week_start`), so day, week and invoice
  queries are plain SQL. Trade-off: changing a contractor's time zone later would need these recomputed.
- **A contractor can have several clients.** Weeks are per contractor and client, so each client approves
  only their own hours, while the overlap and 12-hour checks span all clients.
- **Rate locked at approval.** A later rate change can't rewrite an approved invoice (seeded with Budi).
- **Rounding once per invoice line** (one approved week), not per entry and not only on the total. It's
  predictable, and a line matches what the client approved. The cost: the total is the sum of rounded
  lines, so it can differ by a cent from "all hours x rate" in one go, and two invoices that split a week
  can differ by a cent from one invoice covering both.
- **Approve and reject name the version the client saw.** If a week was rejected and resubmitted while an
  old tab was open, that tab can't approve the new version unseen.
- **Clients don't see drafts.** The invoice's "Not on this invoice" list shows submitted and rejected weeks,
  not hours a contractor hasn't submitted yet.
- **Rejected weeks reopen; approved weeks are final.** Un-approving is a workflow question I'd ask about first.
- **No future entries.** Time can't be logged ahead.
- **Wrong owner gets "Not allowed"** rather than "Not found". Clearer to test and explain. Hiding whether a
  record exists would be the stricter choice for a public API.
- **Dev login is an unsigned httpOnly cookie** holding a user id, on purpose: the brief tests permission
  checks, not authentication. Every service re-checks ownership, so forging the cookie only lets you act
  as that user, which is the point of a user switcher.
- **Seed dates move with the current week** so the demo always looks live. Tests never use the seed; they
  build small fixtures with fixed dates. The seed itself is tested at awkward moments (just after
  midnight on a Monday, late Sunday, a daylight-saving day).

## Not done

- From the brief's out-of-scope list: admin role, password reset and email flows, Docker, live updates,
  charts, CSV download.
- Real authentication (the dev switcher is not secure, by design).
- A clock-in / clock-out timer. Entries are logged with a start and an end.
- Un-approving a week, and an audit history of status changes (only the latest decision is kept).
- Editing rates in the UI, and a full rate history.
- Changing a user's time zone after entries exist.
- A limit on continuous hours: 20:00 to 08:00 then 08:00 to 20:00 passes the daily cap.
- Pagination, invoice numbers, PDF, taxes, payment status, overtime and holidays.

## How I used AI

I made the planning decisions: the stack, the data model, which time zone sets the week, the permission
rules, the test cases, and what to leave out. Claude Code (Anthropic) laid out the options with a
recommendation for each, and I chose. Claude Code then wrote the code and drafted this README from that
plan. I reviewed the changes, ran the tests, and checked the permission rules myself.
