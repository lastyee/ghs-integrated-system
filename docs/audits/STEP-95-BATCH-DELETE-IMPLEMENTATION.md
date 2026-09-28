# STEP 95 — Batch DELETE Implementation

## 1. Objective

Implement `DELETE /api/batches/[id]` for a Batch with no dependent Enrollment, Class, Schedule, or Certificate records. No dependency is cascade-deleted. The endpoint returns `404` for a missing Batch and `409` when a dependency blocks deletion.

## 2. SYSTEM_POLICY Reference

This implementation follows the Batch proposal in [STEP-93-SYSTEM-DELETE-POLICY-DESIGN.md](./STEP-93-SYSTEM-DELETE-POLICY-DESIGN.md). That document is a `SYSTEM_POLICY` proposal, **not official GHS policy**. The technical rules implemented here must not be represented as GHS approval.

## 3. Current Schema and Relations

- Batch requires Program.
- Enrollment, Class, and Certificate reference Batch directly.
- Schedule references Class, which references Batch.
- The required relations restrict deletion; no dependent business rows are deleted.
- Batch has no lifecycle/archive status. No status or schema change was introduced.

## 4. Permission and RBAC

Added `batch:delete` to the permission seed definitions and assigned it to `SUPER_ADMIN`, `ADMIN`, and `ACADEMIC_STAFF`.

The API calls `requirePermission("batch:delete")` and applies a server-side role allowlist. It does not trust frontend-supplied role information. Unauthenticated requests return `401`; authenticated users without the permission return `403`.

## 5. DELETE API

`DELETE /api/batches/[id]` validates the ID, checks existence, and returns:

- `200` — `{ "success": true }` after deletion and audit succeed.
- `404` — Batch not found.
- `409` — dependent records exist or a recognized FK/serialization conflict occurred.
- `401` / `403` — unauthenticated / forbidden.
- `500` — unexpected server error, with server-side logging and no database details exposed.

The conflict response includes current dependency counts. It does not report success on conflict.

## 6. Dependency Rules

Deletion is blocked if any of the following counts is non-zero:

- Enrollment
- Class
- Schedule under the Batch's Classes
- Certificate

Enrollment/Class are the requested primary dependencies. Schedule is checked explicitly, and Certificate is included to honor the complete STEP 93 system proposal and avoid removing historical certificate associations. No Student, Program, Subject, Enrollment, Class, Schedule, or Certificate is deleted.

## 7. Transaction and Concurrency

Existence and dependency checks, Batch deletion, and audit insertion run in a Prisma `Serializable` transaction. An FK or serialization conflict (`P2003` / `P2034`) returns `409`; the transaction cannot leave a partial deletion or success audit. Any recognized conflict is rechecked for current dependency counts.

The isolated test raced an Enrollment insertion against Batch DELETE. Enrollment creation won; DELETE returned `409`, and the Batch and Enrollment remained. The test also verified no fixture orphans.

## 8. Audit Logging

A successful deletion writes `BATCH_DELETE` with entity `Batch`, the deleted Batch ID, the authenticated actor, and dependency counts in the same transaction. Blocked deletes create no success audit. AuditLog rows are retained.

## 9. UI Behavior

The Batch list receives `batch:delete` capability from a server-side permission lookup. The Delete action is disabled with an explanatory dependency reason when Enrollment, Class, or Certificate counts are non-zero; Class also covers its required Schedule relation. Otherwise, the user sees a permanent-delete confirmation. API `409` is displayed as an error, not success; a `200` shows success and reloads the list.

The UI is only a convenience check. Authorization and dependency validation remain server-side.

## 10. Test Cases and Results

`node scripts/test-step95-batch-delete.mjs` — **PASS**.

Verified unauthenticated and forbidden-role responses, all three allowed roles, not-found handling, safe deletion and disappearance, actor-attributed audit, and Batch/Enrollment/Class GET/PATCH regression behavior. Also verified:

- Enrollment-only, Class/Schedule, combined Enrollment + Class, and Certificate dependencies each return `409`.
- Each blocked Batch and its dependencies remain, with no `BATCH_DELETE` audit.
- Enrollment-vs-delete concurrency preserves a consistent outcome.
- Manual GHS records are unchanged.
- Fixture cleanup uses recorded exact IDs; all STEP 95 test fixtures are absent afterward.
- No orphan Enrollment, Class, Schedule, or Certificate rows exist.

The legacy regression suite was not run. This step requested an isolated test, and older destructive suites have not been established as safe for manual database records.

## 11. Quality Gates

| Command | Result |
|---|---|
| `npx prisma validate` | PASS |
| `npx prisma migrate status` | PASS — database schema is up to date |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |

## 12. Database Integrity

Read-only verification after the test:

| Record | Count |
|---|---:|
| Batch | 3 |
| Enrollment | 22 |
| Class | 12 |
| Schedule | 10 |
| Certificate | 0 |
| AuditLog | 871 |

The entity fixture counts returned to their pre-test baselines. AuditLog increased by six: three expected `BATCH_DELETE` success audits and three GET/PATCH regression operations that write update audits. Audit records were not cleaned up.

All STEP 95 Batch, Student, Enrollment, Class, Schedule, Certificate, and User fixture counts were zero after cleanup. Orphan counts for Enrollment, Class, Schedule, and Certificate were all zero.

## 13. Manual Data Safety

Before and after the isolated test, these requested records were present with unchanged identities:

- Batch `GHI-09`
- Student NIM `269067460`
- Employer `bounty`
- Vacancy `KITCHEN`
- The Placement related to that Employer
- KTP Document

## 14. Known Limitations and TBD

- The system proposal is not an official GHS business decision; policy ownership/approval remains external to this implementation.
- The race test covers concurrent Enrollment creation. Class creation has the same required Batch FK and is protected by the transactional check/FK conflict path, but a separate concurrent Class-insert test was not run.
- No archive lifecycle or status was added.

## 15. Final Status

No Prisma schema or migration change was made. Assessment DELETE behavior was not changed. Instructor and Document DELETE were not implemented. No deployment, commit, or push was performed.

**PASS** — targeted tests, manual-data checks, integrity verification, and all requested quality gates passed.
