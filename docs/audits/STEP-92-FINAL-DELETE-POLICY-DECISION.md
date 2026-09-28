# STEP 92 — Final Delete Policy Decision Preparation

**Date:** 2026-09-28  
**Scope:** Assessment, Document, Batch, Instructor; AssessmentScore is reviewed but is not a DELETE target.  
**Mode:** Policy audit only. No route behavior, RBAC, lifecycle, database, storage, schema, or migration was changed.

## 1. Executive Summary

No Phase 2 module is currently confirmed safe for business-authorized DELETE. Some empty/unreferenced records may be technically deletable with dependency checks, but the available GHS requirements do not establish the business authority, retention rules, or eligible roles needed to convert technical feasibility into permission to delete. These are therefore `TBD_GHS_DECISION`, not safe candidates.

Current confirmed behavior:

- Assessment and AssessmentScore DELETE handlers return 405. Existing score correction is PATCH with before/after AuditLog.
- Document DELETE handlers return 405. Document status transitions currently support PENDING to VERIFIED/REJECTED; EXPIRED has no observed transition flow.
- Batch DELETE returns 405 and Batch has no status/archive field.
- Instructor has a read-only list API for class assignment, but no Instructor detail/management page or DELETE endpoint.
- The live schema's required foreign keys use `RESTRICT` for the target dependencies described below; Instructor.user and Document.verifiedBy relations are optional and `SET NULL` when the referenced User is deleted.
- AuditLog is append-only by PRD. Document bytes are in external private storage, not in the database.

**Final status: `PASS_WITH_TBD`**. Audit and gates pass, but GHS decisions remain necessary before hard deletion or an archive lifecycle can be implemented.

## 2. Evidence Classification

| Label | Meaning in this report |
|---|---|
| `OFFICIAL_GHS_CONFIRMED` | Supported by an identified official GHS document. No such separate official policy for these delete decisions was found. |
| `SYSTEM_CONFIRMED` | Directly observable in current schema, source, route behavior, permission seed, UI, or read-only database metadata. It confirms current implementation, not business authorization. |
| `INFERRED` | Technical consequence or risk assessment, not a GHS business rule. |
| `TBD_GHS_DECISION` | No available source explicitly answers the business-policy question. |
| `PRD_CONFIRMED` | Explicit current project requirement in `docs/requirements/PRD.md`; not represented here as an independently issued official GHS policy document. |

The PRD states that score bounds and score-change auditing are required; one AssessmentScore exists per assessment/student; AuditLog is append-only; Document has four statuses and verifier attribution; enrollment history must be preserved; and batch transfers must be recorded as history. It does not specify DELETE eligibility for the four target modules.

## 3. Assessment Policy

### Confirmed implementation and policy evidence

- **`SYSTEM_CONFIRMED`:** Assessment status is `OPEN` or `COMPLETED`; new assessments default to `OPEN`.
- **`SYSTEM_CONFIRMED`:** Assessment requires Class and Subject; AssessmentScore children reference Assessment and Student. `(assessmentId, studentId)` is unique.
- **`SYSTEM_CONFIRMED`:** Score input is finite and between zero and the Assessment's `maxScore`; `maxScore` is finite and greater than zero. Reducing maxScore below an existing score is rejected.
- **`SYSTEM_CONFIRMED`:** Score POST/PATCH and Assessment PATCH require `assessment:update` plus an explicit SUPER_ADMIN/ADMIN role check. Score correction uses PATCH and writes before/after audit values transactionally.
- **`SYSTEM_CONFIRMED`:** COMPLETED does not currently lock score creation or correction; code comments say GHS finalization/lock policy is TBD. This does not establish that COMPLETED assessments can be deleted.
- **`SYSTEM_CONFIRMED`:** Assessment DELETE returns 405; no Delete UI exists. List/detail show status and score counts.
- **`PRD_CONFIRMED`:** Scores must meet bounds and score changes must be audited.
- **`TBD_GHS_DECISION`:** No policy determines whether an Assessment with or without scores, OPEN or COMPLETED, can be deleted or archived.

