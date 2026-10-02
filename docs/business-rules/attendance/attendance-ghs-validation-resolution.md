# GHS Attendance Validation Resolution

## Status Dokumen

- Module: Attendance
- Step: 55
- Status: PARTIALLY RESOLVED
- Source utama: GHS Peraturan Disiplin dan Tata Tertib Mahasiswa (PDTTM)
- Related:
  - `attendance-validation-sheet.md`
  - `attendance-business-rules.md`
  - `attendance-implementation-gate.md`
  - `attendance-api-contract.md`
  - `attendance-schema-validation.md`
  - `attendance-authorization.md`
  - `attendance-audit-specification.md`

---

# 1. Tujuan

Dokumen ini memetakan pertanyaan pada Attendance Validation Sheet
terhadap aturan yang ditemukan pada dokumen resmi GHS.

Dokumen PDTTM menjadi sumber untuk aturan yang memang secara eksplisit
mengatur mahasiswa, kegiatan pendidikan/pelatihan, izin, sakit,
keterlambatan, dan ketidakhadiran.

Aturan yang tidak disebutkan dalam PDTTM tetap berstatus TBD.

---

# 2. Source Document

Dokumen:

**Peraturan Disiplin dan Tata Tertib Mahasiswa (PDTTM)
Global Hospitality Sukabumi (GHS)**

Dokumen ditetapkan melalui:

**Keputusan Direktur LKP GHS
Nomor: 001 / SK-DIR / GHS/ 2024**

PDTTM mengatur hak, kewajiban, larangan, dan sanksi mahasiswa GHS.

---

# 3. Q1 — Student Wajib Memiliki Enrollment

Status:

> TBD

PDTTM menyatakan mahasiswa GHS adalah orang yang mengikuti pendidikan
dan telah tercatat secara sah melalui registrasi mahasiswa.

Namun PDTTM tidak menggunakan istilah `Enrollment` sebagai struktur
database dan tidak menyatakan secara eksplisit bahwa record Enrollment
sistem merupakan prerequisite untuk membuat Attendance.

Keputusan teknis:

> Jangan menambahkan rule `Enrollment wajib` ke API hanya berdasarkan
> dokumen PDTTM.

Tetap:

> TBD

---

# Step 62 — Attendance Business Rule Resolution & Implementation Gate

## Status Addendum

- Step: 62
- Mode: Read-only audit and specification
- Source priority:
  1. PDTTM GHS yang telah dirujuk oleh dokumen ini
  2. PRD
  3. Technical decisions Step 58–61
- Attendance API: belum dibuat
- Implementation status: **BLOCKED**

Addendum ini melengkapi, bukan menghapus atau mengubah secara diam-diam,
keputusan historis Step 55–56.

## 1. Confirmed GHS Rules

Aturan berikut didukung oleh ringkasan PDTTM yang telah dicatat pada
dokumen Attendance sebelumnya:

1. Mahasiswa wajib mengikuti seluruh kegiatan pendidikan/pelatihan yang
   relevan, termasuk teori, praktik, direct study, dan OJT/internship.
2. Ketidakhadiran dibedakan menjadi Sakit, Izin, dan Alpha/tidak hadir
   tanpa alasan.
3. Ketiga kategori tersebut dapat dihitung atau dikelompokkan terpisah
   untuk ketentuan tertentu.
4. Keterlambatan lebih dari 15 menit diperlakukan sebagai tidak hadir
   tanpa alasan untuk 1 SKS.
5. Keterlambatan kurang dari 15 menit memerlukan surat izin masuk.
6. Sakit lebih dari 1 hari memerlukan surat dokter; sampai 1 hari dapat
   menggunakan surat orang tua/wali, dan dokumen diserahkan ketika
   mahasiswa kembali.
7. Izin memiliki kondisi/alasan yang diizinkan dan memerlukan persetujuan
   sesuai ketentuan dokumen.
8. Jam ketidakhadiran diakumulasikan selama semester dan rekap diumumkan
   bulanan.

Aturan di atas adalah aturan disiplin/operasional GHS. Aturan tersebut
tidak otomatis menjadi algoritme mutation Attendance.

## 2. Partial Rules

