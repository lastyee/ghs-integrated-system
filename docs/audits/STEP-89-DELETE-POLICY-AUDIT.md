# STEP 89 — DELETE POLICY & DATA LIFECYCLE AUDIT
**GHS Integrated Training & Career Information System**
**Audit Date:** 2026-09-28 | **Status:** PASS_WITH_TBD
**Scope:** AUDIT ONLY — No code, schema, migration, or data changes made.

---

## 1. Executive Summary

This audit evaluates the appropriate deletion strategy for all 20 modules of the GHS Integrated System. The system has reached production readiness (STEP 88 complete, real data present in DB).

**Key Findings:**

| Category | Modules | Count |
|---|---|---|
| HARD DELETE WITH DEPENDENCY CHECK | Employer, Vacancy, Program, Subject, Batch | 5 |
| SOFT DELETE REQUIRED | User, Student | 2 |
| LIFECYCLE / STATUS ACTION ONLY | Application, Interview, Placement, Certificate, Enrollment, Attendance, Class, Schedule | 8 |
| NEVER DELETE | AuditLog, Reports | 2 |
| TBD GHS DECISION | Assessment, AssessmentScore, Document, Instructor | 4 |

> [!IMPORTANT]
> **No schema migration is required** for any currently safe implementation. `User.deletedAt` and `Student.deletedAt` already exist in the schema.

> [!CAUTION]
> Database baseline at audit start contains **real production data** created by the system owner via the UI: Batch GHI-09, Student MUHAMAD RIVQI (NIM 269067460), Employer "bounty", Vacancy "KITCHEN", Placement (PREPARATION), 1 KTP Document. These must NOT be disturbed by any delete feature.

---

## 2. Current DELETE Inventory

All 405 DELETE responses currently in the API surface (verified from source):

| METHOD | ROUTE | CURRENT BEHAVIOR | STATUS |
|---|---|---|---|
| DELETE | `/api/applications` | 405 Method Not Allowed | 405 |
| DELETE | `/api/applications/[id]` | 405 Method Not Allowed | 405 |
| DELETE | `/api/assessments` | 405 Method Not Allowed | 405 |
| DELETE | `/api/assessments/[id]` | 405 Method Not Allowed | 405 |
| DELETE | `/api/assessments/[id]/scores` | 405 Historical records are immutable | 405 |
| DELETE | `/api/assessments/[id]/scores/[scoreId]` | 405 Method Not Allowed | 405 |
| DELETE | `/api/attendances` | 405 Historical records are immutable | 405 |
| DELETE | `/api/attendances/[id]` | 405 Attendance records are immutable | 405 |
| DELETE | `/api/batches/[id]` | 405 Method Not Allowed | 405 |
| DELETE | `/api/certificates` | 405 Method Not Allowed | 405 |
| DELETE | `/api/certificates/[id]` | 405 Method Not Allowed | 405 |
| DELETE | `/api/classes` | 405 Historical records are immutable | 405 |
| DELETE | `/api/classes/[id]` | 405 Historical records are immutable | 405 |
| DELETE | `/api/documents` | 405 Document deletion is not permitted | 405 |
| DELETE | `/api/documents/[id]` | 405 Document deletion is not permitted | 405 |
| DELETE | `/api/employers` | 405 Employer deletion is not permitted | 405 |
| DELETE | `/api/employers/[id]` | 405 Employer deletion is not permitted | 405 |
| DELETE | `/api/enrollments` | 405 Historical records are immutable | 405 |
| DELETE | `/api/enrollments/[id]` | 405 Historical records are immutable | 405 |
| DELETE | `/api/interviews` | 405 Interview deletion not permitted. Historical records must be preserved | 405 |
| DELETE | `/api/interviews/[id]` | 405 Interview deletion not permitted. Historical records must be preserved | 405 |
| DELETE | `/api/placements` | 405 Method Not Allowed | 405 |
| DELETE | `/api/placements/[id]` | 405 Method Not Allowed | 405 |
| DELETE | `/api/programs/[id]` | 405 Method Not Allowed | 405 |
| DELETE | `/api/schedules` | 405 Historical records are immutable | 405 |
| DELETE | `/api/schedules/[id]` | 405 Historical records are immutable | 405 |
| DELETE | `/api/students` | 405 Historical records are immutable | 405 |
| DELETE | `/api/students/[id]` | 405 Historical records are immutable | 405 |
| DELETE | `/api/subjects/[id]` | 405 Method Not Allowed | 405 |
| DELETE | `/api/vacancies` | 405 Vacancy deletion is not permitted | 405 |
| DELETE | `/api/vacancies/[id]` | 405 Vacancy deletion is not permitted | 405 |

