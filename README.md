# SISTEM BERBAGI BALIK LAYAR (SBBL)

**Web-Based Cash Management System**

SISTEM BERBAGI BALIK LAYAR (SBBL) adalah aplikasi web modern bergaya fintech untuk mengelola kas bersama secara terpusat, transparan, dan akuntabel. Aplikasi ini dirancang sesuai dengan spesifikasi dokumen kebutuhan produk (**PRD SBBL v1.0**).

---

## 🌟 Fitur Utama Sesuai PRD

### 1. Dashboard Keuangan Terpusat (FR-03)
- **Ringkasan Saldo**: Perhitungan otomatis sesuai rumus resmi:
  $$\text{Saldo} = \text{Saldo Awal} + \text{Total Pemasukan Aktif} - \text{Total Pengeluaran Aktif}$$
- **Metrik Bulanan**: Pemasukan bulan berjalan, pengeluaran bulan berjalan, dan jumlah transaksi.
- **Grafik Tren 6 Bulan**: Visualisasi perbandingan pemasukan vs pengeluaran 6 bulan terakhir.
- **Tabel Transaksi Terbaru**: Menampilkan 6 transaksi terakhir dengan status, badge kategori, dan format Rupiah.
- **Widget Rekening Kas**: Menampilkan rekening resmi kas bersama (BCA, Mandiri, QRIS).

### 2. Transaksi & Soft-Delete / Void (FR-04, FR-05)
- **Pencatatan Transaksi**: Formulir modal pencatatan kas (Pemasukan / Pengeluaran) dengan verifikasi kategori yang sesuai jenis transaksi.
- **Pencarian & Multi-Filter**: Filter berdasarkan pencarian deskripsi / counterparty, jenis transaksi (income/expense), bulan, dan kategori.
- **Pembatalan Lunak (Void)**: Transaksi tidak dihapus permanen melainkan di-void dengan **alasan wajib**, sehingga tidak merusak jejak audit dan langsung mengurangi perhitungan saldo.
- **Validasi Otorisasi**: Hanya akun dengan peran **Admin** atau **Super Admin** berstatus `approved` yang dapat mencatat atau membatalkan transaksi.

### 3. Laporan Kas & Ekspor (FR-06)
- **Pemilihan Periode**: Filter bulan dan tahun laporan.
- **Perhitungan Periode Akurat**:
  - Saldo Awal Periode (Saldo awal sistem + transaksi aktif sebelum periode ini).
  - Total Pemasukan & Pengeluaran Periode.
  - Saldo Akhir Periode & Net Cash Flow.
- **Rincian per Kategori**: Ringkasan pos pemasukan dan pengeluaran per kategori.
- **Ekspor CSV**: Mengunduh rekap transaksi bulanan dalam format CSV berstandar RFC4180.
- **Cetak Laporan / PDF**: Format cetak khusus via `@media print` lengkap dengan kop laporan resmi SBBL, tanggal cetak WITA, dan kolom tanda tangan (Bendahara & Super Admin).

### 4. Pengelolaan Anggota & Hak Akses (FR-07)
- **4 Status Akun**:
  - `approved`: Akses penuh ke dashboard.
  - `pending`: Layar menunggu verifikasi pengelola kas.
  - `suspended`: Layar penonaktifan akun dengan alasan wajib yang dicatat pengelola.
  - `rejected`: Layar pendaftaran ditolak.
- **3 Tingkat Peran**:
  - **Super Admin**: Penguasa tertinggi sistem (1 akun).
  - **Admin**: Pengelola kas operasional (maksimal 4 akun, total 5 pengelola).
  - **Member (Anggota)**: Akses *read-only* terhadap data kas dan laporan.
- **Aksi Pengelola**: Approve, Reject, Suspend (wajib alasan), Re-activate, Promote to Admin, dan Demote to Member.

### 5. Manajemen Kategori Kas (FR-08)
- Pengelompokan kategori pemasukan dan pengeluaran.
- Penambahan kategori baru.
- Toggle status aktif / non-aktif (kategori non-aktif dicegah untuk transaksi baru tanpa merusak data historis).

### 6. Jejak Audit (Audit Log) (FR-09)
- Pencatatan aktivitas penting pengelolaan kas: pembuatan transaksi, pembatalan (void), perubahan status/role anggota, pengumuman, dan perubahan saldo awal.
- Informasi jejak: Waktu (WITA), email aktor, jenis tindakan (*action*), entitas yang dipengaruhi, dan rincian data (*details*).

