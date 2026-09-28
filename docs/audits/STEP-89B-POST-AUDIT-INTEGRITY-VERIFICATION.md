# STEP 89B — Post-Audit Database Integrity Verification

**Tanggal verifikasi:** 2026-09-28  
**Target database:** PostgreSQL `ghs_integrated`, schema `public`, `localhost:5432`  
**Ruang lingkup:** Verifikasi read-only pasca STEP 89. Tidak ada DELETE, recovery, restore, perubahan schema, migration, commit, push, atau deploy yang dilakukan.

## Status

**STEP 89B: `PASS_WITH_WARNING`**

Record yang disebut sebagai residual STEP 89 masih ada dan jumlah saat ini cocok dengan baseline pra-audit yang dicantumkan dalam [STEP-89-DELETE-POLICY-AUDIT.md](./STEP-89-DELETE-POLICY-AUDIT.md). Peringatan diberikan karena working tree berisi perubahan lain di luar berkas STEP 89 dan tidak tersedia execution log independen yang membuktikan seluruh perintah yang pernah dijalankan selama STEP 89.

## 1. Git status dan ruang lingkup perubahan

Pemeriksaan `git status --short`, `git diff --name-status`, dan `git diff --stat` menunjukkan bahwa working tree **tidak hanya berisi** berkas STEP 89:

- 24 skrip test/baseline terlacak berubah.
- Berkas tidak terlacak: `docs/audits/STEP-86-GIT-MAIN-COMMIT-REPORT.md`, laporan STEP 89, serta tujuh skrip di `scripts/` (`audit-step88-auth.mjs`, `bootstrap-superadmin.mjs`, `cleanup-demo-users.mjs`, `cleanup-test-fixtures.mjs`, `inspect-db-temp.mjs`, `provision-test-fixtures.mjs`, `verify-real-superadmin-login.mjs`).
- Diff yang diperiksa pada skrip test mencakup perubahan ekspektasi jumlah user, misalnya `2` menjadi `3`, serta perubahan byte-order mark. Bukti yang tersedia tidak cukup untuk menetapkan kapan atau pada step mana semua perubahan tersebut dibuat.
- Tidak ada perubahan terlacak pada `prisma/schema.prisma` atau `prisma/migrations/`.

Dengan demikian, klaim bahwa perubahan STEP 89 di working tree hanya berupa laporan audit **tidak dapat dikonfirmasi**. Berkas tidak terlacak belum masuk index Git; berkas tersebut tidak dihapus atau diubah dalam STEP 89B.

## 2. Hitungan dan identitas record saat ini

Identitas di bawah menggunakan nama/kode bisnis dan relasi record agar tidak menyalin data sensitif yang tidak diperlukan. Untuk `AuditLog`, seluruh 805 ID tidak diduplikasi dalam laporan; rincian jumlah per action/entity dicatat di bagian audit log.

