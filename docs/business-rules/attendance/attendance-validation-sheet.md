# GHS Attendance Validation Sheet

## Tujuan

Dokumen ini digunakan untuk memvalidasi aturan bisnis Attendance
kepada pihak GHS sebelum implementasi Attendance API dan business logic.

Status dokumen: PENDING VALIDATION

---

## 1. Student Eligibility

### Q1 — Apakah Student harus memiliki Enrollment untuk dapat memiliki Attendance?

Pilihan:
- [ ] YA
- [ ] TIDAK

Catatan GHS:
> ...

---

### Q2 — Jika Student memiliki Enrollment, apakah Enrollment harus berstatus ACTIVE?

Pilihan:
- [ ] YA
- [ ] TIDAK
- [ ] Kondisi lain: ...

Catatan GHS:
> ...

---

### Q3 — Apakah Batch pada Enrollment Student harus sama dengan Batch pada Class/Schedule?

Pilihan:
- [ ] YA
- [ ] TIDAK
- [ ] Kondisi lain: ...

Catatan GHS:
> ...

---

## 2. Schedule Lifecycle

### Q4 — Apakah Attendance boleh dibuat ketika Schedule berstatus SCHEDULED?

Pilihan:
- [ ] YA
- [ ] TIDAK

Catatan GHS:
> ...

---

### Q5 — Apakah Attendance boleh dibuat ketika Schedule berstatus COMPLETED?

Pilihan:
- [ ] YA
- [ ] TIDAK

Jika YA:
- [ ] Tanpa batas waktu
- [ ] Hanya oleh role tertentu
- [ ] Dengan alasan/koreksi
- [ ] Lainnya: ...

Catatan GHS:
> ...

---

### Q6 — Apakah Attendance boleh dibuat ketika Schedule berstatus CANCELLED?

Pilihan:
- [ ] YA
- [ ] TIDAK

Catatan GHS:
> ...

---

## 3. Instructor Ownership

### Q7 — Instructor mana yang berwenang mengelola Attendance?

Pilihan:
- [ ] Instructor pada Class (`Class.instructorId`)
- [ ] Instructor pada Schedule (`Schedule.instructorId`)
- [ ] Harus sama pada Class dan Schedule
- [ ] Instructor pengganti/delegasi dapat mengelola
- [ ] Kondisi lain: ...

Catatan GHS:
> ...

---

## 4. Attendance Status

### Q8 — Apa definisi setiap status Attendance?

| Status | Definisi GHS |
|---|---|
| PRESENT | ... |
| LATE | ... |
| EXCUSED | ... |
| ABSENT | ... |

---

### Q9 — Apakah LATE dihitung sebagai kehadiran?

Pilihan:
- [ ] YA
- [ ] TIDAK
- [ ] Kondisi lain: ...

Jika YA, apakah ada batas keterlambatan?

- [ ] Tidak ada
- [ ] Ada, yaitu: ___ menit

Catatan GHS:
> ...

---

### Q10 — Apakah EXCUSED wajib memiliki alasan?

Pilihan:
- [ ] YA
- [ ] TIDAK

Jika YA:
- [ ] Notes wajib
- [ ] Dokumen pendukung wajib
- [ ] Persetujuan staff diperlukan
- [ ] Lainnya: ...

Catatan GHS:
> ...

---

## 5. Duplicate Attendance

### Q11 — Apa yang harus terjadi jika Attendance untuk Student + Schedule sudah ada?

Pilihan:
- [ ] Tolak dengan error
- [ ] Update record yang sudah ada
- [ ] Izinkan hanya melalui mekanisme koreksi
- [ ] Lainnya: ...

Catatan GHS:
> ...

---

## 6. Attendance Audit

### Q12 — Apakah pembuatan Attendance harus dicatat pada AuditLog?

Pilihan:
- [ ] YA
- [ ] TIDAK

Jika YA, data minimum yang dicatat:

- Actor/User
- Student
- Schedule
- Status
- Notes
- Timestamp
- Lainnya: ...

Catatan GHS:
> ...

---

## 7. Koreksi Attendance

### Q13 — Apakah Attendance yang sudah dibuat dapat dikoreksi?

Pilihan:
- [ ] YA
- [ ] TIDAK

Jika YA:

Siapa yang dapat melakukan koreksi?

- [ ] Super Admin
- [ ] Admin
- [ ] Academic Staff
- [ ] Instructor
- [ ] Role lain: ...

Apakah alasan koreksi wajib?

- [ ] YA
- [ ] TIDAK

Apakah koreksi harus masuk AuditLog?

- [ ] YA
- [ ] TIDAK

Catatan GHS:
> ...

---

# Ringkasan Keputusan

| No | Keputusan | Status |
|---|---|---|
| Q1 | Student wajib memiliki Enrollment | TBD |
| Q2 | Enrollment harus ACTIVE | TBD |
| Q3 | Enrollment Batch harus sesuai Class Batch | TBD |
| Q4 | Attendance pada SCHEDULED | TBD |
| Q5 | Attendance pada COMPLETED | TBD |
| Q6 | Attendance pada CANCELLED | TBD |
| Q7 | Dasar Instructor Ownership | TBD |
| Q8 | Definisi status | TBD |
| Q9 | LATE dihitung hadir | TBD |
| Q10 | EXCUSED membutuhkan alasan | TBD |
| Q11 | Duplicate Attendance | TBD |
| Q12 | CREATE masuk AuditLog | TBD |
| Q13 | Koreksi Attendance | TBD |

---

# Implementation Gate

Attendance CREATE belum dapat dinyatakan READY
sebelum keputusan bisnis P0 tervalidasi.

## P0

- Student eligibility
- Enrollment requirement
- Schedule lifecycle
- Instructor ownership
- Attendance status semantics
- Duplicate handling
- Audit CREATE

## Setelah P0 selesai
    
Dokumen berikut perlu diperbarui:

1. Attendance Business Rule
2. Attendance Implementation Gate
3. Attendance API Contract
4. Attendance Schema/Validation
5. Attendance Authorization
6. Attendance Audit Logging

Status akhir:

> ATTENDANCE CREATE: BLOCKED — WAITING FOR GHS VALIDATION