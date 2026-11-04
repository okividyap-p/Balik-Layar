# PANDUAN DEPLOYMENT PUBLIK SBBL
## (Supabase + Google OAuth + GitHub + Vercel)

Panduan ini berisi langkah-langkah praktis agar website **Sistem Berbagi Balik Layar (SBBL)** dapat diakses secara publik oleh seluruh anggota melalui **iPhone**, **Android**, dan **semua Laptop**.

---

## 📋 Ikhtisar Alur Kerja

```
[ Pengguna di iPhone / Android / Laptop ]
                   │
                   ▼
     [ Vercel Hosting (Akses Publik) ]
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
[ Supabase Auth (Google) ]  [ PostgreSQL Database (RLS) ]
```

---

## LANGKAH 1: Siapkan Supabase Database & Realtime

1. Masuk ke [Supabase Dashboard](https://supabase.com/dashboard) dan buat proyek baru (misalnya: `sbbl-cash`).
2. Setelah proyek siap, buka menu **SQL Editor** di sidebar kiri.
3. Buka file [`supabase/schema.sql`](./supabase/schema.sql) dari proyek ini, salin seluruh kodenya, tempelkan di SQL Editor Supabase, lalu klik **Run**.
4. Skrip ini otomatis:
   - Membuat seluruh tabel (`profiles`, `transactions`, `categories`, `notifications`, `audit_logs`, dll).
   - Memasang sistem keamanan **Row Level Security (RLS)** anti-bocor.
   - Mengaktifkan trigger: **Akun Google pertama yang login otomatis menjadi SUPER ADMIN (`approved`)**, sedangkan akun berikutnya menjadi anggota biasa berstatus `pending` (menunggu persetujuan Super Admin).
   - Mengaktifkan **Supabase Realtime** sehingga setiap ada transaksi baru, saldo di iPhone/Android/Laptop seluruh anggota ter-update otomatis secara langsung!

---

## LANGKAH 2: Konfigurasi Login Google di Supabase & Google Cloud

### A. Di Google Cloud Console:
1. Buka [Google Cloud Console - Credentials](https://console.cloud.google.com/apis/credentials).
2. Buat proyek baru atau pilih proyek yang ada.
3. Konfigurasikan **OAuth Consent Screen** (User Type: External, isi nama aplikasi: `SBBL Kas`).
4. Masuk ke **Credentials** > klik **Create Credentials** > pilih **OAuth client ID**.
5. Pilih Application Type: **Web application**.
6. Pada bagian **Authorized redirect URIs**, tambahkan:
   ```
   https://<PROJECT-REF-ANDA>.supabase.co/auth/v1/callback
   ```
   *(Ganti `<PROJECT-REF-ANDA>` dengan ID proyek Supabase Anda).*
7. Klik **Create**, lalu salin **Client ID** dan **Client Secret**.

### B. Di Supabase:
1. Buka menu **Authentication** > **Providers** > klik **Google**.
2. Aktifkan toggle **Enable Google provider**.
3. Masukkan **Client ID** dan **Client Secret** dari Google Cloud.
4. Klik **Save**.
5. Masuk ke **Authentication** > **URL Configuration**:
   - Masukkan **Site URL**: URL Vercel Anda nanti (atau `http://localhost:3000` untuk uji lokal).
   - Di bagian **Redirect URLs**, tambahkan:
     - `http://localhost:3000/**`
     - `https://*.vercel.app/**`

---

## LANGKAH 3: Hubungkan URL & Kunci Supabase ke Proyek

Buka file [`js/supabase-config.js`](./js/supabase-config.js), lalu masukkan URL dan Anon Key Supabase Anda:

```javascript
export const SUPABASE_CONFIG = {
  URL: 'https://xxxxxxxxxxxxxxxxxxxx.supabase.co',
  ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
};
```
> **Catatan Keamanan:** Supabase `anon` / public key aman dipublikasikan di frontend karena seluruh data dilindungi oleh aturan otorisasi server-side Row Level Security (RLS) di database.

---

## LANGKAH 4: Upload ke GitHub

Buka terminal di folder proyek (`~/Downloads/sbbl-cash-management`):

```bash
cd ~/Downloads/sbbl-cash-management

# 1. Inisialisasi Git
git init

# 2. Tambahkan semua file
git add .

# 3. Buat commit pertama
git commit -m "feat: Sistem Berbagi Balik Layar (SBBL) final production"

# 4. Ganti branch utama menjadi main
git branch -M main

# 5. Hubungkan ke repository GitHub Anda (ganti URL repository Anda)
git remote add origin https://github.com/USERNAME-ANDA/NAMA-REPO-ANDA.git

# 6. Push kode ke GitHub
git push -u origin main
```

---

## LANGKAH 5: Publikasikan ke Vercel (1 Menit)

1. Buka [Vercel Dashboard](https://vercel.com/) dan login (bisa login menggunakan akun GitHub).
2. Klik tombol **Add New...** > pilih **Project**.
3. Cari repository GitHub SBBL yang baru Anda push, lalu klik **Import**.
4. Biarkan konfigurasi default (Vercel otomatis membaca file [`vercel.json`](./vercel.json)).
5. Klik tombol **Deploy**.
6. Selesai! Dalam ~30 detik, Anda akan mendapatkan URL publik resmi, contoh:
   ```
   https://sbbl-cash-management.vercel.app
   ```

---

## LANGKAH 6: Buka di iPhone, Android, dan Laptop!

1. Buka link Vercel tersebut di browser:
   - **Di Laptop (Mac / Windows)**: Layar akan tampil penuh (*fullscreen*) otomatis, responsif, dan rapi dari ujung ke ujung.
   - **Di iPhone (Safari / Chrome)**: Tampilan otomatis menyesuaikan layar ponsel (*mobile-friendly*), tanpa bug zoom, dan laci navigasi dapat dibuka/tutup dengan sentuhan.
   - **Di Android**: Tampilan responsif cepat dan ringan.
2. Klik **Masuk dengan Google**:
   - **Login Pertama (Anda)**: Otomatis menjadi **Super Admin** (`approved`) dengan kewenangan penuh!
   - **Login Orang Lain**: Otomatis masuk sebagai anggota biasa dengan status `pending`. Anda (sebagai Super Admin) dapat menyetujui akun mereka dari menu **Members** dengan satu klik.

Semua data kas, transaksi, dan notifikasi kini tersinkronisasi secara langsung di Cloud!
