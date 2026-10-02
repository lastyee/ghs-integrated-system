# STEP Global Soft Delete — Phase 4B Final Gap Closure

**Canonical project:** `C:\ghs-integrated-system`  
**Branch:** `main`  
**Final status:** **BLOCKED**

This phase adds a separate Certificate archive state and closes two UI permission-visibility gaps. It does not certify every delete screen end-to-end, and the Certificate migration remains unapplied to the canonical database. Global Soft Delete must not be declared complete.

## 1. Scope and safety

- Worked directly in the canonical project root on `main`; the nested `pasted-text-processing` worktree was not merged, removed, reset, committed, or pushed.
- Implemented Certificate soft archive independently from its `ACTIVE` / `REVOKED` lifecycle.
- Added server-derived permission visibility for User and Certificate delete actions.
- Certificate API mutation tests and browser checks used the isolated Phase 4B PostgreSQL database, not `ghs_integrated`.
- `ghs_integrated` was accessed read-only for the before/after snapshots below. The additive Certificate migration was not applied because this phase forbids deployment/mutation of the existing database.
- No reset, seed, commit, push, deploy, object-storage deletion, or cleanup of any disposable database was performed.

## 2. Certificate decision and implementation

Certificate supports a separate soft archive through `Certificate.deletedAt`. Its business lifecycle remains `ACTIVE` or `REVOKED`; DELETE does not revoke or overwrite that state. A successful delete sets only `Certificate.deletedAt`, retains the row, status, storage path, and Student/Program/Batch relations, and appends an AuditLog with the actor, `DELETE`, entity, entity ID, and `{ deletedAt: { before: null, after: timestamp } }`.

The new additive migration adds the nullable column and grants `certificate:delete` only to `ADMIN` and `SUPER_ADMIN`. The item DELETE route requires `certificate:delete`, loads an active record, conditionally updates it transactionally, and returns 404 for nonexistent or already archived records. Collection DELETE remains 405. Active list/detail/revoke/download paths filter archived certificates; the download route does not issue a signed URL for an archived record. Certificate creation also rejects archived Student, Program, or Batch records.

The migration was applied to a fresh isolated `_run2` database, where all eight migrations deployed. It is **pending** on canonical `ghs_integrated`; therefore canonical runtime Certificate operations using `deletedAt` are not ready until the approved additive migration is applied.

## 3. Entity delete matrix

“Static UI” means source inspection found a shared two-stage action and a UI permission/role gate; it is not a claim of an individual browser run for that entity. Existing Phase 4 functional evidence is summarized in [the Phase 4 report](./STEP-GLOBAL-SOFT-DELETE-PHASE-4.md).