**Routes with NO DELETE handler at all (Next.js returns 405 automatically):**
`/api/batches`, `/api/programs`, `/api/subjects`, `/api/users`, `/api/instructors`, `/api/reports/*`

---

## 3. Model Dependency Map

Derived directly from `prisma/schema.prisma`. All verified against current schema.

```
User
  → Student? (userId, SET NULL on delete — nullable)
  → Instructor? (userId — nullable, no explicit onDelete)
  → Document[] (verifiedById — DocumentVerifier — nullable)
  → AuditLog[] (userId, ON DELETE SET NULL — intentional)
  has: deletedAt DateTime? ✓ SCHEMA ALREADY SUPPORTS SOFT DELETE

Role  →  User[] / RolePermission[] (Cascade)
Permission  →  RolePermission[] (Cascade)

Program
  → ProgramSubject[] (ON DELETE Cascade — removes link, not subject)
  → Batch[] (programId non-nullable, NO cascade)        ⚠ BLOCKS DELETE
  → Certificate[] (programId non-nullable, NO cascade)  ⚠ BLOCKS DELETE

Subject
  → ProgramSubject[] (ON DELETE Cascade — removes link, not program)
  → Assessment[] (subjectId non-nullable, NO cascade)   ⚠ BLOCKS DELETE
  → Schedule[] (subjectId non-nullable, NO cascade)     ⚠ BLOCKS DELETE

Batch
  → Enrollment[] (batchId non-nullable, NO cascade)     ⚠ BLOCKS DELETE
  → Class[] (batchId non-nullable, NO cascade)          ⚠ BLOCKS DELETE
  → Certificate[] (batchId non-nullable, NO cascade)    ⚠ BLOCKS DELETE

Instructor
  → Class[] (instructorId non-nullable, NO cascade)     ⚠ BLOCKS DELETE
  → Schedule[] (instructorId non-nullable, NO cascade)  ⚠ BLOCKS DELETE

Class (status: SCHEDULED/COMPLETED/CANCELLED)
  → Schedule[] (classId non-nullable, NO cascade)       ⚠ BLOCKS DELETE
  → Assessment[] (classId non-nullable, NO cascade)     ⚠ BLOCKS DELETE

Schedule (status: SCHEDULED/COMPLETED/CANCELLED)
  → Attendance[] (scheduleId non-nullable, NO cascade)  ⚠ BLOCKS DELETE

Student (deletedAt DateTime? ✓ SCHEMA ALREADY SUPPORTS SOFT DELETE)
  → Enrollment[] (studentId non-nullable, NO cascade)
  → Attendance[] (studentId non-nullable, NO cascade)
  → AssessmentScore[] (studentId non-nullable, NO cascade)
  → Document[] (studentId non-nullable, NO cascade)
  → Application[] (studentId non-nullable, NO cascade)
  → Placement[] (studentId non-nullable, NO cascade)
  → Certificate[] (studentId non-nullable, NO cascade)
  → User? (nullable — Student can exist without user account)

Enrollment (status: ACTIVE/COMPLETED/TRANSFERRED/DROPPED)
  — no children; lifecycle action preferred

Attendance (@@unique [scheduleId, studentId])
  — no children; immutable evidence

Assessment (status: OPEN/COMPLETED)
  → AssessmentScore[] (assessmentId non-nullable, NO cascade)  ⚠ BLOCKS DELETE

AssessmentScore (@@unique [assessmentId, studentId])
  — no children

Document (status: PENDING/VERIFIED/REJECTED/EXPIRED)
  — has storagePath (external storage object!)
  — no children but physical file must be considered

Employer
  → Vacancy[] (employerId non-nullable, NO cascade)     ⚠ BLOCKS DELETE
  → Placement[] (employerId non-nullable, NO cascade)   ⚠ BLOCKS DELETE

Vacancy (status: "OPEN" etc.)
  → Application[] (vacancyId non-nullable, NO cascade)  ⚠ BLOCKS DELETE
  → Placement[] (vacancyId nullable)                    ⚠ BLOCKS DELETE (if any exist)

Application (status: APPLIED/SCREENING/INTERVIEW/SELECTED/REJECTED/WITHDRAWN)
  → Interview[] (applicationId non-nullable, NO cascade)
  → Placement? (applicationId unique, nullable)

Interview (status: PENDING/PASSED/FAILED/RESCHEDULED)
  — no children; explicitly hardened in API

Placement (status: PREPARATION/READY/DEPARTED/PLACED/CANCELLED)
  — no children (terminal state)

Certificate (status: ACTIVE/REVOKED)
  — has path? (external storage — optional)
  — no children; REVOKE endpoint already exists

AuditLog (append-only, no updatedAt)
  → User? (userId, ON DELETE SET NULL — confirmed working from STEP 88)
  — NEVER DELETE
```

