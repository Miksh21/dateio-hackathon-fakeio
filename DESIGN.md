# 360° Feedback — Supabase Data Model & Build Spec

> Source of truth for the Claude Code build.
> Derived from **PRD v1.0 (updated)** + design decisions locked in chat.
> **Where the PRD and the chat decisions conflict, this file wins.** Conflicts are noted in §11.

---

## 0. Scope of this build

**In scope (this pass):** Supabase only — schema (tables, enums, FKs, indexes), RLS policies, anonymization views/functions, the assignment-generation function, and the Bamboo seed.

**Out of scope (this pass):** frontend (Lovable), n8n flows, email templates, PDF export. The schema is designed so n8n + OpenAI can read/write to it later without migration changes.

---

## 1. Conventions

- PostgreSQL (Supabase). UUID PKs via `gen_random_uuid()`.
- `created_at` / `updated_at` as `timestamptz default now()`.
- RLS **enabled on every table**. `snake_case` everywhere.
- Auth: Supabase **native email OTP** (6-digit). No passwords, no custom OTP/codes table.
- Allowed login domains: **configurable list** (env/setting), default `@dateio.eu` + `@tapix.io`. The test roster uses `@fakeio.eu`, so add it for seeding/testing. Enforced before OTP send; email must also exist in `employees`.

---

## 2. Roles & identity

- Participant role enum `app_role`: `ceo | manager | ic`.
- `is_super_admin boolean` — **decoupled from `role`**. Dedicated admin emails get this flag. Grants admin panel, raw + de-anonymized read, and the UI ability to act as super admin **or** switch to their own `manager`/`ic` view.
- A super admin **may also be an active participant** (has a `role` and gets assignments). A pure admin is `is_super_admin = true, is_active = false` → generates no assignments.
- Up to **2 CEOs**. CEOs **never** give or receive feedback to/from each other.
- Role resolved at login by matching `auth` email → `employees.email`. Not in directory → login blocked.
- **Role is inferred at seed** (the roster has no role column): `ceo` = blank `Reporting to` (or job title contains "CEO"); `manager` = anyone who appears as another person's `Reporting to`; everyone else = `ic`. `is_super_admin` comes from a hardcoded admin-email list, not the roster.

---

## 3. The feedback graph (core concept)

- `employees.reporting_to_id` is the **Bamboo reporting line — reference only**. It seeds the admin's starting view; it does **not** drive feedback.
- The authoritative "who gives feedback to whom" lives in **`cycle_relationships`**, drawn per cycle by the admin, who **re-attaches** edges after import to reflect real operational relationships. This graph can differ from Bamboo (e.g. a manager can have more reportees than the formal chart — intended).
- `cycle_relationships.relationship_type`: `manages | peer`.
- `feedback_assignments` are **generated from this graph** when the admin opens the cycle, then frozen.

---

## 4. Assignment generation rules

Run when admin opens a cycle (`status: draft → open`). Generates `feedback_assignments` from `cycle_relationships` + participants:

- **self**: one per active participant (`from_id = to_id`). Pure super admins (`is_active = false`) excluded.
- **manages** edge `m → r`: `downward` (m→r) **and** `upward` (r→m).
- **peer** edge `{a, b}`: `peer` (a→b) **and** `peer` (b→a).
- **Guard**: skip any edge where *both* endpoints are CEOs.
- Arbitrary depth works (manager → manager → CEO). Direction of the edge decides `upward`/`downward`, not the role label.

---

## 5. Peer nomination (reconciled — see §11)

- Optional **input**, not authoritative. `peer_nominations` holds nominations; the admin reviews and re-attaches chosen pairs into `cycle_relationships`. Admin always has final say.
- Manager approval requirement is configurable per cycle.
- **If you want nominations dropped entirely, delete this table — the graph still works.**

---

## 6. Questions & responses (content layer)

- `questions` are per-cycle. `type`: `scale_5 | scale_10 | text | multi_choice`. Has `category`, `is_required`, `sort_order`.
- Role-pair / form-type targeting is via `target_assignment_types text[]` (e.g. `{upward}` shows the question only on upward forms; `{peer}` only on peer forms; `{self,upward,downward,peer}` everywhere).
- `responses` are per `(assignment, question)`: `scale_value int null`, `text_value text null`, `choice_value text null`, `updated_at` for autosave.
- **Question wording is seeded separately or authored by the admin — the build does not invent question content.**
- **AI fields (optional, nullable):** populated later by n8n + OpenAI. See `result_summaries` in §7. Storage is included now so no migration is needed when AI is switched on.