### 2.1 Status model

Technical model Step 59–60:

```text
AttendanceStatus: PRESENT | LATE | ABSENT
AbsenceType: SICK | PERMITTED | UNEXCUSED
```

Pemetaan istilah bisnis berikut didukung secara terminologi:

```text
SICK       → Sakit
PERMITTED  → Izin
UNEXCUSED  → Alpha/tidak hadir tanpa alasan
```

Namun source belum menentukan:

- apakah `LATE` dihitung sebagai hadir;
- apakah `LATE` juga masuk hitungan absence;
- bagaimana `LATE` memengaruhi rekap atau SKS;
- apakah `ABSENT + UNEXCUSED` selalu menjadi Alpha untuk semua konteks;
- siapa yang dapat mengoreksi status.

Status: **PARTIAL / TBD — GHS**.

### 2.2 Aturan 15 menit

Dokumen PDTTM memberikan perlakuan disiplin untuk `>15` menit dan
`<15` menit. Source belum menyatakan bahwa API harus otomatis:

```text
lateMinutes > 15 → status ABSENT + UNEXCUSED
```

Nilai tepat 15 menit juga belum didefinisikan secara eksplisit.

Status:

- documented discipline rule: **CONFIRMED**;
- system mapping and exact-15 behavior: **PARTIAL / TBD — GHS**.

### 2.3 Dokumen Sakit dan Izin

Dokumen GHS mendukung kebutuhan surat atau persetujuan pada kondisi
tertentu. Model Attendance saat ini tidak memiliki `documentId`,
`approvalId`, `approvedById`, atau `verifiedAt`.

Source belum menentukan apakah dokumen/persetujuan merupakan prerequisite
sebelum CREATE, atau proses terpisah setelah pencatatan.

Status: **PARTIAL / TBD — GHS**.

## 3. P0 Decision Matrix

| Rule | Status | Evidence | Implementation |
|---|---|---|---|
| Student exists | CONFIRMED technical | Student FK pada schema | Boleh validasi existence |
| Schedule exists | CONFIRMED technical | Schedule FK pada schema | Boleh validasi existence |
| Student wajib memiliki Enrollment | TBD — GHS | PDTTM tidak memetakan record `Enrollment` sebagai prerequisite API | Jangan implementasikan |
| Enrollment harus ACTIVE | TBD — GHS | Enum Enrollment sistem tidak didefinisikan PDTTM sebagai syarat Attendance | Jangan implementasikan |
| Enrollment batch = Class batch | TBD — GHS | Tidak ada keputusan eksplisit | Jangan implementasikan |
| Schedule `SCHEDULED` | TBD — GHS | Tidak ada izin/larangan CREATE eksplisit | Jangan implementasikan |
| Schedule `COMPLETED` | TBD — GHS | Tidak ada aturan correction atau role-specific CREATE | Jangan implementasikan |
| Schedule `CANCELLED` | TBD — GHS | Tidak ada aturan Attendance untuk schedule cancelled | Jangan implementasikan |
| Timing sebelum/pada/setelah tanggal | TBD — GHS | Tidak ada attendance window atau check-in timestamp | Jangan implementasikan |
| Instructor ownership | TBD — GHS | PRD menyebut tanggung jawab class, tetapi authority path belum dipilih | Jangan implementasikan |
| Substitute/delegation | TBD — GHS | Tidak ada actor, periode efektif, atau history rule | Jangan implementasikan |
| `PRESENT` semantics | Technical READY / business TBD | Step 58–60 hanya menetapkan kombinasi field | Validasi struktur saja |
| `LATE` semantics | PARTIAL / TBD — GHS | PDTTM punya aturan disiplin, mapping status belum ditetapkan | Jangan infer |
| `ABSENT` semantics | PARTIAL / TBD — GHS | Kategori Sakit/Izin/Alpha didukung, workflow belum ditetapkan | Validasi struktur saja |
| `>15` minute rule | CONFIRMED source rule | PDTTM | Jangan membuat sanction engine atau auto-conversion |
| Exact 15 minutes | TBD — GHS | Tidak eksplisit pada source | Jangan implementasikan |
| SICK documentation prerequisite | TBD — GHS | Requirement dokumen ada, API prerequisite tidak ada | Jangan implementasikan |
| PERMITTED approval prerequisite | TBD — GHS | Persetujuan disebut, enforcement timing tidak ditentukan | Jangan implementasikan |
| Duplicate database prohibition | CONFIRMED technical | `unique(scheduleId, studentId)` | Pertahankan constraint |
| Duplicate HTTP response | TBD — technical/API decision | Belum ada API contract final | Jangan implementasikan |
| Duplicate upsert | Not confirmed | Tidak ada keputusan upsert | Jangan implementasikan upsert |
| Attendance changes audited | CONFIRMED requirement | PRD | Audit implementation harus ditentukan sebelum mutation |
| Attendance CREATE audit event | TBD — GHS | “Perubahan” belum memutuskan CREATE secara eksplisit | Jangan membuat writer |
| Correction workflow | TBD — GHS | Tidak ada PATCH/correction policy final | Jangan implementasikan |
| Student ownership | CONFIRMED | Step 61 authorization specification | Gunakan server-side ownership |
| Academic Staff scope | TBD — GHS | Permission read ada, data scope tidak ditentukan | Jangan menambah filter/asumsi |
| Management scope | TBD — GHS | Permission read ada, data scope tidak ditentukan | Jangan menambah filter/asumsi |
| Delete | Phase 2 authorized | Admin/Super Admin-only soft delete | No hard delete or cascade |

