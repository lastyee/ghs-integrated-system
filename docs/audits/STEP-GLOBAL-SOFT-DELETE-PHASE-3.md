# STEP Global Soft Delete — Phase 3 Audit

**Canonical project:** `C:\ghs-integrated-system`  
**Branch:** `main`  
**Phase 3 implementation status:** **PASS_WITH_WARNING** — code, migration, database integrity, and quality gates verified; live delete scenarios and browser interactions remain unverified.  
**Overall Global Soft Delete status:** **BLOCKED** — do not claim end-to-end global PASS until exact-fixture API and UI verification runs against an isolated disposable database.

## Scope and worktree safety

- All Phase 3 inspection and changes in this step were made in the canonical project root on `main`.
- The nested `ghs-integrated-system.worktrees\pasted-text-processing` worktree was retained as a reference. It was not merged, removed, reset, committed, or pushed.
- No commit, push, deployment, database reset, seed, or existing business-record deletion was performed.
- The prior [global remediation audit](./STEP-GLOBAL-SOFT-DELETE.md) is a historical snapshot from before Phases 1–3; its earlier hard-delete findings are superseded by this report and the Phase 1/2 reports.

## Phase 3 implementation

1. **User deletion:** `DELETE /api/users/[id]` updates only `User.deletedAt` and writes an AuditLog entry transactionally. It does not update Student or Instructor rows or their relations. User credential authentication, session authorization, and permission checks reject soft-deleted accounts. Self-delete is rejected.
2. **RBAC:** Applied the additive `20260930135500_global_soft_delete_phase3_permissions` migration using `prisma migrate deploy`. Existing delete permissions for scoped entities are assigned only to `ADMIN` and `SUPER_ADMIN`; the migration adds `user:delete` for those two roles. No roles were added and no seed was run.
3. **Active-query coverage:** Added active related-record filters in batch, instructor, assessment, document, placement, student-detail, dashboard, and report queries where those relations affect operational results. Dashboard placement metrics use live APIs; dashboard/report pages are read-only aggregations.
4. **Delete feedback:** Wired transient success toasts to the existing Phase 1 two-stage delete flows. Assessment detail and User actions use the shared `SoftDeleteAction`.
5. **Certificate:** Retained its business lifecycle (`ACTIVE` / `REVOKED`) and audited `REVOKE` action. There is no Certificate `deletedAt` or DELETE operation (DELETE returns 405). No archive mapping or physical deletion was introduced. The management dashboard's active-certificate metric excludes certificates attached to soft-deleted Student, Program, or Batch records. Certificate records remain available as historical records; a separate archive policy is not currently defined.
6. **Document:** Database delete is a soft delete. Active list/detail endpoints filter `Document.deletedAt` and active Student; the signed URL endpoint looks up an active document before signing. Storage objects are retained on soft delete. The only runtime `storage.delete` found in the API is exact-object compensation when a new upload's database insert fails; it is not part of document deletion.
7. **Reports:** Existing dashboard and generated report endpoints are read-only, non-persisted aggregates; DELETE is **NOT APPLICABLE**. No synthetic DELETE operation was added.

## Entity verification matrix

“Implemented” means reviewed in schema/API/UI and does not imply that a live request was exercised. Functional tests remain **NOT RUN** against the shared database.

