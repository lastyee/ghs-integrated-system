# STEP GLOBAL SOFT DELETE — Remediation and Verification

> **Historical checkpoint:** This report records findings from before Phases 1–3 and is superseded for current implementation status by [Phase 3 audit](./STEP-GLOBAL-SOFT-DELETE-PHASE-3.md). The findings below describe that earlier audit state, not the current canonical API state.

**Overall status: BLOCKED**

No global PASS is claimed. The canonical project still has physical DELETE endpoints, incomplete soft-delete schema/query/UI coverage, and no end-to-end soft-delete fixture verification. The earlier report claiming PASS is withdrawn.

## Scope and worktree safety

- Canonical root inspected and changed: `C:\ghs-integrated-system`
- Canonical branch/HEAD: `main` / `e3ea29b14ed5864b17c91fb6f57a981561d76b41`
- Separate worktree retained: `C:\ghs-integrated-system\ghs-integrated-system.worktrees\pasted-text-processing`, branch `agents/pasted-text-processing`; it was not deleted, reset, committed, or pushed.
- The earlier broad soft-delete implementation and its migration are in that worktree, not in the canonical `main` checkout. They were not wholesale copied into canonical root because this task was verification/remediation, not a new global implementation pass.
- The worktree's User DELETE had cascaded `deletedAt` updates to Student and Instructor. That cascade was removed there. The canonical root now also contains the corrected User-only soft-delete route and authentication/authorization enforcement. No Student or Instructor update is part of User DELETE.
- Pre-existing unrelated modified/untracked files in both checkouts were left untouched.

## Changes actually made in canonical root

1. Credential authentication now selects only users with `deletedAt: null`.
2. `requireAuthenticatedUser`, `requirePermission`, and `userHasPermission` now reject or ignore soft-deleted users using a current database lookup.
3. The Users list and its student totals exclude soft-deleted User/Student rows.
4. `DELETE /api/users/[id]` now requires an authenticated SUPER_ADMIN/ADMIN, finds an active User, updates only `User.deletedAt`, writes the User AuditLog in the same transaction, returns 404 for a missing/already-deleted user, and returns 200 on success. It does not update Student, Instructor, or any other related record; the relation foreign keys remain unchanged. Self-delete is rejected with 409.
5. No schema or migration change was made: canonical schema already has `deletedAt` only for User and Student among the audited entities.

The User behavior above is code-reviewed but was not exercised against a disposable User-with-Student fixture. Thus, preservation of the related Student's academic rows and actual login/401 behavior remain unverified at runtime.

## Entity matrix

Legend: `N/A` means there is no deletion action/record lifecycle at that surface; `No` means the requested capability/filter is missing. A 405 is not a soft-delete implementation.

