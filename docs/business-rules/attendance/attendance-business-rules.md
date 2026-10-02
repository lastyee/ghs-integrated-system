# GHS Attendance Business Rules

## Status Dokumen

- Module: Attendance
- Step: 49
- Status: DRAFT
- Source of truth: GHS Attendance Validation Sheet
- Implementation status: BLOCKED
- Last validation status: PENDING GHS VALIDATION

---

# 1. Tujuan

Dokumen ini mendefinisikan business rules untuk modul Attendance pada
GHS Integrated Training & Career Information System.

Dokumen ini menjadi dasar sebelum implementasi Attendance API,
authorization, validation, correction workflow, dan AuditLog.

Aturan yang belum mendapatkan konfirmasi dari GHS tidak boleh dianggap
sebagai aturan bisnis final.

## Technical Status Model (Step 59)

The database status model is ready independently from the blocked
Attendance business workflow:

- `AttendanceStatus`: `PRESENT`, `LATE`, `ABSENT`
- `AbsenceType`: `SICK`, `PERMITTED`, `UNEXCUSED`
- `Attendance.absenceType`: nullable
- `Attendance.lateMinutes`: nullable

Technical combinations are validated at the API layer only when the
Attendance API is implemented. Attendance CREATE remains blocked while
Enrollment, Schedule lifecycle, ownership, correction, and audit rules
remain TBD — GHS.

---

# 2. Prinsip Dasar

Attendance merupakan catatan kehadiran Student terhadap suatu Schedule.

Relasi utama:

Student
→ Enrollment
→ Batch
→ Class
→ Schedule
→ Attendance

Setiap Attendance harus memiliki hubungan yang valid dengan:

- Student
- Schedule

---

# 3. Business Rules Status

| Status | Arti |
|---|---|
| CONFIRMED | Didukung oleh struktur sistem, PRD, atau keputusan yang sudah tersedia |
| PROPOSED | Usulan desain yang belum menjadi keputusan resmi GHS |
| TBD | Belum ditentukan dan membutuhkan validasi GHS |

---

# 4. Attendance Identity

## 4.1 Attendance memiliki Student

Status: CONFIRMED

Setiap Attendance wajib memiliki `studentId`.

Student harus merupakan record Student yang valid di database.

---

## 4.2 Attendance memiliki Schedule

Status: CONFIRMED

Setiap Attendance wajib memiliki `scheduleId`.

Schedule harus merupakan record Schedule yang valid di database.

---

## 4.3 Satu Student hanya memiliki satu Attendance pada satu Schedule

Status: CONFIRMED

Satu kombinasi:

`studentId + scheduleId`

tidak boleh memiliki lebih dari satu record Attendance.

Database sudah memiliki constraint:

`unique(scheduleId, studentId)`

Business rule:

> Student tidak boleh memiliki lebih dari satu Attendance pada Schedule
> yang sama.

---

# 5. Student Eligibility

## 5.1 Student harus memiliki Enrollment

Status: TBD

Belum terdapat keputusan resmi yang menetapkan apakah Student wajib
memiliki Enrollment aktif sebelum Attendance dapat dibuat.

Validasi GHS:

- Apakah Student wajib memiliki Enrollment?
- Apakah Attendance hanya boleh dibuat untuk Student yang terdaftar
  pada Batch tertentu?

Referensi validasi:

`attendance-validation-sheet.md — Q1`

---

## 5.2 Enrollment harus ACTIVE

Status: TBD

Belum terdapat keputusan resmi mengenai apakah hanya Enrollment
berstatus `ACTIVE` yang dapat memiliki Attendance.

Status Enrollment yang tersedia:

- ACTIVE
- COMPLETED
- TRANSFERRED
- DROPPED

Referensi validasi:

`attendance-validation-sheet.md — Q2`

---

## 5.3 Enrollment Batch harus sesuai dengan Class Batch

Status: TBD

Secara teknis Student memiliki Enrollment terhadap Batch, sedangkan
Class juga memiliki Batch.

Belum ada keputusan resmi GHS mengenai apakah sistem wajib memastikan:

`Enrollment.batchId == Class.batchId`

Referensi validasi:

`attendance-validation-sheet.md — Q3`

---

# 6. Schedule Dependency

## 6.1 Schedule harus tersedia

Status: CONFIRMED

Attendance membutuhkan Schedule yang valid.

Schedule yang tidak ditemukan tidak dapat digunakan untuk membuat
Attendance.

---

## 6.2 Attendance pada Schedule SCHEDULED

Status: TBD

Belum terdapat keputusan resmi apakah Attendance dapat dibuat ketika
Schedule berstatus `SCHEDULED`.

Referensi validasi:

`attendance-validation-sheet.md — Q4`

---

## 6.3 Attendance pada Schedule COMPLETED

Status: TBD

Belum terdapat keputusan resmi apakah Attendance masih dapat dibuat
ketika Schedule sudah berstatus `COMPLETED`.

Jika diperbolehkan, mekanisme dan batasannya juga belum ditentukan.

Referensi validasi:

`attendance-validation-sheet.md — Q5`

---

## 6.4 Attendance pada Schedule CANCELLED

Status: TBD

Belum terdapat keputusan resmi apakah Attendance dapat dibuat pada
Schedule berstatus `CANCELLED`.

Referensi validasi:

`attendance-validation-sheet.md — Q6`

---

# 7. Instructor Ownership

## 7.1 Instructor memiliki kewenangan terhadap Attendance

Status: CONFIRMED

Permission yang tersedia untuk Instructor:

- attendance:read
- attendance:create
- attendance:update

Namun cakupan ownership Instructor terhadap Schedule belum sepenuhnya
ditentukan.

---

## 7.2 Dasar Instructor Ownership

Status: TBD

Belum ditentukan apakah kewenangan Instructor didasarkan pada:

1. `Class.instructorId`
2. `Schedule.instructorId`
3. Keduanya harus sesuai
4. Instructor pengganti/delegasi
5. Mekanisme lain

Referensi validasi:

`attendance-validation-sheet.md — Q7`

---

# 8. Attendance Status

Attendance memiliki enum:

- PRESENT
- LATE
- EXCUSED
- ABSENT

Status: CONFIRMED secara teknis.

Namun arti operasional masing-masing status masih perlu divalidasi
dengan GHS.

---

## 8.1 PRESENT

Status: TBD

Definisi operasional `PRESENT` belum ditetapkan oleh GHS.

---

## 8.2 LATE

Status: TBD

Definisi operasional `LATE` belum ditetapkan oleh GHS.

Batas keterlambatan juga belum ditentukan.

Contoh:

- 5 menit
- 10 menit
- 15 menit
- batas lain

Tidak boleh diterapkan sebagai business rule sebelum dikonfirmasi GHS.

---

## 8.3 EXCUSED

Status: TBD

Definisi `EXCUSED`, alasan yang diterima, serta kemungkinan dokumen
pendukung belum ditentukan.

---

## 8.4 ABSENT

Status: TBD

Definisi operasional `ABSENT` belum ditetapkan oleh GHS.

---

# 9. LATE Calculation

## 9.1 LATE dihitung sebagai kehadiran

Status: TBD

Belum diketahui apakah `LATE` secara operasional dianggap sebagai
kehadiran atau ketidakhadiran.

---

## 9.2 Late Threshold

Status: TBD

Belum ada batas waktu keterlambatan yang ditetapkan.

Sistem tidak boleh menentukan threshold secara sepihak.

Referensi validasi:

`attendance-validation-sheet.md — Q9`

---

# 10. EXCUSED

## 10.1 Reason

Status: TBD

Belum diketahui apakah status `EXCUSED` wajib memiliki alasan.

---

## 10.2 Supporting Document

Status: TBD

Belum diketahui apakah `EXCUSED` membutuhkan dokumen pendukung.

---

## 10.3 Approval

Status: TBD

Belum diketahui apakah `EXCUSED` membutuhkan persetujuan
Academic Staff, Admin, atau role lainnya.

Referensi validasi:

`attendance-validation-sheet.md — Q10`

---

# 11. Duplicate Attendance

## 11.1 Duplicate Record

Status: CONFIRMED

Kombinasi:

`studentId + scheduleId`

harus unik.

Database telah menerapkan unique constraint.

---

## 11.2 Duplicate API Behavior

Status: TBD

Belum ditentukan apakah API harus:

- menolak request dengan error,
- mengarahkan ke mekanisme update,
- menggunakan mekanisme koreksi,
- atau menggunakan mekanisme lain.

Referensi validasi:

`attendance-validation-sheet.md — Q11`

---

# 12. Attendance Correction

## 12.1 Correction

Status: TBD

Belum ditentukan apakah Attendance yang sudah dibuat dapat dikoreksi.

---

## 12.2 Correction Actor

Status: TBD

Belum ditentukan role yang dapat melakukan koreksi.

Kemungkinan role:

- Super Admin
- Admin
- Academic Staff
- Instructor
- Role lain yang ditentukan GHS

---

## 12.3 Correction Reason

Status: TBD

Belum ditentukan apakah alasan koreksi wajib diberikan.

---

## 12.4 Correction Audit

Status: TBD

Belum ditentukan apakah setiap koreksi Attendance wajib dicatat
dalam AuditLog.

Referensi validasi:

`attendance-validation-sheet.md — Q13`

---

# 13. Attendance Audit

## 13.1 Audit Requirement

Status: CONFIRMED

PRD menetapkan bahwa perubahan Attendance harus dapat diaudit.

AuditLog dirancang sebagai append-only record.

---

## 13.2 CREATE Audit

Status: TBD

Belum ditentukan apakah pembuatan Attendance baru juga wajib
menghasilkan AuditLog.

Referensi validasi:

`attendance-validation-sheet.md — Q12`

---

## 13.3 Minimum Audit Information

Proposed:

- Actor/User
- Student
- Schedule
- Status
- Notes
- Timestamp

Status: PROPOSED

