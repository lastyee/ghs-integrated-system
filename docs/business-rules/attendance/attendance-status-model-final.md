# GHS Attendance Final Status Model

## Status Dokumen

- Module: Attendance
- Step: 58
- Status: TECHNICAL DESIGN FINAL
- GHS Policy Status: Partially Confirmed
- Implementation Status: READY FOR SCHEMA MIGRATION
- Source:
  - GHS Peraturan Disiplin dan Tata Tertib Mahasiswa
  - `attendance-final-business-rules.md`
  - `attendance-ghs-validation-resolution.md`
  - `attendance-status-model-decision.md`

---

# 1. Tujuan

Dokumen ini menetapkan model data Attendance yang digunakan sistem GHS.

Model ini memisahkan:

1. status kehadiran,
2. kategori ketidakhadiran,
3. informasi keterlambatan.

Pemisahan dilakukan agar aturan GHS seperti Sakit, Izin, Alpha, dan
keterlambatan tidak dipaksa masuk ke satu enum yang memiliki makna
berbeda.

---

# 2. GHS Policy vs Technical Design

Penting:

Dokumen ini tidak menyatakan bahwa seluruh struktur database berikut
merupakan aturan tertulis GHS.

Yang berasal dari GHS:

- Sakit dibedakan dari Izin dan Alpha.
- Keterlambatan lebih dari 15 menit diperlakukan sebagai tidak hadir
  tanpa alasan untuk 1 SKS.
- Keterlambatan di bawah 15 menit memiliki mekanisme izin masuk kelas.
- Ketidakhadiran dihitung secara terpisah berdasarkan kategorinya.

Struktur database berikut merupakan:

> TECHNICAL DESIGN DECISION

yang dibuat agar aturan tersebut dapat direpresentasikan secara
terstruktur.

---

# 3. Final Attendance Model

Model final:

```text
Attendance
├── id
├── scheduleId
├── studentId
├── status
├── absenceType
├── lateMinutes
├── notes
├── createdAt
└── updatedAt