### 7. Notifikasi Internal SBBL & Pengumuman (FR-10, FR-12)
- **Lonceng Notifikasi**: Dilengkapi badge indikator jumlah pesan belum dibaca.
- **Drawer Notifikasi**: Menampilkan judul, isi pesan, jenis (pengumuman, pengingat iuran, pembayaran), waktu, dan status baca.
- **Tandai Semua Dibaca**: Memperbarui status baca via RPC `mark_my_notifications_read`.
- **Broadcast Pengumuman**: Admin dapat menyiarkan pengumuman ke seluruh anggota berstatus `approved`.

### 8. Penjadwalan & Pengingat Iuran Mingguan (FR-11)
- **Aturan Iuran Kas**: Rp 10.000 per anggota per minggu.
- **Jadwal**: Setiap Kamis, pukul 09.00 WITA (`Asia/Makassar`).
- **Idempotensi & Eksekusi**: Perlindungan kunci idempotensi (`weekly-reminder-YYYY-WW`) untuk mencegah duplikasi notifikasi.
- **Delivery Logs**: Riwayat eksekusi penjadwalan tersimpan lengkap dengan jumlah penerima dan status.

### 9. Pengaturan & Konektivitas
- **Saldo Awal Pembukuan (Opening Balance)**: Pengaturan saldo awal dengan hak akses eksklusif Super Admin.
- **Koneksi Supabase (Production)**: Terintegrasi langsung dengan Supabase PostgreSQL & RLS (Row Level Security).
- **Dark / Light Mode**: Penggantian tema tampilan secara instan.
- **Jam Live WITA**: Tampilan waktu real-time zona waktu `Asia/Makassar` di header.

---

## 📁 Struktur Direktori

```
sbbl-cash-management/
├── index.html              # Single Page Application & Anti-flicker splash
├── vercel.json             # Konfigurasi deployment Vercel
├── README.md               # Dokumentasi proyek
├── css/
│   └── style.css           # Design system fintech, navy sidebar, dark mode, print stylesheet
├── js/
│   ├── config.js           # Konfigurasi, konstanta, data seed awal
│   ├── state.js            # State management reaktif & rumus saldo kas
│   ├── supabase.js         # Adapter database Supabase & RPC handler
│   ├── ui.js               # Modal, toast alert, jam WITA, notification drawer
│   └── app.js              # Router navigasi, renderers view, event controller
└── supabase/
    ├── schema.sql          # Skema PostgreSQL lengkap, RLS policy, triggers & RPC
    └── README.md           # Panduan pemasangan database di Supabase
```

---

## 🚀 Menjalankan Secara Lokal

Aplikasi dibangun dengan standar web modern tanpa memerlukan proses *build* yang rumit.

### Opsi A: Menggunakan Python (Sangat Cepat)
```bash
cd sbbl-cash-management
python3 -m http.server 3000
```
Buka browser di: [http://localhost:3000](http://localhost:3000)

### Opsi B: Menggunakan Node.js / npx serve
```bash
cd sbbl-cash-management
npx serve .
```

---

## 🌐 Deployment ke Vercel

SBBL telah dilengkapi dengan `vercel.json` dan struktur statis yang siap dideploy langsung ke Vercel:

1. Push repository ke GitHub.
2. Buka [Vercel Dashboard](https://vercel.com/) dan klik **Add New Project**.
3. Hubungkan repository GitHub SBBL.
4. Pada **Framework Preset**, pilih **Other** (atau biarkan default).
5. Klik **Deploy**.
6. Website SBBL langsung aktif dan berstatus *Ready*.

---

## 🗄️ Menghubungkan ke Supabase (Database Live)

1. Buka Supabase Dashboard dan buat project baru.
2. Masuk ke **SQL Editor** di Supabase, jalankan skrip [`supabase/schema.sql`](./supabase/schema.sql).
3. Buka **Settings** > **API** di Supabase untuk menyalin **Project URL** dan **Anon/Public Key**.
4. Isi URL & Key di [`js/supabase-config.js`](./js/supabase-config.js) atau melalui modal setup di layar masuk website.
5. Panduan lengkap deploy ke GitHub & Vercel tersedia di [`DEPLOYMENT.md`](./DEPLOYMENT.md).

---

## 👥 Alur Hak Akses Akun (Google OAuth)

1. **Pendaftar Pertama (Super Admin)**: Akun Google pertama yang berhasil login otomatis berstatus `approved` dengan role `super_admin`.
2. **Pendaftar Berikutnya (Anggota Kas)**: Akun Google berikutnya otomatis terdaftar dengan role `member` dan status `pending` (menunggu persetujuan Admin/Super Admin sebelum dapat melihat data kas).
3. **Admin / Bendahara**: Ditunjuk langsung oleh Super Admin melalui menu **Pengelolaan Anggota**.

---

**SISTEM BERBAGI BALIK LAYAR (SBBL) v1.0** — Dibuat untuk transparansi dan tata kelola kas bersama yang terpercaya.
