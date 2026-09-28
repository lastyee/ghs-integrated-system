# STEP 93 — System Delete Policy Design

**Date:** 2026-09-28  
**Policy type:** `SYSTEM_POLICY` proposal; not official GHS policy  
**Scope:** Assessment, Document, Batch, and Instructor. AssessmentScore remains PATCH-only and is not a DELETE target.

## 1. Executive Summary

This report converts the requested Step 93 system-policy decisions into a deterministic design proposal. It is **not** `OFFICIAL_GHS_POLICY` and must not be represented as such. Implementation is not part of this step.

Proposed hard-delete eligibility:

- **Assessment:** only `OPEN` with zero AssessmentScore rows. Any score blocks deletion; any `COMPLETED` status blocks deletion.
- **Document:** `PENDING`, `REJECTED`, and `EXPIRED` may be candidates, with private-object cleanup; `VERIFIED` is never hard-deleted. Storage/DB partial-failure behavior is explicitly specified below.
- **Batch:** only when Enrollment, Class, Schedule, and Certificate dependency checks are all empty. Dates alone do not block deletion.
- **Instructor:** only when there are no Class or Schedule references and `userId` is null. A linked User blocks deletion; User is never cascade-deleted.
- **AssessmentScore:** continue current PATCH correction. No DELETE endpoint or score-delete permission.

These eligibility rules are proposed `SYSTEM_POLICY`. They do not amend, supersede, or claim to be an official GHS rule. GHS owner approval may still be required before production implementation.

## 2. Policy Scope

The design applies the supplied common requirements: server-side authorization, deterministic dependency checks, 401/403/404/409 responses, transactionally recorded successful-delete AuditLogs, contextual confirmation, and no cascade deletion of business records.

No new lifecycle status, schema field, permission record, migration, endpoint, UI, or database operation is introduced here.

## 3. System Policy vs Official GHS Rule

| Label | Use in this report |
|---|---|
| `SYSTEM_POLICY` | Explicit proposed system behavior from the Step 93 instructions. It is a design proposal, not an official GHS policy. |
| `SYSTEM_CONFIRMED` | Existing schema, endpoint, UI, RBAC, or database behavior verified in the repository. |
| `PRD_CONFIRMED` | Explicit requirement in the repository PRD. |
| `INFERRED` | Technical consequence or safety recommendation, not a business rule. |
| `OFFICIAL_GHS_CONFIRMED` | No Step 93 delete decision is labeled this; no official policy source supporting these new deletion rules was identified. |

All eligibility rules in Sections 4–7 are `SYSTEM_POLICY`.

## 4. Assessment Policy

### Existing facts

- **`SYSTEM_CONFIRMED`:** Assessment status is `OPEN` or `COMPLETED`. Assessment requires Class and Subject.
- **`SYSTEM_CONFIRMED`:** AssessmentScore references Assessment and Student; `(assessmentId, studentId)` is unique.
- **`SYSTEM_CONFIRMED`:** Scores must be finite and between zero and `maxScore`; `maxScore` must be positive. Assessment PATCH rejects lowering `maxScore` below an existing score.
- **`SYSTEM_CONFIRMED`:** Score corrections use PATCH, check score ownership by Assessment ID, and create before/after AuditLog in the same transaction.
- **`SYSTEM_CONFIRMED`:** COMPLETED currently does not lock score entry or correction. Existing source documents the GHS lock/finalization rule as unresolved. This proposal does not change that behavior.
- **`SYSTEM_CONFIRMED`:** Assessment DELETE returns 405; there is no Delete action in the Assessment list/detail UI.

### Proposed decision table

| Condition | Technical safety | Historical impact | `SYSTEM_POLICY` action | API result if requested |
|---|---|---|---|---|
| OPEN + zero scores | Can delete if the Assessment still exists, is OPEN, and a server-side score count remains zero at delete time. Perform the check and delete/audit atomically; never cascade scores. | No score history is attached, but the assessment definition and its historical AuditLog target remain relevant. | `SAFE_HARD_DELETE_WITH_DEPENDENCY_CHECK` | Success; conflict if status/count changes before commit |
| OPEN + one or more scores | The AssessmentScore FK is RESTRICT; deleting scores to enable deletion is prohibited. | Would remove student results if cascaded. | `NEVER_HARD_DELETE` | 409 with score count |
| COMPLETED + zero scores | No score FK blocker, but current status represents a lifecycle state. | Removing a completed assessment would erase the completed record. | `NEVER_HARD_DELETE` | 409, identifying COMPLETED as the blocker |
| COMPLETED + one or more scores | Score FK blocks deletion; status also blocks deletion. | Highest record-loss risk. | `NEVER_HARD_DELETE` | 409 with status and score count |

