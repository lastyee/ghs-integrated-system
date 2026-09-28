# STEP 91 — Delete Phase 2 Policy Audit

**Audit date:** 2026-09-28  
**Scope:** Assessment, AssessmentScore, Document, Batch, Instructor  
**Mode:** Audit and policy design only; no DELETE endpoint execution, data mutation, schema change, migration, or lifecycle/RBAC change.

## 1. Executive Summary

The five modules were reviewed against the current Prisma schema, route handlers, permission seed, frontend, repository PRD, and read-only database state. No official GHS policy source was found that authorizes deletion or sets archival/retention rules for these modules. Therefore, the business decision for Assessment, Document, Batch, and Instructor remains `TBD_GHS_DECISION`.

The current system confirms:

- Assessment, AssessmentScore, Document, and Batch DELETE handlers return HTTP 405 without deleting database records.
- There is no Instructor management page/detail route or DELETE endpoint.
- Score corrections use PATCH and write a transactional AuditLog. Score deletion is unsupported.
- Assessment `COMPLETED` currently does not lock score creation/correction. The code explicitly says GHS finalization/lock policy is TBD.
- AuditLog is append-only, and the PRD states that score changes must be audited.
- Document file bytes are external to PostgreSQL, private, and served through short-lived signed URLs. Database and storage operations cannot share one transaction.
- Required foreign keys in the live database use `RESTRICT`; the optional verifier/instructor-to-User references use `SET NULL`.

No DELETE implementation is recommended for any of these five modules until the unresolved business rules are decided. For score corrections, retain the existing PATCH pathway. Any future permission for DELETE requires a new, narrowly assigned permission rather than a blanket grant to all administrative roles.

**Final status: `PASS_WITH_TBD`**

## 2. Assessment Audit

### Current system behavior — `SYSTEM_CONFIRMED`

- `Assessment` requires `classId`, `subjectId`, `name`, `type`, `maxScore`, and `status`; status is `OPEN` or `COMPLETED`, default `OPEN`.
- Required foreign keys to Class and Subject restrict deletion of those parents while an assessment exists.
- Assessment has child AssessmentScore rows. Each score references one assessment and one student.
- Assessment list/detail shows status and score counts. Detail UI supports entering scores for unscored enrolled students and updating existing scores.
- Assessment PATCH permits status changes. Lowering `maxScore` below the highest stored score is rejected.
- Score writes and score corrections are separately audited. Audit records store before/after values for a correction.
- Assessment DELETE returns 405; no delete action is displayed.
- On both score POST and PATCH, implementation comments state that `COMPLETED` does not lock score entry/correction because the GHS finalization/lock rule remains unresolved.

The assessment schema validates `maxScore` as finite and greater than zero. Score schemas require a finite score at least zero; endpoint logic also enforces score <= the assessment’s current `maxScore`.

### Decision questions

| Question | Audit finding |
|---|---|
| Delete an assessment with no scores? | `TBD_GHS_DECISION`. No GHS policy found. |
| Delete an assessment with scores? | `TBD_GHS_DECISION`; FK restricts it technically, and deleting scores would erase academic history. No cascading delete is appropriate. |
| Delete a COMPLETED assessment? | `TBD_GHS_DECISION`. Current completion status is not a lock in the implementation; this is not evidence that deletion is allowed. |
| Delete an OPEN assessment? | `TBD_GHS_DECISION`. `OPEN` does not imply deletable. |
| Hard delete, soft delete, archive/status, or never delete? | `TBD_GHS_DECISION`. Existing status only models OPEN/COMPLETED, not archived/deleted. |

No delete recommendation can be made as a GHS business rule from the available evidence.

## 3. AssessmentScore Audit

### Current system behavior — `SYSTEM_CONFIRMED`