### Scenario evaluation

| Scenario | Technical safety | Historical impact | Recommendation | Evidence |
|---|---|---|---|---|
| A. OPEN + 0 scores | Technically possible only if no score rows exist at transaction time; Class and Subject are parents, not children to remove. Must recheck dependency atomically to prevent a concurrent score insert. | Removes assessment definition and its audit-linked target identity; whether an unscored assessment is disposable is not documented. | `TBD_GHS_DECISION` | Technical condition `SYSTEM_CONFIRMED` from schema; business eligibility `TBD_GHS_DECISION` |
| B. OPEN + existing score | Not safe for direct hard delete: required AssessmentScore FK uses RESTRICT. Must not cascade or delete scores. | Removes assessed student results if score rows are removed; preserves audit events alone does not preserve normal application access to scores. | `TBD_GHS_DECISION`; no hard-delete candidate | `SYSTEM_CONFIRMED` FK and score behavior; retention `TBD_GHS_DECISION` |
| C. COMPLETED + 0 scores | Same referential feasibility as A if no scores. COMPLETED does not currently lock scoring, so a no-score check alone can race with score creation unless serialized/rechecked. | Completion may signal finalized history, but the implementation explicitly lacks a confirmed lock rule. | `TBD_GHS_DECISION` | Current behavior `SYSTEM_CONFIRMED`; meaning of COMPLETED for retention `TBD_GHS_DECISION` |
| D. COMPLETED + existing score | Not safe for direct hard delete: AssessmentScore FK restricts; no cascade. | Highest apparent risk of losing evaluated records. Current PATCH remains available even at COMPLETED, pending policy. | `TBD_GHS_DECISION`; no hard-delete candidate | FK/current PATCH `SYSTEM_CONFIRMED`; business finality/retention `TBD_GHS_DECISION` |

Do not add a new status in this step. Whether the model needs archive/withdrawal semantics instead of hard delete is `TBD_GHS_DECISION`.

## 4. Document Policy

### Confirmed lifecycle and architecture

- **`SYSTEM_CONFIRMED`:** PostgreSQL stores metadata and `storagePath`; bytes are external. Production uses Supabase Storage, default bucket `documents`, private signed URL expiry 900 seconds. Development/test defaults to mock storage.
- **`SYSTEM_CONFIRMED`:** Storage path is server-generated under `students/{studentId}/{documentId}.{extension}`. Student reads are checked against ownership.
- **`SYSTEM_CONFIRMED`:** Upload creates `PENDING`; verification only accepts `PENDING` and changes to `VERIFIED` or `REJECTED`, recording verifier, timestamp, and rejection reason. `EXPIRED` is present in enum/list filters, but no expiry transition flow was observed.
- **`SYSTEM_CONFIRMED`:** Upload stores the object first, then creates DB row and `UPLOAD` AuditLog transactionally. If DB operation fails, code attempts compensating storage deletion; failure is logged and can leave an orphan. DB and storage cannot share an atomic transaction.
- **`SYSTEM_CONFIRMED`:** DELETE returns 405; there is no UI delete action. Student may upload/read own documents; existing delete authority is not defined.
- **`PRD_CONFIRMED`:** The four statuses, file validation, Supabase storage, and verifier attribution are requirements.
- **`TBD_GHS_DECISION`:** Retention/removal authority, status-specific eligibility, Student withdrawal, and whether verified evidence must remain are not specified.

### Status-by-status evaluation