No status is added. Parent Class and Subject are not deleted; their required relations remain unchanged. AuditLog rows are append-only and are not deleted with the Assessment.

Concurrency requirement: the final status and score-count eligibility must be checked inside the same transaction as the Assessment delete and AuditLog insert. A concurrent score create must either commit first and block deletion, or lose the FK race and fail; it must not produce a deleted Assessment with orphaned score data.

## 5. Document Policy

### Existing facts

- **`SYSTEM_CONFIRMED`:** The database stores Document metadata and `storagePath`; file bytes reside in external storage.
- **`SYSTEM_CONFIRMED`:** Production uses Supabase Storage; the default private bucket is `documents`. Signed URLs expire after 900 seconds. Object paths are server-generated under a student-scoped prefix.
- **`SYSTEM_CONFIRMED`:** PENDING documents may be VERIFIED or REJECTED; verification stores actor and timestamp. EXPIRED exists in the enum, but the current expiry-transition mechanism is not present in the inspected API.
- **`SYSTEM_CONFIRMED`:** Upload performs storage upload followed by DB insert + UPLOAD AuditLog transaction. If the DB operation fails, it attempts compensating storage deletion; cleanup failure is logged.
- **`SYSTEM_CONFIRMED`:** Document DELETE currently returns 405; Student can upload/read their own documents but has no delete action.
- **`PRD_CONFIRMED`:** Document statuses, private Supabase storage, server-side file validation, and verifier attribution are required.

### Proposed status policy

| Status | Hard-delete eligibility | Storage object | Actor | Audit/history effect | Soft delete | Policy |
|---|---|---|---|---|---|---|
| PENDING | Candidate | Delete the server-resolved object before DB deletion; block DB deletion on storage error | SUPER_ADMIN, ADMIN, ACADEMIC_STAFF, PLACEMENT_STAFF; no Student | Removes pending metadata; append DELETE log on success | Not required by this proposal; retry behavior must preserve DB row until DB delete commits | `SYSTEM_POLICY` |
| REJECTED | Candidate | Same as PENDING | SUPER_ADMIN, ADMIN, ACADEMIC_STAFF, PLACEMENT_STAFF; no Student | Rejection record/reason is removed from normal document record; retain DELETE audit metadata | Not required by this proposal; approval of rejection-history retention remains a GHS concern | `SYSTEM_POLICY` |
| EXPIRED | Candidate | Same as PENDING | SUPER_ADMIN, ADMIN, ACADEMIC_STAFF, PLACEMENT_STAFF; no Student | Expiry/evidence record is removed from normal document record; retain DELETE audit metadata | Not required by this proposal; expiry rules are otherwise not implemented | `SYSTEM_POLICY` |
| VERIFIED | Never hard-delete | Do not delete object | No role may delete | Preserve verified evidence and verifier history | No new status in this design | `SYSTEM_POLICY` |

Authorization is permission-based and server-side. The proposed eligible staff roles are not implied by existing `document:verify` permission. Student is explicitly NO DELETE even for their own document under this policy. The server must load the Document and trusted `storagePath` from DB; it must never accept storage path or role from the client.

### Storage / database operation and failure behavior

Proposed sequence: validate route input; authenticate and authorize; load Document by ID; reject VERIFIED; resolve the stored path and bucket from the database/configuration; attempt storage deletion; if successful or idempotently confirmed already absent, execute one database transaction that rechecks the Document's current status, deletes only that Document row, and writes a DELETE AuditLog; return success only after the DB transaction commits.

