# STEP 96 — Instructor DELETE Implementation

## 1. Objective

Implement `DELETE /api/instructors/[id]` only for an Instructor with zero Class references, zero Schedule references, and no linked User. A missing Instructor returns `404`; a dependency or linked User returns `409`.

## 2. SYSTEM_POLICY Reference

This implementation follows the Instructor proposal in [STEP-93-SYSTEM-DELETE-POLICY-DESIGN.md](./STEP-93-SYSTEM-DELETE-POLICY-DESIGN.md). It is a `SYSTEM_POLICY` design, **not official GHS policy**, and must not be described as GHS approval.

## 3. Instructor Relations

Schema audit confirmed:

- `Instructor.classes` is the reverse relation for `Class.instructorId`.
- `Instructor.schedules` is the reverse relation for `Schedule.instructorId`; Schedule directly references Instructor, independently of its Class relation.
- `Instructor.userId` is nullable and unique, with an optional relation to User.
- Class and Schedule contain the required Instructor references. Existing FK constraints restrict deletion; no business-record cascade is used.
- There was no pre-existing Instructor detail or update route. The list API is GET-only; the new `[id]` route implements only DELETE.

## 4. Permission and RBAC

Added `instructor:delete` to seed permissions and assigned it only to `SUPER_ADMIN`, `ADMIN`, and `ACADEMIC_STAFF`. The endpoint requires `requirePermission("instructor:delete")` and checks the server-derived role against this allowlist.

Unauthenticated requests return `401`; authenticated users without the permission return `403`. Client-supplied role is not trusted.

## 5. DELETE API

The endpoint validates the ID and checks the Instructor and all eligibility conditions using database records. It returns:

- `200` — `{ "success": true }`
- `404` — Instructor not found
- `409` — Class, Schedule, or linked User blocks deletion, or a recognized dependency/serialization conflict occurs
- `401` / `403` — unauthenticated / forbidden
- `500` — unexpected server error, logged server-side without database details in the response

The conflict response includes Class/Schedule counts and whether a User is linked. The API deletes only the Instructor record.

## 6. Dependency Rules

Deletion requires `classCount === 0`, `scheduleCount === 0`, and `userId === null`. Any Class or Schedule reference, or any linked User, blocks deletion. No Class, Schedule, Attendance, Assessment, AssessmentScore, User, or other related data is deleted or changed.

## 7. User-Account Protection

A linked `userId` blocks Instructor deletion with `409`. The endpoint does not delete or unlink the User, change a User role, or alter account state. Tests verified that both linked Instructor and User remained, with the same `userId`.

## 8. Transaction and Concurrency

Existence/dependency checks, Instructor deletion, and AuditLog insertion run inside one Prisma `Serializable` transaction. FK and serialization conflicts (`P2003` / `P2034`) are translated to a safe `409` (or `404` if the Instructor no longer exists). No partial delete or success audit is returned.

The isolated test raced Class creation against deletion. Class creation won; DELETE returned `409`, and both Instructor and Class remained. This demonstrated no orphan or bypass in the tested race.

## 9. Audit Logging

Successful deletion inserts `INSTRUCTOR_DELETE` with entity `Instructor`, target ID, authenticated actor, Instructor name, and dependency metadata, within the deletion transaction. Blocked requests create no success audit. AuditLog records are retained.

## 10. UI Behavior

Added an Instructor management list page and navigation item for administrator and academic roles, since the application previously had no Instructor management screen. The page checks `class:read` server-side and gets delete capability from a server-side `instructor:delete` permission lookup.

The list shows Class count, Schedule count, and whether a User account is linked. Delete is disabled with a clear reason when any dependency exists. An eligible Instructor requires confirmation (“Hapus instructor ini?”) and is described as permanently deleted. A `409` is displayed as an error; success refreshes the list. UI state is advisory; the API rechecks all conditions.

## 11. Test Cases and Results

`node scripts/test-step96-instructor-delete.mjs` — **PASS**.

Verified:

- Unauthenticated `401`; STUDENT, INSTRUCTOR, PLACEMENT, and MANAGEMENT `403`.
- SUPER_ADMIN, ADMIN, and ACADEMIC_STAFF can delete eligible fixture Instructors.
- Nonexistent Instructor returns `404`.
- Successful deletion removes the Instructor and writes an actor-attributed audit.
- Class, Schedule, linked-User, and combined Class + Schedule + User conditions return `409`, preserve all related rows, and create no success audit.
- Existing Instructor list GET, Class GET/PATCH, and Schedule GET continue to work. Schedule PATCH remains unsupported (`405`); no Instructor PATCH endpoint existed before this step.
- Concurrent Class creation and Instructor deletion preserve a valid result.
- Required manual data remains unchanged; fixture data is removed by recorded exact IDs.
- No orphan Class, Schedule, Attendance, or AssessmentScore rows remain.

The legacy regression suite was not run because its cleanup safety for manual database records has not been established.

## 12. Quality Gates

| Command | Result |
|---|---|
| `npx prisma validate` | PASS |
| `npx prisma migrate status` | PASS — database schema is up to date |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |

## 13. Database Integrity

Read-only counts after the test:

| Record | Count |
|---|---:|
| Instructors | 6 |
| Users | 1 |
| Classes | 12 |
| Schedules | 10 |
| Attendances | 22 |
| Assessments | 1 |
| AssessmentScores | 0 |
| AuditLogs | 875 |

All entity counts returned to their pre-test baselines. AuditLogs increased by four: three successful test DELETE audit records and one expected Class PATCH audit record. Audit rows were not removed.

All STEP 96 fixture Instructors, Users, Classes, Schedules, Batches, and Students were absent after cleanup. Orphan counts for Class, Schedule, Attendance, and AssessmentScore were all zero.

## 14. Manual Data Safety

The pre-test and post-test checks confirmed the requested records remained present and unchanged:

- Batch `GHI-09`
- Student NIM `269067460`
- Employer `bounty`
- Vacancy `KITCHEN`
- Related Placement
- KTP Document

## 15. Known Limitations / TBD

- SYSTEM_POLICY has not been asserted as an official GHS decision.
- There is no existing Instructor PATCH endpoint. Schedule PATCH is also not implemented; the test confirmed it remains `405`.
- The concurrency test covers Class creation. Schedule creation follows the same Instructor FK protection, but a separate simultaneous Schedule-create race was not run.
- No schema or migration change was needed.

## 16. Final Status

Assessment DELETE and Batch DELETE were not changed. Document DELETE, User DELETE, and other delete operations were not implemented. No schema change, migration, deployment, commit, or push was performed.

**PASS** — targeted tests, integrity checks, manual-data safety, and all requested quality gates passed.