---

## 4. Delete Classification

### A. HARD DELETE WITH DEPENDENCY CHECK

These can be deleted only when runtime dependency count = 0. If dependencies exist, return `409 Conflict` with specific message. PostgreSQL FK constraints provide a safety net even if the check is bypassed.

| Module | Must Check Before Delete |
|---|---|
| **Employer** | `Vacancy.count(employerId)` AND `Placement.count(employerId)` |
| **Vacancy** | `Application.count(vacancyId)` AND `Placement.count(vacancyId)` |
| **Program** | `Batch.count(programId)` AND `Certificate.count(programId)` |
| **Subject** | `Assessment.count(subjectId)` AND `Schedule.count(subjectId)` |
| **Batch** | `Enrollment.count(batchId)` AND `Class.count(batchId)` AND `Certificate.count(batchId)` |
| **Instructor** | `Class.count(instructorId)` AND `Schedule.count(instructorId)` |

### B. SOFT DELETE REQUIRED

| Module | Schema Status | How |
|---|---|---|
| **User** | `deletedAt DateTime?` ✓ ALREADY IN SCHEMA | Set `deletedAt = now()`, block login in NextAuth |
| **Student** | `deletedAt DateTime?` ✓ ALREADY IN SCHEMA | Set `deletedAt = now()`, all children remain intact |

**No migration needed.** Queries must add `where: { deletedAt: null }` filter after activation.

### C. LIFECYCLE / STATUS ACTION ONLY

| Module | Existing Lifecycle | Terminal States |
|---|---|---|
| **Application** | APPLIED→SCREENING→INTERVIEW→SELECTED | REJECTED, WITHDRAWN |
| **Interview** | PENDING→PASSED/FAILED/RESCHEDULED | PASSED, FAILED |
| **Placement** | PREPARATION→READY→DEPARTED→PLACED | CANCELLED |
| **Certificate** | ACTIVE | REVOKED (endpoint exists) |
| **Enrollment** | ACTIVE→COMPLETED/TRANSFERRED | DROPPED |
| **Attendance** | PRESENT/LATE/ABSENT | Immutable (correction via PATCH) |
| **Class** | SCHEDULED→COMPLETED | CANCELLED |
| **Schedule** | SCHEDULED→COMPLETED | CANCELLED |

### D. NEVER DELETE

| Module | Reason |
|---|---|
| **AuditLog** | Legal/operational evidence; append-only; `userId` SET NULL on user deletion preserves history; no API DELETE handler exists |
| **Role** | System-defined; removal breaks all authentication |
| **Permission** | System-defined; removal breaks RBAC |
| **Reports** | Computed endpoints; no data to delete |

### E. TBD GHS DECISION

| Module | Decision Needed |
|---|---|
| **Assessment** | Delete (if OPEN and no scores) vs. lifecycle CANCEL only |
| **AssessmentScore** | Delete incorrect score vs. update-only |
| **Document** | Who can delete? Storage cleanup protocol? Student-owned? |
| **Instructor** | Delete if unlinked vs. deactivate |