| Entity | Schema `deletedAt` | Active GET | DELETE / RBAC / AuditLog | UI action / two-stage | Browser coverage | Phase 4B status |
|---|---|---|---|---|---|---|
| Peserta / Student | Yes | Active-only | Soft delete; `student:delete`; audited | Shared action; static gate | Not individually run in 4B | Existing Phase 4 API pass |
| Program | Yes | Active-only | Soft delete; `program:delete`; audited | Shared dialog; static gate | Both stages/cancel/final success tested in Phase 4 | Existing Phase 4 pass |
| Mata Pelajaran / Subject | Yes | Active-only | Soft delete; `subject:delete`; audited | Shared dialog; static gate | Not individually run in 4B | Existing Phase 4 API pass |
| Batch | Yes | Active-only | Soft delete; `batch:delete`; audited | Shared dialog; static gate | Not individually run in 4B | Existing Phase 4 API pass |
| Enrollment | Yes | Active-only | Soft delete; `enrollment:delete`; audited | Shared action; static gate | Not individually run in 4B | Existing Phase 4 API pass |
| Kelas / Class | Yes | Active-only | Soft delete; `class:delete`; audited | Shared action; static gate | Not individually run in 4B | Existing Phase 4 API pass |
| Jadwal / Schedule | Yes | Active-only | Soft delete; `schedule:delete`; audited | Shared action; static gate | Not individually run in 4B | Existing Phase 4 API pass |
| Kehadiran / Attendance | Yes | Active-only | Soft delete; `attendance:delete`; audited | Shared action; static gate | Not individually run in 4B | Existing Phase 4 API pass |
| Penilaian / Assessment | Yes | Active-only | Soft delete; `assessment:delete`; audited | Shared dialog/action; static gate | Not individually run in 4B | Existing Phase 4 API pass |
| Assessment Score | Yes | Active-only | Soft delete; `assessment-score:delete`; audited | Shared action; static gate | Not individually run in 4B | Existing Phase 4 API pass |
| Instruktur / Instructor | Yes | Active-only | Soft delete; `instructor:delete`; audited | Shared dialog; static gate | Not individually run in 4B | Existing Phase 4 API pass |
| Dokumen / Document | Yes | Active-only; deleted detail cannot issue signed URL | Database-only soft delete; `document:delete`; audited | Shared dialog; static gate | Not individually run in 4B | Storage cleanup **TBD** |
| Sertifikat / Certificate | Yes in schema; **column pending on canonical DB** | List/detail/download/revoke exclude archived rows | Item soft DELETE; `certificate:delete` only for Admin/Super Admin; audited | Shared action; server-derived permission | Both stages, both cancellations, final DELETE, toast, refresh, and retained DB row tested on isolated app before the final permission-prop refactor | **BLOCKED** pending canonical migration and browser recheck |
| Perusahaan / Employer | Yes | Active-only | Soft delete; `employer:delete`; audited | Shared dialog; static gate | Not individually run in 4B | Existing Phase 4 API pass |
| Lowongan / Vacancy | Yes | Active-only | Soft delete; `vacancy:delete`; audited | Shared dialog; static gate | Not individually run in 4B | Existing Phase 4 API pass |
| Lamaran / Application | Yes | Active-only | Soft delete; `application:delete`; audited | Shared action; static gate | Not individually run in 4B | Existing Phase 4 API pass |
| Wawancara / Interview | Yes | Active-only | Soft delete; `interview:delete`; audited | Shared action; static gate | Not individually run in 4B | Existing Phase 4 API pass |
| Penempatan / Placement | Yes | Active-only | Soft delete; `placement:delete`; audited | Shared action; static gate | Not individually run in 4B | Existing Phase 4 API pass |
| Pengguna / User | Yes | Active list; authentication/authorization reject deleted user | Changes only `User.deletedAt`; `user:delete`; audited | Shared action; now hidden unless server grants permission | Two-stage delete flow tested in Phase 4; latest permission visibility change not browser-retested | **BLOCKED** on complete browser coverage |
| Dashboard | N/A | Live operational aggregates | **NOT APPLICABLE** — no persisted entity/delete API | N/A | Phase 4 checked archived entities excluded from metrics | N/A |
| Reports | N/A | Generated/read-only aggregates | **NOT APPLICABLE** — no persisted report/delete API | N/A | Phase 4 checked academic, attendance, and placement aggregates | N/A |

## 4. UI confirmation and permission audit

- Delete screens use `DeleteConfirmationDialog` directly or through `SoftDeleteAction`. The shared component presents the required first prompt, then the second prompt with record identity and the retained-data explanation. Request submission is guarded against pending/double submission; cancellation does not invoke DELETE; successful actions refresh their active list and show success feedback.
- The repository search found `window.confirm` in Attendance and Vacancy for non-delete operations (marking attendance present and closing a vacancy), not for their soft-delete actions.
- User management previously rendered a delete action for every non-self account. `app/users/page.tsx` now computes `user:delete` on the server and passes `canDelete`; the action is hidden unless that permission is granted.
- Certificate list and detail routes now compute `certificate:delete` server-side and pass the permission to the UI, replacing role-name-only visibility checks. API authorization remains independently enforced.
- Static coverage was inspected for all targets, but browser interactions were not individually executed on every delete screen. The browser evidence is limited to Program and User from Phase 4, and Certificate from Phase 4B before the final permission-prop refactor. This is an unmet requirement, not a pass.

## 5. API, RBAC, AuditLog, and relation verification

