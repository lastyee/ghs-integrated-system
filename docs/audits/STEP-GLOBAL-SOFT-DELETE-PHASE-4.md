# STEP Global Soft Delete — Phase 4 Functional Verification

**Canonical project:** `C:\ghs-integrated-system`  
**Branch:** `main`  
**Verification:** **PASS_WITH_WARNING** for the Phase 4 scope. This does not certify every possible UI page or a Certificate archive policy.

## Scope and safety

- All Phase 4 edits and verification were performed in the canonical project root on `main`; the nested `ghs-integrated-system.worktrees\pasted-text-processing` worktree was not used as the result, merged, deleted, reset, committed, or pushed.
- The existing configured database (`ghs_integrated`) was used for read-only integrity counts only. All mutation tests used a dedicated loopback PostgreSQL cluster and fresh, explicitly named test databases, including `ghs_soft_delete_phase4_test_full`.
- The test runner refuses non-local or unexpected database targets, requires an exact database-name confirmation and an explicit mutation opt-in, and has no cleanup that deletes test records or AuditLogs.
- No existing GHS record, Super Admin, Student, AuditLog, or storage object was deleted or updated. No database reset, seed, deployment, commit, or push was run.
- The earlier Phase 1–3 worktree in the canonical project remains present and the repository already had many unrelated modified/untracked files. This phase did not clean or revert them.

## Functional test results

The exact-fixture HTTP/database suite completed successfully with **375 passing assertions** against the isolated database:

- Anonymous DELETE returned **401** on all 18 soft-delete endpoints.
- Five representative unauthorized roles (Academic Staff, Instructor, Placement Staff, Management, Student) received **403**.
- Authenticated DELETE of a nonexistent ID returned **404** for all 18 endpoints.
- Authorized deletes returned **200**; the row remained stored, `deletedAt` was set, the record disappeared from its active list, detail returned **404**, and a repeated DELETE safely returned **404**.
- Each delete appended an AuditLog record with `action=DELETE`, matching entity and ID, and `deletedAt: { before: null, after: timestamp }`.
- The User-specific cases confirmed only `User.deletedAt` changed. Its linked Student stayed active and linked with academic relations intact; a separate User linked to Instructor likewise left that Instructor and relation intact. A pre-delete session was rejected with **401**, and a new login was rejected.
- **27** named parent/child/junction relation checks passed; the fixture orphan check returned **0**.
- Document list/detail were active before deletion and excluded the archived record afterward; its detail/signed-URL endpoint returned **404**. The test used mock storage and did not attempt storage cleanup.
- Certificate DELETE returned **405**; the business lifecycle transition `ACTIVE` → `REVOKED` returned **200** and appended a `REVOKE` AuditLog. After related Student/Program/Batch records were archived, Certificate list excluded it and detail/download returned **404**.
- Academic, attendance, and placement reports remained available and excluded archived fixture names. The management dashboard rendered successfully and excluded archived operational record names. A browser check showed all operational dashboard metrics at **0** after the fixture entities were archived.

## UI verification

The browser exercised both reusable delete UI patterns using only disposable records:

1. **Program list (`DeleteConfirmationDialog`):** stage one displayed the required first prompt; stage two displayed the record identity and retained-data explanation. Cancelling at stage two kept the record visible. Final confirmation showed the success toast, refreshed the list, and removed the Program from active results. A database check confirmed its row remained with `deletedAt` and exactly one matching DELETE AuditLog.
2. **User management (`SoftDeleteAction`):** stage one and stage two were verified, including the identity and the User-specific warning that linked Student/Instructor and history remain. Final confirmation showed the success toast and refreshed the active-user count from six to five; the current Super Admin could not delete itself.

The remaining entity screens reuse one of these shared dialog/action components. The browser test is representative of those shared flows, not a separate browser session for every individual screen. API behavior was tested per entity.

## Entity matrix

“Runtime pass” refers to the isolated fixture suite above. Certificate is the business-lifecycle exception. Dashboard and reports are read-only, non-persisted aggregates.