| Model | Jumlah | Identitas record saat ini |
|---|---:|---|
| Users | 1 | `muhamadrivqi83@gmail.com` — `SUPER_ADMIN` |
| Instructors | 6 | Mr. Rendy Fradita Kriswandi; Mr. Muhammad Nurul Hidayat; Mrs. Sabila Dheandra; Mrs. Hanny Astriani; Mr. Taufan Pratidiena; Chef Eris Resdiyanta |
| Programs | 1 | `HTP` — Hospitality Training Program |
| Batches | 3 | GHI-07 (12 enrollment); GHI-08 (9); GHI-09 (1) |
| Students | 22 | 260405064 RAFLI AULIA RAHMAN; 260405065 SAHRUL GUNAWAN; 260405066 TIARA ISMI LAILA; 260405067 KHALIF FAUZI; 260405068 SUCI WALIYAH; 260405069 ISMATULLAH MAULANA; 260405070 ATTHALARICK RAYHAIN KURNIAWAN; 260405071 RIO RESTU RAHAYU; 260405072 M. SYEHTU SUBAWAN; 260405073 ZIQRI HARIRI; 260405074 DRAJAT PRAMONO; 260405075 ZIDANE AZZAM MALIK DEGEL; 260308076 MUHAMMAD NAUFAL; 260308077 WILDA MAULIDINA; 260308078 MOCH. RAMLAN RAYANA; 260308079 ASEP ABDUL JABAR; 260308080 ADEN AGUSTIAN MAULANA; 260308081 MUHAMMAD FAJRIL MULYADI; 260308082 MUHAMMAD PUTRA MULYA PRATAMA; 260308083 CALISTUS CANDRAWARTYA; 260308084 MUHAMMAD DIMAS ANDIKA; 269067460 MUHAMAD RIVQI |
| Enrollments | 22 | GHI-07: NIM 260405064, 260405065, 260405066, 260405067, 260405068, 260405069, 260405070, 260405071, 260405072, 260405073, 260405074, 260405075. GHI-08: NIM 260308076–260308084. GHI-09: NIM 269067460. |
| Subjects | 6 | FBS — Food and Beverage Service; EHC — English Hotel conversation; BE — Basic English; GEC — General English Conversation; EFI — English For Interview; FP — Food Production |
| Classes | 11 | GHI-08 English Hotel conversation / Mr. Muhammad Nurul Hidayat; GHI-08 Basic English / Mrs. Sabila Dheandra; GHI-08 General English Conversation / Mrs. Hanny Astriani; GHI-08 English For Interview / Mr. Taufan Pratidiena; GHI-08 Food Production / Chef Eris Resdiyanta; GHI-07 Food and Beverage Service / Mr. Rendy Fradita Kriswandi; GHI-07 General English Conversation / Mrs. Hanny Astriani; GHI-07 English For Interview / Mr. Taufan Pratidiena; GHI-07 Food Production / Chef Eris Resdiyanta; Food and Beverage Service for GHI-08 / Chef Eris Resdiyanta; GHI-08 Food and Beverage Service / Mr. Rendy Fradita Kriswandi |
| Schedules | 10 | 2026-09-21 GHI-08/FBS/Rendy; 2026-09-22 GHI-08/EHC/Muhammad Nurul; 2026-09-23 GHI-08/BE/Sabila; 2026-09-23 GHI-08/GEC/Hanny; 2026-09-24 GHI-08/EFI/Taufan; 2026-09-25 GHI-08/FP/Eris; 2026-09-22 GHI-07/FBS/Rendy; 2026-09-22 GHI-07/GEC/Hanny; 2026-09-24 GHI-07/EFI/Taufan; 2026-09-25 GHI-07/FP/Eris |
| Employers | 1 | `bounty` |
| Vacancies | 1 | `KITCHEN` — OPEN, employer `bounty` |
| Applications | 0 | Tidak ada |
| Interviews | 0 | Tidak ada |
| Placements | 1 | `KITCHEN` — PREPARATION, student NIM 260405066, employer `bounty`, vacancy `KITCHEN` |
| Documents | 1 | KTP — `Screenshot__540_.png`, PENDING, student NIM 260405066 |
| Certificates | 0 | Tidak ada |
| AuditLogs | 805 | CREATE 559; UPDATE 16; STATUS_CHANGE 209; REVOKE 20; UPLOAD 1; action/entity tercantum lengkap di bawah. Tidak ditemukan action `DELETE`. |

Rincian action/entity untuk 805 `AuditLog`: CREATE — Application 20, Assessment 19, Attendance 28, Batch 29, Certificate 20, Class 57, Employer 21, Enrollment 59, Interview 102, Placement 97, Program 28, Student 30, Subject 28, Vacancy 21; UPDATE — Application 3, Assessment 2, Class 3, Interview 6, Placement 1, Student 1; STATUS_CHANGE — Placement 209; REVOKE — Certificate 20; UPLOAD — Document 1. Query `action = DELETE` (case-insensitive) mengembalikan 0 record.

## 3. Verifikasi record residual STEP 89

Semua record yang disebut sebagai data manual/user-created di baseline STEP 89 ditemukan:

- Batch `GHI-09`, ID `cmukmu1f9002bkdmm928uf9r6`, masih ada.
- Student tambahan `MUHAMAD RIVQI`, NIM `269067460`, ID `cmukmxyiw002fkdmmsxmph01v`, masih ada dan terdaftar di GHI-09 melalui enrollment `cmukn0ca4002kkdmmnhr9embf`.
- Employer `bounty`, ID `cmukmgv1e000ikdmm3wab04eg`, masih ada.
- Vacancy `KITCHEN` (OPEN), ID `cmuknh1cr0035kdmm9o2paobc`, masih ada dan terkait employer `bounty`.
- Placement `KITCHEN` (PREPARATION), ID `cmuknm8ns003dkdmmbx0zixoc`, masih ada dan terkait employer/vacancy `bounty`/`KITCHEN`.
- Document KTP `Screenshot__540_.png` (PENDING), ID `doc_4aefd49e8447405c9984192c6155f63e`, masih ada.