---

## 5. RBAC Matrix

### Existing Delete Permissions in Seed (Confirmed from `prisma/seed.js`)

| Permission | Assigned To |
|---|---|
| `student:delete` | SUPER_ADMIN, ADMIN |
| `program:delete` | SUPER_ADMIN, ADMIN |
| `subject:delete` | SUPER_ADMIN, ADMIN |

**No `delete` permission exists for:** employer, vacancy, batch, class, schedule, enrollment, attendance, assessment, assessmentScore, document, application, interview, placement, certificate.

### Proposed RBAC Matrix (Audit Only)

| Module | SUPER_ADMIN | ADMIN | ACADEMIC_STAFF | INSTRUCTOR | PLACEMENT_STAFF | MANAGEMENT | STUDENT |
|---|---|---|---|---|---|---|---|
| User (soft) | ✓ | TBD_GHS | ✗ | ✗ | ✗ | ✗ | ✗ |
| Student (soft) | ✓ | TBD_GHS | ✗ | ✗ | ✗ | ✗ | ✗ |
| Program | ✓ | ✓ (perm exists) | ✗ | ✗ | ✗ | ✗ | ✗ |
| Subject | ✓ | ✓ (perm exists) | ✗ | ✗ | ✗ | ✗ | ✗ |
| Batch | ✓ | TBD_GHS | ✗ | ✗ | ✗ | ✗ | ✗ |
| Instructor | ✓ | TBD_GHS | ✗ | ✗ | ✗ | ✗ | ✗ |
| Class | ✗ lifecycle | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Schedule | ✗ lifecycle | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Enrollment | ✗ lifecycle | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Attendance | ✗ NEVER | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Assessment | TBD | TBD | TBD | ✗ | ✗ | ✗ | ✗ |
| AssessmentScore | TBD | TBD | TBD | TBD | ✗ | ✗ | ✗ |
| Document | TBD | TBD | TBD | ✗ | TBD | ✗ | TBD (own) |
| Employer | ✓ | ✓ | ✗ | ✗ | TBD_GHS | ✗ | ✗ |
| Vacancy | ✓ | ✓ | ✗ | ✗ | TBD_GHS | ✗ | ✗ |
| Application | ✗ lifecycle | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Interview | ✗ NEVER | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Placement | ✗ lifecycle | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Certificate | ✗ REVOKE | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| AuditLog | ✗ NEVER | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

### Permissions Requiring Seed Change (SCHEMA/SEED CHANGE REQUIRED — data, not migration)

- `employer:delete` — add to seed → assign to SUPER_ADMIN, ADMIN
- `vacancy:delete` — add to seed → assign to SUPER_ADMIN, ADMIN (PLACEMENT_STAFF: TBD)
- `batch:delete` — add to seed if GHS approves
- `assessment:delete` — add to seed if GHS approves
- `document:delete` — add to seed if GHS approves
- `instructor:delete` — add to seed if GHS approves

---

## 6. Audit Log Impact

### Confirmed FK Behavior (from Schema + STEP 88 test)

```prisma
model AuditLog {
  userId String?
  user   User?  @relation(fields: [userId], references: [id], onDelete: SetNull)
}
```

When a User is deleted: `AuditLog.userId` → NULL automatically (PostgreSQL).
The log row itself is **preserved forever**. Historical actions remain traceable by timestamp and entity, even without the user link.

### Per-Module Delete Audit Requirements

| Module | Log Required | Action Name | Key Metadata |
|---|---|---|---|
| User (soft) | ✓ | `SOFT_DELETE` | `{ email, role, deletedAt }` |
| Student (soft) | ✓ | `SOFT_DELETE` | `{ nim, name, deletedAt }` |
| Program | ✓ | `DELETE` | `{ code, name }` |
| Subject | ✓ | `DELETE` | `{ code, name }` |
| Batch | ✓ | `DELETE` | `{ name, programId }` |
| Employer | ✓ | `DELETE` | `{ name }` |
| Vacancy | ✓ | `DELETE` | `{ title, employerId }` |
| Assessment | ✓ (TBD) | `DELETE` | `{ name, classId, subjectId }` |
| AssessmentScore | ✓ (TBD) | `DELETE` | `{ assessmentId, studentId, score }` |
| Document | ✓ (TBD) | `DELETE` | `{ type, storagePath, studentId }` |
| Instructor | ✓ (TBD) | `DELETE` | `{ name }` |