| Entity | Schema `deletedAt` | Active GET | DELETE/API | UI delete / 2-step | RBAC | AuditLog | Runtime test | Status |
|---|---|---|---|---|---|---|---|---|
| Peserta / Student | Yes | List/detail and related reads filter active rows | Soft delete; preserves User and academic history | List; shared two-stage flow | `student:delete`; Admin/Super Admin | Transactional DELETE | Pass | PASS |
| Program | Yes | List/detail and related reads filter active rows | Soft delete; preserves Batch/Certificate | List/detail; two-stage flow browser-tested | `program:delete`; Admin/Super Admin | Transactional DELETE | Pass | PASS |
| Mata Pelajaran / Subject | Yes | List/detail and related reads filter active rows | Soft delete; preserves Schedule/Assessment | List/detail; shared two-stage flow | `subject:delete`; Admin/Super Admin | Transactional DELETE | Pass | PASS |
| Batch | Yes | List/detail and related reads filter active rows | Soft delete; preserves Enrollment/Class/Schedule/Certificate | List/detail; shared two-stage flow | `batch:delete`; Admin/Super Admin | Transactional DELETE | Pass | PASS |
| Enrollment | Yes | List/detail filter active rows | Soft delete; preserves Student/Batch history | List; shared two-stage flow | `enrollment:delete`; Admin/Super Admin | Transactional DELETE | Pass | PASS |
| Kelas / Class | Yes | List/detail and related reads filter active rows | Soft delete; preserves Schedule/Assessment history | List; shared two-stage flow | `class:delete`; Admin/Super Admin | Transactional DELETE | Pass | PASS |
| Jadwal / Schedule | Yes | List/detail and related reads filter active rows | Soft delete; preserves Attendance | List; shared two-stage flow | `schedule:delete`; Admin/Super Admin | Transactional DELETE | Pass | PASS |
| Kehadiran / Attendance | Yes | List/detail and reports filter active rows | Soft delete; preserves Student/Schedule history | Session detail; shared two-stage flow | `attendance:delete`; Admin/Super Admin | Transactional DELETE | Pass | PASS |
| Penilaian / Assessment | Yes | List/detail, scores, and reports filter active rows | Soft delete; preserves AssessmentScore | List/detail; shared two-stage flow | `assessment:delete`; Admin/Super Admin | Transactional DELETE | Pass | PASS |
| Assessment Score | Yes | Score list/detail filter active rows | Soft delete; preserves Assessment/Student | Assessment detail; shared two-stage flow | `assessment-score:delete`; Admin/Super Admin | Transactional DELETE | Pass | PASS |
| Instruktur / Instructor | Yes | List/detail and linked Class/Schedule reads filter active rows | Soft delete; preserves User/Class/Schedule | List; shared two-stage flow | `instructor:delete`; Admin/Super Admin | Transactional DELETE | Pass | PASS |
| Dokumen / Document | Yes | List/detail filter active rows; signed URL requires active lookup | Soft delete only; storage object is not deleted | List; shared two-stage flow | `document:delete`; Admin/Super Admin | Transactional DELETE | Pass; provider cleanup not tested | PASS_WITH_WARNING — storage cleanup TBD |
| Sertifikat / Certificate | No; `ACTIVE` / `REVOKED` lifecycle | Lifecycle/history reads; archived related records excluded | DELETE returns 405; lifecycle uses revoke PATCH | No delete; revoke is separate business action | `certificate:revoke`; Admin/Super Admin | REVOKE is audited | Lifecycle/list/detail/download pass | PASS_WITH_WARNING — archive policy undefined |
| Perusahaan / Employer | Yes | List/detail and related Vacancy/Placement reads filter active rows | Soft delete; preserves Vacancy/Placement | List/detail; shared two-stage flow | `employer:delete`; Admin/Super Admin | Transactional DELETE | Pass | PASS |
| Lowongan / Vacancy | Yes | List/detail and related Application/Placement reads filter active rows | Soft delete; preserves Application/Placement | List/detail; shared two-stage flow | `vacancy:delete`; Admin/Super Admin | Transactional DELETE | Pass | PASS |
| Lamaran / Application | Yes | List/detail and related reads filter active rows | Soft delete; preserves Interview/Placement | List; shared two-stage flow | `application:delete`; Admin/Super Admin | Transactional DELETE | Pass | PASS |
| Wawancara / Interview | Yes | List/detail and related reads filter active rows | Soft delete; preserves Application | List; shared two-stage flow | `interview:delete`; Admin/Super Admin | Transactional DELETE | Pass | PASS |
| Penempatan / Placement | Yes | List/detail, reports, and related reads filter active rows | Soft delete; preserves Student/Employer/Application | List; shared two-stage flow | `placement:delete`; Admin/Super Admin | Transactional DELETE | Pass | PASS |
| Pengguna / User | Yes | Active list; authentication and authorization reject deleted users | Changes only `User.deletedAt`; Student/Instructor rows and links untouched | User management; shared two-stage flow browser-tested | `user:delete`; Admin/Super Admin; server enforced | Transactional DELETE | Pass, including relation/auth scenarios | PASS |
| Dashboard | N/A | Read-only live operational metrics | **NOT APPLICABLE** | N/A | Existing page permissions | N/A | Rendered; archived metrics excluded | N/A |
| Laporan / Reports | N/A | Generated/read-only reports; not persisted | **NOT APPLICABLE** | N/A | Existing report permissions | N/A | Academic/attendance/placement verified | N/A |