Daftar tersebut belum menjadi format AuditLog final sampai divalidasi
dan diselaraskan dengan implementasi AuditLog.

---

# 14. Authorization

## 14.1 Attendance Permission Matrix (Phase 2 Update)

| Role | Read | Create | Update | Delete |
|---|---:|---:|---:|---:|
| Super Admin | YES | YES | YES | YES |
| Admin | YES | YES | YES | YES |
| Academic Staff | YES | NO | NO | NO |
| Instructor | YES | YES | YES | NO |
| Management | YES | NO | NO | NO |
| Student | YES | NO | NO | NO |
| Placement Staff | NO | NO | NO | NO |

Status: Updated by the Phase 2 user authorization for soft-delete only.

Permission tersebut merupakan technical authorization baseline.

Scope/ownership lebih lanjut tetap mengikuti business rules yang
sudah divalidasi GHS.

---

# 15. Student Self-Service

## 15.1 Student Read Access

Status: PARTIAL / NEEDS VALIDATION

Student memiliki permission `attendance:read`.

Namun scope data yang boleh dilihat Student harus dibatasi pada data
Attendance miliknya sendiri.

---

## 15.2 Student Create

Status: CONFIRMED

Student tidak memiliki permission untuk membuat Attendance.

---

## 15.3 Student Update

Status: CONFIRMED

Student tidak memiliki permission untuk mengubah Attendance.

---

## 15.4 Student Delete

Status: CONFIRMED

Student tidak memiliki permission untuk menghapus Attendance.

---

# 16. Delete Policy

## 16.1 Attendance Delete

Status: SUPERSEDED by the Phase 2 user authorization.

Attendance soft-delete is authorized for Super Admin and Admin only.
The record and all related history must remain in the database; deletion
must not be treated as a correction workflow.

---

# 17. Time & Attendance Window

Status: TBD

Belum terdapat aturan resmi mengenai:

- apakah Attendance hanya dapat dibuat pada jam Schedule,
- apakah terdapat check-in window,
- apakah terdapat grace period,
- apakah Attendance dapat dibuat sebelum Schedule,
- apakah Attendance dapat dibuat setelah Schedule selesai,
- apakah terdapat batas waktu koreksi.

Semua aturan tersebut harus divalidasi sebelum diterapkan sebagai
business logic.

---

# 18. Business Rules yang Belum Boleh Diimplementasikan

Sebelum validasi GHS, sistem tidak boleh secara sepihak menetapkan:

1. Attendance wajib memiliki Enrollment.
2. Enrollment harus ACTIVE.
3. Enrollment Batch harus sama dengan Class Batch.
4. Attendance hanya boleh dibuat pada SCHEDULED.
5. Attendance tidak boleh dibuat pada COMPLETED.
6. Attendance tidak boleh dibuat pada CANCELLED.
7. Instructor ownership berdasarkan Class atau Schedule.
8. Definisi LATE.
9. Late threshold.
10. LATE dihitung sebagai hadir atau tidak.
11. Definisi EXCUSED.
12. Dokumen pendukung EXCUSED.
13. Approval EXCUSED.
14. Mekanisme duplicate API.
15. Mekanisme correction.
16. Role yang boleh melakukan correction.
17. CREATE Attendance wajib diaudit.
18. Attendance time window.
19. Grace period.
20. Batas waktu correction.

---

# 19. Implementation Gate

Status:

> BLOCKED — WAITING FOR GHS VALIDATION

Attendance CREATE belum boleh diimplementasikan sebagai production
business logic sampai keputusan P0 berikut tervalidasi:

### P0

- Student eligibility
- Enrollment requirement
- Enrollment status requirement
- Batch consistency
- Schedule lifecycle
- Instructor ownership
- Attendance status semantics
- LATE calculation
- Duplicate API behavior
- Attendance CREATE audit

### P1

- Correction workflow
- Correction authorization
- Correction reason
- EXCUSED supporting document
- Schedule time window
- Grace period
- Historical correction policy

---

# 20. Source of Truth

Urutan sumber yang digunakan untuk menentukan business rule:

1. Keputusan resmi GHS
2. PRD yang telah disetujui
3. Dokumen SOP/Tata Tertib GHS yang relevan
4. Database/schema sebagai technical implementation
5. UI/mock sebagai presentation reference

UI atau mock data tidak boleh digunakan sebagai sumber utama untuk
menetapkan business rule.

---

# 21. Next Step

Setelah GHS memberikan jawaban pada:

`attendance-validation-sheet.md`

maka dokumen ini harus diperbarui.

Setiap `TBD` harus diubah menjadi:

- `CONFIRMED` jika GHS menyetujui aturan tersebut, atau
- `PROPOSED` jika masih merupakan usulan yang belum disahkan.

Setelah itu dilakukan:

1. Attendance Business Rule Finalization
2. Attendance Implementation Gate
3. Attendance API Contract
4. Attendance Schema Validation
5. Attendance Authorization
6. Attendance Audit Implementation
7. Attendance CREATE API
8. Integration Test
9. Regression Test