---

## 7. Tables (field-level)

### employees
`id uuid PK` · `email text unique` · `first_name text` · `last_name text` · `division text` · `job_title text` · `reporting_to_id uuid FK→employees null` · `role app_role` · `is_super_admin bool default false` · `work_phone text` · `is_active bool default true` · `created_at`

### evaluation_cycles
`id uuid PK` · `name text` · `status cycle_status default 'draft'` · `form_start timestamptz` · `form_end timestamptz` · `anon_min_responses int default 3 check (2..5)` · `require_peer_approval bool default false` · `reminder_config jsonb` · `created_by uuid FK→employees` · `published_at timestamptz null` · `created_at`

### cycle_relationships  *(the admin-drawn graph)*
`id uuid PK` · `cycle_id uuid FK` · `from_employee_id uuid FK→employees` · `to_employee_id uuid FK→employees` · `relationship_type relationship_type` · `created_at` · unique `(cycle_id, from_employee_id, to_employee_id, relationship_type)`

### feedback_assignments  *(generated)*
`id uuid PK` · `cycle_id uuid FK` · `from_id uuid FK→employees` · `to_id uuid FK→employees` · `type assignment_type` · `status assignment_status default 'pending'` · `submitted_at timestamptz null` · unique `(cycle_id, from_id, to_id, type)`

### questions
`id uuid PK` · `cycle_id uuid FK` · `text text` · `description text null` · `type question_type` · `category text` · `target_assignment_types text[]` · `sort_order int` · `is_required bool default true` · `created_at`

### responses
`id uuid PK` · `assignment_id uuid FK` · `question_id uuid FK` · `scale_value int null` · `text_value text null` · `choice_value text null` · `created_at` · `updated_at` · unique `(assignment_id, question_id)`

### peer_nominations  *(optional, §5)*
`id uuid PK` · `cycle_id uuid FK` · `nominator_id uuid FK` · `nominee_id uuid FK` · `status nomination_status default 'pending'` · `reviewed_by uuid FK null` · `reviewed_at timestamptz null` · `created_at`

### result_summaries  *(where AI writes; nullable until v-next)*
`id uuid PK` · `cycle_id uuid FK` · `recipient_id uuid FK→employees` · `scope text` (e.g. `peer`, `upward`, `overall`) · `ai_summary text null` · `theme_tags text[] null` · `computed_at timestamptz null` · unique `(cycle_id, recipient_id, scope)`

### audit_logs
`id uuid PK` · `actor_id uuid FK` · `action text` · `target_table text` · `target_id uuid null` · `meta jsonb` · `created_at`

### Enums
- `app_role`: ceo, manager, ic
- `cycle_status`: draft, open, closed, published
- `relationship_type`: manages, peer
- `assignment_type`: self, upward, downward, peer
- `assignment_status`: pending, draft, submitted
- `question_type`: scale_5, scale_10, text, multi_choice
- `nomination_status`: pending, approved, rejected

---

## 8. RLS & visibility

Helper functions (security definer): `current_employee_id()`, `is_super_admin()`, `my_role()`, `manager_subtree(cycle_id uuid)` (recursive CTE over `manages` edges → all descendant employee ids).

| Role | Own *given* | Own *received* | Others' aggregated | Raw / de-anon |
|---|---|---|---|---|
| super_admin | yes | yes | yes | yes (audit-logged) |
| ceo | yes (un-anon) | aggregated/anon | yes — any person, any depth (anon) | no |
| manager | yes (un-anon) | aggregated/anon | their whole subtree, all levels (anon) | no |
| ic | yes (un-anon) | aggregated/anon | — | no |

*Manager scope = the manager's whole subtree in the cycle `manages` graph (all descendants, recursive) — see §11.6.*