| Entity | Schema `deletedAt` | GET filter | DELETE API | UI Delete | 2-Step Confirmation | RBAC | AuditLog | Test | Status |
|---|---|---|---|---|---|---|---|---|---|
| Peserta / Student | Yes | Active list/detail and relation filters | Soft delete; updates Student only | List | Yes; toast and refresh | `student:delete`; Admin/Super Admin only | Transactional `DELETE` with timestamp before/after | Not run | Implemented; runtime unverified |
| Program | Yes | Active list/detail and relation filters | Soft delete; preserves Batch/Certificate | List and detail | Yes; toast | `program:delete`; Admin/Super Admin only | Transactional `DELETE` with timestamp before/after | Not run | Implemented; runtime unverified |
| Mata Pelajaran / Subject | Yes | Active list/detail and relation filters | Soft delete; preserves Schedule/Assessment | List and detail | Yes; toast | `subject:delete`; Admin/Super Admin only | Transactional `DELETE` with timestamp before/after | Not run | Implemented; runtime unverified |
| Batch | Yes | Active list/detail and relation filters | Soft delete; preserves Enrollment/Class/Schedule/Certificate | List and detail | Yes; toast and refresh | `batch:delete`; Admin/Super Admin only | Transactional `DELETE` with timestamp before/after | Not run | Implemented; runtime unverified |
| Enrollment | Yes | Active list/detail and relation filters | Soft delete; preserves Student/Batch | List | Yes; shared action, toast and refresh | `enrollment:delete`; Admin/Super Admin only | Transactional `DELETE` with timestamp before/after | Not run | Implemented; runtime unverified |
| Kelas / Class | Yes | Active list/detail and relation filters | Soft delete; preserves Schedule/Assessment history | List | Yes; shared action, toast and refresh | `class:delete`; Admin/Super Admin only | Transactional `DELETE` with timestamp before/after | Not run | Implemented; runtime unverified |
| Jadwal / Schedule | Yes | Active list/detail and relation filters | Soft delete; preserves Attendance | List | Yes; shared action, toast and refresh | `schedule:delete`; Admin/Super Admin only | Transactional `DELETE` with timestamp before/after | Not run | Implemented; runtime unverified |
| Kehadiran / Attendance | Yes | Active list/detail/report filters | Soft delete; preserves Student/Schedule history | Attendance session detail | Yes; shared action, toast and active-row removal | `attendance:delete`; Admin/Super Admin only | Transactional `DELETE` with timestamp before/after | Not run | Implemented; runtime unverified |
| Penilaian / Assessment | Yes | Active list/detail and score/report filters | Soft delete; preserves AssessmentScore | List and detail | Yes; shared action, toast | `assessment:delete`; Admin/Super Admin only | Transactional `DELETE` with timestamp before/after | Not run | Implemented; runtime unverified |
| Assessment Score | Yes | Active score/detail/report filters | Soft delete; preserves Assessment/Student | Assessment detail score list | Yes; shared action, toast and reload | `assessment-score:delete`; Admin/Super Admin only | Transactional `DELETE` with timestamp before/after | Not run | Implemented; runtime unverified |
| Instruktur / Instructor | Yes | Active list/detail and linked-class filters | Soft delete; preserves User/Class/Schedule | List | Yes; toast and refresh | `instructor:delete`; Admin/Super Admin only | Transactional `DELETE` with timestamp before/after | Not run | Implemented; runtime unverified |
| Dokumen / Document | Yes | Active list/detail; signed URL only after active lookup | Soft delete; storage object retained | List | Yes; toast and refresh | `document:delete`; Admin/Super Admin only | Transactional `DELETE` with timestamp before/after | Not run | Implemented; storage cleanup TBD |
| Sertifikat / Certificate | No; `ACTIVE` / `REVOKED` lifecycle | Lifecycle/history read; no soft-delete field | DELETE returns 405; revoke is PATCH | No delete; separate revoke action | N/A for DELETE | `certificate:revoke` for business lifecycle | `REVOKE` is audited | Not run | Lifecycle-only; no archive policy |
| Perusahaan / Employer | Yes | Active list/detail and Vacancy filters | Soft delete; preserves Vacancy/Placement | List and detail | Yes; toast | `employer:delete`; Admin/Super Admin only | Transactional `DELETE` with timestamp before/after | Not run | Implemented; runtime unverified |
| Lowongan / Vacancy | Yes | Active list/detail and Employer filters | Soft delete; preserves Application/Placement | List and detail | Yes; toast | `vacancy:delete`; Admin/Super Admin only | Transactional `DELETE` with timestamp before/after | Not run | Implemented; runtime unverified |
| Lamaran / Application | Yes | Active list/detail and Student/Vacancy filters | Soft delete; preserves Interview/Placement | List | Yes; shared action, toast and refresh | `application:delete`; Admin/Super Admin only | Transactional `DELETE` with timestamp before/after | Not run | Implemented; runtime unverified |
| Wawancara / Interview | Yes | Active list/detail and Application filters | Soft delete; preserves Application | List | Yes; shared action, toast and refresh | `interview:delete`; Admin/Super Admin only | Transactional `DELETE` with timestamp before/after | Not run | Implemented; runtime unverified |
| Penempatan / Placement | Yes | Active list/detail/report and linked-entity filters | Soft delete; preserves Student/Employer/Application | List | Yes; shared action, toast and refresh | `placement:delete`; Admin/Super Admin only | Transactional `DELETE` with timestamp before/after | Not run | Implemented; runtime unverified |
| Pengguna / User | Yes | Active Users list; authentication/authorization reject deleted users | Soft delete; changes only User | User management list; self-delete action hidden | Yes; shared action, toast and refresh | `user:delete`; Admin/Super Admin only; server enforced | Transactional `DELETE` with timestamp before/after | Not run | Correct semantics; runtime unverified |

