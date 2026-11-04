// ==============================================================================
// SISTEM BERBAGI BALIK LAYAR (SBBL) - CONFIGURATION & CONSTANTS
// Clean Production Version (No Dummy Data, No Simulation)
// ==============================================================================

export const APP_CONFIG = {
  APP_NAME: 'Sistem Berbagi Balik Layar',
  APP_SHORT_NAME: 'SBBL',
  APP_VERSION: '1.0.0',
  CURRENCY: 'IDR',
  TIMEZONE: 'Asia/Makassar', // WITA as required in PRD
  WEEKLY_CONTRIBUTION_AMOUNT: 10000,
  WEEKLY_CONTRIBUTION_DAY: 'Kamis',
  WEEKLY_CONTRIBUTION_TIME: '09:00 WITA',
  MAX_ADMINS: 4, // 1 Super Admin + 4 Admin = 5 total managers
  MAX_SUPER_ADMINS: 1,
  OPENING_BALANCE_DEFAULT: 0
};

// Storage Keys
export const STORAGE_KEYS = {
  SUPABASE_URL: 'sbbl_supabase_url',
  SUPABASE_ANON_KEY: 'sbbl_supabase_anon_key',
  AUTH_USER: 'sbbl_auth_user',
  THEME: 'sbbl_theme_preference'
};

// Official default categories (matching PRD & schema.sql)
export const INITIAL_CATEGORIES = [
  { id: 'cat-1', name: 'Iuran Mingguan Anggota', type: 'income', is_active: true },
  { id: 'cat-2', name: 'Donasi & Sumbangan', type: 'income', is_active: true },
  { id: 'cat-3', name: 'Bunga Kas & Bagi Hasil', type: 'income', is_active: true },
  { id: 'cat-4', name: 'Pemasukan Lainnya', type: 'income', is_active: true },
  { id: 'cat-5', name: 'Konsumsi Kegiatan', type: 'expense', is_active: true },
  { id: 'cat-6', name: 'Alat Tulis Kantor & Cetak', type: 'expense', is_active: true },
  { id: 'cat-7', name: 'Operasional & Transportasi', type: 'expense', is_active: true },
  { id: 'cat-8', name: 'Bantuan Sosial Anggota', type: 'expense', is_active: true },
  { id: 'cat-9', name: 'Biaya Administrasi & Bank', type: 'expense', is_active: true },
  { id: 'cat-10', name: 'Pengeluaran Lainnya', type: 'expense', is_active: true }
];

// Clean Production Data (Populated dynamically via Supabase)
export const INITIAL_MEMBERS = [];
export const INITIAL_TRANSACTIONS = [];
export const INITIAL_NOTIFICATIONS = [];
export const INITIAL_AUDIT_LOGS = [];
export const INITIAL_DELIVERY_LOGS = [];
