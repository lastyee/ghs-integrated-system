# STEP 112 — Final Functional System Audit

## Executive result

**Classification: BLOCKED**

The audited build and quality gates pass, the demo Student remains linked to the intended record, and read-only database integrity checks are clean. However, source inspection found authorization and data-integrity gaps that conflict with the existing project contract:

1. Instructor reads are not scoped to the Instructor's assigned classes, despite the PRD requirement. Attendance and assessment-score endpoints can expose other classes' student records when an Instructor account is used.
2. A Student can use the general Student update endpoint to change their own NIM, NIK, or registered name. The dedicated profile endpoint correctly limits Student edits to phone and address, but this second path bypasses that restriction.
3. Several Instructor write permissions are granted in the seeded permission matrix but the corresponding endpoints explicitly reject Instructor users.
4. Role dashboards still display hard-coded/mock values instead of consistently using live system data.

This was an audit-only step. No application source, schema, migration, credentials, or database records were changed.

## Scope and safety

- Canonical repository: `C:\ghs-integrated-system`
- Branch: `main`
- HEAD: `e3ea29b14ed5864b17c91fb6f57a981561d76b41`
- Database: local PostgreSQL `ghs_integrated`
- Database access during this step was read-only. Login and denied-request probes did not write records.
- No seed, reset, migration, deploy, commit, push, or worktree deletion was performed.
- The existing Next.js process on port 3000 was left running.
- The nested repository and its registered worktree were preserved.

## Findings

### F-1 — Instructor data reads are not restricted to assigned classes

**Severity: HIGH · Confidence: 9/10 · Status: Confirmed by source inspection**

The PRD states: “Instructor hanya boleh mengakses class yang menjadi tanggung jawabnya.” The seeded `INSTRUCTOR` role receives `class:read`, `schedule:read`, `attendance:read`, and `assessment:read`. However, class/schedule list and detail handlers only call `requirePermission` and then query by the requested ID or without a class filter. Attendance listing similarly filters only by optional query parameters, not by Instructor assignment. The score-list endpoint returns all scores for an assessment to non-Student users.

Relevant evidence:

- `app/api/classes/route.ts` — unfiltered `class.findMany` after permission check.
- `app/api/classes/[id]/route.ts` — class lookup by ID without verifying assigned Instructor.
- `app/api/schedules/route.ts` and `app/api/schedules/[id]/route.ts` — schedule reads are not scoped to the authenticated Instructor.
- `app/api/attendances/route.ts` — non-Student reads accept arbitrary filters and otherwise list all attendance records.
- `app/api/assessments/[id]/scores/route.ts` — non-Student reads return all scores for the assessment.
- `prisma/seed.js` — grants the relevant read permissions to `INSTRUCTOR`.
- `docs/requirements/PRD.md` — limits Instructor access to their assigned classes.

The current database has no Instructor user account, so this role-specific behavior was not exercised over HTTP. The route and permission behavior nevertheless establish the unscoped access path for any account granted the seeded Instructor role. Attendance and assessment-score responses include student identifiers and names, so the scope failure exposes student records beyond the documented class boundary.

### F-2 — Student can update protected identity fields through the general Student endpoint

**Severity: MEDIUM · Confidence: 9/10 · Status: Confirmed by source inspection**

`studentUpdateSchema` accepts `nim`, `nik`, and `name`. `PATCH /api/students/[id]` allows a Student through `student:update` after checking ownership, then applies those fields without a Student-specific field restriction. By contrast, `studentProfileUpdateSchema` and `PATCH /api/profile` restrict Student self-service updates to `phone` and `address`. The general endpoint therefore bypasses the narrower profile contract and permits self-service changes to official identifiers and registered name.

Relevant evidence:

- `schemas/student.ts` — update schema accepts `nim`, `nik`, and `name`.
- `app/api/students/[id]/route.ts` — Student ownership is checked, but the update fields are not narrowed by role.
- `schemas/profile.ts` and `app/api/profile/route.ts` — the separate Student profile flow only accepts and updates phone/address.

The endpoint was not used to alter data. The only non-owner PATCH probe returned 403 before validation or mutation.

### F-3 — Instructor write permissions conflict with endpoint role checks

**Severity: MEDIUM · Confidence: 9/10 · Status: Confirmed by source inspection**

The seeded permission matrix grants Instructor `attendance:create`, `attendance:update`, `assessment:create`, and `assessment:update`. The attendance-create and assessment-create/score-write handlers additionally require the role to be `SUPER_ADMIN` or `ADMIN`, rejecting an Instructor despite the permission grant. This makes those assigned Instructor operations unavailable and leaves the permission matrix inconsistent with endpoint behavior.

Relevant evidence:

- `prisma/seed.js` — Instructor permission entries.
- `app/api/attendances/route.ts` — attendance creation role allow-list excludes Instructor.
- `app/api/assessments/route.ts` and `app/api/assessments/[id]/scores/route.ts` — assessment/score writes have the same role allow-list.

No Instructor account exists in the database, so this mismatch was not exercised at runtime.

### F-4 — Role dashboards present hard-coded/mock operational data

**Severity: MEDIUM · Confidence: 10/10 · Status: Confirmed by source inspection**

Several dashboard surfaces render mock values or mock collections rather than deriving them from current database/API results. Examples include the admin summary cards/activity/overview, Academic and Instructor dashboards, Management dashboard, and portions of Student and Placement dashboards. Some Student/Placement values are live while other displayed metrics remain fixed or sourced from `lib/mock-data.ts`; consequently the page can mix real counts with fictional operational summaries.