## 4. Unresolved TBD — GHS

Keputusan berikut masih belum tersedia dan sebagian merupakan P0 untuk
Attendance CREATE:

- Enrollment prerequisite;
- status Enrollment yang eligible;
- konsistensi Enrollment batch dengan Class batch;
- izin CREATE pada Schedule `SCHEDULED`, `COMPLETED`, dan `CANCELLED`;
- attendance timing window;
- Instructor authority path;
- substitute/delegation;
- definisi operasional `PRESENT`, `LATE`, dan `ABSENT`;
- mapping aturan 15 menit ke mutation API;
- perlakuan tepat 15 menit;
- prerequisite dokumen Sakit;
- prerequisite approval Izin;
- duplicate HTTP behavior;
- apakah CREATE menghasilkan AuditLog;
- correction workflow dan actor yang berwenang;
- Academic Staff scope;
- Management scope.

## 5. Implementation Gate

| Layer/Area | Status | Reason |
|---|---|---|
| Attendance technical model | READY | Step 59 migration dan model tersedia |
| Zod validation | READY | Step 60 technical combinations tersedia |
| Authorization baseline | READY | Step 61 permission mapping confirmed |
| Student ownership | READY | Session user → Student.userId → Attendance.studentId |
| Student/Schedule FK validation | READY technically | Relation tersedia pada schema |
| Attendance status business semantics | PARTIAL | Terminology confirmed, operational meaning unresolved |
| Attendance CREATE | **BLOCKED** | P0 eligibility, lifecycle, ownership, status mapping, and audit decisions unresolved |
| Attendance READ | PARTIAL / BLOCKED for implementation | Permission dan Student ownership tersedia, scope Academic/Management/Instructor belum final |
| Attendance UPDATE | BLOCKED | Correction policy, ownership, and audit behavior unresolved |
| Attendance DELETE | BLOCKED | Permission tidak tersedia |

### Gate Decision

```text
Attendance CREATE: BLOCKED
```

Technical readiness tidak cukup untuk membuka CREATE karena beberapa
keputusan business rule yang menentukan validitas record masih `TBD —
GHS`.

**Do not implement Attendance CREATE yet.**

## 6. Scope and Change Control

Step 62 hanya menghasilkan audit/specification:

- Code changes: 0
- Prisma schema changes: 0
- Migration changes: 0
- Seed changes: 0
- Database writes: 0
- Attendance API changes: 0
- Frontend changes: 0
- Auth.js changes: 0
- Permission mapping changes: 0
- Instructor ownership decision: 0
- Sanction engine: 0
- Automatic late calculation/conversion: 0
- Correction workflow: 0
- AuditLog writer: 0

---

# Step 63A — P0 Decision Resolution

