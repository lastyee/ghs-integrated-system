# GHS Attendance Schema & Validation Specification

## Status Dokumen

- Module: Attendance
- Step: 52
- Status: DRAFT
- Implementation Status: BLOCKED
- API Contract: `attendance-api-contract.md`
- Business Rules: `attendance-business-rules.md`
- Validation Sheet: `attendance-validation-sheet.md`

---

# 1. Tujuan

Dokumen ini mendefinisikan technical validation untuk request
Attendance.

Technical validation berbeda dengan business validation.

Technical validation memastikan request memiliki struktur dan tipe data
yang benar.

Business validation memastikan request sesuai dengan aturan operasional
GHS.

Business validation yang masih TBD tidak boleh dimasukkan ke dalam
technical schema.

## Technical Status Model (Step 59)

```text
AttendanceStatus:
PRESENT
LATE
ABSENT

AbsenceType:
SICK
PERMITTED
UNEXCUSED
```

Attendance technical fields:

- `absenceType`: nullable `AbsenceType`
- `lateMinutes`: nullable integer

The technical model does not define late thresholds, sanction rules,
check-in behavior, or other unresolved GHS business rules.

---

# 2. Candidate Request

## Step 60 Technical Validation

Candidate Attendance Create request:

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

Technical fields:

- `scheduleId`: required, non-empty string.
- `studentId`: required, non-empty string.
- `status`: `PRESENT`, `LATE`, or `ABSENT`.
- `absenceType`: optional nullable enum.
- `lateMinutes`: optional nullable integer.
- `notes`: optional nullable string.

Technical combination rules:

| Status | `absenceType` | `lateMinutes` |
|---|---|---|
| `PRESENT` | Must be null or omitted | Must be null or omitted |
| `LATE` | Must be null or omitted | Required |
| `ABSENT` | Required | Not interpreted by this layer |

Unknown fields are rejected. This validation is pure and deterministic;
it does not access the database, Schedule time, current time, or API.
Business rules regarding Enrollment, Schedule lifecycle, Instructor
ownership, exact 15-minute handling, correction, audit, and attendance
eligibility remain TBD — GHS.

Request Attendance:

```json
{
  "scheduleId": "schedule-id",
  "studentId": "student-id",
  "status": "PRESENT",
  "notes": null
}