- Prior Phase 4 exact-fixture suite: **375 assertions passed** across 18 soft-delete endpoints. It covered anonymous `401`, representative unauthorized roles `403`, nonexistent `404`, authorized `200`, retained rows, active-read exclusion, repeated DELETE `404`, AuditLog contents, and relation preservation. User-specific tests confirmed that deleting a User changed only `User.deletedAt`, preserved linked Student/Instructor and academic relations, and rejected the deleted account's existing session and new login.
- Certificate isolated runner: **57 assertions passed**. Admin and Super Admin deletes succeeded; anonymous requests returned `401`; Academic Staff, Instructor, Placement Staff, Management, and Student were denied with `403`; nonexistent/repeated DELETE returned `404`. ACTIVE and REVOKED lifecycle values, Student/Program/Batch relations, and storage paths remained intact. Active list/detail/download excluded the archived Certificate, and AuditLog actor/entity/entity ID/timestamp/changes were checked.
- Phase 4 relation checks covered **27** parent/child/junction cases and found **0 fixture orphans**. The Certificate-specific tests also confirmed its linked records remain present.
- These tests ran only against isolated disposable databases. The exact-fixture databases and their AuditLogs were retained; no global cleanup was performed.

## 6. Document storage

Document deletion remains database-only. Deleted Documents are filtered from active list/detail access, so normal active routes do not issue signed URLs for them. The storage object is retained; irreversible storage cleanup remains **TBD** pending a retention/cleanup policy. The `storage.delete` call found in the upload API is compensation for a failed new database insert, not a Document soft-delete operation.

## 7. Runtime physical-delete scan

Search of canonical runtime business APIs under `app/api` found no Prisma `.delete()` / `.deleteMany()`, `$executeRaw` / `$executeRawUnsafe`, or raw SQL `DELETE FROM` business-entity operation. Test scripts may clean up only exact disposable fixtures and are not runtime business APIs.

The Certificate migration contains a narrowly scoped SQL `DELETE FROM role_permissions` to remove `certificate:delete` grants from roles other than Admin/Super Admin. It is RBAC permission reconciliation, not deletion of a business record or AuditLog. No AuditLog cleanup exists.

## 8. Canonical database integrity

Read-only snapshots were captured on `ghs_integrated` before and after Phase 4B work. Counts are identical; no test fixtures were inserted into this database. The active Super Admin count remained **2**. Existing Student soft-delete count was **2** in the initial snapshot and was not changed by this phase. Certificate has no `deletedAt` database column yet because its migration remains pending.

| Model | Before | After |
|---|---:|---:|
| User | 3 | 3 |
| Student | 23 | 23 |
| Program | 1 | 1 |
| Subject | 6 | 6 |
| Batch | 2 | 2 |
| Enrollment | 21 | 21 |
| Class | 10 | 10 |
| Schedule | 10 | 10 |
| Attendance | 9 | 9 |
| Assessment | 0 | 0 |
| AssessmentScore | 0 | 0 |
| Instructor | 6 | 6 |
| Document | 0 | 0 |
| Certificate | 0 | 0 |
| Employer | 0 | 0 |
| Vacancy | 0 | 0 |
| Application | 0 | 0 |
| Interview | 0 | 0 |
| Placement | 0 | 0 |
| AuditLog | 24 | 24 |

The earlier Phase 4 report recorded 21 Students and 20 AuditLogs; the present pre-Phase-4B snapshot recorded 23 and 24 respectively. This historical discrepancy predates the Phase 4B read-only before/after comparison and cannot be attributed or reconciled by this phase. No claim is made that those older snapshots match.

## 9. Quality gates

| Gate | Result |
|---|---|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npx prisma validate` | PASS |
| `npx prisma migrate status` | **BLOCKED / pending** — `20260930160000_certificate_soft_delete` is unapplied to canonical `ghs_integrated`; not applied because deployment/existing-DB mutation is out of scope |
| `npm run build` | PASS |
| `git diff --check` | PASS; Git emitted line-ending normalization warnings only |

## 10. Remaining blockers and final status

1. Apply the approved additive Certificate migration to the intended canonical database under an explicitly authorized migration window; until then the Certificate API/schema is not available against that database.
2. Re-run the Certificate browser permission-visibility and delete flow after the server-derived permission-prop refactor.
3. Perform browser delete coverage on every remaining applicable entity screen, including both cancellations, final success, refresh, and active-list absence. Existing Phase 4 API tests and representative shared-component browser runs do not substitute for that coverage.
4. Reconcile the historical count discrepancy (Student 21 → 23; AuditLog 20 → 24) outside this phase before asserting a longer-term database baseline.
5. Document storage-object cleanup policy remains TBD; no storage object was removed.

**Final status: BLOCKED.** Certificate implementation and isolated tests pass, but the required canonical migration is pending and complete per-screen browser verification has not been performed. No global soft-delete completion claim is made.
