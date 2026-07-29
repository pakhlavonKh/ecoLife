# MASTER PROMPT — Telegram Bot Roles & Notification Routing
> Upgrade for the existing EcoLife project (all 9 phases of AGENTS.md are DONE and working).
> Put this file in the repo root as `BOT_ROLES.md`. Execute ONE phase at a time (§8),
> stop after each phase and wait for confirmation.

## 0. Role & ground rules

You are a senior full-stack engineer continuing the EcoLife booking platform. The codebase
already has: NestJS API (`api/`), admin SPA (`admin/`), public site, grammY bot module
(`api/src/telegram/`) with a retry queue, domain events via EventEmitter, audit_log, RBAC.

Rules (same as AGENTS.md): migrations for every DB change; no secrets in code; tests for
routing logic; do not break existing behavior — the current `TELEGRAM_ADMIN_CHAT_IDS` env
must keep working during migration (§7). Stop after each phase.

## 1. Goal

Replace the flat "one list of admin chat IDs gets everything" model with **role-based
notification routing**:

Roles: `owner` (владелец), `admin` (администратор), `manager` (менеджер), `cleaner` (уборщица).

Three separation principles:
1. **Event routing** — each role receives only the events assigned to it (matrix, §4).
2. **Data scoping** — each role sees only the fields it needs. Cleaners NEVER see guest
   names, phones, or money — only cottage + room + dates.
3. **Managed binding** — people are attached to roles via one-time invite codes generated
   in the admin panel, not by editing .env.

## 2. Database

New Prisma models (+ migration):

- `telegram_recipients` — id, chat_id (bigint, UNIQUE), name (admin-entered label, e.g.
  "Зухра — уборщица"), role enum (`owner` | `admin` | `manager` | `cleaner`),
  is_active bool default true, muted_until (nullable timestamptz), created_at, updated_at
- `telegram_invites` — id, code (UNIQUE, 8-char A-Z0-9, one-time), role enum,
  created_by FK users, expires_at (default now()+24h), used_at nullable,
  used_by_chat_id nullable
- `notification_rules` — id, event (enum, §4 list), role enum, enabled bool,
  UNIQUE(event, role). Seed with the default matrix from §4.

All mutations of these tables go to `audit_log`.

## 3. Binding flow (invite codes)

1. Admin panel → new section **"Telegram"** → "Пригласить" → pick role → system generates
   a one-time code and a deep link `https://t.me/<bot_username>?start=<CODE>` (+ QR optional).
2. Person opens the link (or sends `/start <CODE>`), bot: validates code (exists, not used,
   not expired) → creates `telegram_recipients` row with that role → replies
   "Вы подключены как <роль>" → marks invite used. Invalid/expired code → polite refusal.
3. `/start` without a code → short message: "Этот бот для сотрудников EcoLife. Попросите
   код приглашения у администратора." (do NOT print chat_id to strangers).
4. Deactivation: admin toggles `is_active` off (or deletes) in the admin panel → person
   silently stops receiving anything and commands answer "доступ отключён".
5. Rebinding an existing chat_id with a new code updates the role (one chat = one role).

## 4. Event → role routing matrix (seed defaults; editable in admin panel)

Events (align names with existing EventEmitter events; add missing ones):

| event                        | owner | admin | manager | cleaner |
|------------------------------|-------|-------|---------|---------|
| booking.created              | ✅    | ✅    | ✅      | —       |
| payment.received             | ✅    | ✅    | ✅      | —       |
| booking.checked_in           | —     | ✅    | ✅      | —       |
| booking.checked_out          | —     | ✅    | ✅      | ✅      |
| booking.updated              | ✅    | ✅    | ✅      | —       |
| booking.cancelled            | ✅    | ✅    | ✅      | —       |
| system.hold_expired          | —     | ✅    | —       | —       |
| system.late_payment_review   | —     | ✅    | —       | —       |
| system.payment_failed        | —     | ✅    | —       | —       |
| digest.morning               | ✅    | ✅    | ✅      | ✅      |

Routing resolution at send time: `recipients = telegram_recipients WHERE is_active AND
(muted_until IS NULL OR muted_until < now()) AND role IN (SELECT role FROM
notification_rules WHERE event = :e AND enabled)`. Rules are read from DB (small cache
with invalidation on edit is fine), so admin edits apply without restart.

## 5. Role-scoped message templates (HTML, Russian)

One formatter per (event, scope). Two scopes:

- **full** (owner / admin / manager): guest name, phone, cottage + room, dates, beds,
  total, deposit, paid, remaining, status, public_code. `booking.updated` shows a
  "было → стало" diff. System events include actionable details.
