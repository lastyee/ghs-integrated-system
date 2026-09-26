# GHS Attendance API Contract

## Status Dokumen

- Module: Attendance
- Step: 51
- Status: DRAFT
- Implementation Status: BLOCKED
- Business Rule: `attendance-business-rules.md`
- Validation Sheet: `attendance-validation-sheet.md`
- Implementation Gate: `attendance-implementation-gate.md`

---

# 1. Tujuan

Dokumen ini mendefinisikan kontrak API untuk modul Attendance.

Kontrak ini menjadi batas antara frontend dan backend sebelum implementasi
API dilakukan.

Business rule yang masih berstatus TBD tidak boleh dianggap sebagai
aturan final pada API.

## Candidate Request Status Model (Step 59)

The future Attendance CREATE candidate request uses:

```json
{
  "scheduleId": "schedule-id",
  "studentId": "student-id",
  "status": "PRESENT",
  "absenceType": null,
  "lateMinutes": null,
  "notes": null
}
```

Technical status structure:

- `PRESENT`: `absenceType` and `lateMinutes` are null.
- `LATE`: `absenceType` is null and `lateMinutes` is technically required.
- `ABSENT`: `absenceType` is technically required.
- `AbsenceType`: `SICK`, `PERMITTED`, `UNEXCUSED`.

This is not an implemented endpoint. Attendance CREATE remains blocked
by unresolved GHS business rules.

---

# 2. Endpoint

## Create Attendance

```http
POST /api/attendances