| Failure | Deterministic `SYSTEM_POLICY` behavior |
|---|---|
| A. Storage delete fails | Keep DB row unchanged. Return a non-success server error (e.g. 502/503); do not write a successful DELETE AuditLog. Log safe operational context without credentials, signed URLs, or file content. |
| B. DB delete fails after storage delete | Do not report success and do not create a successful DELETE AuditLog (transaction rolls back). The DB row remains, but its object may be missing. Return non-success, retain the row/path as retry reference, and permit a later authorized retry. |
| C. Object is already absent | Treat as cleanup-complete only when the provider can reliably distinguish a confirmed not-found from an operational failure. Continue the DB transaction and record `storageOutcome: already_absent` in safe audit metadata. If absence cannot be distinguished, fail closed and retain the row. |
| D. Retry | Storage deletion must be idempotent for the same server-resolved path. Retry by Document ID; do not accept a path from the request. If a previous attempt removed storage but DB failed, retry the same no-op/confirmed-missing storage deletion and then retry DB delete + audit. A request after a fully committed deletion returns 404; the original successful audit remains. |

The database row and storage object cannot be atomically committed together. In case B, a temporary DB row pointing at a missing object is possible until retry. The DB row is the retry reference. Any implementation must surface that state and must not claim atomic cross-system behavior. If operations cannot reliably detect already-absent objects or retry by record ID, Document DELETE is not ready for implementation and requires a stronger recovery mechanism. No storage-provider change or cleanup code is made in this step.

Successful DB deletion and its AuditLog insert must be in the same DB transaction. No success-shaped response or successful audit is allowed when storage cleanup fails or DB deletion fails.

## 6. Batch Policy

### Existing facts

- **`SYSTEM_CONFIRMED`:** Batch requires Program. Enrollment, Class, and Certificate reference Batch; Schedule references Class. The live FK actions restrict deletion for these required relations.
- **`SYSTEM_CONFIRMED`:** Batch has start/end dates but no status/archive field. Existing Batch DELETE returns 405.
- **`PRD_CONFIRMED`:** Enrollment history must be retained and batch transfers must be recorded as history.

### Proposed condition table

| Condition | Technical safety | Business risk | `SYSTEM_POLICY` action |
|---|---|---|---|
| 0 Enrollment, 0 Class, 0 Schedule, 0 Certificate | Can delete only after a transaction-scoped dependency check. Program is a required parent, not a child; do not delete it. | No child business history exists; otherwise empty does not mean abandoned. | `SAFE_HARD_DELETE_WITH_DEPENDENCY_CHECK` |
| Has Enrollment | FK restricts; no cascading | Would erase enrollment/cohort history | `NEVER_HARD_DELETE` — 409 with count |
| Has Class | FK restricts; no cascading | Would lose Class and potentially Assessment/Schedule context | `NEVER_HARD_DELETE` — 409 with count |
| Has Schedule through Class | Schedule is reached through Class; Class check must block. Check schedules explicitly for a complete, explainable dependency response. | Would affect schedule/attendance context | `NEVER_HARD_DELETE` — 409 with counts |
| Has Certificate | FK restricts; no cascading | Would remove a certificate's batch association | `NEVER_HARD_DELETE` — 409 with count |
| Historical/completed by dates but no children | Date fields alone do not define a lifecycle and are not a blocker in this proposal | No child history to preserve, but a batch could still be intentionally retained | `SAFE_HARD_DELETE_WITH_DEPENDENCY_CHECK`; no date-only blocker |

The supplied “0 Enrollment and 0 Class” condition is necessary but must not override the explicit Certificate rule: implementation eligibility is zero Enrollment, zero Class, zero Schedule, **and** zero Certificate. Never cascade-delete. Do not add a Batch status. Any future archive lifecycle is outside this proposal.

## 7. Instructor Policy

### Existing facts

- **`SYSTEM_CONFIRMED`:** Instructor has optional nullable unique `userId`, and required Class/Schedule references. Class and Schedule foreign keys restrict Instructor deletion.
- **`SYSTEM_CONFIRMED`:** Deleting an Instructor does not cascade-delete User. Deleting a User sets the linked Instructor's userId to null.
- **`SYSTEM_CONFIRMED`:** Only a read-only Instructor list API exists for Class assignment; no Instructor detail/manage/delete page exists.

### Proposed condition table

