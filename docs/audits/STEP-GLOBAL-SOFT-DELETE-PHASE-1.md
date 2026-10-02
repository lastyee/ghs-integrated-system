# STEP — Global Soft Delete Phase 1

**Status: BLOCKED (implementation in place; functional verification incomplete)**  
**Canonical project:** `C:\ghs-integrated-system`  
**Branch:** `main`  
**Scope:** Program, Subject, Batch, Instructor, Employer, Vacancy, Assessment, Document

This report covers Phase 1 only. It does not claim that global soft delete is complete.

## Worktree and canonical root

- Phase 1 edits and validation were performed in `C:\ghs-integrated-system` on `main`.
- `C:\ghs-integrated-system\ghs-integrated-system.worktrees\pasted-text-processing` remains a separate worktree and was not merged, removed, reset, committed, or pushed.
- Existing uncommitted work in the canonical checkout was preserved.

## Entity verification matrix

| Entity | Schema `deletedAt` | GET/list/detail | DELETE API | UI Delete | 2-Step Confirmation | RBAC | AuditLog | Test | Status |
|---|---|---|---|---|---|---|---|---|---|
| Program | Added | Active list/detail filter | Transactional soft delete; 200/404 | List and detail | Shared dialog; API callback only on stage 2 | `program:delete` | Transactional `DELETE`, `deletedAt` before/after | Integration cases not run | Implemented; unverified |
| Subject | Added | Active list/detail filter | Transactional soft delete; 200/404 | List and detail | Shared dialog; API callback only on stage 2 | `subject:delete` | Transactional `DELETE`, `deletedAt` before/after | Integration cases not run | Implemented; unverified |
| Batch | Added | Active list/detail filter | Transactional soft delete; 200/404 | List and detail | Shared dialog; API callback only on stage 2 | `batch:delete` plus server role gate | Transactional `DELETE`, `deletedAt` before/after | Integration cases not run | Implemented; unverified |
| Instructor | Added | Active list/detail and linked-instructor checks | Transactional soft delete; 200/404 | List | Shared dialog; API callback only on stage 2 | `instructor:delete` plus server role gate | Transactional `DELETE`, `deletedAt` before/after | Integration cases not run | Implemented; unverified |
| Employer | Added | Active list/detail filter | Transactional soft delete; 200/404 | List and detail | Shared dialog; API callback only on stage 2 | `employer:delete` | Transactional `DELETE`, `deletedAt` before/after | Integration cases not run | Implemented; unverified |
| Vacancy | Added | Active list/detail; deleted employer vacancies excluded | Transactional soft delete; 200/404 | List and detail | Shared dialog; API callback only on stage 2 | `vacancy:delete` | Transactional `DELETE`, `deletedAt` before/after | Integration cases not run | Implemented; unverified |
| Assessment | Added | Active list/detail and score endpoints | Transactional soft delete; scores remain | List and detail | Shared dialog; API callback only on stage 2 | `assessment:delete` plus server role gate | Transactional `DELETE`, `deletedAt` before/after | Integration cases not run | Implemented; unverified |
| Document | Added | Active list/detail; signed URL is obtained only after active-record lookup | Transactional DB-only soft delete; 200/404 | List, including verified documents | Shared dialog; API callback only on stage 2 | `document:delete` plus server role gate | Transactional `DELETE`, `deletedAt` before/after | Integration cases not run | Implemented; storage cleanup TBD |

The shared dialog text is:

- Stage 1: “Apakah yakin kamu ingin menghapus data ini?” (`Batal`, `Lanjutkan`)
- Stage 2: “Apakah kamu benar-benar yakin ingin menghapus data ini?” with record identity and retention explanation (`Batal`, `Ya, Hapus`)

The confirmation component disables actions while pending and guards duplicate submissions. All Phase 1 delete entry points use it. Existing success feedback is an inline status/notice, not a transient toast; the explicit toast requirement remains unmet.

