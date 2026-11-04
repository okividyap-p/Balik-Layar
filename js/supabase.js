// ==============================================================================
// SISTEM BERBAGI BALIK LAYAR (SBBL) - PRODUCTION SUPABASE ADAPTER
// Handles Google OAuth, PostgreSQL RLS, RPC, and Realtime Subscriptions
// ==============================================================================

import { SUPABASE_CONFIG } from './supabase-config.js';
import { STORAGE_KEYS, APP_CONFIG } from './config.js';
import { state } from './state.js';

class SupabaseAdapter {
  constructor() {
    this.client = null;
    this.realtimeChannel = null;
    this.loadCredentials();
  }

  loadCredentials() {
    // Priority: 1. Code SUPABASE_CONFIG -> 2. LocalStorage
    this.url = (SUPABASE_CONFIG.URL || localStorage.getItem(STORAGE_KEYS.SUPABASE_URL) || '').trim();
    this.anonKey = (SUPABASE_CONFIG.ANON_KEY || localStorage.getItem(STORAGE_KEYS.SUPABASE_ANON_KEY) || '').trim();
    this.useLive = !!(this.url && this.anonKey);

    if (this.useLive && window.supabase) {
      try {
        this.client = window.supabase.createClient(this.url, this.anonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        });
      } catch (err) {
        console.error('Failed to initialize Supabase client:', err);
        this.client = null;
      }
    }
  }

  isLiveMode() {
    return !!(this.client && this.url && this.anonKey);
  }

  setLiveConfig(url, key, enableLive) {
    this.url = url.trim();
    this.anonKey = key.trim();
    this.useLive = !!enableLive;

    localStorage.setItem(STORAGE_KEYS.SUPABASE_URL, this.url);
    localStorage.setItem(STORAGE_KEYS.SUPABASE_ANON_KEY, this.anonKey);
    localStorage.setItem(STORAGE_KEYS.USE_LIVE_SUPABASE, this.useLive ? 'true' : 'false');

    if (this.url && this.anonKey && window.supabase) {
      this.client = window.supabase.createClient(this.url, this.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    } else {
      this.client = null;
    }
  }

  // ============================================================================
  // GOOGLE OAUTH AUTHENTICATION (FR-01)
  // ============================================================================
  async signInWithGoogle() {
    if (!this.isLiveMode()) {
      throw new Error('Supabase URL dan Anon Key belum dikonfigurasi. Silakan isi konfigurasi terlebih dahulu.');
    }

    const { error } = await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname
      }
    });

    if (error) throw error;
  }

  async signOut() {
    if (this.client) {
      await this.client.auth.signOut();
    }
    state.currentUser = null;
    state.saveState();
  }

  // Session recovery & listener
  async initAuthListener(onUserResolved) {
    if (!this.isLiveMode()) {
      // Offline/Demo initial load
      onUserResolved(state.currentUser);
      return;
    }

    // Check existing live session
    const { data: { session } } = await this.client.auth.getSession();
    if (session?.user) {
      await this.syncUserData(session.user);
    }

    onUserResolved(state.currentUser);

    // Listen for auth state changes (OAuth callback, token refresh, signout)
    this.client.auth.onAuthStateChange(async (event, currentSession) => {
      if (event === 'SIGNED_IN' && currentSession?.user) {
        await this.syncUserData(currentSession.user);
        await this.syncAllData();
        this.setupRealtimeListeners();
        state.notify();
      } else if (event === 'SIGNED_OUT') {
        state.currentUser = null;
        state.saveState();
        state.notify();
      }
    });

    // If already signed in, sync all data and realtime
    if (session?.user) {
      await this.syncAllData();
      this.setupRealtimeListeners();
    }
  }

  // Sync user profile from Supabase
  async syncUserData(authUser) {
    try {
      // 1. Fetch profile
      let { data: profile, error } = await this.client
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();

      // 2. If profile not yet created by trigger, upsert it now
      if (!profile || error) {
        // Check if this is the first profile in system
        const { count } = await this.client
          .from('profiles')
          .select('*', { count: 'exact', head: true });

        const isFirst = count === 0;
        const meta = authUser.user_metadata || {};
        const fullName = meta.full_name || meta.name || authUser.email.split('@')[0];
        const avatarUrl = meta.avatar_url || meta.picture || '';

        const newProfile = {
          id: authUser.id,
          full_name: fullName,
          email: authUser.email,
          avatar_url: avatarUrl,
          role: isFirst ? 'super_admin' : 'member',
          status: isFirst ? 'approved' : 'pending'
        };

        const { data: created } = await this.client
          .from('profiles')
          .upsert(newProfile)
          .select()
          .single();

        profile = created || newProfile;
      }

      state.currentUser = profile;
      state.saveState();
    } catch (err) {
      console.error('Error syncing user profile:', err);
    }
  }

  // Sync all live database records into state
  async syncAllData() {
    if (!this.isLiveMode() || !state.currentUser || state.currentUser.status !== 'approved') return;

    try {
      // Transactions
      const { data: txs } = await this.client
        .from('transactions')
        .select('*')
        .order('transaction_date', { ascending: false });
      if (txs) state.transactions = txs;

      // Categories
      const { data: cats } = await this.client
        .from('categories')
        .select('*')
        .order('name');
      if (cats) state.categories = cats;

      // Settings
      const { data: settingsList } = await this.client
        .from('system_settings')
        .select('*');
      if (settingsList) {
        settingsList.forEach(item => {
          if (item.key === 'opening_balance' && item.value?.amount !== undefined) {
            state.settings.opening_balance = item.value.amount;
          }
          if (item.key === 'bank_accounts' && Array.isArray(item.value)) {
            state.settings.bank_accounts = item.value;
          }
        });
      }

      // Profiles / Members
      const { data: profiles } = await this.client
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: true });
      if (profiles) state.members = profiles;

      // Notifications (RLS limits to current user)
      const { data: notifs } = await this.client
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false });
      if (notifs) state.notifications = notifs;

      // Audit Logs (Admins only)
      if (['super_admin', 'admin'].includes(state.currentUser.role)) {
        const { data: audits } = await this.client
          .from('audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);
        if (audits) state.auditLogs = audits;

        const { data: delLogs } = await this.client
          .from('delivery_logs')
          .select('*')
          .order('executed_at', { ascending: false })
          .limit(50);
        if (delLogs) state.deliveryLogs = delLogs;
      }

      state.saveState();
      state.notify();
    } catch (err) {
      console.warn('Sync failed:', err);
    }
  }

  // Setup Supabase Realtime Channels for Live Collaboration
  setupRealtimeListeners() {
    if (!this.isLiveMode() || this.realtimeChannel) return;

    this.realtimeChannel = this.client
      .channel('public:live-cash')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, async () => {
        const { data: txs } = await this.client.from('transactions').select('*').order('transaction_date', { ascending: false });
        if (txs) {
          state.transactions = txs;
          state.notify();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, async () => {
        const { data: notifs } = await this.client.from('notifications').select('*').order('created_at', { ascending: false });
        if (notifs) {
          state.notifications = notifs;
          state.notify();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, async () => {
        const { data: profiles } = await this.client.from('profiles').select('*').order('created_at', { ascending: true });
        if (profiles) {
          state.members = profiles;
          // Refresh current user if updated
          const updatedSelf = profiles.find(p => p.id === state.currentUser?.id);
          if (updatedSelf) state.currentUser = updatedSelf;
          state.notify();
        }
      })
      .subscribe();
  }

  // ============================================================================
  // RPC: CREATE TRANSACTION (FR-04)
  // ============================================================================
  async createTransaction(payload) {
    const user = state.currentUser;
    if (!user || user.status !== 'approved') {
      throw new Error('Akses ditolak: Akun belum terverifikasi atau tidak memiliki izin.');
    }
    if (!['super_admin', 'admin'].includes(user.role)) {
      throw new Error('Akses ditolak: Hanya pengelola yang dapat mencatat transaksi.');
    }

    const amount = Number(payload.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Nominal transaksi harus berupa bilangan positif.');
    }

    // Live mode RPC execution
    if (this.isLiveMode()) {
      const { data, error } = await this.client.rpc('create_transaction', {
        p_date: payload.transaction_date,
        p_description: payload.description,
        p_counterparty: payload.counterparty,
        p_category_id: payload.category_id,
        p_type: payload.type,
        p_amount: amount,
        p_payment_method: payload.payment_method || 'Transfer Bank',
        p_notes: payload.notes || null,
        p_receipt_url: payload.receipt_url || null
      });

      if (error) throw error;
      await this.syncAllData();
      return data || { success: true, message: 'Transaksi berhasil dicatat.' };
    }

    // Local / Simulation fallback
    const newTx = {
      id: `tx-${Date.now()}`,
      transaction_date: payload.transaction_date,
      description: payload.description,
      counterparty: payload.counterparty,
      category_id: payload.category_id,
      type: payload.type,
      amount,
      payment_method: payload.payment_method || 'Transfer Bank',
      notes: payload.notes || '',
      receipt_url: payload.receipt_url || '',
      recorded_by: user.id,
      status: 'active',
      void_reason: null,
      created_at: new Date().toISOString()
    };

    state.transactions.unshift(newTx);
    state.logAudit('CREATE_TRANSACTION', 'transactions', {
      transaction_id: newTx.id,
      type: newTx.type,
      amount: newTx.amount,
      description: newTx.description
    });

    state.notify();
    return { success: true, message: 'Transaksi berhasil dicatat ke dalam kas bersama.' };
  }

  // ============================================================================
  // RPC: VOID TRANSACTION (FR-04)
  // ============================================================================
  async voidTransaction(transactionId, reason) {
    if (!reason || !reason.trim()) {
      throw new Error('Alasan pembatalan transaksi wajib diisi.');
    }

    if (this.isLiveMode()) {
      const { data, error } = await this.client.rpc('void_transaction', {
        p_transaction_id: transactionId,
        p_reason: reason.trim()
      });

      if (error) throw error;
      await this.syncAllData();
      return data || { success: true, message: 'Transaksi berhasil dibatalkan (void).' };
    }

    // Local simulation fallback
    const tx = state.transactions.find(t => t.id === transactionId);
    if (!tx) throw new Error('Transaksi tidak ditemukan.');
    if (tx.status === 'void') throw new Error('Transaksi ini sudah dibatalkan.');

    tx.status = 'void';
    tx.void_reason = reason.trim();
    tx.updated_at = new Date().toISOString();

    state.logAudit('VOID_TRANSACTION', 'transactions', {
      transaction_id: transactionId,
      amount: tx.amount,
      reason: reason.trim()
    });

    state.notify();
    return { success: true, message: 'Transaksi berhasil dibatalkan (void).' };
  }

  // ============================================================================
  // RPC: BROADCAST ANNOUNCEMENT (FR-10, FR-12)
  // ============================================================================
  async broadcastAnnouncement(title, body) {
    if (!title?.trim() || !body?.trim()) {
      throw new Error('Judul dan isi pengumuman tidak boleh kosong.');
    }

    if (this.isLiveMode()) {
      const { data, error } = await this.client.rpc('broadcast_announcement', {
        p_title: title.trim(),
        p_body: body.trim()
      });

      if (error) throw error;
      await this.syncAllData();
      return data || { success: true, message: 'Pengumuman berhasil disiarkan.' };
    }

    // Local simulation
    const approved = state.members.filter(m => m.status === 'approved');
    const now = new Date().toISOString();

    approved.forEach(m => {
      state.notifications.unshift({
        id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        recipient_id: m.id,
        title: title.trim(),
        body: body.trim(),
        type: 'announcement',
        created_by: state.currentUser.id,
        read_at: null,
        created_at: now
      });
    });

    state.logAudit('BROADCAST_ANNOUNCEMENT', 'notifications', {
      title: title.trim(),
      recipients: approved.length
    });

    state.notify();
    return { success: true, message: `Pengumuman berhasil dikirim ke ${approved.length} anggota.` };
  }

  // ============================================================================
  // RPC: MARK MY NOTIFICATIONS READ (FR-10)
  // ============================================================================
  async markMyNotificationsRead() {
    if (this.isLiveMode()) {
      const { data, error } = await this.client.rpc('mark_my_notifications_read');
      if (error) throw error;
      await this.syncAllData();
      return data || { success: true };
    }

    const user = state.currentUser;
    if (!user) return { success: false };

    state.notifications.forEach(n => {
      if (n.recipient_id === user.id && !n.read_at) {
        n.read_at = new Date().toISOString();
      }
    });

    state.notify();
    return { success: true };
  }

  // ============================================================================
  // RPC: UPDATE MEMBER ROLE (FR-07 Strict 1 Super Admin + Max 4 Admins)
  // ============================================================================
  async updateMemberRole(targetMemberId, newRole) {
    if (this.isLiveMode()) {
      const { data, error } = await this.client.rpc('update_member_role', {
        p_target_member_id: targetMemberId,
        p_new_role: newRole
      });

      if (error) throw error;
      await this.syncAllData();
      return data || { success: true, message: 'Role berhasil diperbarui.' };
    }

    // Local validation
    const target = state.members.find(m => m.id === targetMemberId);
    if (!target) throw new Error('Anggota tidak ditemukan.');

    if (newRole === 'admin' && target.role !== 'admin') {
      const currentAdmins = state.members.filter(m => m.role === 'admin').length;
      if (currentAdmins >= APP_CONFIG.MAX_ADMINS) {
        throw new Error(`Batas kuota tercapai: Maksimal ${APP_CONFIG.MAX_ADMINS} Admin biasa (Total 5 Pengelola).`);
      }
    }

    target.role = newRole;
    state.logAudit('UPDATE_MEMBER_ROLE', 'profiles', { target_email: target.email, new_role: newRole });
    state.notify();
    return { success: true, message: `Role anggota ${target.full_name} berhasil diubah.` };
  }

  // ============================================================================
  // RPC: UPDATE MEMBER STATUS (FR-07)
  // ============================================================================
  async updateMemberStatus(targetMemberId, newStatus, reason = null) {
    if (newStatus === 'suspended' && (!reason || !reason.trim())) {
      throw new Error('Penonaktifan akun (suspend) wajib menyertakan alasan.');
    }

    if (this.isLiveMode()) {
      const { data, error } = await this.client.rpc('update_member_status', {
        p_target_member_id: targetMemberId,
        p_new_status: newStatus,
        p_reason: reason ? reason.trim() : null
      });

      if (error) throw error;
      await this.syncAllData();
      return data || { success: true, message: `Status berhasil diubah menjadi ${newStatus}.` };
    }

    const target = state.members.find(m => m.id === targetMemberId);
    if (!target) throw new Error('Anggota tidak ditemukan.');

    target.status = newStatus;
    target.suspension_reason = newStatus === 'suspended' ? reason.trim() : null;

    state.logAudit('UPDATE_MEMBER_STATUS', 'profiles', {
      target_email: target.email,
      new_status: newStatus,
      reason
    });

    state.notify();
    return { success: true, message: `Status ${target.full_name} diubah menjadi ${newStatus}.` };
  }

  // ============================================================================
  // RPC: TRIGGER WEEKLY REMINDER (FR-11 Cron Thursday 09:00 WITA)
  // ============================================================================
  async triggerWeeklyReminder() {
    if (this.isLiveMode()) {
      const { data, error } = await this.client.rpc('trigger_weekly_contribution_reminder');
      if (error) throw error;
      await this.syncAllData();
      return data || { success: true, message: 'Pengingat berhasil diproses.' };
    }

    // Local simulation
    const now = new Date();
    const weekYear = `${now.getFullYear()}-W${Math.ceil(now.getDate() / 7)}`;
    const idempotencyKey = `weekly-reminder-${weekYear}`;

    const alreadyRun = state.deliveryLogs.some(
      l => l.idempotency_key === idempotencyKey && l.status === 'success'
    );

    if (alreadyRun) {
      return {
        success: true,
        skipped: true,
        message: 'Pengingat iuran minggu ini sudah dikirimkan sebelumnya (Idempotent).'
      };
    }

    const approved = state.members.filter(m => m.status === 'approved');
    approved.forEach(m => {
      state.notifications.unshift({
        id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        recipient_id: m.id,
        title: 'Pengingat Iuran Kas Mingguan SBBL',
        body: 'Halo! Hari ini Kamis adalah jadwal iuran kas bersama SBBL sebesar Rp 10.000. Mohon transfer ke rekening kas atau serahkan kepada bendahara. Terima kasih!',
        type: 'contribution_reminder',
        created_by: null,
        read_at: null,
        created_at: new Date().toISOString()
      });
    });

    state.deliveryLogs.unshift({
      id: `del-${Date.now()}`,
      job_name: 'weekly_contribution_reminder',
      executed_at: new Date().toISOString(),
      status: 'success',
      recipients_count: approved.length,
      details: `Sukses mengirim pengingat ke ${approved.length} anggota approved.`,
      idempotency_key: idempotencyKey
    });

    state.notify();
    return { success: true, message: `Pengingat berhasil terkirim ke ${approved.length} anggota.` };
  }

  // ============================================================================
  // CATEGORIES & SETTINGS MANAGEMENT
  // ============================================================================
  async createCategory(name, type) {
    if (!name?.trim()) throw new Error('Nama kategori wajib diisi.');

    if (this.isLiveMode()) {
      const { data, error } = await this.client
        .from('categories')
        .insert([{ name: name.trim(), type, is_active: true }])
        .select()
        .single();

      if (error) throw error;
      await this.syncAllData();
      return { success: true, category: data };
    }

    const newCat = { id: `cat-${Date.now()}`, name: name.trim(), type, is_active: true };
    state.categories.push(newCat);
    state.logAudit('CREATE_CATEGORY', 'categories', { name: newCat.name, type: newCat.type });
    state.notify();
    return { success: true, category: newCat };
  }

  async toggleCategoryStatus(categoryId) {
    const cat = state.categories.find(c => c.id === categoryId);
    if (!cat) throw new Error('Kategori tidak ditemukan.');

    const newActive = !cat.is_active;

    if (this.isLiveMode()) {
      const { error } = await this.client
        .from('categories')
        .update({ is_active: newActive })
        .eq('id', categoryId);

      if (error) throw error;
      await this.syncAllData();
      return { success: true, is_active: newActive };
    }

    cat.is_active = newActive;
    state.logAudit('TOGGLE_CATEGORY', 'categories', { name: cat.name, is_active: newActive });
    state.notify();
    return { success: true, is_active: newActive };
  }

  async updateOpeningBalance(amount) {
    const num = Number(amount);
    if (isNaN(num) || num < 0) throw new Error('Saldo awal harus positif atau 0.');

    if (this.isLiveMode()) {
      const { error } = await this.client
        .from('system_settings')
        .upsert({
          key: 'opening_balance',
          value: { amount: num, currency: 'IDR' },
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      await this.syncAllData();
      return { success: true, message: 'Saldo awal berhasil diperbarui di Supabase.' };
    }

    state.settings.opening_balance = num;
    state.logAudit('UPDATE_SYSTEM_SETTINGS', 'system_settings', { key: 'opening_balance', amount: num });
    state.notify();
    return { success: true, message: 'Saldo awal berhasil diperbarui.' };
  }
}

export const supabaseAdapter = new SupabaseAdapter();