| Condition | Technical safety | `SYSTEM_POLICY` action |
|---|---|---|
| 0 Class, 0 Schedule, `userId = null` | No current references or linked account; dependency check must be in transaction | `SAFE_HARD_DELETE_WITH_DEPENDENCY_CHECK` |
| Has Class | Required FK restricts deletion | `NEVER_HARD_DELETE` — 409 with count |
| Has Schedule | Required FK restricts deletion | `NEVER_HARD_DELETE` — 409 with count |
| `userId` is linked | Separate User record is not a child to remove; deleting Instructor alone would change the profile relationship | `NEVER_HARD_DELETE` — 409; no unlink as a side effect |
| Has historical teaching reference | Class/Schedule attribution must remain | `NEVER_HARD_DELETE` while referenced |

Critical rule: never cascade-delete User. If User account deletion is needed, it is a distinct User lifecycle operation governed separately. Under this proposal, a linked User causes Instructor DELETE to be rejected, not silently unlinked or archived.

## 8. AssessmentScore Policy

- **`SYSTEM_CONFIRMED`:** Existing correction is PATCH of score/feedback with maxScore validation, assessment-parent IDOR checking, and transactional before/after audit.
- **`PRD_CONFIRMED`:** Score range, uniqueness per Assessment/Student, and score-change audit are required.
- **`SYSTEM_POLICY`:** `PATCH_ONLY` remains the correction mechanism. No DELETE endpoint, score DELETE permission, cascade, or score removal is introduced.
- COMPLETED currently does not lock score PATCH. This existing behavior is unchanged; the policy proposal does not infer that score deletion or unrestricted post-completion changes are approved.

## 9. Dependency Matrix

| Target | Dependencies / parents | Required DB constraints | AuditLog relationship |
|---|---|---|---|
| Assessment | Children: AssessmentScore. Parents: Class and Subject. | Score FK restricts deletion; Class/Subject required FKs do not get removed. | AuditLog.entity/entityId has no FK and remains append-only. |
| Document | Parent: Student; optional verifier User; external private object. | Student FK restricts; verifiedBy nullable FK is SET NULL if User is deleted. | No target FK; successful DELETE appends record after storage cleanup and within DB delete transaction. |
| Batch | Parent: Program. Children: Enrollment, Class, Certificate; Schedule through Class. | Required business references restrict deletion. | No target FK; append successful-delete audit. |
| Instructor | Optional linked User. Children: Class, Schedule. | userId nullable + unique; deleting User sets it null. Class/Schedule required references restrict Instructor deletion. | No target FK; append successful-delete audit. |

No business-record cascades are allowed. Any unseen/new child relation discovered before implementation must be added to dependency checks and tests.

## 10. Permission Design

Proposed new permissions (design only; none added to code or DB):

| Proposed permission | SUPER_ADMIN | ADMIN | ACADEMIC_STAFF (`ACADEMIC`) | INSTRUCTOR | PLACEMENT_STAFF (`PLACEMENT`) | MANAGEMENT | STUDENT |
|---|---:|---:|---:|---:|---:|---:|---:|
| `assessment:delete` | Yes | Yes | Yes | No | No | No | No |
| `document:delete` | Yes | Yes | Yes | No | Yes | No | No |
| `batch:delete` | Yes | Yes | Yes | No | No | No | No |
| `instructor:delete` | Yes | Yes | Yes | No | No | No | No |

**Discrepancy:** the requested role labels `ACADEMIC` and `PLACEMENT` differ from the current repository/database role identifiers `ACADEMIC_STAFF` and `PLACEMENT_STAFF`. The table maps them explicitly; implementation must use the actual role identifiers or an approved role mapping. Existing seed gives ADMIN/SUPER_ADMIN broadly many current permissions, but these four proposed delete permissions do not exist and are not assigned. The proposed matrix is separate from current RBAC and requires explicit approval before implementation.

Document permission does not confer permission to delete a Student or access arbitrary storage paths. Target record must be loaded server-side; do not accept actor role, ownership, student ID, bucket, or path as trusted client claims.

## 11. Audit Log Design

Every successful deletion appends exactly one DB AuditLog in the same database transaction as the DB row deletion:

- `action`: `DELETE`
- `entity`: `Assessment`, `Document`, `Batch`, or `Instructor`
- `entityId`: deleted record ID
- `actor`: authenticated server-resolved user ID
- `changes`: safe operational context only, such as pre-delete status and dependency counts; for Document, storage outcome (`deleted` or confirmed `already_absent`) and non-sensitive identifying metadata.

