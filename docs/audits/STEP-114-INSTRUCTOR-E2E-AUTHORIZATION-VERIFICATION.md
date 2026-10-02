# STEP 114 — Instructor E2E Authorization Verification

## Executive result

**Classification: PASS_WITH_WARNING**

Two disposable Instructor accounts were authenticated through the real Auth.js credentials flow. Own-resource access was allowed, cross-Instructor access was denied, list filters did not widen access, and tested IDOR attempts failed. Student identity protection, audit-log access rules, dashboard data sources, cleanup, database integrity, and all requested quality gates were checked.

The warning is operational: successful fixture API mutations from the initial E2E pass left eight append-only audit events, which were preserved as required. Deleting the disposable Users set their audit `userId` references to null by the existing `onDelete: SetNull` relation. The final audit count is therefore 9 rather than the STEP 113 count of 1. A later read/denial pass generated no additional audit events.

## Objective and environment

- Canonical project: `C:\ghs-integrated-system`
- Branch / HEAD: `main` / `e3ea29b14ed5864b17c91fb6f57a981561d76b41`
- Database: local PostgreSQL `ghs_integrated`
- Existing app server on port 3000 was reused; it was not stopped or restarted.
- Read-only inspection found six existing Instructor records and zero linked Instructor Users.
- Existing Instructor role permissions include `class:read`, `schedule:read`, `student:read`, `attendance:create/read/update`, and `assessment:create/read/update`.
- No seed, reset, migration, schema change, deployment, commit, push, or worktree deletion was performed.
- No password, password hash, or secret was printed or added to this report.

## Disposable fixture and cleanup

Because there were no existing linked Instructor Users, two temporary users were created with generated, process-local passwords and the existing `INSTRUCTOR` role. Each was linked to a test Instructor with an isolated Batch, Student, Enrollment, Class, and Schedule. A shared existing Program and Subject were used without changing them.

The following fixture IDs are from the completed authenticated read/denial verification pass. All listed records were deleted by exact IDs in dependency-safe order; the audit count did not change during this pass.

| Record | Instructor A | Instructor B |
|---|---|---|
| User | `cmunbikde0001tf4z99mxey5n` | `cmunbikdn0003tf4zrqix71t6` |
| Instructor | `cmunbikdp0004tf4zc2aayv5r` | `cmunbike30005tf4z0u0soxg8` |
| Batch | `cmunbikea0007tf4zc8iz64lt` | `cmunbikei0009tf4zd4ispxbp` |
| Student | `cmunbikek000atf4zlnirptfo` | `cmunbikem000btf4zt2u8rdc4` |
| Enrollment | `cmunbiken000dtf4zje460keg` | `cmunbikf0000ftf4zhkvbghq0` |
| Class | `cmunbikf1000htf4zs3836ln2` | `cmunbikf4000jtf4zfpbgkgwn` |
| Schedule | `cmunbikf8000ltf4zrd9aqs2x` | `cmunbikff000ntf4zlyq3up4v` |
| Assessment | `cmunbiktb000ptf4zo0awiala` | `cmunbikte000rtf4z9n1iyhkj` |
| Attendance | `cmunbim0w000ttf4zi104xfht` | `cmunbim16000vtf4z3z3csfxq` |
| Assessment score | `cmunbimlz000xtf4zyk9vzwj5` | `cmunbimm6000ztf4zxgsr9ise` |

Cleanup verification confirmed that the exact User, Instructor, Batch, Student, Class, Schedule, and Assessment IDs were absent afterward; all non-audit model counts matched their pre-fixture counts, including Enrollment, Attendance, and AssessmentScore. There are again zero linked Instructor Users.

An earlier mutation pass also used disposable fixtures and produced the eight audit rows described below. Its oversized command output did not preserve the full parent-fixture ID manifest. Its audited Assessment, Attendance, and AssessmentScore entity IDs are listed in the audit section; the later pass independently verified all routes with a captured fixture manifest and confirmed no test records remained.

## Authenticated authorization matrix