## 1. Evidence Reviewed

Dokumen dan artefak yang ditinjau secara read-only untuk Step 63A:

- `PRD.md`
- `prisma/schema.prisma`
- `schemas/attendance.ts`
- `prisma/seed.js`
- `docs/10-attendance/attendance-authorization.md`
- `components/dashboard/docs/10-attendance/attendance-validation-sheet.md`
- `components/dashboard/docs/10-attendance/docs/10-attendance/attendance-business-rules.md`
- `docs/10-attendance/docs/10-attendance/docs/10-attendance/attendance-ghs-validation-resolution.md`
- `docs/10-attendance/docs/10-attendance/docs/10-attendance/docs/10-attendance/attendance-final-business-rules.md`
- `docs/10-attendance/docs/10-attendance/docs/10-attendance/docs/10-attendance/docs/10-attendance/docs/10-attendance/attendance-status-model-final.md`

Catatan penting:

- GHS PDTTM dan dokumen internal yang tersedia memberikan fakta disiplin
  dan kategori ketidakhadiran yang terbatas.
- Dokumen tersebut tidak secara eksplisit menentukan seluruh business rule
  untuk Attendance API.
- Keputusan teknis Step 58–62 tidak boleh dipakai untuk mengunci business
  rule GHS yang belum didukung oleh source.

## 2. Confirmed Decisions

Hanya keputusan yang didukung evidence yang masuk kategori CONFIRMED:

1. Mahasiswa wajib mengikuti kegiatan pendidikan/pelatihan.
2. Ketidakhadiran dibedakan menjadi Sakit, Izin, dan Alpha.
3. Keterlambatan lebih dari 15 menit diperlakukan sebagai tidak hadir tanpa
   alasan untuk 1 SKS.
4. Keterlambatan kurang dari 15 menit memerlukan surat izin masuk.
5. Sakit lebih dari 1 hari memerlukan surat dokter.
6. Sakit sampai 1 hari dapat menggunakan surat orang tua/wali.
7. Izin memerlukan alasan yang diperbolehkan dan persetujuan sesuai
   ketentuan.
8. Student existence dapat ditentukan secara teknis melalui FK `studentId`.
9. Schedule existence dapat ditentukan secara teknis melalui FK `scheduleId`.
10. `unique(scheduleId, studentId)` adalah constraint teknis yang sah dan
    mencegah duplicate attendance pada DB level.
11. Permission baseline dan student ownership untuk Attendance sudah
    dikonfirmasi pada Step 61.
12. The Phase 2 user instruction supersedes the Step 61 baseline and
    authorizes `attendance:delete` for Admin/Super Admin only.

## 3. Partial Decisions

Keputusan berikut sebagian didukung source, tetapi tidak cukup untuk
memastikan business rule yang lengkap:

1. `PRESENT`, `LATE`, dan `ABSENT` adalah model status teknis yang telah
   disepakati.
2. Terminologi GHS mendukung pemetaan istilah:
   - `SICK` ≈ Sakit
   - `PERMITTED` ≈ Izin
   - `UNEXCUSED` ≈ Alpha/tidak hadir tanpa alasan
3. PDTTM menyebut keterlambatan dan ketidakhadiran, tetapi belum menjelaskan
   apakah `LATE` dihitung sebagai hadir, sebagai absence, atau sebagai
   kategori terpisah dalam API.
4. `LATE` dan `ABSENT` dibedakan secara teknis, tetapi definisi operasional
   dan output rekap belum dikonfirmasi.
5. Dokumen GHS menyebut perlunya surat dan persetujuan, tetapi belum
   mengunci apakah dokumen tersebut adalah prerequisite Attendance CREATE
   atau bagian dari proses administrasi terpisah.
6. `15-minute rule` adalah rule disiplin yang terbukti, tetapi belum ada
   keputusan yang mengikat bahwa rule tersebut harus diubah menjadi logic
   otomatis `lateMinutes > 15 -> ABSENT / UNEXCUSED` di API.

## 4. TBD — GHS

Daftar kebutuhan keputusan yang belum ditemukan evidence authoritative:

- Student wajib memiliki Enrollment untuk Attendance.
- Enrollment harus ACTIVE.
- Enrollment batch harus sama dengan Class batch.
- Schedule `SCHEDULED` dapat menerima Attendance atau tidak.
- Schedule `COMPLETED` dapat menerima Attendance atau tidak.
- Schedule `CANCELLED` dapat menerima Attendance atau tidak.
- Attendance timing window: sebelum/durasi/after schedule.
- Instructor ownership: `Class.instructorId`, `Schedule.instructorId`,
  keduanya, atau substitute/delegation.
- Definisi operasional `PRESENT`, `LATE`, dan `ABSENT`.
- Apakah `LATE` dihitung hadir atau absent.
- Apakah `ABSENT + UNEXCUSED` selalu Alpha.
- Perlakuan tepat 15 menit.
- Sakit >1 hari dan ≤1 hari memerlukan dokumen/verification atau apakah
  tindakan tersebut dilakukan di luar Attendance API.
- Izin memerlukan approval sebelum atau sesudah Attendance dibuat.
- Duplicate HTTP behavior (`409`, `400`, `upsert`, `correction`).
- Apakah CREATE harus menghasilkan AuditLog.
- Correction workflow, actor, approval, dan apakah koreksi boleh dilakukan.
- Scope data Academic Staff dan Management.
- Apakah Attendance dapat dibuat dengan status `LATE` tanpa status lain
  yang ditetapkan oleh GHS.

## 5. Decision Matrix

| ID | Rule | Status | Evidence | Safe to Implement? |
|---|---|---|---|---|
| P0-1 | Enrollment prerequisite | TBD — GHS | PDTTM dan PRD tidak mengekspos prerequisite Enrollment untuk Attendance | No |
| P0-2 | Enrollment ACTIVE | TBD — GHS | Enum ACTIVE/COMPLETED/TRANSFERRED/DROPPED tidak didefinisikan sebagai rule GHS Attendance | No |
| P0-3 | Batch consistency | TBD — GHS | Tidak ada source yang menetapkan Enrollment.batchId = Class.batchId sebagai prerequisite | No |
| P0-4 | Schedule SCHEDULED | TBD — GHS | Tidak ada source eksplisit yang mengizinkan atau melarang CREATE saat SCHEDULED | No |
| P0-5 | Schedule COMPLETED | TBD — GHS | Tidak ada source yang menetapkan allowed/not allowed/correction only | No |
| P0-6 | Schedule CANCELLED | TBD — GHS | Tidak ada source yang menetapkan CANCELLED otomatis menolak Attendance | No |
| P0-7 | Timing window | TBD — GHS | PDTTM membahas keterlambatan, bukan system mutation timing | No |
| P0-8 | Instructor ownership | TBD — GHS | PRD menyebut tanggung jawab class, namun authority path belum final | No |
| P0-9 | Status semantics | PARTIAL | Terminologi GHS ada, definisi operasional belum final | No |
| P0-10 | 15-minute mapping | PARTIAL / TBD — GHS | Rule disiplin confirmed, mapping ke API belum dikonfirmasi | No |
| P0-11 | Sick documentation | TBD — GHS | Dokumen membutuhkan surat, tetapi bukti apakah prerequisite `CREATE` belum ada | No |
| P0-12 | Permitted approval | TBD — GHS | Izin perlu persetujuan, tidak ada sistem enforcement yang disepakati | No |
| P0-13 | Duplicate HTTP behavior | TBD — TECHNICAL | Unique DB constraint confirmed; API response format belum final | No |
| P0-14 | Audit CREATE | TBD — GHS | PRD menyebut audit perubahan, tetapi CREATE inclusion belum eksplisit | No |
| P0-15 | Correction workflow | TBD — GHS | Tidak ada source yang menetapkan actor, reason, approval, atau timeline | No |
| P0-16 | Academic scope | TBD — GHS | Permission read ada, scope data belum final | No |
| P0-17 | Management scope | TBD — GHS | Permission read ada, scope data belum final | No |
| Technical FK validation | CONFIRMED | `scheduleId` and `studentId` are existing foreign keys; DB allows validation | Yes |
| Student existence validation | CONFIRMED | schema relation and step 61 ownership pattern | Yes |
| DB duplicate prevention | CONFIRMED | `@@unique([scheduleId, studentId])` | Yes |