Never log password hashes, secrets, service credentials, signed URLs, file contents, or unnecessary sensitive document/student data. On dependency conflict, authorization denial, storage error, or DB transaction failure: no successful DELETE audit. AuditLog is append-only and must never be deleted.

## 12. Storage Design

Only Document uses external storage among these targets. Resolve storage object exclusively from the persisted `storagePath` and configured bucket. Attempt object removal before the database delete. Treat provider-confirmed absence as idempotent success; unknown errors block deletion.

Then delete the database Document and create its AuditLog atomically. If storage removal succeeded but DB transaction fails, keep the Document row/path as a retry handle and return failure; a subsequent authorized retry repeats removal and retries the DB transaction. This can leave a temporary broken download until retry and must be observable. Never return success or append a successful DELETE event before the DB transaction commits.

This is a proposed ordering and failure contract, not proof of cross-system atomicity. If reliable not-found detection/idempotent retry is unavailable from the provider, pause Document implementation and design explicit durable recovery before release. No provider change or implementation is part of Step 93.

## 13. UI/UX Policy

Render Delete only if the signed-in user has the proposed permission and the server-provided eligibility data indicates a candidate. Eligibility display is advisory; backend must recheck everything. Contextual confirmation is required:

| Candidate | Confirmation |
|---|---|
| Assessment | **“Hapus Assessment?”** “Assessment ini masih OPEN dan belum memiliki nilai.” |
| Batch | **“Hapus Batch?”** “Batch ini belum memiliki Enrollment, Class, Schedule, atau Certificate.” |
| Instructor | **“Hapus Instructor?”** “Instructor ini belum digunakan pada Class atau Schedule dan tidak memiliki akun User tertaut.” |
| Document | **“Hapus Dokumen?”** “Dokumen ini belum terverifikasi dan file terkait akan ikut dihapus.” Use status-aware wording for REJECTED/EXPIRED rather than claiming PENDING. |

Conflict messages must be specific and use server counts:

- Assessment: “Assessment tidak dapat dihapus. Assessment ini sudah memiliki 12 nilai.”
- Batch: “Batch tidak dapat dihapus. Batch ini masih memiliki 21 Enrollment.” Also identify Class/Schedule/Certificate when present.
- Instructor: “Instructor tidak dapat dihapus. Instructor ini masih digunakan pada 4 Schedule.” Also identify Class or linked User where applicable.
- Document VERIFIED: “Dokumen tidak dapat dihapus. Dokumen VERIFIED merupakan bagian dari histori.”
- Storage cleanup or database failure: state that removal did not complete and whether retry is needed; never show success.

Unauthenticated is 401, forbidden is 403, missing target is 404, dependency/status conflict is 409. Errors must not be hidden behind generic success/fallback UX.

## 14. Test Plan

Design only; **no destructive tests were executed**.

**Assessment**
1. OPEN + zero score -> success.
2. OPEN + score -> 409; score preserved.
3. COMPLETED + zero score -> 409.
4. COMPLETED + score -> 409; score preserved.
5. Unauthenticated -> 401; authenticated without permission -> 403.
6. IDOR/cross-resource target -> 403/404 without revealing or deleting unrelated data.
7. Exactly one successful actor-attributed audit; none for conflicts.
8. Concurrent score creation vs delete cannot produce orphan score or bypass status/dependency policy.

**Batch**
9. Empty across Enrollment/Class/Schedule/Certificate -> success, even if dates are historical.
10. Enrollment -> 409, preserve enrollment.
11. Class -> 409, preserve class and children.
12. Schedule through Class -> 409, preserve schedule/attendance.
13. Certificate -> 409, preserve certificate.
14. Unauthorized/forbidden checks and one success audit.

**Instructor**
15. Unused, no User -> success.
16. Class -> 409.
17. Schedule -> 409.
18. Linked User -> 409; verify User remains unchanged and linked; never cascade-delete User.
19. Unauthorized/forbidden and IDOR checks.
20. One success audit; no success audit for conflicts.