Catatan relasi: placement dan document yang ditemukan terkait `bounty`/`KITCHEN` terhubung ke student TIARA ISMI LAILA (NIM 260405066), bukan student GHI-09 NIM 269067460. Record student GHI-09 sendiri ditemukan; query relasi menunjukkan belum memiliki placement atau document. Ini sesuai dengan record yang ada saat verifikasi dan tidak ditafsirkan sebagai penghapusan.

Hitungan dan record residual cocok dengan bagian “Pre-Audit State” di laporan STEP 89. Laporan STEP 84C yang lebih lama mencatat baseline berbeda; karena itu perbandingan yang dipakai di sini adalah snapshot pra-audit yang tertulis di laporan STEP 89, bukan menganggap kondisi STEP 84C sebagai baseline langsung.

## 4. Audit `scripts/cleanup-test-fixtures.mjs`

Skrip tersebut **benar-benar berisi operasi DELETE database**. Secara statis, bila dijalankan:

1. Mencari user `student.demo@ghs.local`; bila ditemukan, melepas relasi `Student.userId` (nilai menjadi `null`) lalu menghapus record **User** dengan email tersebut.
2. Mencari user `admin.demo@ghs.local`; bila ditemukan, mengubah `AuditLog.userId` terkait menjadi `null`, lalu menghapus record **User** tersebut.
3. Tidak ada operasi penghapusan terhadap model Student, Enrollment, Batch, Employer, Vacancy, Placement, atau Document di skrip ini. Penghapusan user dilakukan bersyarat jika email ditemukan.

Skrip **tidak dijalankan** dalam STEP 89B. Database saat ini hanya memiliki user `muhamadrivqi83@gmail.com`; dua email fixture tersebut tidak ada di hasil query Users, sehingga skrip tidak menjadi bagian dari verifikasi dan tidak perlu dijalankan.

## 5. Bukti operasi DELETE selama STEP 89

- Dalam sesi STEP 89B ini, tidak ada skrip cleanup/test yang dijalankan dan tidak ada operasi mutasi database.
- `AuditLog` saat ini berisi 805 record dan tidak memiliki action `DELETE`.
- Laporan STEP 89 menyatakan tidak ada mutasi data selama audit.
- Tidak tersedia execution log independen atau log database historis yang membuktikan seluruh perintah selama STEP 89. Karena `AuditLog` aplikasi saja tidak dapat membuktikan ketiadaan semua operasi database, kesimpulan “tidak ada DELETE selama STEP 89” tidak dapat diverifikasi secara absolut. Bukti yang tersedia tidak menunjukkan adanya DELETE, dan data residual yang diperiksa masih utuh.

## 6. Validasi yang dijalankan

| Perintah | Hasil |
|---|---|
| `npx prisma validate` | PASS — schema valid |
| `npx prisma migrate status` | PASS — 4 migrations ditemukan; database up to date |
| `npx tsc --noEmit` | PASS — exit code 0 |
| `npm run lint` | PASS — exit code 0 |
| `npm run build` | PASS — build selesai, 57 halaman statis dibuat |

Semua pemeriksaan database menggunakan target lokal `ghs_integrated` di `localhost:5432`. Validasi tidak menjalankan migrasi atau perubahan data.

## Kesimpulan

Data residual STEP 89 yang diminta **masih ada** dan hitungan saat ini cocok dengan snapshot pra-audit STEP 89. Tidak ada recovery/restore yang diperlukan atau dijalankan. Tidak ada perubahan schema/migration atau operasi DELETE yang dilakukan dalam STEP 89B.

Status tetap **`PASS_WITH_WARNING`** karena working tree memiliki perubahan di luar STEP 89 dan riwayat eksekusi STEP 89 tidak tersedia untuk membuktikan secara independen bahwa tidak ada operasi DELETE lain yang pernah dijalankan. Tidak ada tindakan implementasi Phase 1, commit, push, atau deploy yang dilakukan.