- AssessmentScore has required `assessmentId` and `studentId` foreign keys and a nullable `score` and `feedback`.
- The composite unique key `(assessmentId, studentId)` permits at most one score row for a student per assessment.
- POST validates assessment existence, score range, student existence/non-soft-deleted state, and enrollment in the batch associated with the assessment's class. Duplicate scores return 409.
- PATCH updates score/feedback only, validates the value against the current `maxScore`, checks that the score belongs to the URL assessment (IDOR guard), and writes before/after AuditLog data in the same transaction.
- Students can read only their own score through the API. Score creation and correction require `assessment:update` and an additional SUPER_ADMIN/ADMIN role check.
- Score DELETE returns 405. The frontend offers “Simpan” for a new score and “Update” for an existing score; it has no delete action.
- The repository PRD requires valid score bounds, one score per assessment/student, and audit logging of score changes.

### Decision questions

| Question | Audit finding |
|---|---|
| May a score be deleted for correction? | Current system does not permit deletion. Whether GHS permits it remains `TBD_GHS_DECISION`. |
| Is a score a historical record? | The PRD requires changes to be audited; it does not explicitly define score retention/deletion. Historical-retention rule is `TBD_GHS_DECISION`. |
| Should correction use PATCH rather than DELETE? | `SYSTEM_CONFIRMED`: PATCH already changes score/feedback and logs before/after data. This is the existing correction path. |
| Does COMPLETED lock score changes? | `SYSTEM_CONFIRMED`: it currently does not. Whether it should is `TBD_GHS_DECISION`. |
| May a Student delete their score? | `SYSTEM_CONFIRMED`: there is no score DELETE; Student has read-only assessment permission and the UI/API do not expose score mutation to Student. Future policy remains `TBD_GHS_DECISION`. |

**Classification:** `PATCH_ONLY` for correction under the current behavior (`SYSTEM_CONFIRMED`). This does not decide whether GHS may later authorize deletion or require a completion lock.

## 4. Document Audit

### Data and storage — `SYSTEM_CONFIRMED`

- Prisma `Document` stores `studentId`, `type`, `storagePath`, file metadata, status, optional `verifiedById`, `verifiedAt`, and `rejectionReason`. File bytes are not stored in PostgreSQL.
- Storage provider is Supabase Storage in production (or when explicitly configured); development/test defaults to an in-memory mock provider.
- Objects are stored in the private `documents` bucket by default. Paths are server-generated under `students/{studentId}/{documentId}.{extension}`.
- Document detail creates a signed URL with a 900-second expiry. Student detail access checks ownership against the authenticated account.
- Upload starts by storing the external object, then inserts the Document and `UPLOAD` AuditLog within a database transaction. If the DB operation fails, code attempts compensating storage deletion. If that cleanup also fails, the failure is logged and an orphan object may remain.
- Database and Supabase Storage do not participate in a shared atomic transaction.

### Lifecycle and verification — `SYSTEM_CONFIRMED`

- Enum statuses are `PENDING`, `VERIFIED`, `REJECTED`, and `EXPIRED`.
- Upload creates a `PENDING` Document.
- Verification PATCH accepts only `PENDING` documents and changes them to `VERIFIED` or `REJECTED`; it records verifier, timestamp, and rejection reason and appends a transactional `VERIFY` or `REJECT` AuditLog.
- The list UI filters and counts all four statuses. Detail UI exposes verify/reject controls only for `PENDING`. The inspected endpoint/UI contains no EXPIRED transition flow.
- DELETE returns 405; no delete action is shown.
- Student may upload and read their own document. Administrative roles can upload for a selected student. The API does not offer a Student document-delete operation.

### Decision questions

Whether to delete, who may delete, whether VERIFIED/REJECTED/EXPIRED records are removable, whether Student may delete their own record, and whether history must be retained are all `TBD_GHS_DECISION`. No official retention, withdrawal, or replacement policy was found.

### Architecture recommendation — `INFERRED`, not a GHS rule

Do not perform a simple storage-first or database-first hard delete:

- Storage-first followed by DB failure leaves a database row pointing to a missing private object.
- DB-first followed by storage failure leaves an unreferenced private object and potentially destroys the retrievable document record before deletion is known to have completed.