- **cleaner** (cleaner role): ONLY cottage, room number, checkout date/time. Example:
  «🧹 Освободился номер 305 (Chorshanba kottej). Можно убирать.»
  NO names, NO phones, NO amounts, NO public_code.

Owner variant may drop verbose operational fields but keeps money. Keep templates in one
module with unit tests asserting the cleaner template contains no phone/money/name for a
fixture booking (regression guard for privacy).

## 6. Commands (role-aware; unknown/inactive users get a polite refusal)

- `/today` — owner/admin/manager: заезды и выезды на сегодня (guests, rooms);
  cleaner: только список номеров, освобождающихся сегодня (cottage + room, no guest data).
- `/stats` — **owner only**: period picker (day / week / month / custom) → cash-in
  report (arrivals, departures, staying guests, payments by method, total revenue).
  Admin/manager/cleaner and unbound chats get a polite refusal.
- `/mute 2h` / `/mute 1d` / `/unmute` — any bound user; sets `muted_until` for themselves.
- `/whoami` — shows the user's role and status.
- `/help` — commands available for the user's role only.

## 7. Morning digest (cron)

- Daily at 08:00 **Asia/Tashkent** (env `DIGEST_HOUR`, default 8; existing cron infra).
- owner/admin/manager digest: заезды сегодня (кол-во + список), выезды сегодня, живущие
  гости, загрузка % на сегодня, выручка за вчера, брони в ожидании оплаты.
- cleaner digest: «Сегодня освобождаются: …» — list of cottage+room for today's checkouts
  (or «Сегодня выездов нет»).
- Digest respects the routing matrix row `digest.morning` and per-user mute.

## 8. Backward compatibility & migration

- On Phase A migration: for each chat_id currently in `TELEGRAM_ADMIN_CHAT_IDS`, create a
  `telegram_recipients` row with role `admin`, name "Migrated from env".
- After migration the env var becomes a fallback ONLY when the recipients table is empty
  (log a deprecation warning). Document removal in README.
- Existing send queue/retry stays; extend it to per-recipient delivery: failure to one
  recipient must not block others. On Telegram 403 (bot blocked by user) → auto-set
  `is_active = false` + audit_log entry + warn log.

## 9. Admin panel — new section "Telegram"

1. **Получатели**: table (name, role badge, chat_id, active toggle, muted-until, created);
   actions: rename, change role, deactivate, delete.
2. **Приглашения**: generate invite (pick role) → show code + deep link + copy button;
   list of pending invites with expiry; revoke invite.
3. **Матрица уведомлений**: grid event × role with checkboxes bound to
   `notification_rules` (§4); "reset to defaults" button.
4. **Тест**: "Отправить тестовое сообщение" button per recipient (send "✅ Тест связи
   EcoLife" through the same queue) — the fastest way to verify wiring.
All under existing admin RBAC (admin role only, not manager); all mutations audited.

## 10. Implementation phases (one at a time, stop after each)

- **Phase A — DB & binding.** Migration for the 3 tables (+ seed default matrix from §4 +
  migrate env chat IDs per §8); bot: `/start <code>` binding flow, `/whoami`; admin panel:
  "Получатели" + "Приглашения". Show: generate invite → bind a real chat → recipient
  appears in the panel.
- **Phase B — Routing & templates.** Replace flat broadcast with matrix routing (§4);
  role-scoped templates (§5); per-recipient queue delivery + 403 auto-deactivate; unit
  tests: routing (event → expected chat set for a fixture recipient mix) and cleaner
  template privacy. GATE: these tests green.
- **Phase C — Commands & digest.** Role-aware `/today`, `/stats`, `/mute`, `/unmute`,
  `/help` (§6); morning digest cron (§7) with a manual trigger endpoint for testing
  (`POST /api/v1/admin/telegram/digest/run`, admin only).
- **Phase D — Matrix UI & polish.** Admin "Матрица уведомлений" + test-message button
  (§9); README section (how to invite staff, roles explained); full test run
  (`test:unit` + `test:gate`) — show output.

## 11. Definition of Done

- A cleaner bound via invite receives ONLY checkout notifications and the cleaning digest,
  with no guest personal data or money anywhere — proven by a unit test.
- Owner/admin/manager receive events per the matrix; matrix edits in the admin panel apply
  without API restart.
- Deactivating a recipient stops all messages immediately; blocked-bot recipients
  auto-deactivate.
- Old env-based config still works when the recipients table is empty; documented as
  deprecated.
- All existing tests remain green; new routing + privacy tests added and green.