---

## 7. Document Storage Impact

The `Document` model has:
- `storagePath` — external storage path (Supabase Storage in production)
- `status` — PENDING / VERIFIED / REJECTED / EXPIRED

### Failure Scenarios and Safe Design

| Scenario | DB Record | Storage Object | Recommended Action |
|---|---|---|---|
| Storage ✓, DB ✓ | Deleted | Deleted | ✓ Clean state |
| Storage ✓, DB ✗ | Intact | Gone | Abort; DB record survives; log inconsistency alert |
| Storage ✗, DB not attempted | Intact | Intact | Abort; return 502; no data lost |
| Storage ✗, DB ✓ (wrong order) | Deleted | **Orphaned** | ⚠ Dangling storage — storage billing waste |

### Safe Implementation Order

```
1. Write AuditLog (DELETE intent) — before any destructive action
2. Attempt storage object deletion (idempotent — 404 from provider = treat as success)
3. IF storage deletion confirmed → prisma.document.delete()
4. IF storage deletion fails → abort, return 502, DO NOT delete DB record
5. IF DB delete fails after storage gone → log CRITICAL inconsistency, trigger alert
```

> [!WARNING]
> PostgreSQL transactions cannot span external storage API calls. Storage must be deleted first, then DB. Never the reverse.

### Who Can Delete Documents — TBD GHS DECISION

Options:
- A) Student can delete own documents with PENDING status only
- B) ACADEMIC_STAFF, PLACEMENT_STAFF, or higher can delete any document
- C) Nobody can delete — use `EXPIRED` status instead
- D) SUPER_ADMIN only

---

## 8. UI/UX Delete Recommendation

### Delete Button Placement

| Context | Location |
|---|---|
| List pages (Employer, Vacancy, Program, Subject) | Row action ⋮ menu — visible only to authorized roles |
| Detail pages | "Actions" dropdown in header — with confirmation dialog |
| Soft delete (Student, User) | Detail page only — "Nonaktifkan" (Deactivate), not "Hapus" |

### Confirmation Dialog Examples

**Employer — safe to delete:**
```
🗑 Hapus Employer?

Employer "PT Contoh Sukses" belum memiliki Vacancy atau Placement.
Data ini akan dihapus secara permanen dan tidak dapat dipulihkan.
Catatan audit tindakan ini akan disimpan.

  [ Batal ]    [ Hapus Employer ]
```

**Employer — has dependencies (blocked):**
```
⚠ Tidak Dapat Menghapus Employer

"PT Contoh Sukses" tidak dapat dihapus karena masih memiliki:
  • 3 Vacancy aktif
  • 1 Placement terkait

Hapus semua Vacancy dan Placement terlebih dahulu.

  [ OK ]
```

**Student — soft delete:**
```
🗑 Nonaktifkan Peserta?

"TIARA ISMI LAILA" (NIM 260405066) akan dinonaktifkan.
Seluruh riwayat akademik, kehadiran, dokumen, dan penempatan
akan tetap tersimpan dan dapat diakses administrator.

  [ Batal ]    [ Nonaktifkan Peserta ]
```

### Modules That Must NOT Show Delete Button

- AuditLog, Interview, Attendance, Enrollment (status change), Placement (CANCEL only)
- Certificate → show REVOKE button only
- Application → show WITHDRAW/REJECT only

### After Delete — Behavior

**Success:** Remove row from list → toast `"Employer 'X' berhasil dihapus."`
**Failure:** Keep row visible → show server error message (e.g., `"Gagal: Employer masih memiliki 2 Vacancy."`)

---

## 9. Test Plan

All tests must use controlled fixtures on a test/dev database. Do NOT run destructive tests on production.

