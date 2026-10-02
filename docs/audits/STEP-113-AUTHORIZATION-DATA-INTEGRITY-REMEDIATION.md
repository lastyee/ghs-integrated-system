# STEP 113 — Authorization and Data-Integrity Remediation

## Executive result

**Classification: BLOCKED**

The source findings from STEP 112 were remediated, and the full lint, Prisma validation/migration status, TypeScript, and production build gates passed. Read-only integrity checks show the original Student/User/enrollment counts and linkage remain intact, and relational orphan checks returned zero.

The result remains **BLOCKED** because a verification request accidentally changed the demo Student's contact phone before the mistake was recognized. The previous phone value was restored, but the append-only audit event was intentionally preserved and the Student's `updatedAt` timestamp changed. The database is therefore not unchanged from the STEP 112 snapshot: `AuditLog` increased from 0 to 1. No attempt was made to delete or alter the audit record.

## Remediation summary

### Instructor authorization scope

Added shared Instructor-to-record scope checks in `lib/instructor-ownership.ts` and applied them to the relevant API surfaces:

- Class reads are limited to Classes assigned to the authenticated Instructor.
- Schedule reads are limited to Schedules assigned to that Instructor.
- Attendance reads and writes are constrained through the assigned Schedule.
- Assessment reads, creation, and score operations are constrained through the assigned Class; creation also checks the Subject against the Instructor's Schedule.
- Student list/detail reads for Instructors are restricted to Students enrolled in a Batch containing one of the Instructor's assigned Classes.

The changes use existing permissions and schema relations; no permissions, migrations, or schema changes were added. Instructor assessment metadata updates remain restricted to Admin/Super Admin because they can change Class/Subject associations.

The local database has no User linked to an Instructor record. Consequently, the Instructor authorization paths were source-reviewed and type/build checked, but could not be exercised end-to-end with an authenticated Instructor without creating a fixture.

### Student identity update restriction

`PATCH /api/students/[id]` now validates Student self-service requests using the existing contact-only `studentProfileUpdateSchema`. A Student can update `phone` and `address`, but cannot change NIM, NIK, name, or submit extra identity fields. Admin/Academic Staff retain the existing master-data update schema.

Student detail reads now enforce ownership; Instructor detail reads enforce the same assigned-Batch scope as the Instructor list.

### Dashboard and audit visibility

- Replaced reported hard-coded dashboard summaries with database/API-backed values, or removed metrics whose business definitions were not established.
- Added `GET /api/audit-logs`, protected by the existing `audit:read` permission, with bounded cursor pagination and safe metadata only. The response omits audit `changes`.
- Updated dashboard audit activity displays to show recent event metadata without exposing change payloads.
- Kept the Admin/Super Admin root dashboard behind its existing role gate rather than requiring the undefined `user:read` permission.

## Runtime verification

| Check | Result |
|---|---|
| Student own Student record | Allowed |
| Student read of another Student record | 403 |
| Student attempts to update NIM, NIK, or name | 400 for each identity-field request |
| Student update of another Student record | 403 |
| Student client-supplied role override | Ignored; authenticated role remains server-authoritative |
| Audit-log read with authorized account | 200 |
| Audit-log read as Student | 403 |
| Audit-log read unauthenticated | 401 |
| Audit-log POST/DELETE | 405 |
| Audit-log invalid limit/cursor | 400 |
| Root/Admin, Management, Academic, and Student dashboard route checks | HTTP 200 |
| Student `/` redirect probe | Fetch followed the redirect and returned the destination's HTTP 200; the earlier expectation of observing a 3xx was a test-script assumption error |
| Authenticated Instructor end-to-end tests | Not available; no linked Instructor User exists in the local database |

### Verification side-effect and recovery

One profile verification request accidentally sent a valid contact-field update while expecting an identity-field rejection. It returned 200 and created an audit record. The exact prior contact value was recovered from that audit record and restored. A read-only comparison confirmed the current value equals the recorded pre-update value; the restored contact value itself is not reproduced here.

The audit record was not deleted or altered. The Student's `updatedAt` consequently remains updated, and `AuditLog` remains at 1. This is an unintended persistent test side-effect and is the reason for the BLOCKED classification.

## Database integrity

All checks below were read-only. No seed, reset, migration, delete, or cleanup was run.

| Model | STEP 112 baseline | Final snapshot |
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
| Role | 7 | 7 |
| Permission | 62 | 62 |
| AuditLog | 0 | 1 |

The demo account remains role `STUDENT`, linked to the existing Student with NIM `260405066`. That Student has one active enrollment in `GHI-07`; no Student or User was created. There is exactly one Student linked to the demo User. Student-to-User orphan and duplicate-link checks returned zero.

Read-only left-join checks returned zero orphans for Student/User, Enrollment/Student/Batch, Schedule/Class/Subject/Instructor, Attendance/Schedule/Student, Assessment/Class/Subject, AssessmentScore/Assessment/Student, Document/Student, Application/Student/Vacancy, Placement/Student, RolePermission/Role/Permission, and AuditLog/User.

## Quality gates

| Gate | Result |
|---|---|
| `npm run lint` | PASS |
| `npx prisma validate` | PASS |
| `npx prisma migrate status` | PASS — 4 migrations found; schema up to date |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS — optimized production build completed |
| `npx prisma generate` | Not run; this step did not stop or restart the existing server or retry generation because the previously documented Windows native-engine process-lock limitation remained |

## Git and safety

- Canonical repository: `C:\ghs-integrated-system`
- Branch/HEAD: `main` / `e3ea29b14ed5864b17c91fb6f57a981561d76b41`
- `git diff --check`: passed; Git emitted working-copy LF-to-CRLF warnings for some modified files.
- No schema or migration file was changed.
- No deployment, commit, push, database reset, reseed, migration, or worktree deletion was performed.
- STEP 113 source changes and this report remain uncommitted. The working tree also contains pre-existing modifications and untracked reports/artifacts; none were reverted.

## Final classification

**BLOCKED** — The STEP 112 source findings are addressed and the tested quality gates pass, but authenticated Instructor runtime coverage is unavailable without a linked Instructor account, and the verification mistake left an append-only audit event plus a changed Student `updatedAt`. The contact value was restored; the audit event was preserved rather than destructively cleaned up.