## 6. API Safety

Hal yang aman untuk diterapkan secara teknis, tanpa mengunci business rule GHS:

- validasi bahwa `scheduleId` benar-benar ada;
- validasi bahwa `studentId` benar-benar ada;
- validasi `status` sesuai enum teknis;
- validasi `absenceType` dan `lateMinutes` kombinasi sesuai `schemas/attendance.ts`;
- validasi unik pada `scheduleId + studentId` di DB;
- server-side permission baseline;
- Student ownership check untuk role `STUDENT`.

Hal yang tidak aman untuk diterapkan tanpa evidence GHS:

- Enrollment prerequisite;
- Enrollment ACTIVE check;
- batch consistency;
- schedule lifecycle gate by status;
- instructor authority by Class/Schedule;
- automatic 15-minute consequence logic;
- automatic late conversion to absent;
- documentation prerequisite enforcement;
- approval prerequisite enforcement;
- duplicate HTTP contract beyond DB uniqueness;
- AuditLog creation on CREATE;
- correction workflow or PATCH behavior.

## 7. Implementation Gate

Attendance CREATE:

```text
BLOCKED
```

Blokir yang menghalangi gate:

1. `P0-1`: Enrollment prerequisite belum ada evidence authoritative.
2. `P0-2`: Enrollment ACTIVE rule belum ada evidence authoritative.
3. `P0-3`: Batch consistency belum ada evidence authoritative.
4. `P0-4` / `P0-5` / `P0-6`: schedule lifecycle belum final.
5. `P0-8`: instructor ownership belum final.
6. `P0-9`: status semantics tidak cukup untuk mengunci API behavior.
7. `P0-10`: mapping 15-minute rule ke mutation API belum final.
8. `P0-11` / `P0-12`: document approval and verification requirements belum final.
9. `P0-13`: duplicate HTTP behavior belum final.
10. `P0-14`: Audit CREATE belum final.
11. `P0-15`: correction workflow belum final.
12. `P0-16` / `P0-17`: scope Academic Staff / Management belum final.

Karena satu atau lebih blokir P0 masih `TBD — GHS`, maka Attendance CREATE
harus tetap ditahan.

**Do not implement Attendance CREATE yet.**

## 8. Scope Confirmation

Pada Step 63A tidak dilakukan:

- Attendance API
- database mutation
- Prisma schema change
- migration
- seed modification
- permission change
- Auth.js change
- frontend change
- AuditLog writer
- sanction engine
- automatic late calculation
- business rule invention

## 9. Final Note

TBD — GHS; tidak ditemukan evidence authoritative yang cukup untuk mengunci rule ini.

Semua keputusan yang tidak ditopang source yang jelas tetap dipertahankan
sebagai `TBD — GHS`, tidak diubah menjadi `CONFIRMED` hanya karena mudah
diimplementasikan atau umum di sistem pendidikan.

---

# Step 63A Result Summary

- Decision classification selesai sesuai source of truth.
- P0 blockers diidentifikasi secara eksplisit.
- Attendance CREATE tetap BLOCKED.
- Tidak ada perubahan kode atau schema.
- Rekomendasi: lanjutkan ke validasi GHS secara formal untuk key decisions
  di atas sebelum membuka Attendance CREATE.

---

# 4. Q2 — Enrollment Harus ACTIVE

Status:

> TBD

PDTTM menyebut mahasiswa dapat menjadi tidak aktif dalam kondisi tertentu,
termasuk berkaitan dengan cuti dan ketidakpemenuhan persyaratan sebagai
mahasiswa aktif.

Namun PDTTM tidak mendefinisikan enum sistem:

- ACTIVE
- COMPLETED
- TRANSFERRED
- DROPPED

sebagai status Enrollment.

Karena itu belum boleh menyamakan status PDTTM dengan enum database.

Tetap:

> TBD

---

# 5. Q3 — Enrollment Batch Harus Sama Dengan Class Batch

Status:

> TBD

PDTTM tidak mendefinisikan relasi:

```text
Enrollment
→ Batch
→ Class