Relevant evidence:

- `app/page.tsx` imports `statCards` from `lib/mock-data.ts`.
- `components/dashboard/academic-dashboard.tsx` renders mock schedules, batches, progress, and activity.
- `components/dashboard/instructor-dashboard.tsx` renders mock classes, students, attendance, and assessments.
- `components/dashboard/management-dashboard.tsx` explicitly labels its summaries as mock data.
- `components/dashboard/student-dashboard.tsx` contains fixed training, attendance, and score summary values and mock collections.
- `components/dashboard/placement-dashboard.tsx` mixes API-backed values with hard-coded/mock dashboard data.

### Additional contract limitation — audit-log reads

`audit:read` is defined and assigned to `MANAGEMENT`, but no audit-log API/page handler was found in the application route tree. Audit log writes are present in mutation handlers, but the assigned read permission does not currently provide a corresponding retrieval surface. This was classified as an implementation gap; no audit records existed in the database to inspect.

## Runtime smoke checks

| Check | Result |
|---|---|
| `GET /login` | HTTP 200 |
| Quick-fill secret text in login response | Not present |
| Valid Super Admin Auth.js login | PASS; session role `SUPER_ADMIN` |
| Valid Student Auth.js login | PASS; session role `STUDENT` |
| Invalid credential probe | Rejected; no authenticated session |
| Unauthenticated `GET /api/users` | 401 |
| Student `GET /api/users` | 403 |
| Student own Student record | 200 |
| Student other Student record PATCH probe | 403 |
| Client-supplied role override during Student login | Ignored; session role remained `STUDENT` |
| Student own-resource ownership | PASS |

No credentials, passwords, hashes, or environment values were printed or added to the report.

## Database snapshot and integrity

Final read-only counts:

| Model | Count |
|---|---:|
| User | 2 |
| Role | 7 |
| Permission | 62 |
| RolePermission | 212 |
| Student | 21 |
| Program | 1 |
| Subject | 6 |
| ProgramSubject | 6 |
| Batch | 2 |
| Enrollment | 21 |
| Instructor | 6 |
| Class | 10 |
| Schedule | 10 |
| Attendance | 0 |
| Assessment | 0 |
| AssessmentScore | 0 |
| Document | 0 |
| Employer | 0 |
| Vacancy | 0 |
| Application | 0 |
| Interview | 0 |
| Placement | 0 |
| Certificate | 0 |
| AuditLog | 0 |

The counts match the STEP 112 starting snapshot. No test operation changed persistent business data.

The demo user remains role `STUDENT`, linked to the existing Student with NIM `260405066`; that Student has an active enrollment in `GHI-07`. The Student count remains 21. No Student or User was created by this audit.

Read-only orphan checks returned zero for Student→User, Enrollment→Student/Batch, Schedule→Class/Subject/Instructor, Attendance→Schedule/Student, AssessmentScore→Assessment/Student, Document→Student, Application→Student/Vacancy, Placement→Student, and RolePermission→Role/Permission.

## Functional and policy review

- Auth.js credential authentication, server-authoritative role resolution, permission checks, Student ownership checks, and activation linkage were reviewed. Live tests covered only the existing Super Admin and Student accounts.
- Attendance logic statically validates schedule, enrollment batch, duplicate attendance, and records audit entries on writes. No attendance writes were attempted.
- Assessment score logic statically validates score bounds, enrollment batch, duplicate score, and records audit entries. No assessment or score data existed for an end-to-end test.
- Application, interview, and placement transition schemas/handlers were reviewed. Those datasets are empty, so transitions were not runtime-tested.
- Document upload/verification checks file size/type/signature and uses storage operations with database/audit handling. No document existed; no upload or external storage write was attempted.
- Delete handlers were reviewed without invoking them. Historical attendance, application, interview, placement, certificate, and similar records use 405 responses where applicable; conditional entity/document/assessment deletions include dependency or state guards. The existing protected-delete policy was not altered.
- Audit writes are integrated with mutation transactions in inspected handlers. With zero audit rows and no write probes, audit event behavior is source-reviewed but not newly exercised.

## Quality gates

| Gate | Result |
|---|---|
| Full lint (`npm run lint -- --format json`) | PASS — 716 files, 0 errors, 0 warnings |
| `npx prisma validate` | PASS |
| `npx prisma migrate status` | PASS — 4 migrations, database up to date |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS — optimized production build completed |
| `npx prisma generate` | Not rerun in this step; STEP 111 documented the native-engine process-lock limitation while the project server was running |

The existing canonical-root server remained responsive after the build and returned HTTP 200 for `/login`.

## Git and worktree state

- Canonical root: `C:\ghs-integrated-system`
- Branch/HEAD remained `main` / `e3ea29b14ed5864b17c91fb6f57a981561d76b41`.
- `git diff --check` passed; Git printed only existing LF-to-CRLF working-copy warnings for `app/login/page.tsx` and `eslint.config.mjs`.
- Pre-existing modified files: `app/login/page.tsx`, `eslint.config.mjs`, `prisma/seed.js`.
- Pre-existing untracked audit reports and nested repository/worktree directories were preserved.
- The STEP 112 report is the only file added by this step.
- No commit or push was performed.

## Final classification

**BLOCKED** — Authentication and database integrity remain healthy, and all executed quality gates pass, but the Instructor class-scope authorization gap and Student identity-field update path violate existing project contracts. Mock operational dashboards and the missing audit-log read surface are additional functional limitations. No fixes were applied because this step was restricted to diagnosis/reporting.