## Schema and migration

- Added nullable `deletedAt` columns to all eight Phase 1 models in `prisma/schema.prisma`.
- Added additive migration `prisma/migrations/20260930110000_global_soft_delete_phase1/migration.sql`.
- Applied only this additive migration with `prisma migrate deploy`; no reset or seed was run.
- Existing dependency rows are not deleted or changed by these handlers. Audit events record only the `deletedAt` before/after values.
- Document deletion retains the storage object. Irreversible storage cleanup remains **TBD**.

## Related behavior and reporting

- Creation paths that would attach new records to deleted Program, Batch, Subject, Instructor, Employer, or Vacancy records now reject those archived parents.
- Academic and placement dashboards/reports exclude deleted Phase 1 entities from their operational totals. Historical child rows are retained.
- The User DELETE correction remains unchanged: it updates only `User.deletedAt`, preserves Student/Instructor rows and relations, and writes its audit event transactionally. Authentication/authorization rejects deleted users.
- Certificate lifecycle remains separate (`ACTIVE`/`REVOKED`); no certificate status or record is changed by this phase.
- Dashboard and report pages are aggregate/read-only surfaces, not deletable entities; persisted report deletion is **NOT APPLICABLE**.

## Tests and verification limits

The requested per-entity functional cases (anonymous 401, unauthorized 403, nonexistent 404, authorized 200, retained row/timestamp, active GET exclusion, AuditLog delta, relation preservation, and repeated-delete behavior) were **not run**. There is no isolated disposable database configured. The connected `ghs_integrated` database contains existing data, so no synthetic fixture mutations or cleanup were attempted there.

The shared database was changed only by applying the additive nullable-column migration. No fixture was created or soft-deleted.

### Row-count integrity

Counts recorded before migration and re-read afterward were identical:

| Table | Before | After |
|---|---:|---:|
| Program | 1 | 1 |
| Subject | 6 | 6 |
| Batch | 2 | 2 |
| Instructor | 6 | 6 |
| Employer | 0 | 0 |
| Vacancy | 0 | 0 |
| Assessment | 0 | 0 |
| AssessmentScore | 0 | 0 |
| Document | 0 | 0 |
| AuditLog | 19 | 19 |

All eight new `deletedAt` columns currently have zero non-null values. There are 21 Students and 2 active SUPER_ADMIN accounts; neither count was modified by this phase. No application data or AuditLog rows were changed.

### Quality gates (canonical root)

| Command | Result |
|---|---|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npx prisma validate` | PASS |
| `npx prisma migrate status` | PASS — schema up to date after applying the Phase 1 additive migration |
| `npm run build` | PASS |
| `git diff --check` | PASS (Git emitted line-ending conversion warnings only) |

These gates validate compilation and schema, not the missing HTTP/database fixture scenarios or browser interactions.

## Repository scan and remaining blockers

- The eight Phase 1 API folders contain no Prisma hard-delete calls or raw SQL `DELETE FROM` statements. Document storage deletion remains only in the existing upload-failure cleanup path, not in its soft-delete handler.
- A repository-wide text scan also finds legacy test scripts using `deleteMany` (including cleanup code touching AuditLog), as well as older audit documents describing previous 405/hard-delete behavior. Those scripts were not run or changed; their cleanup safety needs a separate exact-fixture audit.
- Remaining verification blockers:
  1. Run the full 8-entity behavior matrix against an isolated disposable database.
  2. Exercise the confirmation flow in a browser and provide transient success-toast behavior.
  3. Verify the affected role permissions against the target deployed permission data without reseeding the shared database.
  4. Continue the global audit for modules outside these eight entities; this phase does not certify them.

**Final Phase 1 status: BLOCKED.** The additive schema/API/UI implementation and quality gates are present, but the required functional, browser, and toast verification is incomplete. Do not treat this as completion of global soft delete.