| # | Test Case | Expected |
|---|---|---|
| 1 | Delete Employer with no dependencies | 200 OK + AuditLog |
| 2 | Delete Employer with 1+ Vacancy | 409 Conflict + specific message |
| 3 | Delete Vacancy with no Applications | 200 OK + AuditLog |
| 4 | Delete Vacancy with 1+ Application | 409 Conflict |
| 5 | Delete non-existent record | 404 Not Found |
| 6 | Delete as unauthorized role (STUDENT) | 403 Forbidden |
| 7 | Delete another student's document | 403 Forbidden |
| 8 | DELETE terminal lifecycle record (PLACED placement) | 405 or 409 |
| 9 | Duplicate DELETE (idempotency) | 2nd returns 404 |
| 10 | Concurrent DELETE (race condition) | Only one succeeds; FK intact |
| 11 | AuditLog preserved after record delete | AuditLog row with entityId survives |
| 12 | FK integrity — delete Program with Batch | 409 Conflict |
| 13 | Document storage cleanup | Storage object gone after DB delete |
| 14 | Storage delete fails | DB record NOT deleted; 502 returned |
| 15 | DB delete fails after storage deleted | CRITICAL inconsistency logged |
| 16 | Student soft delete preserves enrollment | Enrollment count unchanged |
| 17 | Soft-deleted Student cannot login | 401 / session rejected |
| 18 | Role escalation via direct API call | 403 Forbidden |
| 19 | Direct API DELETE without UI (curl) | Same 403/405 as via UI |
| 20 | Delete Subject used in Schedule | 409 Conflict — has Schedules |

---

## 10. Final Recommendation Matrix

| MODULE | CURRENT DELETE | RECOMMENDED ACTION | DEP CHECK | RBAC | AUDIT LOG | SOFT? | STATUS ACTION | SAFE NOW? | SCHEMA CHANGE? | BUSINESS RULE |
|---|---|---|---|---|---|---|---|---|---|---|
| User | 405 (no handler) | SOFT_DELETE_REQUIRED | SET NULL (auto) | SUPER_ADMIN | ✓ | ✓ (exists) | — | YES | NO | INFERRED |
| Student | 405 Historical immutable | SOFT_DELETE_REQUIRED | none (cascade blocked) | SUPER_ADMIN | ✓ | ✓ (exists) | — | YES | NO | INFERRED |
| Program | 405 Method Not Allowed | SAFE_DELETE_WITH_DEPENDENCY_CHECK | Batches, Certs | SUPER_ADMIN, ADMIN | ✓ | NO | — | YES | NO | SYSTEM_CONFIRMED |
| Subject | 405 Method Not Allowed | SAFE_DELETE_WITH_DEPENDENCY_CHECK | Assessments, Schedules | SUPER_ADMIN, ADMIN | ✓ | NO | — | YES | NO | SYSTEM_CONFIRMED |
| Batch | 405 Method Not Allowed | SAFE_DELETE_WITH_DEPENDENCY_CHECK | Enrollments, Classes, Certs | SUPER_ADMIN | ✓ | NO | — | TBD_GHS | NO | TBD_GHS_DECISION |
| Instructor | 405 (no handler) | SAFE_DELETE_WITH_DEPENDENCY_CHECK | Classes, Schedules | SUPER_ADMIN | ✓ | NO | — | TBD_GHS | NO | TBD_GHS_DECISION |
| Class | 405 Historical immutable | LIFECYCLE_ACTION_ONLY | — | — | — | NO | CANCELLED | NO | NO | SYSTEM_CONFIRMED |
| Schedule | 405 Historical immutable | LIFECYCLE_ACTION_ONLY | — | — | — | NO | CANCELLED | NO | NO | SYSTEM_CONFIRMED |
| Enrollment | 405 Historical immutable | LIFECYCLE_ACTION_ONLY | — | — | — | NO | DROPPED/TRANSFERRED | NO | NO | SYSTEM_CONFIRMED |
| Attendance | 405 Immutable | NEVER_DELETE | — | NONE | — | NO | UPDATE only | NO | NO | OFFICIAL_GHS_CONFIRMED |
| Assessment | 405 Method Not Allowed | TBD_GHS_DECISION | AssessmentScores | TBD | TBD | NO | COMPLETED status | TBD | NO | TBD_GHS_DECISION |
| AssessmentScore | 405 Historical immutable | TBD_GHS_DECISION | none | TBD | TBD | NO | UPDATE only | TBD | NO | TBD_GHS_DECISION |
| Document | 405 Not permitted | TBD_GHS_DECISION | Storage + DB | TBD | ✓ | NO | EXPIRED status | TBD | NO | TBD_GHS_DECISION |
| Employer | 405 Not permitted | SAFE_DELETE_WITH_DEPENDENCY_CHECK | Vacancies, Placements | SUPER_ADMIN, ADMIN | ✓ | NO | — | YES (seed+perm) | NO | INFERRED |
| Vacancy | 405 Not permitted | SAFE_DELETE_WITH_DEPENDENCY_CHECK | Applications, Placements | SUPER_ADMIN, ADMIN | ✓ | NO | — | YES (seed+perm) | NO | INFERRED |
| Application | 405 Method Not Allowed | LIFECYCLE_ACTION_ONLY | — | — | — | NO | REJECTED/WITHDRAWN | NO | NO | SYSTEM_CONFIRMED |
| Interview | 405 Not permitted/Historical | NEVER_DELETE | — | NONE | — | NO | Status transitions | NO | NO | OFFICIAL_GHS_CONFIRMED |
| Placement | 405 Method Not Allowed | LIFECYCLE_ACTION_ONLY | — | — | — | NO | CANCELLED | NO | NO | SYSTEM_CONFIRMED |
| Certificate | 405 Method Not Allowed | LIFECYCLE_ACTION_ONLY | — | — | — | NO | REVOKE (exists) | NO | NO | OFFICIAL_GHS_CONFIRMED |
| AuditLog | No handler | NEVER_DELETE | — | NONE | — | NO | — | NO | NO | OFFICIAL_GHS_CONFIRMED |