| Status | Hard-delete safety | Storage object | Actor/RBAC | Audit/history | Soft delete / business decision |
|---|---|---|---|---|---|
| PENDING | DB/storage consistency makes a one-step hard delete unsafe; even if no verifier exists, policy is absent. | If removal is approved, object cleanup is necessary; do not delete it before durable recovery/cleanup design. | `TBD_GHS_DECISION`; no current delete permission. | Would remove current metadata/evidence; a DELETE audit alone may not satisfy retention. | Soft-delete/withdrawal semantics and Student rights are `TBD_GHS_DECISION`. |
| REJECTED | Same cross-system failure risk; rejection reason and reviewer attribution may be relevant history. | Same approved cleanup/retry requirement. | `TBD_GHS_DECISION`; no current delete permission. | Rejection history would disappear from normal record if hard deleted. | Retention vs. replacement policy is `TBD_GHS_DECISION`. |
| EXPIRED | Status alone does not prove retention may end; no current expiry process was found. | Same external-object cleanup issue. | `TBD_GHS_DECISION`; no current delete permission. | May represent historical evidence; expiry mechanism itself is undefined in PRD. | Retention/expiry semantics are `TBD_GHS_DECISION`. |
| VERIFIED | Highest evidentiary risk; hard deletion cannot be called safe from available evidence. | Do not remove object absent explicit GHS authorization and durable cleanup design. | `TBD_GHS_DECISION`; no current delete permission. | Could destroy proof and verification provenance; audit-only metadata may be insufficient. | Retention period and soft-delete requirement are `TBD_GHS_DECISION`. |

### Required failure analysis and architecture recommendation

No cleanup implementation is authorized. If GHS later approves document removal, use an explicit, durable, idempotent asynchronous cleanup design rather than attempting a false cross-system transaction. A database tombstone/outbox and retry state is a possible future architecture, not a chosen GHS policy; it may need a migration.

| Failure scenario | Risk / required future handling |
|---|---|
| 1. DB delete fails | Do not report success; preserve DB metadata. If storage has not yet been removed, the object remains available. |
| 2. Storage delete fails | Surface and persist cleanup failure; retry idempotently and alert. A silent best-effort failure can leave private orphan data. |
| 3. DB delete succeeds, storage cleanup fails | Leaves orphan storage without normal DB locator. Durable outbox/tombstone must retain path and retry state; do not hard-delete the only cleanup reference. |
| 4. Storage delete succeeds, DB delete fails | Leaves DB row pointing to missing object. Avoid storage-first; if unavoidable, have recovery/re-upload/restore semantics and do not return success. |
| 5. Retry | Must be idempotent by Document ID/path, retry safely after partial completion, record outcome, and never delete a different object due to client-supplied path. |

All five statuses remain `TBD_GHS_DECISION`. Recommendation: do not include Document in an unconditional Phase 2 hard-delete scope.

## 5. Batch Policy

### Confirmed dependencies and lifecycle

- **`SYSTEM_CONFIRMED`:** Batch requires Program; Enrollment, Class, and Certificate reference Batch. Schedule references Class, making it an indirect descendant. Required live FKs use `RESTRICT`.
- **`SYSTEM_CONFIRMED`:** Batch has start/end dates but no status, archived/deleted flag, or lifecycle transition.
- **`PRD_CONFIRMED`:** Enrollment history must be preserved and batch transfers must be recorded as history.
- **`SYSTEM_CONFIRMED`:** Batch DELETE returns 405; list/detail show dates, Program and Enrollments, but detail does not expose counts for all Class/Schedule/Certificate dependents.
- **`TBD_GHS_DECISION`:** Batch removal, closure, archive, reactivation, and treatment of completed cohorts have no explicit policy.

### Condition evaluation