If GHS later permits removal, decide retention first. A soft-delete/tombstone plus a durable, retryable storage-cleanup work item (outbox/saga) is safer than pretending the two systems can commit atomically. Require idempotent retries, explicit cleanup-failure state/alerting, and an audit record that identifies actor, Document ID, prior status, and cleanup outcome without placing signed URLs or file contents in audit metadata. This may require schema/migration work if no existing durable retry mechanism is available. Do not run storage deletion until policy, retry, and recovery behavior are approved.

## 5. Batch Audit

### Current system behavior — `SYSTEM_CONFIRMED`

- Batch has required `programId`, `startDate`, optional `endDate`, `name`, timestamps, and no own status/archive/deleted field.
- Batch is related to Program, Enrollment, Class, and Certificate. Enrollment and Class reference Batch. Certificate also references Batch. Schedule references Class, so Schedule is an indirect descendant through Class.
- The list UI displays program and batch dates; detail displays enrollment rows and enrollment statuses. The current detail does not provide dependency counts for Classes, Schedules, or Certificates.
- Create/update validates that end date is not before start date. Batch update writes AuditLog.
- DELETE returns 405; no delete action is shown. Batch has no frontend status/archive control.
- The repository PRD states that enrollment history must be preserved and batch transfers must be recorded as history; it does not define batch deletion/archive eligibility.

### Decision questions

| Question | Audit finding |
|---|---|
| Delete an empty batch? | `TBD_GHS_DECISION`; an empty current count does not establish policy. |
| Delete a batch with Enrollment or Class? | No cascade; live FKs restrict parent deletion. Business exception policy remains `TBD_GHS_DECISION`. |
| Delete a batch already started or ended? | `TBD_GHS_DECISION`; schema only stores dates and has no lifecycle status. |
| Should Batch have archive/status? | `TBD_GHS_DECISION`; adding a distinct archive lifecycle would require a schema/migration decision. |
| Would hard delete harm history? | `INFERRED`: deleting a batch can remove the historical grouping/context used by enrollment, class, schedule, and certificate records. The PRD's explicit history requirements strengthen the need for GHS approval; they do not authorize a particular archive implementation. |

Do not cascade-delete Enrollment, Class, Schedule, or Certificate.

## 6. Instructor Audit

### Current system behavior — `SYSTEM_CONFIRMED`

- Instructor has a required name, optional `userId`, timestamps, Classes, and Schedules. It has no active/inactive/archive field.
- `userId` is nullable and unique. On **User deletion**, the Instructor's `userId` is set null. Instructor deletion does not cascade in the opposite direction to User.
- Class and Schedule both require an Instructor. Their FK actions restrict Instructor deletion while those records exist.
- `/api/instructors` is a read-only list endpoint protected with `class:read`. The Class UI uses that list to assign an instructor while creating/updating a Class.
- No `/instructors` page, `/instructors/[id]` page, Instructor write endpoint, or Instructor DELETE endpoint exists in the inspected app.
- Role association does not imply permission to delete the linked account. **Never cascade-delete User because an Instructor record is deleted.**

### Decision questions

Deletion eligibility for an instructor with no Classes, an instructor with Schedules, a User-linked instructor, and a teacher with historical Class/Schedule records is `TBD_GHS_DECISION`. Whether to retain an inactive/archive state is also `TBD_GHS_DECISION`. Existing foreign keys only enforce referential integrity; they do not decide historical retention.

## 7. Dependency Matrix

The following combines `prisma/schema.prisma` and a read-only query of PostgreSQL `information_schema` foreign keys. Database delete rules below are the live FK rules.