| Entity | Schema `deletedAt` | GET/list active filter | DELETE API | UI Delete | 2-step Confirmation | RBAC | AuditLog | Test | Status |
|---|---|---|---|---|---|---|---|---|---|
| Peserta / Student | Yes | No: detail uses `findUnique`; list does not consistently filter `deletedAt` | 405 | No | N/A | Read/update checks; no delete endpoint | N/A | No soft-delete test run/found | BLOCKED |
| Program | No | No soft-delete field/filter | Physical delete | Yes | No: one confirmation dialog | `program:delete` | Yes on physical delete | No soft-delete test run | BLOCKED |
| Mata Pelajaran / Subject | No | No soft-delete field/filter | Physical delete | Yes | No: one confirmation dialog | `subject:delete` | Yes on physical delete | No soft-delete test run | BLOCKED |
| Batch | No | No soft-delete field/filter | Physical delete | Yes | No: one confirmation dialog | `batch:delete` plus role gate | Yes on physical delete | No soft-delete test run | BLOCKED |
| Enrollment | No | No soft-delete field/filter | 405 | No | N/A | No delete endpoint | N/A | No soft-delete test run | BLOCKED |
| Kelas / Class | No | No soft-delete field/filter | 405 | No | N/A | No delete endpoint | N/A | No soft-delete test run | BLOCKED |
| Jadwal / Schedule | No | No soft-delete field/filter | 405 | No | N/A | No delete endpoint | N/A | No soft-delete test run | BLOCKED |
| Kehadiran / Attendance | No | No soft-delete field/filter | 405 | No | N/A | No delete endpoint | N/A | No soft-delete test run | BLOCKED |
| Penilaian / Assessment | No | No soft-delete field/filter | Physical delete for eligible OPEN/no-score records | Yes | No: one confirmation dialog | `assessment:delete` plus role gate | Yes on physical delete | Existing delete tests are not soft-delete tests; not run | BLOCKED |
| Assessment Score | No | No soft-delete field/filter | 405 | No | N/A | No delete endpoint | N/A | No soft-delete test run | BLOCKED |
| Instruktur / Instructor | No | No soft-delete field/filter | Physical delete when dependency-free | Yes | No verified two-stage flow | `instructor:delete` plus role gate | Yes on physical delete | Existing delete tests are not soft-delete tests; not run | BLOCKED |
| Dokumen / Document | No | No soft-delete field/filter; detail GET returns a signed URL | Physical DB delete and external storage object delete | Yes | No: one confirmation dialog | `document:delete` plus role gate | Yes on physical delete | Existing storage tests do not prove soft delete; not run | BLOCKED |
| Sertifikat / Certificate | No | No soft-delete field/filter | 405; business lifecycle is `ACTIVE`/`REVOKED` via revoke endpoint | No Delete; revoke is separate | N/A for DELETE; revoke confirmation not verified as two-step | `certificate:read` / `certificate:revoke` | Revoke is audited | No soft-delete test run | BLOCKED — revoke is primary lifecycle; archive policy TBD |
| Perusahaan / Employer | No | No soft-delete field/filter | Physical delete | Yes | No: one confirmation dialog | `employer:delete` | Yes on physical delete | No soft-delete test run | BLOCKED |
| Lowongan / Vacancy | No | No soft-delete field/filter | Physical delete | Yes | No: one confirmation dialog | `vacancy:delete` | Yes on physical delete | No soft-delete test run | BLOCKED |
| Lamaran / Application | No | No soft-delete field/filter | 405 | No | N/A | No delete endpoint | N/A | No soft-delete test run | BLOCKED |
| Wawancara / Interview | No | No soft-delete field/filter | 405 | No | N/A | No delete endpoint | N/A | No soft-delete test run | BLOCKED |
| Penempatan / Placement | No | No soft-delete field/filter | 405 | No | N/A | No delete endpoint | N/A | No soft-delete test run | BLOCKED |
| Pengguna / User | Yes | Yes for Users list and auth; no detail GET route | Soft delete: only `User.deletedAt` | No | No UI flow | SUPER_ADMIN/ADMIN role gate in new handler | Yes, transactional | No fixture test run | BLOCKED — API semantics corrected; UI and runtime verification absent |

### Dashboard and reports

Dashboard and report endpoints/pages are aggregate/read-only surfaces, not persisted entities; DELETE is **NOT APPLICABLE**, and no fake DELETE endpoint should be added. The inspected dashboards/reports query Prisma or APIs rather than static mock metrics. However, management/academic dashboard counts are direct unfiltered counts, so they cannot reliably exclude soft-deleted records. The academic report filters deleted Students, but other counted entity types do not have soft-delete columns in the canonical schema.

## Critical delete scan

Canonical `app/api` still contains physical deletes for Program, Subject, Batch, Instructor, Employer, Vacancy, Assessment, and Document. Each has permission checks and success audit logging, but audit logging does not make physical deletion compliant. Document additionally deletes its external storage object before deleting the database row.

Other record DELETE handlers return 405, including Student, Enrollment, Class, Schedule, Attendance, AssessmentScore, Certificate, Application, Interview, and Placement. These preserve data today but do not implement the requested soft-delete lifecycle.

