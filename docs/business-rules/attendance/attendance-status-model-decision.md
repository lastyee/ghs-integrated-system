# GHS Attendance Status Model Decision

## Status Dokumen

- Module: Attendance
- Step: 57
- Status: DECISION REQUIRED
- Implementation Status: BLOCKED
- Source:
  - GHS Peraturan Disiplin dan Tata Tertib Mahasiswa
  - `attendance-final-business-rules.md`
  - `attendance-business-rules.md`
  - `attendance-validation-sheet.md`

---

# 1. Tujuan

Dokumen ini menentukan model status/kategori Attendance yang akan
digunakan oleh sistem GHS.

Keputusan ini harus diselesaikan sebelum:

- perubahan Prisma schema,
- migration,
- Zod schema final,
- Attendance API,
- Attendance calculation.

---

# 2. Existing Database Model

Saat ini database memiliki enum:

```text
PRESENT
LATE
EXCUSED
ABSENT