## Hard-delete, Document, and Certificate findings

- No runtime business API in `app/api` uses Prisma `.delete()` / `.deleteMany()` or raw SQL `DELETE FROM` for business entities.
- The repository-wide search did find exact-ID cleanup in existing test scripts; these are fixture-cleanup paths, not production DELETE handlers. The Phase 4 runner itself performs no cleanup.
- The API's `storage.delete` call is exact-object compensation when a new Document upload's database insert fails. It is unrelated to soft deletion. Soft-delete does not destroy storage objects; deletion of stored objects remains **TBD** until a reversible/verified cleanup policy exists.
- A deleted Document is absent from active list/detail, and its detail endpoint does not issue a signed URL once inactive.
- Certificate retains its business `ACTIVE` / `REVOKED` lifecycle and historical record. No Certificate `deletedAt`, DELETE, or archive behavior was introduced. A separate Certificate archive policy remains undefined.
- Dashboard and report pages are not persisted entities; no synthetic DELETE API was added.

## Canonical database integrity

Read-only canonical `ghs_integrated` counts matched the Phase 3 baseline captured at `2026-09-30T07:17:47.809Z` UTC:

| Model | Baseline | After Phase 4 |
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
- All checked canonical Student/User, Instructor/User, Batch/Program, Enrollment/Student/Batch, Class/Batch, Schedule/Class, and Attendance/Schedule orphan counts were **0**. The isolated fixture run also found no orphaned fixture relations.
- Existing GHS records were not the target of any Phase 4 mutation; all DELETE, REVOKE, and UI scenarios ran against the isolated test cluster.

## Quality gates

| Gate | Result |
|---|---|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npx prisma validate` | PASS |
| `npx prisma migrate status` | PASS — all 7 migrations applied to canonical DB |
| `npm run build` | PASS |
| `git diff --check` | PASS — Git emitted line-ending normalization warnings only |

The isolated test database was created from the same seven existing migrations. No new migration was required for Phase 4.

## Remaining warnings and status

1. Document storage-object cleanup is **TBD** by design; no irreversible object deletion was performed.
2. Certificate is lifecycle-only (`ACTIVE` / `REVOKED`); an archive policy is not defined and DELETE intentionally returns 405.
3. Browser interaction was exercised through the shared direct-dialog and action-component flows on disposable Program and User records, rather than separately clicking every entity screen.
4. Isolated test databases and their AuditLogs were left intact; they were not reset, dropped, or cleared.

**Phase 4 status: PASS_WITH_WARNING.** The 18 soft-delete API paths and their tested authorization, active-read, AuditLog, and relation behaviors passed; both shared UI patterns were exercised. This status is limited to Phase 4 and is not a blanket certification of every module's end-to-end UI or an archive policy for Certificate/Document storage.
