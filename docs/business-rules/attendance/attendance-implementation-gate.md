# GHS Attendance Implementation Gate

## Status Dokumen

- Module: Attendance
- Step: 50
- Status: REVIEW / IMPLEMENTATION GATE
- Business Rule: `attendance-business-rules.md`
- Validation Sheet: `attendance-validation-sheet.md`
- Implementation status: BLOCKED

---

# 1. Tujuan

Dokumen ini menentukan apakah modul Attendance sudah memiliki dasar
business rule dan technical contract yang cukup untuk mulai
diimplementasikan.

Gate ini mencegah business rule yang masih TBD diterjemahkan menjadi
kode secara sepihak.

---

# 2. Current Technical Baseline

Step 59 technical status model:

- `AttendanceStatus`: `PRESENT`, `LATE`, `ABSENT`
- `AbsenceType`: `SICK`, `PERMITTED`, `UNEXCUSED`
- `absenceType`: nullable
- `lateMinutes`: nullable integer

Technical status model: READY  
Migration: READY  
Attendance CREATE: STILL BLOCKED

Model Attendance saat ini memiliki:

- `id`
- `scheduleId`
- `studentId`
- `status`
- `notes`
- `createdAt`
- `updatedAt`

Enum:

- `PRESENT`
- `LATE`
- `EXCUSED`
- `ABSENT`

Constraint:

```text
unique(scheduleId, studentId)