| Candidate | Parent/required FKs | Child/dependent rows | Nullable/unique details | Live FK `ON DELETE` / dependency |
|---|---|---|---|---|
| Assessment | `classId -> Class.id` (required); `subjectId -> Subject.id` (required) | AssessmentScore (`assessmentId`); AuditLog references by string only | AssessmentScore has unique `(assessmentId, studentId)` | Required parent FKs are `RESTRICT`; score rows block assessment deletion (`RESTRICT`); AuditLog `entityId` has no FK and is not cascade-deleted |
| AssessmentScore | `assessmentId -> Assessment.id` (required); `studentId -> Student.id` (required) | AuditLog references by entity/entityId only | Composite unique `(assessmentId, studentId)`; no nullable FK | Both FKs `RESTRICT`; AuditLog row not FK-coupled |
| Document | `studentId -> Student.id` (required); `verifiedById -> User.id` (optional) | External storage object; AuditLog references by string only | `verifiedById` nullable; no FK to storage; Student relation indexed | Student FK `RESTRICT`; verifier FK `SET NULL`; storage object is outside DB FK/transaction |
| Batch | `programId -> Program.id` (required) | Enrollment, Class, Certificate; Schedule via Class; AuditLog references by string only | No Batch lifecycle/status field | Program and dependent required FKs `RESTRICT`; do not cascade descendants |
| Instructor | `userId -> User.id` (optional) | Class, Schedule; AuditLog references by string only | `userId` nullable and unique | User-to-Instructor FK is `SET NULL` when User is deleted; Class/Schedule required Instructor FKs are `RESTRICT`; deleting Instructor does not delete User |

Additional AuditLog fact: its optional `userId` FK to User uses `SET NULL`; its `entity`/`entityId` is not an FK to audited records. Its append-only behavior is a repository policy, not a database FK rule.

## 8. RBAC Matrix

Current runtime/seed has no `assessment:delete`, `document:delete`, `batch:delete`, `instructor:delete`, or `assessmentScore:delete` permissions. Assessment/score/document/batch DELETE endpoints return 405 independent of role; Instructor has no DELETE route. “No delete” below describes current behavior and assigned delete permissions, not a future GHS decision.

| Module | Current delete permission | SUPER_ADMIN | ADMIN | ACADEMIC_STAFF | INSTRUCTOR | PLACEMENT_STAFF | MANAGEMENT | STUDENT |
|---|---|---|---|---|---|---|---|---|
| Assessment | None | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE |
| AssessmentScore | None; correction uses `assessment:update` | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE |
| Document | None | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE |
| Batch | None | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE |
| Instructor | None; list uses `class:read` | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE | No DELETE |

If GHS approves delete for any module, mark the corresponding permission `NEW_PERMISSION_REQUIRED`. Do not infer that all Admin users should receive it. Approval must specify the eligible roles and assignment scope; existing seed broadly gives ADMIN/SUPER_ADMIN many current permissions, but that is not a deletion-policy decision for these modules.

## 9. Audit Log Impact

- Repository PRD states AuditLog is append-only and ordinary users cannot modify/delete it.
- Existing Assessment and AssessmentScore create/update operations record actor, entity, entityId, and change metadata in the same database transaction.
- Document upload/verify/reject and Batch create/update append audit records transactionally.
- AuditLog `entityId` has no FK to the target, so an audit record can remain after a target hard delete; this does not itself implement retention of the target.
- If a future delete is authorized, its target deletion and `DELETE` AuditLog write should share one DB transaction. Audit metadata should capture the pre-delete identity/status and relevant dependency counts, plus actor and entity ID, with privacy-minimized fields.
- If a Document storage cleanup is part of a future operation, database transaction alone cannot atomically cover the external storage action; see Section 10. AuditLog must never be deleted.

## 10. Storage Impact

Only Document has external file storage among these five candidates. Its PostgreSQL row and external object can diverge on partial failures. Existing upload compensation demonstrates that storage cleanup can itself fail and currently only logs that failure. A future removal policy needs explicit retention semantics and durable cleanup/retry behavior; no storage deletion was executed or tested in this audit.

## 11. Frontend Audit