User A and User B each signed in through `POST /api/auth/callback/credentials`; `/api/auth/session` returned the database-derived `INSTRUCTOR` role and the matching fixture User ID. Both login attempts also supplied a client role override of `SUPER_ADMIN`; it was ignored.

| Surface | Instructor A own data | A access to B data | List/query scope |
|---|---|---|---|
| Classes | `GET /api/classes/{classA}` → 200 | `{classB}` → 403 | `GET /api/classes?instructorId={B}` returned only A's assigned Classes |
| Schedules | `GET /api/schedules/{scheduleA}` → 200 | `{scheduleB}` → 403 | `GET /api/schedules?instructorId={B}` returned only A's assigned Schedules |
| Students | Student A in A's assigned Batch → 200 | Unrelated Student B → 403 | Student list contained only Students enrolled in Batches containing A's assigned Classes |
| Attendance | A's schedule/attendance reads → 200 | B's attendance detail → 403 | A's complete list contained no B schedule rows; `scheduleId=B` → 403; `studentId=B` did not expand access |
| Assessments | A's Assessment detail/list → 200 | B's Assessment detail → 403 | List contained only A-class Assessments; `classId=B` → 403; `instructorId=B` did not expand access |
| Assessment scores | A score list/detail → 200 | B Assessment list/detail → 403 | `studentId=B` did not expand A's score scope |

The response data and list membership were checked against the authenticated Instructor's actual linked Instructor ID, not just HTTP status.

## Mutation permissions and IDOR attempts

### Attendance

- The existing Instructor role explicitly has `attendance:create` and `attendance:update`.
- The initial mutation pass successfully created attendance for A's Schedule and updated A's own Attendance; those operations generated the expected audit events.
- Creating Attendance against B's Schedule and updating B's Attendance as A returned 403.
- A Schedule-B filter returned 403. A `studentId=B` query did not return B's attendance or widen schedule scope.
- No Attendance was created or updated in the later verification pass.

### Assessment and scores

- The existing Instructor role explicitly has `assessment:create`, `assessment:read`, and `assessment:update`.
- A's Assessment creation on Class A and B's fixture Assessment creation on Class B succeeded in the initial mutation pass. A's attempted creation against Class B returned 403.
- The assessment metadata PATCH handler returned 403 for A even on A's own Assessment because the handler has an explicit Admin/Super Admin role gate. This is the current behavior and was not changed; the permission matrix's `assessment:update` grant does not override that role gate.
- A's score creation and update on Assessment A, and B's own score creation, succeeded in the initial mutation pass. Cross-Assessment score creation/update was denied.
- A's attempt to score Student B under Assessment A returned 400 because Student B is not enrolled in A's Batch.
- A Score ID from Assessment B paired with Assessment A was rejected: GET → 404 and PATCH → 400. B's score detail/update through B's Assessment returned 403 to A.
- Score update inputs cannot reassign the score's `studentId` or `assessmentId`; the handler schema accepts score/feedback and the update query only writes those fields. The runtime foreign-Student attempt was separately rejected by the Batch enrollment check.

## Audit-log regression and preserved test events

The audit-log API was checked using actual sessions:

| Request | Result |
|---|---:|
| Super Admin `GET /api/audit-logs` | 200 |
| Student `GET /api/audit-logs` | 403 |
| Anonymous `GET /api/audit-logs` | 401 |
| `limit=101` | 400 |
| Invalid cursor | 400 |
| POST / DELETE | 405 |
| Response payload includes `changes` | No |

The count was 1 before the initial mutation pass and is now 9. The eight added, append-only events have this metadata breakdown: two Assessment CREATE, two Attendance CREATE, one Attendance UPDATE, two AssessmentScore CREATE, and one AssessmentScore UPDATE. Their entity IDs are:

- Assessments: `cmunbfe1p0005x94qufggmes2`, `cmunbfe4q000ax94qvlo2bxkp`
- Attendances: `cmunbfk4m000fx94qhlp3s3zm`, `cmunbfk7x000kx94qze5dun5f`
- Assessment scores: `cmunbfnlq000sx94qf3g4j6pg`, `cmunbfnrb000xx94q8digf6bz`

These audit rows were not deleted or modified. The disposable User references are null after cleanup, consistent with the schema's `onDelete: SetNull` relation. The later verification pass did not change the count.

## Student identity regression

Validation-only PATCH requests by the real demo Student session for `nim`, `nik`, and `name` each returned 400. No allowed contact field was submitted. A read-only before/after comparison confirmed identity fields and `updatedAt` were unchanged; AuditLog count remained unchanged during these probes.

The demo account remains `STUDENT`, linked to NIM `260405066`, with an active enrollment in `GHI-07`.

## Dashboard data-source audit

| Dashboard | Data source | Remaining operational mock data |
|---|---|---|
| Super Admin / Admin | Direct Prisma counts and recent AuditLog metadata in `app/page.tsx` | None found |
| Academic | Direct Prisma counts, schedules, and batches/enrollment counts | None found |
| Instructor | Prisma queries scoped by linked Instructor for Classes, Schedules, Attendance, Students, and Assessments | None found |
| Placement | Live `/api/applications`, `/api/vacancies`, `/api/interviews`, and `/api/placements` responses; displayed counts derive from fetched records | None found; status labels and empty/loading states are UI/static |
| Management | Direct Prisma counts, status groupings, and recent AuditLog metadata | None found |
| Student | Live `/api/profile`, `/api/applications`, `/api/interviews`, `/api/placements`, `/api/attendances`, `/api/assessments`, `/api/documents`, and `/api/certificates` responses | None found; empty/loading states are UI/static |

Dashboard source searches found no mock-data imports or mock operational collections. Static status-category names, labels, icons, and empty/loading/error copy are presentation, not fabricated operational metrics.

## Database snapshot and integrity

| Model | STEP 113 snapshot | Final |
|---|---:|---:|
| User | 2 | 2 |
| Student | 21 | 21 |
| Instructor | 6 | 6 |
| Enrollment | 21 | 21 |
| Class | 10 | 10 |
| Schedule | 10 | 10 |
| Attendance | 0 | 0 |
| Assessment | 0 | 0 |
| AssessmentScore | 0 | 0 |
| Document | 0 | 0 |
| Employer | 0 | 0 |
| Vacancy | 0 | 0 |
| Application | 0 | 0 |
| Interview | 0 | 0 |
| Placement | 0 | 0 |
| Certificate | 0 | 0 |
| AuditLog | 1 | 9 |
| Role | 7 | 7 |
| Permission | 62 | 62 |

All 19 requested orphan checks returned zero: Student/User; Enrollment/Student and Batch; Schedule/Class, Subject, and Instructor; Attendance/Schedule and Student; Assessment/Class and Subject; AssessmentScore/Assessment and Student; Document/Student; Application/Student and Vacancy; Placement/Student; RolePermission/Role and Permission; AuditLog/User.

## Quality gates and repository state

| Gate | Result |
|---|---|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npx prisma validate` | PASS |
| `npx prisma migrate status` | PASS — 4 migrations found; database up to date |
| `npm run build` | PASS — production build completed |
| `git diff --check` | PASS; Git emitted only existing LF/CRLF working-copy warnings |
| Schema / migration files changed in STEP 114 | No |

The temporary runner was removed. No application source or schema files were changed in STEP 114; this audit report is the requested deliverable. Existing uncommitted STEP 113 and earlier worktree changes/artifacts remain untouched. No commit or push was made.

## Final classification

**PASS_WITH_WARNING** — Authenticated Instructor E2E checks, ownership/list scoping, cross-owner denial, Student identity protection, audit-log policy, dashboard source review, fixture cleanup, integrity checks, and quality gates passed. The warning is the eight preserved append-only audit events from successful temporary fixture API mutations, now retained with null actor references after exact test User cleanup. No temporary academic fixtures remain.
