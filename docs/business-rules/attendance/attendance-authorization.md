# GHS Attendance Authorization & Ownership Specification

## Status Dokumen

- Module: Attendance
- Step: 61
- Status: TECHNICAL AUTHORIZATION READY / BUSINESS OWNERSHIP PARTIAL
- Implementation status: Attendance API belum dibuat

## 1. Authentication Source

Semua Attendance authorization wajib menggunakan server-side session
melalui `requireAuthenticatedUser()` dan `requirePermission()`.

Actor identity berasal dari:

```text
session.user.id
```

Server tidak mempercayai:

- `userId` dari request body
- `userId` dari query atau URL
- role dari client
- permission dari client
- actor ID dari client
- hidden form input sebagai bukti ownership

Unauthenticated request menghasilkan `401`. Authenticated user tanpa
permission menghasilkan `403`, mengikuti existing authorization helper.

## 2. Permission Matrix

| Role | `attendance:read` | `attendance:create` | `attendance:update` | `attendance:delete` |
|---|---:|---:|---:|---:|
| SUPER_ADMIN | YES | YES | YES | YES |
| ADMIN | YES | YES | YES | YES |
| ACADEMIC_STAFF | YES | NO | NO | NO |
| INSTRUCTOR | YES | YES | YES | NO |
| MANAGEMENT | YES | NO | NO | NO |
| STUDENT | YES | NO | NO | NO |
| PLACEMENT_STAFF | NO | NO | NO | NO |

Status: **UPDATED FOR PHASE 2 IMPLEMENTATION**.

Phase 2 explicitly authorizes soft-delete for Attendance to SUPER_ADMIN and
ADMIN only. This is a user-approved implementation change from the earlier
Step 61 baseline; it does not authorize hard deletion or cascade changes.

Other roles do not receive `attendance:delete`. The route must enforce this
permission server-side and keep the attendance record and all relations.

## 3. Ownership Matrix

| Actor | Permission baseline | Ownership |
|---|---|---|
| SUPER_ADMIN | Read/Create/Update | Global; tidak ada restriction tambahan yang confirmed |
| ADMIN | Read/Create/Update | Global; tidak ada restriction tambahan yang confirmed |
| ACADEMIC_STAFF | Read | TBD — GHS |
| INSTRUCTOR | Read/Create/Update | TBD — GHS |
| MANAGEMENT | Read | TBD — GHS |
| STUDENT | Read | Student resource milik sendiri |
| PLACEMENT_STAFF | None | None |

“Global” berarti tidak ada ownership restriction tambahan yang telah
dikonfirmasi pada Step 61. Permission tetap wajib diperiksa.

## 4. Student Ownership

Student ownership yang confirmed menggunakan chain berikut:

```text
session.user.id
        ↓
Student.userId
        ↓
Student.id
        ↓
Attendance.studentId
```

Untuk role `STUDENT`:

1. Authenticate melalui server session.
2. Check `attendance:read`.
3. Resolve Student berdasarkan `Student.userId = session.user.id`.
4. Jika Student tidak ditemukan, return `403`.
5. Query Attendance hanya dengan `studentId` milik session.
6. Resource milik Student lain menghasilkan `403`, tanpa membocorkan
   existence atau detail resource.

Existing `requireStudentOwnership()` sudah menerapkan prinsip yang sama
untuk Student resource. Tidak ada fallback berdasarkan nama, email, atau
Student pertama.

Student:

- boleh masuk ke authorization layer untuk `attendance:read`;
- tidak memiliki `attendance:create`;
- tidak memiliki `attendance:update`;
- tidak memiliki `attendance:delete`.

Student visibility terhadap notes dan bentuk response Attendance masih
TBD — GHS.

## 5. Instructor Ownership

Status: **TBD — GHS**.

Belum ditentukan apakah Attendance ownership menggunakan:

- `Class.instructorId`;
- `Schedule.instructorId`;
- keduanya harus cocok;
- substitute/delegation;
- atau aturan lain.

Jangan membuat `requireInstructorOwnership()` yang memilih salah satu
authority path sebelum keputusan GHS tersedia.

Permission Instructor tidak membuktikan ownership. Untuk API berikutnya:

- `attendance:create` memerlukan permission dan ownership rule yang belum
  resolved;
- `attendance:read` memerlukan permission dan ownership rule yang belum
  resolved;
