# Panduan Pengaturan Database Supabase untuk SBBL

Dokumen ini memandu pemasangan skema database, autentikasi Google, dan fungsi RPC untuk **Sistem Berbagi Balik Layar (SBBL)**.

---

## 1. Buat Project Baru di Supabase
1. Masuk ke [Supabase Dashboard](https://supabase.com/dashboard).
2. Klik **New Project**, tentukan nama (misal: `sbbl-cash-management`) dan password database yang kuat.
3. Pilih Region terdekat (misal: `Singapore (ap-southeast-1)`).

---

## 2. Eksekusi Skema SQL
1. Buka menu **SQL Editor** di sidebar Supabase.
2. Salin seluruh isi file [`supabase/schema.sql`](./schema.sql).
3. Tempelkan ke SQL Editor, lalu klik tombol **Run**.
4. Skema akan membuat:
   - Tabel: `profiles`, `categories`, `transactions`, `system_settings`, `audit_logs`, `notifications`, `scheduled_jobs`, `delivery_logs`.
   - Kebijakan keamanan **Row Level Security (RLS)** untuk seluruh tabel.
   - Fungsi RPC berkeamanan tinggi:
     - `create_transaction`: Pencatatan transaksi dengan verifikasi role & validasi tipe kategori.
     - `void_transaction`: Pembatalan lunak transaksi & jejak audit.
     - `mark_my_notifications_read`: Menandai notifikasi telah dibaca oleh pemilik akun.
     - `broadcast_announcement`: Mengirim pengumuman ke seluruh anggota approved.
     - `update_member_role`: Membatasi maksimal 1 Super Admin + 4 Admin (Total 5 pengelola).
     - `update_member_status`: Menyetujui, menolak, atau menangguhkan akun dengan alasan wajib.
     - `trigger_weekly_contribution_reminder`: Menjalankan cron pengingat iuran mingguan Rp10.000 dengan kunci idempotensi.
   - Trigger otomatis `handle_new_user()` saat pengguna baru login pertama kali.
   - Data awal (kategori standar kas & saldo awal).

---

## 3. Konfigurasi Google OAuth di Supabase Auth
1. Buka menu **Authentication** > **Providers** > **Google**.
2. Aktifkan toggle **Enable Google provider**.
3. Buat OAuth Client ID di [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
   - Tambahkan **Authorized redirect URIs**:
     `https://<project-ref>.supabase.co/auth/v1/callback`
4. Masukkan **Client ID** dan **Client Secret** ke Supabase.
5. Klik **Save**.

---

## 4. Konfigurasi pg_cron untuk Pengingat Iuran Mingguan
Untuk mengaktifkan pengingat otomatis setiap **Kamis pukul 09:00 WITA (01:00 UTC)**:
1. Di Supabase Dashboard, buka **Database** > **Extensions**, aktifkan `pg_cron`.
2. Buka **SQL Editor** dan jalankan query berikut:

```sql
-- Jadwalkan cron setiap Kamis pukul 01:00 UTC (09:00 WITA)
SELECT cron.schedule(
    'sbbl_weekly_contribution_reminder',
    '0 1 * * 4',
    $$ SELECT trigger_weekly_contribution_reminder(); $$
);
```

---

## 5. Hubungkan ke Aplikasi SBBL
1. Dapatkan **Project URL** dan **Anon/Public Key** dari menu **Project Settings** > **API**.
2. Di website SBBL, buka menu **Settings (Pengaturan)** > **Konfigurasi Supabase**.
3. Masukkan Project URL dan Anon Key, lalu simpan.
4. Aplikasi akan otomatis beralih ke mode Live Supabase.
