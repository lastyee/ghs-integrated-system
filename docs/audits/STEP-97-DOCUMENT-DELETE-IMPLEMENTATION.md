# STEP 97 — Document Delete Implementation

**Policy reference:** STEP 93 `SYSTEM_POLICY`; this is not an official GHS policy.  
**Scope:** Document deletion only. Assessment, Batch, and Instructor delete behavior was not changed in this step.

## 1. Objective

Implement `DELETE /api/documents/[id]` for non-verified Documents, deleting both the database row and its private storage object while preserving retry behavior for partial failures. VERIFIED Documents must remain intact.

## 2. Policy and Schema

The implementation follows the Document proposal in [STEP-93-SYSTEM-DELETE-POLICY-DESIGN.md](./STEP-93-SYSTEM-DELETE-POLICY-DESIGN.md):

- `PENDING`, `REJECTED`, and `EXPIRED` may be deleted.
- `VERIFIED` is blocked with HTTP 409.
- This technical eligibility policy is not presented as GHS-approved business policy.

The existing `Document` row stores `storagePath`; file bytes reside in external private storage. No schema or migration changes were made.

## 3. Authorization

The API requires server-side `document:delete` permission and permits only `SUPER_ADMIN`, `ADMIN`, `ACADEMIC_STAFF`, and `PLACEMENT_STAFF`. Unauthenticated callers receive 401; authenticated callers without permission or in a disallowed role receive 403. The role and permission are resolved server-side, not trusted from request data.

The seed defines `document:delete` and assigns it to the allowed roles. No delete permission was added to `STUDENT`, `INSTRUCTOR`, or `MANAGEMENT`.

## 4. API and Data Integrity

The DELETE handler:

1. Authenticates and authorizes before accessing the record.
2. Loads and locks the Document row inside a Serializable Prisma transaction.
3. Returns 404 if the Document is absent and 409 if its database status is VERIFIED.
4. Uses the stored `storagePath` rather than client-supplied data.
5. Deletes the storage object before deleting the database row.
6. Writes a `DOCUMENT_DELETE` AuditLog in the same database transaction as the row deletion.

Successful response is `{ "success": true }`. Storage failure returns 502 and retains the database row. If storage deletion succeeds but database deletion/audit does not commit, the handler returns 503 and retains the row so a retry with the same Document ID can finish. A retry treats an already-absent storage object as successful cleanup. No AuditLog is written for a failed deletion.

The external storage operation and database transaction cannot be atomic. The row lock is held during the storage call to prevent a concurrent status change from racing deletion; this reduces the race window but can hold a database lock for the duration of the provider request.

## 5. Storage Provider

`StorageProvider.delete` now returns either `deleted` or `already_absent`. The Mock provider implements idempotent deletion and a one-shot failure hook for tests. The Supabase provider maps a successful removal response with returned objects to `deleted`, an empty successful response to `already_absent`, and provider errors to an exception.

Provider contract tests use an injected fetch mock. No live Supabase request or production storage was used; actual server-side behavior for removing an already-missing object remains unverified against the configured production project.

## 6. UI

The Documents list exposes Delete only when the server-provided capability allows it. The action is disabled for VERIFIED rows with an explanatory title. Confirmation explains that deletion is permanent. Errors, including a 409 dependency/status conflict or storage failure, remain visible; the row is removed from the UI and the list refreshed only after a successful API response.

## 7. Isolated Tests

Added `scripts/test-step97-document-delete.mjs`. It runs against a local PostgreSQL database named `ghs_integrated` and Mock storage, requires explicit `STEP97_TEST_ALLOW_MUTATIONS=YES`, and refuses non-local app/database targets. Fixtures use unique identifiers and tracked exact IDs/paths; it does not invoke global storage clear or broad cleanup.

All test assertions passed, including:

- Mock and Supabase provider contract mapping and error propagation.
- Unauthenticated and forbidden-role responses; allowed-role deletion and actor audit.
- Not found and VERIFIED protection, including preservation of its row and object.
- PENDING, REJECTED, and EXPIRED deletion; request-supplied status/path/student values do not control the deletion.
- Missing storage object, storage failure, database failure after storage cleanup, and retry paths.
- Existing document GET/signed-URL, upload, verify, and reject flows.
- Exact fixture cleanup, unchanged manual-record snapshot, retained AuditLog rows, and no orphan Document-to-Student references.

The test accounts and other tracked fixture rows were removed. The existing `AuditLog.userId` relation is `onDelete: SetNull`; consequently, test audit rows remain but their actor foreign key is nulled when the temporary test accounts are removed. Actor attribution was verified before fixture cleanup. AuditLog rows were not deleted.

## 8. Quality Gates

| Gate | Result |
|---|---|
| `npx prisma validate` | PASS |
| `npx prisma migrate status` | PASS — schema up-to-date; 4 migrations found |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `node --check scripts/test-step97-document-delete.mjs` | PASS |
| `node --env-file=.env scripts/test-step97-document-delete.mjs` | PASS — all assertions passed |
| `git diff --check` (scoped implementation files) | PASS |
| Schema/migration diff | None |

The local Next.js development server was stopped after the isolated test. No regression suite, production storage, deployment, commit, or push was used.

## 9. Database Integrity and Manual Data

Post-test read-only counts:

| Model | Count |
|---|---:|
| Users | 1 |
| Instructors | 6 |
| Programs | 1 |
| Batches | 3 |
| Students | 22 |
| Enrollments | 22 |
| Subjects | 6 |
| Classes | 12 |
| Schedules | 10 |
| Employers | 1 |
| Vacancies | 1 |
| Applications | 0 |
| Interviews | 0 |
| Placements | 1 |
| Documents | 1 |
| Certificates | 0 |
| AuditLogs | 927 |

The final run's baseline and final counts matched for Documents (1), Students (22), and Users (1). Across the two isolated runs, AuditLogs increased from 875 to 927 due to retained upload/reject/verify/delete audit events.

Manual records were unchanged and present after testing:

- Batch `GHI-09` — `cmukmu1f9002bkdmm928uf9r6`.
- Student NIM `269067460` — `MUHAMAD RIVQI`, ID `cmukmxyiw002fkdmmsxmph01v`.
- Employer `bounty` — `cmukmgv1e000ikdmm3wab04eg`.
- Vacancy `KITCHEN` — `cmuknh1cr0035kdmm9o2paobc`.
- Related Placement — `cmuknm8ns003dkdmmbx0zixoc`.
- KTP Document — `doc_4aefd49e8447405c9984192c6155f63e`, status `PENDING`.

Post-cleanup checks found zero STEP 97 Document, Student, or User fixtures, all 12 tracked STEP 97 storage paths absent, and no orphan Document-to-Student rows.

## 10. Limitations and Known Warning

- The Supabase contract is covered with a fetch mock only; no live provider request was made.
- Storage and PostgreSQL do not participate in a shared atomic transaction. The implemented failure responses and idempotent retry behavior address the tested partial-failure cases, but provider outages and network ambiguity still require operational monitoring.
- The external storage request runs while the database row lock/transaction is open.

## 11. Final Status

**PASS_WITH_WARNING**

The implementation, local isolated tests, build/type/lint/Prisma gates, and post-test data integrity checks passed. The warning is limited to the absence of a live Supabase provider verification; production storage was intentionally not used.