| Condition | Technical safety | Business risk | Recommended action | Evidence |
|---|---|---|---|---|
| A. No Enrollment and no Class | Direct delete is technically possible only after checking Certificates and any other required references atomically. | Could still be a planned/future batch; empty does not mean abandoned. | `TBD_GHS_DECISION` | Technical check `SYSTEM_CONFIRMED`; eligibility `TBD_GHS_DECISION` |
| B. Has Enrollment | Live FK prevents hard deletion while enrollments exist. Do not cascade. | PRD requires enrollment history preservation. | `NEVER_DELETE` enrolled Batch as a technical default for Phase 2; if business needs concealment, separate archive decision | FK `SYSTEM_CONFIRMED`; history rule `PRD_CONFIRMED` |
| C. Has Class | Live FK prevents deletion; do not cascade. | Class records identify training grouping and can link to assessments/schedules. | `NEVER_DELETE` while Class exists | FK `SYSTEM_CONFIRMED`; historical risk `INFERRED` |
| D. Has Schedule through Class | Schedule points to Class; deleting Batch/Class would threaten schedule and attendance history. | Loss of training calendar and associated attendance linkage. | `NEVER_DELETE` while descendant records exist | Schema `SYSTEM_CONFIRMED`; history impact `INFERRED` |
| E. Has Certificate | Live FK prevents deletion. | Certificate refers to the cohort and program and is issued evidence. | `NEVER_DELETE` while Certificate exists | FK `SYSTEM_CONFIRMED`; evidence impact `INFERRED` |
| F. Completed/historical by dates or related statuses | No Batch completion field; dates alone do not enforce lifecycle or imply safe deletion. | Would erase cohort context; PRD history requirements apply to enrollments/transfers. | `ARCHIVE_OR_STATUS` is only a possible design direction; actual decision `TBD_GHS_DECISION` | Dates/status behavior `SYSTEM_CONFIRMED`; business policy `TBD_GHS_DECISION` |

Do not create a Batch status in STEP 92. Any archive/closure status and semantics are a future schema and GHS decision.

## 6. Instructor Policy

### Confirmed dependencies and account relationship

- **`SYSTEM_CONFIRMED`:** Instructor has a required name, optional `userId` (nullable, unique), and Class/Schedule relations. It has no active/archive field.
- **`SYSTEM_CONFIRMED`:** Class and Schedule require Instructor; live FK delete actions are `RESTRICT`.
- **`SYSTEM_CONFIRMED`:** Instructor.user relation is optional. Deleting a linked User sets `Instructor.userId` to null; deleting Instructor has no cascade to User. A future delete must never delete User merely because Instructor is deleted.
- **`SYSTEM_CONFIRMED`:** API only lists Instructors for class assignment using `class:read`; no Instructor management/detail page or delete route exists.
- **`TBD_GHS_DECISION`:** Offboarding, historical teaching retention, linked-account behavior, and actor permissions are unspecified.

### Condition evaluation

| Condition | Technical safety | Business risk | Recommended action | Evidence |
|---|---|---|---|---|
| A. No Class | Could be technically deletable if no Schedule exists; both dependencies must be checked server-side and atomically. | A currently unused Instructor may be a future staff record; policy absent. | `TBD_GHS_DECISION` | Technical `SYSTEM_CONFIRMED`; eligibility `TBD_GHS_DECISION` |
| B. Has Class | Class FK restricts hard deletion. | Past/future class attribution may be lost if descendants are removed. | `NEVER_DELETE` while Class references exist; consider separately approved inactive/archive lifecycle | FK `SYSTEM_CONFIRMED`; retention `TBD_GHS_DECISION` |
| C. Has Schedule | Schedule FK restricts hard deletion. | Schedule and attendance context/history could be broken. | `NEVER_DELETE` while Schedule references exist | FK `SYSTEM_CONFIRMED`; impact `INFERRED` |
| D. Has linked User | User is optional and unique; technically separate rows. Deleting Instructor does not require deleting User. | Whether account should remain and which profile role it represents is not specified. | `TBD_GHS_DECISION`: either reject, unlink, or archive only after GHS defines account/offboarding semantics. Never cascade-delete User. | Relation `SYSTEM_CONFIRMED`; actor/account policy `TBD_GHS_DECISION` |
| E. Has teaching history | Historical Class/Schedule references remain protected by FK. | Attribution of past teaching is consequential. | `NEVER_DELETE` while historical rows reference Instructor; any inactive/archive alternative is `TBD_GHS_DECISION` | Technical `SYSTEM_CONFIRMED`; historical retention `INFERRED`/decision TBD |

