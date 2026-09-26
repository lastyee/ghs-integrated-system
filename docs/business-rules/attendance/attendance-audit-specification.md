# GHS Attendance Audit Specification

## Status Dokumen

- Module: Attendance
- Step: 54
- Status: DRAFT
- Implementation Status: BLOCKED / PARTIAL
- Business Rules: `attendance-business-rules.md`
- API Contract: `attendance-api-contract.md`
- Authorization: `attendance-authorization.md`

---

# 1. Tujuan

Dokumen ini mendefinisikan kebutuhan audit untuk modul Attendance.

Audit digunakan untuk mengetahui:

- siapa yang melakukan perubahan,
- data Attendance yang terdampak,
- perubahan yang dilakukan,
- kapan perubahan terjadi.

Audit merupakan bagian dari kontrol keamanan dan historical record.

---

# 2. AuditLog Technical Baseline

Model `AuditLog` saat ini memiliki:

```text
id
userId
action
entity
entityId
changes
createdAt