No application raw `DELETE FROM` path was identified in the audited route handlers. The repository includes fixture-cleanup scripts using exact IDs, but some legacy scripts delete AuditLog fixture rows and some cleanup scripts target fixed User emails. They were not run; they do not qualify as authorization to remove existing data or AuditLog.

## Document and Certificate decisions

- **Document:** Current API physically deletes the database row and calls storage deletion; detail GET returns a signed URL. Soft delete and active-read suppression are absent. Irreversible object cleanup remains **TBD** and must not run as a soft-delete implementation or test shortcut.
- **Certificate:** `REVOKED` is the existing business lifecycle and is audited by the revoke endpoint. It must not be replaced with `deletedAt`. Whether an additional archival tombstone is needed remains **TBD**; historical certificate rows are currently retained by the 405 DELETE handler.

## Database integrity and test safety

No fixture/API mutation, migration apply, seed, cleanup, or database reset was executed. The read-only baseline and post-validation counts match exactly:

| Table | Count |
|---|---:|
| User | 3 |
| Student | 21 |
| Program | 1 |
| Subject | 6 |
| Batch | 2 |
| Enrollment | 21 |
| Class | 10 |
| Schedule | 10 |
| Attendance | 9 |
| Assessment | 0 |
| AssessmentScore | 0 |
| Instructor | 6 |
| Document | 0 |
| Certificate | 0 |
| Employer | 0 |
| Vacancy | 0 |
| Application | 0 |
| Interview | 0 |
| Placement | 0 |
| AuditLog | 19 |

The post-validation counts equal the baseline for all 20 tables: **no count changes**. The baseline check found 0 orphans across 32 relations; a post-validation subset covering 9 core relations also found 0. The active `SUPER_ADMIN` count remains 2. This verifies role presence/count only, not which account belongs to the requester. No existing Student, User, or AuditLog was modified by this remediation. No test was run, so no test cleanup or data mutation occurred.

The required per-entity fixture tests (create fixture, authenticate, DELETE, row/tombstone, active GET, AuditLog delta, anonymous/unauthorized/nonexistent cases, and relation preservation) were **not run**. The current repository does not provide a verified soft-delete fixture suite for every entity, and legacy scripts include destructive cleanup/AuditLog deletion; using them against the recovery/manual database would violate the safety constraints.

## Quality gates — canonical root

| Gate | Result |
|---|---|
| `npm run lint` | **FAIL** — unrelated existing lint error in `C:\ghs-integrated-system\ghs-integrated-system\prisma\notepad cek-users.cjs:1:26` (`@typescript-eslint/no-require-imports`). |
| `npx tsc --noEmit` | PASS |
| `npx prisma validate` | PASS |
| `npx prisma migrate status` | PASS — database schema up to date; 4 migrations found. No global soft-delete migration exists in canonical root. |
| `npm run build` | PASS — production build completed; 59 static pages generated. |
| `git diff --check` | PASS for tracked diff; untracked deliverables are not included by Git's default diff check. |

## Remaining blockers

1. Convert the eight active physical DELETE APIs to policy-approved soft delete; add additive schema/migrations where appropriate.
2. Apply `deletedAt: null` consistently to relevant list/detail/aggregate reads; Student GET/list currently do not consistently filter.
3. Decide and implement the required per-entity two-stage UI confirmation (the shared dialog is single-stage; User has no Delete UI).
4. Define lifecycle-safe behavior for Document storage cleanup and Certificate archival without irreversible deletion or loss of revocation history.
5. Add and run exact disposable-fixture integration tests in an isolated test database, retaining AuditLog and existing recovery data.
6. Resolve the unrelated lint error; retain the completed build and read-only data-integrity results as validation evidence.

No commit, push, deployment, reset, seed, destructive migration, broad cleanup, or worktree deletion was performed.