---

## 11. Schema / Migration Assessment

| Question | Answer |
|---|---|
| New schema migration required? | **NO** — for all safe implementations |
| Soft delete migration needed? | **NO** — `User.deletedAt` and `Student.deletedAt` already exist |
| New permissions need migration? | **NO** — permissions are seed data, not schema |
| Document delete needs schema change? | **NO** — `storagePath` already in schema |
| FK behaviors need changing? | **NO** — existing non-nullable FKs are sufficient guards |
| `deletedAt` needed on other models? | **MAYBE** — only if GHS decides Employer/Vacancy needs soft delete instead of hard |

---

## 12. TBD GHS Decisions

| # | Decision Required | Options | Blocks Implementation |
|---|---|---|---|
| 1 | Can **Assessment** be deleted if OPEN and no scores? | A) Hard delete; B) Lifecycle CANCEL only | Assessment delete |
| 2 | Can **AssessmentScore** be deleted (correction use case)? | A) Delete + re-enter; B) Update only | AssessmentScore delete |
| 3 | Can **Document** be deleted? Who can? What protocol? | A) Student own PENDING; B) Staff; C) EXPIRED status only | Document delete |
| 4 | Can **Batch** be deleted if empty (no Enrollments/Classes/Certs)? | A) Hard delete; B) Status INACTIVE | Batch delete |
| 5 | Can **Instructor** record be deleted if no classes? | A) Hard delete; B) Deactivate | Instructor delete |
| 6 | Can **ADMIN** soft-delete a **Student**? | A) Yes; B) SUPER_ADMIN only | Student soft delete delegation |
| 7 | Can **PLACEMENT_STAFF** delete Employer/Vacancy they created? | A) Yes; B) SUPER_ADMIN/ADMIN only | RBAC seed change scope |
| 8 | For soft-deleted Student/User, is full removal ever allowed? | A) Never; B) After N years; C) Manual SUPER_ADMIN only | Data retention policy |

---

## 13. Safe Implementation Order

### Phase 1 — Immediate (No GHS decision needed, no new permissions)