**Document**
21. PENDING -> candidate delete + object cleanup.
22. REJECTED -> candidate delete + object cleanup.
23. EXPIRED -> candidate delete + object cleanup.
24. VERIFIED -> 409; record and object remain.
25. Storage error -> record remains, no success audit.
26. DB failure after storage success -> no success response/audit; DB row remains and retry works.
27. Already-missing object and repeated request -> deterministic idempotent outcome; distinguish confirmed not-found from provider failure.
28. Student ownership/access and staff role matrix; Student cannot delete even own document.
29. Unauthenticated 401, forbidden 403, IDOR tests.
30. Successful audit actor/entity/ID/context and no sensitive metadata.

**Data integrity**
- No orphan AssessmentScore, Enrollment, Class, Schedule, Certificate, or User.
- Unrelated records and manual GHS data are preserved.
- Use isolated uniquely identified test fixtures and a non-production database only after Step 94 implementation is authorized.

## 15. Implementation Order

If the proposal is approved:

1. **Phase 2A — Assessment:** OPEN + zero score only; keep Score PATCH-only.
2. **Phase 2B — Batch:** only all-dependency-empty candidates.
3. **Phase 2C — Instructor:** only unused and unlinked candidates; never delete User.
4. **Phase 2D — Document:** last because of private external storage and partial-failure/retry requirements.

Before each phase, verify actual permission identifiers and add only the approved permission assignments. No phase is implemented here.

## 16. Risks

- This is a system proposal, not an official GHS requirement. Owner approval may be required.
- Assessment eligibility depends on atomic status/score checks; preflight UI checks alone are insufficient.
- Batch must include Certificate and indirect Schedule checks in addition to the two primary conditions; otherwise the proposal could contradict its own “never delete” rules.
- Instructor deletion could affect account interpretation; rejecting linked User is intentionally conservative.
- Document external storage and PostgreSQL cannot commit atomically. A storage-first/DB-failure case temporarily leaves a DB record for a missing object; retry must be observable and deterministic.
- Proposed permission roles use conceptual aliases that differ from current role names.
- AuditLog entity references are not foreign keys; audit retention does not preserve the deleted application record.
- No new Archive/status is proposed, so ineligible historical records remain blocked rather than being hidden through a new lifecycle state.

## 17. TBD GHS Decisions

The following remain outside this system proposal and require GHS-owner confirmation if business approval is needed:

- Whether OPEN/no-score Assessment deletion is acceptable and whether COMPLETED has an official finalization meaning.
- Whether PENDING/REJECTED/EXPIRED documents may be removed, required retention periods, and whether VERIFIED evidence must be retained.
- Whether an empty historical Batch may be deleted when its dates have passed.
- Whether unlinked, unused Instructor records may be removed and how staff offboarding/User lifecycle is handled.
- Which organizational approver authorizes adoption of the proposed role matrix.

Until approval, label the rules `SYSTEM_POLICY`, not `OFFICIAL_GHS_POLICY`.

## 18. Quality Gates

| Command | Result |
|---|---|
| `npx prisma validate` | **PASS** |
| `npx prisma migrate status` | **PASS** — four migrations found; database up to date |
| `npx tsc --noEmit` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS** |

No destructive regression suite or test was run. No permission was inserted or seeded. No Prisma schema or migration was changed.

## 19. Database Integrity

Read-only counts verified during this step:

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
| AuditLogs | 847 |
| Assessments | 1 |
| AssessmentScores | 0 |

Each required manual record was present:

- Batch `GHI-09`.
- Student NIM `269067460` (`MUHAMAD RIVQI`).
- Employer `bounty`.
- Vacancy `KITCHEN` (OPEN), related to `bounty`.
- Placement `KITCHEN` (PREPARATION), related to `bounty`.
- KTP document `Screenshot__540_.png` (PENDING).

The Placement and KTP document are associated with student NIM `260405066` (TIARA ISMI LAILA), not the GHI-09 student. No database write was performed. No new candidate permission is present in the database.

## 20. Final Status

**`PASS_WITH_TBD`**

The deterministic system policy design and quality gates are complete. New rules are explicitly labeled `SYSTEM_POLICY`, not official GHS policy. Pending organizational approval is recorded in Section 17. No DELETE implementation, permission, schema change, migration, lifecycle change, database mutation, commit, push, or deployment was performed.