The shared two-stage dialog uses the required Indonesian prompts and buttons. Stage two identifies the record and explains that it remains stored but is hidden from active data. API deletion is called only after stage two; pending state disables the controls and guards duplicate submission. API errors are shown and successful deletes show a transient toast and refresh/remove the active row.

## Hard-delete and history-safety scan

- Scoped runtime `app/api` scan found **no Prisma `.delete()` / `.deleteMany()` or raw SQL `DELETE FROM` against business entities**.
- The one `.delete()` match in runtime API code is the document-upload failure compensation described above.
- The Phase 3 migration uses SQL `DELETE FROM role_permissions` only to revoke non-admin permission-grant rows; it does not delete business data, users, or AuditLog rows.
- Soft-delete handlers update only their target record and append an AuditLog row in the same transaction. Related records remain stored.
- User deletion changes only `User.deletedAt`; Student/Instructor records, foreign keys, and academic history are not mutated.

## Database integrity

Read-only counts before and after the Phase 3 permissions migration were identical:

| Model | Before | After |
|---|---:|---:|
| User | 3 | 3 |
| Student | 21 | 21 |
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
| AuditLog | 20 | 20 |

- Active Super Admin count remained **2**.
- Final read-only checks covered **33** declared relation references; orphan total was **0**.
- Database migration status reports schema up to date. The migration changed only RBAC permission rows; no entity fixtures were created or soft-deleted.
- No data comparison can establish preservation during an actual DELETE request because no delete fixture was executed.

## Tests and quality gates

| Check | Result | Notes |
|---|---|---|
| Exact-fixture API matrix (anonymous 401, unauthorized 403, missing 404, authorized 200, retained row, active GET omission, audit delta, relation preservation, repeated delete) | **NOT RUN** | No isolated disposable database was available; the configured database contains existing data and was not used for destructive test requests. |
| Browser confirmation/loading/toast/refresh verification | **NOT RUN** | Two-stage behavior and wiring reviewed in code only. |
| `npm run lint` | **PASS** | Exit code 0 after removing stale notice state. |
| `npx tsc --noEmit` | **PASS** | Exit code 0. |
| `npx prisma validate` | **PASS** | Schema valid. |
| `npx prisma migrate status` | **PASS** | All 7 migrations applied. |
| `npm run build` | **PASS** | Production build, TypeScript, and static page generation completed. |
| `git diff --check` | **PASS** | Exit code 0; Git emitted line-ending normalization warnings only. |

## Remaining blockers and final status

1. Run the required delete/authentication/history scenarios against an isolated disposable database, including the User-with-Student fixture. Do not run legacy test scripts with unsafe broad/AuditLog cleanup against the configured database.
2. Exercise the two-stage flows in a browser and verify pending-state, duplicate-submit prevention, toast/error visibility, and active-list refresh.
3. A separate Certificate archive policy remains undefined. Keep `REVOKED` as the business lifecycle and do not map it to `deletedAt` without an explicit policy.
4. Document storage-object cleanup remains **TBD**; soft delete intentionally retains storage objects.

**Phase 3:** **PASS_WITH_WARNING** for implementation, migration, database-integrity checks, and static quality gates only.  
**Overall Global Soft Delete:** **BLOCKED** pending isolated functional and browser verification. No global PASS is claimed.