1. `DELETE /api/employers/[id]` — hard delete with Vacancy + Placement dependency check
2. `DELETE /api/vacancies/[id]` — hard delete with Application + Placement dependency check
3. `DELETE /api/programs/[id]` — hard delete with Batch + Certificate dependency check (`program:delete` perm exists)
4. `DELETE /api/subjects/[id]` — hard delete with Assessment + Schedule dependency check (`subject:delete` perm exists)

### Phase 2 — Seed Update Required

5. Add `employer:delete`, `vacancy:delete` permissions to `prisma/seed.js` → re-seed
6. `User` soft delete — set `deletedAt`, block NextAuth login, update `findMany` queries

### Phase 3 — After GHS Decisions

7. `Document` delete — after confirming who, protocol, and storage cleanup design
8. `Assessment` delete — after CANCEL vs. delete decision
9. `Student` soft delete — after delegation policy confirmed
10. `Batch` delete — after empty-batch deletion confirmed
11. `AssessmentScore` delete — after academic integrity policy confirmed

---

## 14. Quality Gate Results

| Gate | Result | Note |
|---|---|---|
| `npx tsc --noEmit` | ✓ PASS | Confirmed pre-audit (exit 0) |
| `npx eslint .` | ✓ PASS | Confirmed pre-audit (exit 0) |
| `npm run build` | ✓ PASS | 57 pages built successfully |
| `npx prisma validate` | ✓ PASS | Schema valid |
| `npx prisma migrate status` | ✓ PASS | 4 migrations, up to date |
| Source code changes | ✓ ZERO | Audit only |
| Schema changes | ✓ ZERO | Audit only |
| DB data mutations | ✓ ZERO | Read-only audit |

---

## 15. Database Baseline

### Pre-Audit State (Start of STEP 89)

| Model | Count | Origin |
|---|---|---|
| users | 1 | Real SUPER_ADMIN (muhamadrivqi83@gmail.com) |
| instructors | 6 | Seeded |
| programs | 1 | HTP — seeded |
| batches | **3** | GHI-07, GHI-08 (seeded) + **GHI-09 (production)** |
| students | **22** | 21 seeded + **MUHAMAD RIVQI NIM 269067460 (production)** |
| enrollments | **22** | 21 seeded + 1 production |
| subjects | 6 | Seeded |
| classes | **11** | 10 seeded + 1 production |
| schedules | 10 | Seeded |
| employers | **1** | **"bounty" (production)** |
| vacancies | **1** | **"KITCHEN" OPEN (production)** |
| applications | 0 | — |
| interviews | 0 | — |
| placements | **1** | **"KITCHEN" PREPARATION (production)** |
| documents | **1** | **KTP PENDING (production)** |
| certificates | 0 | — |
| audit_logs | varies | Historical — preserved from all prior steps |

### Post-Audit State

**IDENTICAL to pre-audit** — zero data mutations performed.

---

## 16. Final Status

### STEP 89 STATUS: `PASS_WITH_TBD`

---

### Quick Reference Summary

**✓ Safe to implement (no GHS decision needed):**
- **Hard delete with dependency check:** Employer, Vacancy, Program, Subject
- **Soft delete (schema already ready):** User, Student

**⚠ Lifecycle action only — no hard delete:**
- Application → REJECT/WITHDRAW
- Placement → CANCEL
- Certificate → REVOKE (endpoint exists)
- Enrollment, Class, Schedule → status transitions
- Attendance → PATCH correction only

**✗ Must never be deleted:**
- AuditLog (NEVER), Interview (NEVER), Attendance (NEVER)

**? Pending GHS business decisions:**
- Document, Assessment, AssessmentScore, Batch, Instructor

**Recommended implementation order:**
1. Employer + Vacancy (Phase 1 — immediate)
2. Program + Subject (Phase 1 — permissions exist)
3. User soft delete (Phase 2 — after seed update)
4. All TBD modules (Phase 3 — after GHS decisions)

**Schema migration: NOT REQUIRED for any Phase 1 or Phase 2 item.**

---

*Audit completed by Antigravity AI — 2026-09-28.*
*No code, schema, migration, or data was modified during this audit step.*