Per-table policy notes:
- **employees**: read = own row + (manager) their whole subtree in the current cycle graph (recursive) + (super_admin) all. Write = super_admin only.
- **feedback_assignments / responses**: insert/update only by `from_id`; forms become read-only once `now() > cycle.form_end`. Raw rows readable only by super_admin; everyone else reads received feedback **only through the aggregation views**.
- **cycle_relationships / questions / evaluation_cycles**: write = super_admin only; read = authenticated.
- **peer_nominations**: write = nominator; read = nominator + (if approval on) their manager + super_admin.
- **result_summaries**: write = service role (n8n); read follows the same visibility matrix as received feedback.

---

## 9. Anonymization

- Giver identity is **always stored** (admin must see everything). It is **hidden at the query layer** via views/RPC for non-admins — never stripped at write time.
- Threshold `evaluation_cycles.anon_min_responses` (default 3, bounds 2–5). A recipient's aggregate is **suppressed** below the threshold → UI shows "not enough responses to display."
- super_admin can de-anonymize; every de-anon read writes an `audit_logs` row.
- Provide views, e.g.: `v_my_given` (raw, own giver rows), `v_received_aggregated` (per recipient × question: avg scale + response count, threshold-gated), `v_received_text_anon` (open-text with giver masked, threshold-gated).

---

## 10. Lifecycle / gating

`status`: `draft → open → closed → published`.

- `form_end` is the **deadline**: forms lock (read-only) once passed.
- After the deadline, the super admin **manually** closes the cycle and **publishes** results. Results are visible to non-admins **only when `status = 'published'`** (and `published_at` set).
- The "X of Y submitted" figure is a live **progress indicator**, not a gate.

---

## 11. Decisions (locked)

1. **Peer nomination** — kept. Optional input; the admin-drawn graph stays authoritative. `peer_nominations` table present.
2. **Super admin** — `is_super_admin` flag separate from `role`, with UI role-switch. Seeded from a hardcoded admin-email list (§12).
3. **AI** — per-recipient summary. `result_summaries.ai_summary` populated later by n8n + OpenAI.
4. **Seed roles** — inferred automatically, no role column needed (see §2 / §12).
5. **Results gating** — forms lock on `form_end`; super admin manually closes + publishes after the deadline.
6. **Manager scope** — a manager sees their **whole subtree**: every descendant under them in the cycle `manages` graph, recursive (e.g. `Skywalker, Luke` sees `Baggins, Frodo` *and* Frodo's entire team, aggregated). Implemented via a recursive CTE (`manager_subtree`).

---

## 12. Seed (Bamboo roster)

Canonical dataset = the provided `@fakeio.eu` roster (~165 rows); the importer is tuned to it. Place it in the repo as `employees.csv`. Notes for the importer:
- Name column is `Last, First` with **multi-word surnames** (e.g. "Bartoníková Bednaříková, Jitka") → split on the **first comma**; everything before = `last_name`, after = `first_name`.
- `Reporting to` is a person **name** in `First Last` order (not email/ID) → resolve to `reporting_to_id` via name match against assembled `first_name + last_name`; log unresolved rows for a manual map. Top-of-chain rows resolve to NULL.
- `Work Email` must match an allowed domain.
- `role` is inferred (§2). `is_super_admin` is a hardcoded list in the seed config; for the test roster it is `rachel.green@fakeio.eu`. Add more emails to that constant as needed.
- **Reporting-to format**: in this export `Reporting to` is `Last, First` — the same key as the name column — so resolve by exact match on the raw `Last, First` string. (An older export used `First Last`; support both.)
- **Last names are not unique** (many Stark / Greyjoy / Lannister; two Fett; two Clegane; "Hudson, Hudson") → always match on the full `Last, First` key, and guard duplicate emails.

### Known data issues to handle (provided roster, ~165 rows)
- **Two CEOs**, both top-level with blank `Reporting to`: `Musk, Elon` and `Jobs, Steve`.
- **One unresolved manager**: `McFly, Marty` reports to `Wozniak, Steve`, who is **not in the roster** → log it, set `reporting_to_id = NULL`, and still treat Marty as a manager (Brown and Tannen report to him).
- Multi-level depth exists (e.g. `Musk → Skywalker, Luke → Baggins, Frodo → team`), so assignment generation and any subtree logic must not assume a flat CEO → manager → IC tree.

---

## 13. Out of scope (this build)

Frontend (Lovable), n8n flows, email sending, magic-link/OTP UI, PDF report cards, participation-stats endpoints. Schema supports them; they are not built here.