- `attendance:update` memerlukan permission dan ownership rule yang belum
  resolved.

Jika substitute/delegation diperlukan, authority, effective period, record
history, dan audit policy masih harus ditentukan GHS.

## 6. Academic Staff Scope

Academic Staff hanya memiliki `attendance:read`.

Scope data belum ditentukan secara spesifik. Jangan mengasumsikan
Academic Staff dapat membaca:

- seluruh Attendance GHS;
- batch tertentu;
- program tertentu;
- Class tertentu;
- Schedule tertentu.

Untuk Step 61, authorization Academic Staff bersifat permission-based
only; data scope tetap TBD — GHS.

## 7. Management Scope

Management hanya memiliki `attendance:read`.

Scope data Management belum ditentukan. Jangan membuat filter tambahan
berdasarkan batch, program, instructor, atau ownership lain.

## 8. Placement Staff

Placement Staff tidak memiliki permission Attendance.

Maka:

- Attendance read → `403`
- Attendance create → `403`
- Attendance update → `403`
- Attendance delete → unavailable / `403`

Hubungan Placement Staff dengan student placement tidak memberikan
Attendance access.

## 9. Horizontal Access Control

Wajib mencegah:

```text
Student A → Attendance Student B
```

Jangan menerima arbitrary `studentId` sebagai bukti ownership. Untuk role
Student, target resource harus dibatasi berdasarkan session-linked Student.

Response ownership violation harus generic `403`; jangan mengembalikan:

- Attendance data;
- Student name;
- Schedule details;
- existence information yang tidak diperlukan.

## 10. Authorization Design for Future APIs

### READ

Non-Student roles tetap memerlukan `attendance:read`. Scope mereka belum
boleh diperluas dengan rule baru.

Student roles harus menggunakan Student ownership chain.

### CREATE

Permission baseline:

- SUPER_ADMIN: allowed
- ADMIN: allowed
- INSTRUCTOR: allowed by permission, ownership TBD
- ACADEMIC_STAFF: `403`
- MANAGEMENT: `403`
- STUDENT: `403`
- PLACEMENT_STAFF: `403`

Tidak ada POST Attendance pada Step 61.

### UPDATE

Permission baseline:

- SUPER_ADMIN: allowed
- ADMIN: allowed
- INSTRUCTOR: allowed by permission, ownership TBD
- ACADEMIC_STAFF: `403`
- MANAGEMENT: `403`
- STUDENT: `403`
- PLACEMENT_STAFF: `403`

Tidak ada PATCH Attendance pada Step 61.

### DELETE

Phase 2 user authorization supersedes this Step 61 baseline: soft-delete
is allowed for SUPER_ADMIN and ADMIN only. The existing DELETE endpoint
must retain all linked records and audit the timestamp transactionally.

## 11. Business Rules Still TBD

Authorization technical layer tidak menyelesaikan business rules berikut:

- Instructor ownership authority;
- substitute/delegation;
- Academic Staff scope;
- Management scope;
- Enrollment prerequisite;
- Enrollment status eligibility;
- Batch/Class consistency;
- Schedule lifecycle;
- Attendance timing;
- status semantics;
- correction workflow;
- Audit CREATE;
- duplicate HTTP response;
- historical integrity;
- Student notes visibility.

## 12. Scope Confirmation

Step 61:

- tidak membuat Attendance API;
- tidak membuat authorization system kedua;
- tidak mengubah Prisma schema;
- tidak membuat migration;
- tidak mengubah database;
- tidak mengubah Auth.js;
- tidak mengubah permission mapping;
- tidak mengubah Enrollment;
- tidak mengubah Schedule;
- tidak menentukan Instructor ownership;
- tidak menentukan Academic Staff scope;
- tidak menentukan Management scope;
- tidak membuat AuditLog writer;
- tidak membuat correction workflow;
- tidak membuat frontend change.

Final gate:

```text
Authorization technical layer: READY
Permission baseline: READY
Student ownership: READY
Instructor ownership: BLOCKED / TBD
Academic scope: TBD
Management scope: TBD
Attendance CREATE: STILL BLOCKED
Attendance READ: STILL BLOCKED FOR IMPLEMENTATION
Attendance UPDATE: BLOCKED
Attendance DELETE: BLOCKED
Business eligibility: BLOCKED
```