| Page/surface | Delete action / mock Delete | Lifecycle and dependency display | Error behavior / confirmation |
|---|---|---|---|
| `/assessments` | No delete or mock delete | List shows OPEN/COMPLETED, max score, and score counts | Fetch/save errors are displayed; no delete confirmation exists |
| `/assessments/[id]` | No delete | Shows assessment status and scored count; lets user save/update scores | Fetch/save validation and API failures surface in the page; no delete confirmation |
| `/batches` | No delete or mock delete | Shows Program and dates; create/edit form | Load/save errors displayed; no delete confirmation |
| `/batches/[id]` | No delete | Shows Batch details and Enrollment rows/statuses; does not expose Class/Schedule/Certificate dependency counts | Load failure displayed; no delete confirmation |
| `/documents` | No delete or mock delete | Filters/counts PENDING, VERIFIED, REJECTED, EXPIRED | Load/upload errors displayed; no delete confirmation |
| `/documents/[id]` | No delete or mock delete | Shows document metadata/status/rejection reason; verify/reject only while PENDING; no EXPIRED transition UI | Load/verify/reject errors displayed; no delete confirmation |
| `/instructors`, `/instructors/[id]` | These page routes do not exist | Instructor list is used in the Class editor; no Instructor lifecycle UI | No Instructor delete UI or confirmation to assess |

A future destructive UI would require a contextual confirmation and clear dependency/storage failure reporting, but adding UI is outside STEP 91.

## 12. Test Plan (Design Only — Not Run)

No destructive tests were run.

**Assessment**
- No scores, OPEN and COMPLETED: capture expected policy-specific outcomes without presuming they are deletable.
- With scores: verify no child-score cascade; dependency conflict and all records retained unless a separately approved archive/retention policy says otherwise.
- Verify Class/Subject references, status handling, and AuditLog transaction rollback.

**AssessmentScore**
- Existing score duplicate constraint and current PATCH correction path.
- Correction before/after audit values and maxScore boundaries.
- Student ownership on reads, cross-assessment IDOR, unauthorized and forbidden direct API requests.
- OPEN and COMPLETED assessments; do not assume completed lock until GHS decides.
- Any future delete/soft-delete must preserve score history and must not create duplicate score rows.

**Document**
- PENDING, VERIFIED, REJECTED, EXPIRED, ownership, verifier/rejection metadata.
- Storage delete failure; DB failure before/after scheduling cleanup; retry/idempotency and audit behavior.
- Verify signed URLs are not leaked to unauthorized users and are invalidated/expire according to approved retention policy.
- No test should delete real storage or database records; use isolated mock storage and uniquely identified fixtures only after a future authorized implementation.

**Batch**
- Empty, with Enrollment, with Class/Schedule, and with Certificate; dates in future/current/past and completed Enrollments.
- Confirm dependencies block destructive removal without cascade and validate any approved archive/status transition.

**Instructor**
- No Class/Schedule, with Class, with Schedule, User-linked, and User-unlinked.
- Confirm deleting/inactivating Instructor never deletes User, and historical Class/Schedule attribution remains available.

**Security (all candidate routes)**
- Unauthenticated, authenticated-but-forbidden role, authorized role after formal approval, IDOR/cross-parent IDs, and direct API bypass of frontend.
- Verify append-only AuditLog and transaction atomicity; storage tests must use mock/private test storage only.

## 13. Final Decision Matrix

| Module | Recommended Action | Dependency Rule | RBAC | Audit | Schema Change | Status |
|---|---|---|---|---|---|---|
| Assessment | `TBD_GHS_DECISION` | Never cascade AssessmentScore; Class/Subject FKs required; decide behavior separately for scored/no-score and OPEN/COMPLETED | No current delete permission; `NEW_PERMISSION_REQUIRED` if GHS authorizes it | If authorized, append transactional delete/archival event; AuditLog never deleted | Hard-delete dependency check can use current schema; archive/soft delete may need schema | Business retention and completion rules unavailable |
| AssessmentScore | `PATCH_ONLY` | Assessment and Student required; unique per assessment/student; do not cascade history | Existing correction uses `assessment:update`; no score-delete permission | PATCH writes transactional before/after audit; never delete AuditLog | No schema change for existing PATCH-only behavior | Current behavior confirmed; completed lock remains TBD |
| Document | `TBD_GHS_DECISION` | Student required; verifier nullable/SET NULL; coordinate external private storage separately | No delete permission; `NEW_PERMISSION_REQUIRED` if approved | Record actor, Document ID/status and cleanup outcome; append-only | A durable tombstone/outbox/retry mechanism may require migration | Retention and storage-removal policy unavailable |
| Batch | `TBD_GHS_DECISION` | No cascade to Enrollment, Class, Schedule, Certificate; live FKs restrict | No current delete permission; `NEW_PERMISSION_REQUIRED` if approved | Append event for an approved archive/delete; preserve history | Archive/status field would require schema/migration | Lifecycle/history policy unavailable |
| Instructor | `TBD_GHS_DECISION` | Class/Schedule references restrict; deleting Instructor must never delete User | No current delete permission or Instructor management route; `NEW_PERMISSION_REQUIRED` if approved | Preserve actor/instructor identity in history; AuditLog append-only | Inactive/archive state would require schema | Staff-retention/history policy unavailable |

