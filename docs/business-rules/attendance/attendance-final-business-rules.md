# GHS Attendance Final Business Rules & Re-Gate

## Status Dokumen

- Module: Attendance
- Step: 56
- Status: PARTIALLY FINALIZED
- Source:
  - GHS Peraturan Disiplin dan Tata Tertib Mahasiswa
  - Attendance Validation Sheet
  - Attendance Business Rules
  - GHS Validation Resolution
- Implementation Status: BLOCKED

---

# 1. Tujuan

Dokumen ini merupakan konsolidasi business rule Attendance setelah
ditemukan dokumen resmi GHS tentang Peraturan Disiplin dan Tata Tertib
Mahasiswa.

Dokumen ini membedakan:

- aturan yang sudah memiliki dasar resmi GHS,
- aturan teknis yang sudah tersedia,
- aturan yang masih membutuhkan keputusan sistem/GHS.

Tidak ada business rule yang boleh dianggap final apabila sumber belum
mendukungnya.

---

# 2. Sumber Utama

Sumber utama untuk aturan mahasiswa adalah:

**Peraturan Disiplin dan Tata Tertib Mahasiswa (PDTTM)
Global Hospitality Sukabumi (GHS)**

Dokumen tersebut mengatur kewajiban mahasiswa dalam mengikuti kegiatan
pendidikan dan pelatihan, izin, sakit, keterlambatan, ketidakhadiran,
serta konsekuensi pelanggaran.

---

# 3. Student Participation

## Rule

Mahasiswa wajib mengikuti seluruh kegiatan pendidikan dan pelatihan.

Kegiatan mencakup:

- teori,
- praktik terstruktur,
- kunjungan,
- studi langsung,
- Praktik Kerja Nyata/Magang/OJT/Internship.

Status:

> CONFIRMED

---

# 4. Attendance Categories from GHS

PDTTM membedakan ketidakhadiran menjadi:

1. Sakit
2. Izin
3. Tidak hadir tanpa alasan / Alpha

Status:

> CONFIRMED

Ketiga kategori tersebut juga dihitung secara terpisah dalam
perhitungan ketidakhadiran.

Status:

> CONFIRMED

---

# 5. Current Database Status Model

Database saat ini memiliki:

```text
PRESENT
LATE
EXCUSED
ABSENT