An unused, unlinked Instructor is a **technical-only delete candidate**, not business-wise safe: no official policy confirms it may be removed. No Phase 2 candidate is approved by this audit.

## 7. AssessmentScore Policy

- **`SYSTEM_CONFIRMED`:** Existing score correction uses PATCH for score/feedback, verifies that the score belongs to the requested Assessment, enforces the current maxScore, and appends transactional before/after audit data.
- **`SYSTEM_CONFIRMED`:** Score DELETE endpoints return 405; frontend offers Update, not Delete. Student may read only own score; score mutations require Admin/Super Admin checks.
- **`PRD_CONFIRMED`:** score changes must be audited; score range is bounded; unique `(assessmentId, studentId)`.
- **Recommendation:** `PATCH_ONLY` is the current model for corrections and should remain so for STEP 92. There is no evidence requiring score DELETE, and deleting a score would weaken uniqueness/history semantics.
- Whether GHS requires immutable/finalized scores or an exceptional correction workflow after COMPLETED remains `TBD_GHS_DECISION`. Current implementation does not lock PATCH on COMPLETED; this is not a business approval to delete or change behavior.

AssessmentScore is not a DELETE candidate in Phase 2.

## 8. Dependency Analysis

Schema and live PostgreSQL FK metadata were both inspected read-only. Live FK delete actions:

| Record/edge | Required/nullable | Unique/index | Live `ON DELETE` and implication |
|---|---|---|---|
| Assessment.classId -> Class.id | Required, NOT NULL | No uniqueness | RESTRICT; Class cannot be deleted while Assessment references it |
| Assessment.subjectId -> Subject.id | Required, NOT NULL | No uniqueness | RESTRICT |
| AssessmentScore.assessmentId -> Assessment.id | Required, NOT NULL | Composite unique with studentId | RESTRICT; existing score blocks Assessment removal |
| AssessmentScore.studentId -> Student.id | Required, NOT NULL | Composite unique with assessmentId | RESTRICT |
| Document.studentId -> Student.id | Required, NOT NULL | Index on studentId | RESTRICT |
| Document.verifiedById -> User.id | Nullable | No uniqueness | SET NULL when User is deleted |
| Batch.programId -> Program.id | Required, NOT NULL | No uniqueness | RESTRICT |
| Enrollment.batchId -> Batch.id | Required, NOT NULL | No uniqueness declared | RESTRICT |
| Class.batchId -> Batch.id | Required, NOT NULL | No uniqueness declared | RESTRICT |
| Certificate.batchId -> Batch.id | Required, NOT NULL | No uniqueness declared | RESTRICT |
| Schedule.classId -> Class.id | Required, NOT NULL | No uniqueness declared | RESTRICT; indirect Batch descendant |
| Instructor.userId -> User.id | Nullable | Unique | SET NULL when User is deleted; does not imply reverse deletion |
| Class.instructorId -> Instructor.id | Required, NOT NULL | No uniqueness declared | RESTRICT |
| Schedule.instructorId -> Instructor.id | Required, NOT NULL | No uniqueness declared | RESTRICT |
| AuditLog.userId -> User.id | Nullable | Indexed | SET NULL when User is deleted |
| AuditLog.entity/entityId -> target | No FK | No uniqueness | Target deletion does not cascade AuditLog; log is append-only per PRD |

No schema changes were made. The current live DB counts include zero AssessmentScores, but this snapshot does not constitute policy approval for future records.

## 9. RBAC Analysis

Current seed/database has no delete permissions for Assessment, AssessmentScore, Document, Batch, or Instructor. ADMIN and SUPER_ADMIN have many existing module permissions, but this does not create permission to delete these records. Academic Staff, Instructor, Placement Staff, Management, and Student have no delete permission for these targets.

| Module | Current candidate DELETE permission | SUPER_ADMIN | ADMIN | ACADEMIC_STAFF | INSTRUCTOR | PLACEMENT_STAFF | MANAGEMENT | STUDENT |
|---|---|---|---|---|---|---|---|---|
| Assessment | None | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE |
| AssessmentScore | None; existing `assessment:update` only | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE |
| Document | None | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE |
| Batch | None | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE |
| Instructor | None; list uses `class:read` | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE |

If GHS later approves a delete action, it requires a new narrowly scoped permission (`NEW_PERMISSION_REQUIRED`) and an explicit role decision. Do not use client-supplied role/ownership; every future route must enforce server-side authorization, parent/target ownership where applicable, and IDOR-safe target scoping. STEP 92 creates no permissions.

## 10. Storage Analysis

Document is the only target with external object storage. DB metadata, storage object, and AuditLog cannot be atomically committed together. The existing upload compensation path may leave an orphan if compensation fails; it logs the error. Deleting storage first risks a DB row pointing to a missing object if DB removal then fails. Deleting DB first risks losing the normal reference needed to clean up an object if storage removal fails.

Recommendation is an `INFERRED` technical architecture only: only after GHS authorizes retention/removal, preserve a durable cleanup reference and retry state (for example, tombstone/outbox), use idempotent object deletion, surface/alert failures, and retain audit evidence. Do not accept storage path from the client, and do not place file contents or signed URLs in audit logs. A durable outbox/tombstone likely needs a separate schema decision/migration.

## 11. UX Recommendation

No UI is implemented or authorized now. If policy is later approved:

| Target and condition | Suggested UX behavior |
|---|---|
| Assessment | Do not show Delete until GHS decides each OPEN/COMPLETED and scored/unscored rule. If allowed with zero scores, show exact dependency count and explain that the Assessment definition will be removed; with scores, show a server conflict and preserve scores. Confirmation must be contextual; show 403 Forbidden and network/server errors distinctly. |
| AssessmentScore | Keep existing Update/PATCH; no Delete button. Show maxScore validation and server error as today. |
| Document | Do not show Delete based on status alone. If future policy allows withdrawal/removal, explain that both record and private file are affected, state whether cleanup is pending, and show retryable cleanup failure without claiming success. Status-specific confirmation and 403/conflict errors must be explicit. |
| Batch | No Delete button until policy exists. If future approved and truly dependency-free, a contextual “Hapus Batch?” confirmation may name absence of Enrollment/Class/Certificate dependencies; any descendant dependency should show a server-side 409 count, not cascade. Archive wording must wait for GHS-approved archive semantics. |
| Instructor | No Delete button until offboarding policy exists. If approved for unused/unlinked only, confirmation must say the User account is not deleted. With Class/Schedule dependencies show a blocking count and preserve historical attribution. |

In all cases, client checks are informational only; dependency validation and authorization must be server-side. Render 401, 403, 404, 409, storage-pending/failure, and 500 states accurately.

## 12. Phase 2 Safe Candidates

**Business-authorized safe candidates: none.**

This does not mean no rows can be deleted at the database level. It means none of the four modules has sufficient explicit GHS evidence for business-safe DELETE.

Technical-only conditional observations (not permission to implement):

- Assessment OPEN with zero score rows: technically deletable only after an atomic dependency check; business decision is missing.
- Assessment COMPLETED with zero score rows: same technical constraint, and completion/lock meaning is not settled.
- Batch with no Enrollment/Class/Certificate references: potentially FK-clear, but no rule says an empty Batch is disposable.
- Instructor with no Class/Schedule and no linked User: potentially FK-clear, but no offboarding/deletion policy exists.

Do not treat these as approved Phase 2 candidates.

## 13. Phase 2 TBD/Blocked Candidates