The recommendation values are technical/system recommendations only where labeled `SYSTEM_CONFIRMED` or `INFERRED`; they do not represent an unverified GHS decision.

## 14. GHS Decisions Required

1. **Assessment:** whether unscored OPEN assessments may be removed; treatment of scored/completed assessments; whether archive/withdrawal is needed; who approves and which roles may act.
2. **AssessmentScore:** whether corrections are always PATCH-only; whether scores are immutable historical records; whether COMPLETED should lock score entry/correction; exceptional correction authority and audit requirements.
3. **Document:** retention/deletion rights by status; Student withdrawal rights; retention of verified/rejected/expired records; storage cleanup retries, orphan recovery, audit retention, and the status/soft-delete meaning.
4. **Batch:** whether empty/started/completed batches may be removed; preservation of enrollments and transfer history; archive/closure semantics and reactivation rules.
5. **Instructor:** whether inactive instructors remain assignable; treatment of past/future Class and Schedule references; offboarding and User-account ownership; who may deactivate/archive an instructor.

No one of these choices is inferred as a policy from technical FK behavior or current role names.

## 15. Recommended Implementation Order

- **Phase 2A — No business decision required:** None of the five currently qualifies for a new DELETE implementation. Existing score correction via PATCH is already present and is not a new feature.
- **Phase 2B — After explicit GHS decisions:** Reassess Assessment and AssessmentScore together; Batch lifecycle; Instructor offboarding/archive. Do not implement until eligibility, retention, actor roles, and audit semantics are decided.
- **Phase 2C — Schema/infrastructure decision:** Any soft-delete/archive field or durable Document cleanup outbox/retry state requires separate schema/migration review and approval. Document hard deletion also needs a storage consistency and recovery design. No migration is part of this audit.

## 16. Quality Gates

| Command | Result |
|---|---|
| `npx prisma validate` | **PASS** |
| `npx prisma migrate status` | **PASS** — four migrations found; database schema up to date |
| `npx tsc --noEmit` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS** |

No destructive tests, legacy regression suite, cleanup script, or DELETE endpoint was run. No schema or migration change was detected. No lifecycle, RBAC, or implementation behavior was changed.

## 17. Database Integrity

Read-only count snapshots at audit start and final verification matched:

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

Required manual records were present before and after:

- Batch `GHI-09`.
- Student NIM `269067460` (`MUHAMAD RIVQI`).
- Employer `bounty`.
- Vacancy `KITCHEN` (OPEN), related to `bounty`.
- Placement `KITCHEN` (PREPARATION), related to `bounty`.
- KTP document `Screenshot__540_.png` (PENDING).

Observed relationship: the Placement and KTP document are for student NIM `260405066` (TIARA ISMI LAILA), not the GHI-09 student. No data was changed. PostgreSQL FK metadata was queried read-only to verify the `RESTRICT`/`SET NULL` actions summarized in Section 7.

## 18. Final Status

**`PASS_WITH_TBD`**

Audit objectives and quality gates passed. The live schema, routes, permissions, frontend, audit/storage patterns, FK metadata, and database integrity were verified without mutation. Business decisions concerning deletion, archival, score finalization, document retention, and instructor/batch lifecycle remain explicitly `TBD_GHS_DECISION`; no DELETE implementation or behavior change was made.

No commit, push, deployment, migration, schema edit, database mutation, or destructive test was performed.