| Candidate | Status | Blocker |
|---|---|---|
| Assessment OPEN with or without scores | `TBD_GHS_DECISION` | Retention and score dependencies; no OPEN delete policy |
| Assessment COMPLETED with or without scores | `TBD_GHS_DECISION` | Finalization/score-lock and retention policy absent |
| AssessmentScore | Excluded; `PATCH_ONLY` current behavior | No delete policy; correction already supported via audited PATCH |
| Document in PENDING/REJECTED/EXPIRED/VERIFIED | `TBD_GHS_DECISION` | Status-specific retention, Student rights, actor, external storage cleanup/retry |
| Batch empty | `TBD_GHS_DECISION` | Empty does not prove abandoned or disposable |
| Batch with Enrollment/Class/Schedule/Certificate or historical | `NEVER_DELETE` by technical/historical safety unless separately approved archival path is defined | Required FK and history dependencies |
| Instructor unused | `TBD_GHS_DECISION` | No offboarding or deletion rule |
| Instructor with Class/Schedule/history | `NEVER_DELETE` while referenced; archive/deactivation is TBD | FKs and historical teaching attribution |
| Instructor linked to User | `TBD_GHS_DECISION` | Must never cascade-delete User; reject/unlink/archive semantics need approval |

## 14. Future GHS Decisions

1. **Assessment:** May OPEN with zero scores be deleted? What about COMPLETED with zero scores? Are any scored assessments ever removable? Does COMPLETED mean final, and should it lock scoring? What retention period and actor roles apply?
2. **Document:** Retention period per status, verified-evidence obligations, Student withdrawal rights, replacement semantics, who authorizes removal, and whether soft deletion/tombstones are required.
3. **Batch:** Meaning of completed/historical, deletion eligibility for never-started empty batches, cohort archival, reactivation, and retention of Enrollment/Class/Schedule/Certificate context.
4. **Instructor:** Offboarding/inactivation lifecycle, treatment of future versus historical assignments, policy for linked User accounts, and authorized roles. Confirm explicitly that Instructor removal never deletes User.
5. **Audit:** For each approved delete/archive, required metadata and retention details beyond actor/entity/entityId and pre-delete state.

No default is inferred from role title, current empty counts, date fields, FK behavior, or implementation gaps.

## 15. Implementation Order

- **Phase 2A — No business decision required:** None of these four modules qualifies for a new DELETE feature. Existing AssessmentScore PATCH remains outside DELETE scope.
- **Phase 2B — After GHS policy decisions:** Reassess Assessment and AssessmentScore together; Batch retention/archive; Instructor offboarding; Document status-specific retention and actor rights. Then specify exact permissions, dependency policy, audit payload, and UX.
- **Phase 2C — Schema/infrastructure decision:** Any soft delete, archive status, tombstone, or durable Document cleanup outbox/retry state needs a separate schema/migration approval and operational design.

No Phase 2 implementation is performed by this report.

## 16. Quality Gates

| Command | Result |
|---|---|
| `npx prisma validate` | **PASS** |
| `npx prisma migrate status` | **PASS** — four migrations found; database up to date |
| `npx tsc --noEmit` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS** |

No destructive test, regression suite, fixture cleanup, or DELETE request was run. No schema/migration, implementation, RBAC, or lifecycle changes were made.

## 17. Database Integrity

Read-only count snapshots at the beginning and end of the audit matched:

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

Each required manual record was found both before and after:

- Batch `GHI-09`.
- Student NIM `269067460` (`MUHAMAD RIVQI`).
- Employer `bounty`.
- Vacancy `KITCHEN` (OPEN), related to `bounty`.
- Placement `KITCHEN` (PREPARATION), related to `bounty`.
- KTP document `Screenshot__540_.png` (PENDING).

The Placement and KTP document are associated with student NIM `260405066` (TIARA ISMI LAILA), not the GHI-09 student. No database write was performed. FK actions and unique indexes were inspected read-only from live PostgreSQL metadata.

## 18. Final Status

**`PASS_WITH_TBD`**

Audit scope, data integrity checks, and all requested quality gates passed. There is no evidence that makes any of the four modules business-wise safe for Phase 2 DELETE. Their unresolved business policy is explicitly recorded as `TBD_GHS_DECISION`; technical-only empty-record cases are not elevated into GHS approval.

No DELETE implementation, soft delete, archive, new status, schema change, migration, DB mutation, permission change, commit, push, or deployment was performed.
