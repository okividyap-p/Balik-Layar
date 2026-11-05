// ==============================================================================
// SISTEM BERBAGI BALIK LAYAR (SBBL) - MAIN CONTROLLER & APPLICATION LOGIC
// Clean Production Version: 100% Real Supabase Data, Responsive & Fullscreen
// ==============================================================================

import { APP_CONFIG, STORAGE_KEYS } from './config.js';
import { state, formatCurrency, formatDateWITA, formatDateShort } from './state.js';
import { supabaseAdapter } from './supabase.js';
import {
  showToast,
  openModal,
  closeModal,
  setupModalBackdrops,
  escapeHtml,
  initWITAClock,
  updateNotificationBadge
} from './ui.js';

class SBBLApp {
  constructor() {
    this.currentView = 'dashboard';
    this.txFilter = { search: '', type: 'all', month: '', category: 'all' };
    const now = new Date();
    this.reportFilter = {
      year: now.getFullYear(),
      month: now.getMonth() + 1
    };
    this.memberFilter = 'all';
    this.auditFilter = { search: '', entity: 'all' };
    this.pendingVoidTxId = null;
    this.pendingEditTxId = null;
    this.pendingSuspendMemberId = null;
  }

  async init() {
    document.body.classList.toggle('dark', state.theme === 'dark');

    state.subscribe(() => {
      this.render();
      updateNotificationBadge();
    });

    this.setupGlobalEvents();
    setupModalBackdrops();
    initWITAClock();

    // Supabase Auth listener (Handles Google OAuth redirects & sessions)
    await supabaseAdapter.initAuthListener(() => {
      this.render();
      updateNotificationBadge();
    });

    this.render();
    updateNotificationBadge();
  }

  navigateTo(viewName) {
    this.currentView = viewName;
    this.render();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    document.querySelector('.sidebar')?.classList.remove('open');
    document.querySelector('.sidebar-backdrop')?.classList.remove('open');
  }

  render() {
    const user = state.currentUser;
    const appContainer = document.getElementById('app-container');

    // 1. Not authenticated -> Show clean login
    if (!user) {
      appContainer.innerHTML = this.renderLoginScreen();
      this.attachLoginEvents();
      setupModalBackdrops();
      return;
    }

    // 2. Pending verification
    if (user.status === 'pending') {
      appContainer.innerHTML = this.renderPendingScreen(user);
      this.attachStatusScreenEvents();
      return;
    }

    // 3. Suspended or Rejected
    if (user.status === 'suspended' || user.status === 'rejected') {
      appContainer.innerHTML = this.renderBlockedScreen(user);
      this.attachStatusScreenEvents();
      return;
    }

    // 4. Approved -> Render Dashboard
    appContainer.innerHTML = `
      <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
      ${this.renderSidebar(user)}
      <div class="main-wrapper">
        ${this.renderHeader(user)}
        <main class="content-body" id="main-content">
          ${this.renderCurrentView()}
        </main>
      </div>
      ${this.renderNotificationPanel()}
      ${this.renderAllModals()}
      <div id="toast-container"></div>
    `;

    this.attachAppEvents();
    setupModalBackdrops();
    updateNotificationBadge();
  }

  // ============================================================================
  // AUTH & STATUS SCREENS (CLEAN PRODUCTION)
  // ============================================================================
  renderLoginScreen() {
    const isLive = supabaseAdapter.isLiveMode();

    return `
      <div class="fullscreen-center">
        <div class="auth-card">
          <div class="auth-brand">
            <div class="brand-icon">SB</div>
            <h2>SISTEM BERBAGI BALIK LAYAR</h2>
            <p>Cash Management System Terpusat & Transparan</p>
          </div>

          <div style="font-size: 13.5px; color: var(--text-secondary); line-height: 1.6; margin-bottom: 24px;">
            Masuk dengan akun Google Anda untuk mengakses data kas bersama, mutasi transaksi, dan laporan paguyuban secara real-time.
          </div>

          <button class="google-login-btn" id="btn-google-login">
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            Masuk dengan Akun Google
          </button>

          ${!isLive ? `
            <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border-color); font-size: 12px; color: var(--text-muted);">
              Belum menyetel Supabase? <a href="javascript:void(0)" onclick="window.sbblApp.openSupabaseSetupModal()" style="color: var(--primary); font-weight: 600;">Klik di sini untuk mengatur URL & Anon Key</a>
            </div>
          ` : ''}
        </div>

        ${this.renderSupabaseSetupModal()}
      </div>
      <div id="toast-container"></div>
    `;
  }

  renderPendingScreen(user) {
    return `
      <div class="fullscreen-center">
        <div class="auth-card" style="text-align: center;">
          <div style="width: 56px; height: 56px; border-radius: var(--radius-full); background: var(--warning-bg); color: var(--warning); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">
            <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <h2 style="font-size: 18px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">Pendaftaran Sedang Ditinjau</h2>
          <p style="font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 16px;">
            Halo, <strong>${escapeHtml(user.full_name)}</strong> (${escapeHtml(user.email)}). Akun Anda telah terdaftar dan berstatus <strong>Pending</strong>.
          </p>
          <div style="background: var(--bg-card-subtle); padding: 14px; border-radius: var(--radius-md); font-size: 12.5px; color: var(--text-secondary); margin-bottom: 24px;">
            Pengelola kas SBBL sedang memverifikasi akun Anda. Anda akan dapat mengakses dashboard segera setelah akun disetujui oleh Super Admin.
          </div>
          <div style="display: flex; justify-content: center;">
            <button class="btn btn-secondary btn-sm" id="btn-logout">Keluar / Ganti Akun</button>
          </div>
        </div>
      </div>
    `;
  }

  renderBlockedScreen(user) {
    const isSuspended = user.status === 'suspended';
    return `
      <div class="fullscreen-center">
        <div class="auth-card" style="text-align: center;">
          <div style="width: 56px; height: 56px; border-radius: var(--radius-full); background: var(--danger-bg); color: var(--danger); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">
            <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
          </div>
          <h2 style="font-size: 18px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;">
            ${isSuspended ? 'Akun Ditangguhkan (Suspended)' : 'Pendaftaran Ditolak (Rejected)'}
          </h2>
          <p style="font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 16px;">
            Akses ke dashboard SBBL dinonaktifkan untuk akun <strong>${escapeHtml(user.email)}</strong>.
          </p>
          ${isSuspended && user.suspension_reason ? `
            <div style="background: var(--danger-bg); border-left: 3px solid var(--danger); padding: 12px 14px; border-radius: 4px; text-align: left; font-size: 12.5px; color: var(--danger-text); margin-bottom: 24px;">
              <strong>Alasan Penonaktifan:</strong><br>${escapeHtml(user.suspension_reason)}
            </div>
          ` : ''}
          <div style="display: flex; justify-content: center;">
            <button class="btn btn-secondary btn-sm" id="btn-logout">Keluar</button>
          </div>
        </div>
      </div>
    `;
  }

  // ============================================================================
  // SIDEBAR & HEADER
  // ============================================================================
  renderSidebar(user) {
    const navItems = [
      { id: 'dashboard', label: 'Dashboard', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>` },
      { id: 'transactions', label: 'Transactions', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>` },
      { id: 'reports', label: 'Reports', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>` },
      { id: 'data-sources', label: 'Data Sources', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"/>` },
      { id: 'scheduled', label: 'Scheduled', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>` },
      { id: 'members', label: 'Members', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>` },
      { id: 'categories', label: 'Categories', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>` },
      { id: 'audit-log', label: 'Audit Log', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>` },
      { id: 'settings', label: 'Settings', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>` }
    ];

    return `
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="brand-wrapper">
            <div class="brand-icon">SB</div>
            <div class="brand-text">
              <h1>SBBL KAS</h1>
              <p>Cash Management</p>
            </div>
          </div>
          <button class="sidebar-close-btn" id="btn-close-sidebar" title="Tutup Menu">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <nav class="sidebar-nav">
          <div class="nav-section-title">Menu Utama</div>
          ${navItems.map(item => `
            <a href="javascript:void(0)" class="nav-item ${this.currentView === item.id ? 'active' : ''}" onclick="window.sbblApp.navigateTo('${item.id}')">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">${item.icon}</svg>
              <span>${item.label}</span>
            </a>
          `).join('')}
        </nav>

        <div class="sidebar-footer">
          <div class="user-sidebar-card">
            <img src="${escapeHtml(user.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100')}" class="user-avatar" alt="Avatar">
            <div class="user-info-text">
              <div class="user-info-name">${escapeHtml(user.full_name)}</div>
              <div class="user-info-role">
                <span class="role-tag role-${user.role}">${user.role.replace('_', ' ')}</span>
              </div>
            </div>
          </div>
        </div>
      </aside>
    `;
  }

  renderHeader(user) {
    const titles = {
      dashboard: 'Dashboard Kas',
      transactions: 'Daftar Transaksi',
      reports: 'Laporan Keuangan Kas',
      'data-sources': 'Sumber Data Kas & Bank',
      scheduled: 'Penjadwalan & Pengingat Otomatis',
      members: 'Pengelolaan Anggota',
      categories: 'Kategori Kas',
      'audit-log': 'Audit Log Aktivitas',
      settings: 'Pengaturan Sistem'
    };

    return `
      <header class="header">
        <div class="header-left">
          <button class="sidebar-toggle-btn" id="btn-toggle-sidebar" title="Toggle Menu">
            <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
          <div class="page-title-area">
            <h2>${titles[this.currentView] || 'SBBL Kas'}</h2>
            <p>Sistem Berbagi Balik Layar</p>
          </div>
        </div>

        <div class="header-right">
          <!-- User Role Tag -->
          <span class="role-tag role-${user.role}">${user.role.replace('_', ' ')}</span>

          <!-- WITA Clock -->
          <div class="clock-badge">
            <span class="dot"></span>
            <span id="header-wita-clock">--:--:-- WITA</span>
          </div>

          <!-- Fullscreen Toggle for Laptop -->
          <button class="icon-btn" id="btn-toggle-fullscreen" title="Mode Layar Penuh (Fullscreen)">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
          </button>

          <!-- Dark Mode Toggle -->
          <button class="icon-btn" id="btn-toggle-theme" title="Toggle Tema (Terang/Gelap)">
            ${state.theme === 'dark' ? `
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
            ` : `
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
            `}
          </button>

          <!-- Notification Bell -->
          <button class="icon-btn" id="btn-toggle-notifs" title="Notifikasi Internal">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
            <span class="badge-count" id="notif-badge-count" style="display: none;">0</span>
          </button>

          <!-- Logout Button -->
          <button class="icon-btn" id="btn-header-logout" title="Keluar / Logout">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
          </button>
        </div>
      </header>
    `;
  }

  // ============================================================================
  // NOTIFICATIONS PANEL (FR-10)
  // ============================================================================
  renderNotificationPanel() {
    return `
      <div class="notifications-panel" id="notifications-panel">
        <div class="notif-header">
          <h4>Notifikasi Internal SBBL</h4>
          <button class="btn btn-sm btn-outline-primary" id="btn-mark-all-read">Tandai Dibaca</button>
        </div>
        <div class="notif-list" id="notif-panel-list"></div>
      </div>
    `;
  }

  // ============================================================================
  // VIEW RENDERERS
  // ============================================================================
  renderCurrentView() {
    switch (this.currentView) {
      case 'dashboard': return this.renderDashboardView();
      case 'transactions': return this.renderTransactionsView();
      case 'reports': return this.renderReportsView();
      case 'data-sources': return this.renderDataSourcesView();
      case 'scheduled': return this.renderScheduledView();
      case 'members': return this.renderMembersView();
      case 'categories': return this.renderCategoriesView();
      case 'audit-log': return this.renderAuditLogView();
      case 'settings': return this.renderSettingsView();
      default: return this.renderDashboardView();
    }
  }

  // 1. DASHBOARD VIEW (FR-03)
  renderDashboardView() {
    const currentSaldo = state.getCurrentSaldo();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const monthlyStats = state.getMonthlyStats(currentYear, currentMonth);
    const trendData = state.get6MonthTrend();
    const user = state.currentUser;
    const isManager = ['super_admin', 'admin'].includes(user.role);
    const recentTx = state.transactions.slice(0, 6);

    const maxVal = Math.max(
      ...trendData.map(d => Math.max(d.income, d.expense)),
      100000
    );

    return `
      <div class="formula-banner">
        <div class="formula-text">
          <strong>Rumus Perhitungan Kas:</strong> 
          <span class="formula-code">Saldo = Saldo Awal (${formatCurrency(state.settings.opening_balance)}) + Pemasukan Aktif (${formatCurrency(state.getTotalActiveIncome())}) - Pengeluaran Aktif (${formatCurrency(state.getTotalActiveExpense())})</span>
        </div>
        <div style="font-size: 11.5px; color: var(--text-muted);">
          Terpusat di Database Supabase
        </div>
      </div>

      ${isManager ? `
        <div class="quick-actions-bar">
          <button class="btn btn-success" onclick="window.sbblApp.openCreateTxModal('income')">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Catat Pemasukan
          </button>
          <button class="btn btn-danger" onclick="window.sbblApp.openCreateTxModal('expense')">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>
            Catat Pengeluaran
          </button>
          <button class="btn btn-primary" onclick="window.sbblApp.openAnnouncementModal()">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/></svg>
            Kirim Pengumuman Kas
          </button>
        </div>
      ` : ''}

      <div class="stats-grid">
        <div class="stat-card card-balance">
          <div class="stat-top">
            <span class="stat-title">Total Saldo Kas Bersama</span>
            <div class="stat-icon balance">
              <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
            </div>
          </div>
          <div class="stat-amount">${formatCurrency(currentSaldo)}</div>
          <div class="stat-subtext">Akumulasi kas riil aktif</div>
        </div>

        <div class="stat-card card-income">
          <div class="stat-top">
            <span class="stat-title">Pemasukan Bulan Ini</span>
            <div class="stat-icon income">
              <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 11l5-5m0 0l5 5m-5-5v12"/></svg>
            </div>
          </div>
          <div class="stat-amount">${formatCurrency(monthlyStats.income)}</div>
          <div class="stat-subtext">Bulan ${now.toLocaleString('id-ID', { month: 'long', year: 'numeric' })}</div>
        </div>

        <div class="stat-card card-expense">
          <div class="stat-top">
            <span class="stat-title">Pengeluaran Bulan Ini</span>
            <div class="stat-icon expense">
              <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 13l-5 5m0 0l-5-5m5 5V6"/></svg>
            </div>
          </div>
          <div class="stat-amount">${formatCurrency(monthlyStats.expense)}</div>
          <div class="stat-subtext">Bulan ${now.toLocaleString('id-ID', { month: 'long', year: 'numeric' })}</div>
        </div>

        <div class="stat-card card-transactions">
          <div class="stat-top">
            <span class="stat-title">Transaksi Bulan Ini</span>
            <div class="stat-icon transactions">
              <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
            </div>
          </div>
          <div class="stat-amount">${monthlyStats.activeCount} <span style="font-size: 14px; font-weight: 500; color: var(--text-muted);">transaksi</span></div>
          <div class="stat-subtext">Net Cash Flow: ${formatCurrency(monthlyStats.netChange)}</div>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="card">
          <div class="card-header">
            <h3>
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"/></svg>
              Grafik Tren Arus Kas 6 Bulan Terakhir
            </h3>
            <span style="font-size: 12px; color: var(--text-muted);">Pemasukan vs Pengeluaran</span>
          </div>

          <div class="custom-bar-chart">
            ${trendData.map(d => {
              const incPercent = Math.min(Math.round((d.income / maxVal) * 100), 100);
              const expPercent = Math.min(Math.round((d.expense / maxVal) * 100), 100);
              return `
                <div class="chart-bar-group" title="${d.label}: Masuk ${formatCurrency(d.income)}, Keluar ${formatCurrency(d.expense)}">
                  <div class="bars-wrapper">
                    <div class="bar-income" style="height: ${Math.max(incPercent, 4)}%;"></div>
                    <div class="bar-expense" style="height: ${Math.max(expPercent, 4)}%;"></div>
                  </div>
                  <div class="chart-month-label">${d.label.split(' ')[0]}</div>
                </div>
              `;
            }).join('')}
          </div>

          <div class="chart-legend">
            <div><span class="legend-dot" style="background: #10b981;"></span> Pemasukan</div>
            <div><span class="legend-dot" style="background: #f43f5e;"></span> Pengeluaran</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
              Rekening Resmi Kas SBBL
            </h3>
          </div>
          <div style="display:flex; flex-direction:column; gap: 12px;">
            ${state.settings.bank_accounts.map(acc => `
              <div style="background: var(--bg-card-subtle); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 12px;">
                <div style="font-weight: 700; font-size: 13px; color: var(--text-primary); margin-bottom: 2px;">${escapeHtml(acc.bank_name)}</div>
                <div style="font-family: monospace; font-size: 14px; font-weight: 700; color: var(--primary); letter-spacing: 0.5px;">${escapeHtml(acc.account_number)}</div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">a.n. ${escapeHtml(acc.holder_name)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Transaksi Kas Terbaru
          </h3>
          <button class="btn btn-sm btn-outline-primary" onclick="window.sbblApp.navigateTo('transactions')">
            Lihat Semua Transaksi &rarr;
          </button>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Deskripsi & Pihak Terkait</th>
                <th>Kategori</th>
                <th>Metode</th>
                <th>Nominal</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${recentTx.length === 0 ? `
                <tr>
                  <td colspan="6" style="text-align: center; padding: 32px; color: var(--text-muted);">
                    Belum ada transaksi kas yang dicatat.
                  </td>
                </tr>
              ` : recentTx.map(t => {
                const cat = state.categories.find(c => c.id === t.category_id);
                const isVoid = t.status === 'void';
                return `
                  <tr class="${isVoid ? 'row-void' : ''}">
                    <td style="white-space: nowrap;">${formatDateShort(t.transaction_date)}</td>
                    <td>
                      <div style="font-weight: 600;">${escapeHtml(t.description)}</div>
                      <div style="font-size: 11.5px; color: var(--text-muted);">${escapeHtml(t.counterparty)}</div>
                    </td>
                    <td><span class="category-pill">${escapeHtml(cat ? cat.name : '-')}</span></td>
                    <td><span style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(t.payment_method)}</span></td>
                    <td class="${t.type === 'income' ? 'amount-income' : 'amount-expense'}" style="white-space: nowrap;">
                      ${t.type === 'income' ? '+' : '-'} ${formatCurrency(t.amount)}
                    </td>
                    <td>
                      <span class="badge ${isVoid ? 'badge-danger' : 'badge-success'}">
                        ${isVoid ? 'Dibatalkan' : 'Aktif'}
                      </span>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // 2. TRANSACTIONS VIEW (FR-04, FR-05)
  renderTransactionsView() {
    const user = state.currentUser;
    const isManager = ['super_admin', 'admin'].includes(user.role);

    let filtered = [...state.transactions];

    if (this.txFilter.search) {
      const q = this.txFilter.search.toLowerCase();
      filtered = filtered.filter(t =>
        t.description.toLowerCase().includes(q) ||
        t.counterparty.toLowerCase().includes(q)
      );
    }

    if (this.txFilter.type !== 'all') {
      filtered = filtered.filter(t => t.type === this.txFilter.type);
    }

    if (this.txFilter.category !== 'all') {
      filtered = filtered.filter(t => t.category_id === this.txFilter.category);
    }

    if (this.txFilter.month) {
      filtered = filtered.filter(t => t.transaction_date.startsWith(this.txFilter.month));
    }

    return `
      <div class="filters-bar">
        <div class="search-box">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          <input type="text" id="tx-search-input" placeholder="Cari keterangan atau pihak terkait..." value="${escapeHtml(this.txFilter.search)}">
        </div>

        <select class="filter-select" id="tx-type-filter">
          <option value="all" ${this.txFilter.type === 'all' ? 'selected' : ''}>Semua Jenis</option>
          <option value="income" ${this.txFilter.type === 'income' ? 'selected' : ''}>Pemasukan</option>
          <option value="expense" ${this.txFilter.type === 'expense' ? 'selected' : ''}>Pengeluaran</option>
        </select>

        <select class="filter-select" id="tx-category-filter">
          <option value="all">Semua Kategori</option>
          ${state.categories.map(c => `
            <option value="${c.id}" ${this.txFilter.category === c.id ? 'selected' : ''}>${escapeHtml(c.name)} (${c.type === 'income' ? 'Masuk' : 'Keluar'})</option>
          `).join('')}
        </select>

        <input type="month" class="filter-select" id="tx-month-filter" value="${escapeHtml(this.txFilter.month)}">

        ${isManager ? `
          <button class="btn btn-primary" onclick="window.sbblApp.openCreateTxModal('income')" style="margin-left: auto;">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Tambah Transaksi
          </button>
        ` : ''}
      </div>

      <div class="card">
        <div class="card-header">
          <h3>Daftar Transaksi Kas (${filtered.length} Transaksi)</h3>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Deskripsi Transaksi</th>
                <th>Pihak Terkait</th>
                <th>Kategori</th>
                <th>Metode</th>
                <th>Nominal</th>
                <th>Status</th>
                ${isManager ? `<th style="text-align: right;">Aksi</th>` : ''}
              </tr>
            </thead>
            <tbody>
              ${filtered.length === 0 ? `
                <tr>
                  <td colspan="${isManager ? 8 : 7}" style="text-align: center; padding: 36px; color: var(--text-muted);">
                    Belum ada transaksi kas yang dicatat. Klik '+ Tambah Transaksi' untuk memulai.
                  </td>
                </tr>
              ` : filtered.map(t => {
                const cat = state.categories.find(c => c.id === t.category_id);
                const isVoid = t.status === 'void';
                return `
                  <tr class="${isVoid ? 'row-void' : ''}">
                    <td style="white-space: nowrap;">${formatDateShort(t.transaction_date)}</td>
                    <td>
                      <div style="font-weight: 600;">${escapeHtml(t.description)}</div>
                      ${t.notes ? `<div style="font-size: 11.5px; color: var(--text-muted);">${escapeHtml(t.notes)}</div>` : ''}
                      ${isVoid && t.void_reason ? `<div style="font-size: 11px; color: var(--danger); margin-top: 2px;">Alasan Dibatalkan: ${escapeHtml(t.void_reason)}</div>` : ''}
                    </td>
                    <td>${escapeHtml(t.counterparty)}</td>
                    <td><span class="category-pill">${escapeHtml(cat ? cat.name : '-')}</span></td>
                    <td><span style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(t.payment_method)}</span></td>
                    <td class="${t.type === 'income' ? 'amount-income' : 'amount-expense'}" style="white-space: nowrap;">
                      ${t.type === 'income' ? '+' : '-'} ${formatCurrency(t.amount)}
                    </td>
                    <td>
                      <span class="badge ${isVoid ? 'badge-danger' : 'badge-success'}">
                        ${isVoid ? 'Dibatalkan' : 'Aktif'}
                      </span>
                    </td>
                    ${isManager ? `
                      <td style="text-align: right; white-space: nowrap;">
                        ${!isVoid ? `
                          <div style="display: inline-flex; gap: 6px;">
                            <button class="btn btn-sm btn-outline-primary" onclick="window.sbblApp.openEditTxModal('${t.id}')" title="Edit Rincian Transaksi">
                              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                              Edit
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="window.sbblApp.openVoidTxModal('${t.id}')" title="Batalkan Transaksi (Void)">
                              Void
                            </button>
                          </div>
                        ` : `
                          <span style="font-size: 11px; color: var(--text-muted);">Voided</span>
                        `}
                      </td>
                    ` : ''}
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // 3. REPORTS VIEW (FR-06)
  renderReportsView() {
    const stats = state.getMonthlyStats(this.reportFilter.year, this.reportFilter.month);
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];

    const activeTx = stats.transactions.filter(t => t.status === 'active');
    const incomeByCategory = {};
    const expenseByCategory = {};

    activeTx.forEach(t => {
      const cat = state.categories.find(c => c.id === t.category_id);
      const catName = cat ? cat.name : 'Lainnya';
      if (t.type === 'income') {
        incomeByCategory[catName] = (incomeByCategory[catName] || 0) + Number(t.amount);
      } else {
        expenseByCategory[catName] = (expenseByCategory[catName] || 0) + Number(t.amount);
      }
    });

    return `
      <div class="print-only-header">
        <h2 style="font-size: 18pt; margin-bottom: 4px;">SISTEM BERBAGI BALIK LAYAR (SBBL)</h2>
        <h3 style="font-size: 14pt; margin-bottom: 6px;">LAPORAN PERTANGGUNGJAWABAN KAS BERSAMA</h3>
        <p style="font-size: 11pt;">Periode: ${months[this.reportFilter.month - 1]} ${this.reportFilter.year} | Dicetak pada: ${formatDateWITA(new Date().toISOString())}</p>
      </div>

      <div class="filters-bar">
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <label style="font-weight: 600; font-size: 13px;">Bulan:</label>
          <select class="filter-select" id="report-month-select">
            ${months.map((m, idx) => `
              <option value="${idx + 1}" ${this.reportFilter.month === (idx + 1) ? 'selected' : ''}>${m}</option>
            `).join('')}
          </select>

          <label style="font-weight: 600; font-size: 13px; margin-left: 8px;">Tahun:</label>
          <select class="filter-select" id="report-year-select">
            <option value="2026" ${this.reportFilter.year === 2026 ? 'selected' : ''}>2026</option>
            <option value="2025" ${this.reportFilter.year === 2025 ? 'selected' : ''}>2025</option>
          </select>
        </div>

        <div style="margin-left: auto; display: flex; gap: 10px; flex-wrap: wrap;">
          <button class="btn btn-secondary" onclick="window.sbblApp.exportReportCSV()">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            Ekspor CSV
          </button>
          <button class="btn btn-primary" onclick="window.print()">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
            Cetak Laporan
          </button>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-top"><span class="stat-title">Saldo Awal Periode</span></div>
          <div class="stat-amount" style="font-size: 20px;">${formatCurrency(stats.openingBalance)}</div>
          <div class="stat-subtext">Per 1 ${months[this.reportFilter.month - 1]} ${this.reportFilter.year}</div>
        </div>

        <div class="stat-card card-income">
          <div class="stat-top"><span class="stat-title">Total Pemasukan Periode</span></div>
          <div class="stat-amount" style="font-size: 20px; color: var(--success);">${formatCurrency(stats.income)}</div>
          <div class="stat-subtext">Pemasukan aktif</div>
        </div>

        <div class="stat-card card-expense">
          <div class="stat-top"><span class="stat-title">Total Pengeluaran Periode</span></div>
          <div class="stat-amount" style="font-size: 20px; color: var(--danger);">${formatCurrency(stats.expense)}</div>
          <div class="stat-subtext">Pengeluaran aktif</div>
        </div>

        <div class="stat-card card-balance">
          <div class="stat-top"><span class="stat-title">Saldo Akhir Periode</span></div>
          <div class="stat-amount" style="font-size: 20px; color: var(--primary);">${formatCurrency(stats.closingBalance)}</div>
          <div class="stat-subtext">Saldo Awal + Masuk - Keluar</div>
        </div>
      </div>

      <div class="dashboard-grid" style="margin-bottom: 24px;">
        <div class="card">
          <div class="card-header">
            <h3>Rincian Pemasukan per Kategori</h3>
          </div>
          <table class="data-table">
            <thead><tr><th>Kategori</th><th style="text-align: right;">Jumlah</th></tr></thead>
            <tbody>
              ${Object.keys(incomeByCategory).length === 0 ? `
                <tr><td colspan="2" style="text-align:center; color: var(--text-muted); padding: 18px;">Tidak ada pemasukan periode ini.</td></tr>
              ` : Object.entries(incomeByCategory).map(([cat, amt]) => `
                <tr><td>${escapeHtml(cat)}</td><td style="text-align: right; font-weight: 700; color: var(--success);">${formatCurrency(amt)}</td></tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>Rincian Pengeluaran per Kategori</h3>
          </div>
          <table class="data-table">
            <thead><tr><th>Kategori</th><th style="text-align: right;">Jumlah</th></tr></thead>
            <tbody>
              ${Object.keys(expenseByCategory).length === 0 ? `
                <tr><td colspan="2" style="text-align:center; color: var(--text-muted); padding: 18px;">Tidak ada pengeluaran periode ini.</td></tr>
              ` : Object.entries(expenseByCategory).map(([cat, amt]) => `
                <tr><td>${escapeHtml(cat)}</td><td style="text-align: right; font-weight: 700; color: var(--danger);">${formatCurrency(amt)}</td></tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>Rincian Buku Transaksi Kas Periode ${months[this.reportFilter.month - 1]} ${this.reportFilter.year}</h3>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Deskripsi</th>
                <th>Pihak Terkait</th>
                <th>Kategori</th>
                <th>Nominal</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${stats.transactions.length === 0 ? `
                <tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">Tidak ada transaksi pada periode ini.</td></tr>
              ` : stats.transactions.map(t => {
                const cat = state.categories.find(c => c.id === t.category_id);
                const isVoid = t.status === 'void';
                return `
                  <tr class="${isVoid ? 'row-void' : ''}">
                    <td>${formatDateShort(t.transaction_date)}</td>
                    <td>${escapeHtml(t.description)}</td>
                    <td>${escapeHtml(t.counterparty)}</td>
                    <td>${escapeHtml(cat ? cat.name : '-')}</td>
                    <td class="${t.type === 'income' ? 'amount-income' : 'amount-expense'}">
                      ${t.type === 'income' ? '+' : '-'} ${formatCurrency(t.amount)}
                    </td>
                    <td>${isVoid ? 'Dibatalkan' : 'Aktif'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="print-only-signatures">
        <div style="text-align: center; width: 200px;">
          <p>Disiapkan Oleh,</p>
          <p style="font-weight: 600; margin-top: 4px;">Bendahara Kas</p>
          <div style="height: 60px;"></div>
          <p style="font-weight: 700; text-decoration: underline;">Bendahara SBBL</p>
        </div>

        <div style="text-align: center; width: 200px;">
          <p>Mengetahui,</p>
          <p style="font-weight: 600; margin-top: 4px;">Super Admin SBBL</p>
          <div style="height: 60px;"></div>
          <p style="font-weight: 700; text-decoration: underline;">Super Admin</p>
        </div>
      </div>
    `;
  }

  // 4. DATA SOURCES VIEW
  renderDataSourcesView() {
    const isLive = supabaseAdapter.isLiveMode();
    const user = state.currentUser;
    const isSuperAdmin = user.role === 'super_admin';

    return `
      <div class="formula-banner">
        <div class="formula-text">
          <strong>Sumber Data Kas:</strong>
          Rekening bank resmi & konfigurasi database kas bersama SBBL. Hanya <strong>Super Admin</strong> yang dapat mengubah data ini.
        </div>
        ${isSuperAdmin ? `
          <div style="font-size: 11.5px; color: var(--accent); font-weight: 600;">
            ✓ Anda memiliki hak penuh untuk mengedit
          </div>
        ` : `
          <div style="font-size: 11.5px; color: var(--text-muted);">
            Hanya tampilan — pengeditan memerlukan hak Super Admin
          </div>
        `}
      </div>

      <div class="dashboard-grid">
        <div class="card">
          <div class="card-header">
            <h3>Rekening Resmi Kas Bersama SBBL</h3>
            ${isSuperAdmin ? `
              <button class="btn btn-sm btn-primary" onclick="window.sbblApp.openEditBankAccountsModal()">
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                Edit Rekening Bank
              </button>
            ` : ''}
          </div>
          <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">
            Seluruh mutasi dana kas bersama dialirkan melalui rekening bank &amp; QRIS resmi yang telah disepakati bersama.
          </p>

          <div style="display:flex; flex-direction:column; gap: 14px;">
            ${state.settings.bank_accounts.map((acc, idx) => `
              <div style="background: var(--bg-card-subtle); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap: wrap; gap: 8px;">
                <div>
                  <div style="font-weight: 700; font-size: 14px; color: var(--text-primary);">${escapeHtml(acc.bank_name)}</div>
                  <div style="font-family: monospace; font-size: 16px; font-weight: 700; color: var(--primary); margin: 4px 0;">${escapeHtml(acc.account_number)}</div>
                  <div style="font-size: 12px; color: var(--text-muted);">Atas Nama: <strong>${escapeHtml(acc.holder_name)}</strong></div>
                </div>
                <button class="btn btn-sm btn-secondary" onclick="navigator.clipboard.writeText('${acc.account_number}'); window.sbblApp.copyFeedback()">
                  Salin No. Rekening
                </button>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>Integrasi &amp; Status Database Cloud</h3>
          </div>
          <div style="display:flex; flex-direction:column; gap: 14px;">
            <div style="background: var(--bg-card-subtle); border-radius: var(--radius-md); padding: 14px; border: 1px solid var(--border-color);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                <span style="font-size: 13px; font-weight: 600;">Status Supabase:</span>
                <span class="badge ${isLive ? 'badge-success' : 'badge-warning'}">
                  ${isLive ? 'Live Cloud Connected' : 'Belum Terhubung'}
                </span>
              </div>
              <p style="font-size: 12px; color: var(--text-secondary);">
                ${isLive ? 'Terhubung langsung ke Cloud Supabase PostgreSQL RLS' : 'Silakan konfigurasikan URL dan Anon Key di menu Settings.'}
              </p>
            </div>

            <div style="background: var(--bg-card-subtle); border-radius: var(--radius-md); padding: 14px; border: 1px solid var(--border-color);">
              <div style="font-size: 13px; font-weight: 600; margin-bottom: 6px;">Pemeriksaan Integritas Saldo:</div>
              <div style="font-size: 12.5px; color: var(--success); display:flex; align-items:center; gap: 6px;">
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                Seluruh transaksi konsisten dan terlindungi otorisasi server-side.
              </div>
            </div>

            <div style="background: var(--bg-card-subtle); border-radius: var(--radius-md); padding: 14px; border: 1px solid var(--border-color);">
              <div style="font-size: 13px; font-weight: 600; margin-bottom: 6px;">Statistik Entitas:</div>
              <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.8;">
                • Total Transaksi: <strong>${state.transactions.length}</strong> entri<br>
                • Total Anggota Terdaftar: <strong>${state.members.length}</strong> akun<br>
                • Kategori Kas: <strong>${state.categories.filter(c => c.is_active).length}</strong> aktif
              </div>
            </div>

            <div style="background: var(--bg-card-subtle); border-radius: var(--radius-md); padding: 14px; border: 1px solid var(--border-color);">
              <div style="font-size: 13px; font-weight: 600; margin-bottom: 6px;">Hak Akses Sistem:</div>
              <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.9;">
                • <span class="role-tag role-super_admin">super admin</span> — Semua akses + edit rekening & jadwal<br>
                • <span class="role-tag role-admin">admin</span> — Transaksi, anggota, kategori, pengumuman<br>
                • <span class="role-tag role-member">member</span> — Hanya lihat (read-only)
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderScheduledView() {
    const user = state.currentUser;
    const isManager = ['super_admin', 'admin'].includes(user.role);
    const isSuperAdmin = user.role === 'super_admin';
    const cfg = state.settings.weekly_contribution_config || { amount: 10000, day: 'Thursday', time: '09:00', timezone: 'Asia/Makassar' };

    const dayLabels = {
      'Monday': 'Senin', 'Tuesday': 'Selasa', 'Wednesday': 'Rabu',
      'Thursday': 'Kamis', 'Friday': 'Jumat', 'Saturday': 'Sabtu', 'Sunday': 'Minggu'
    };

    return `
      ${isSuperAdmin ? `
        <div class="formula-banner" style="background: linear-gradient(135deg, rgba(124,58,237,0.08), rgba(109,40,217,0.04)); border-color: rgba(124,58,237,0.25);">
          <div class="formula-text">
            <strong>Mode Super Admin:</strong> Anda dapat mengubah konfigurasi jadwal & nominal iuran kas bersama.
          </div>
          <button class="btn btn-sm btn-primary" onclick="window.sbblApp.openEditScheduleModal()">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            Edit Konfigurasi Jadwal
          </button>
        </div>
      ` : `
        <div class="formula-banner">
          <div class="formula-text">
            <strong>Jadwal Iuran Kas:</strong> Konfigurasi jadwal iuran mingguan. Hanya <strong>Super Admin</strong> yang dapat mengubah pengaturan ini.
          </div>
        </div>
      `}

      <div class="card" style="margin-bottom: 24px;">
        <div class="card-header">
          <h3>
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Jadwal Pengingat Iuran Mingguan SBBL
          </h3>
          <span class="badge badge-success">Jadwal Terpasang</span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 20px;">
          <div style="background: var(--bg-card-subtle); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
            <div style="font-size: 11.5px; color: var(--text-muted); text-transform: uppercase;">Nominal Iuran</div>
            <div style="font-size: 18px; font-weight: 800; color: var(--primary); margin-top: 4px;">Rp ${Number(cfg.amount || 10000).toLocaleString('id-ID')} / minggu</div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Per anggota approved</div>
          </div>

          <div style="background: var(--bg-card-subtle); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
            <div style="font-size: 11.5px; color: var(--text-muted); text-transform: uppercase;">Hari &amp; Waktu Eksekusi</div>
            <div style="font-size: 18px; font-weight: 800; color: var(--text-primary); margin-top: 4px;">Setiap ${dayLabels[cfg.day] || cfg.day}, ${cfg.time || '09:00'}</div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Zona waktu: Asia/Makassar (WITA)</div>
          </div>

          <div style="background: var(--bg-card-subtle); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
            <div style="font-size: 11.5px; color: var(--text-muted); text-transform: uppercase;">Cron Expression</div>
            <div style="font-family: monospace; font-size: 16px; font-weight: 700; color: var(--text-primary); margin-top: 4px;">0 1 * * 4</div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">01:00 UTC = 09:00 WITA</div>
          </div>
        </div>

        <div style="background: linear-gradient(135deg, rgba(2, 132, 199, 0.08), rgba(20, 184, 166, 0.08)); border: 1px solid rgba(2, 132, 199, 0.25); border-radius: var(--radius-md); padding: 14px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
          <div>
            <div style="font-weight: 700; font-size: 13.5px; color: var(--text-primary);">Pengujian Pengiriman Pengingat Iuran</div>
            <div style="font-size: 12px; color: var(--text-secondary);">
              Uji pengiriman notifikasi pengingat iuran mingguan dengan perlindungan kunci idempotensi untuk mencegah duplikasi.
            </div>
          </div>
          ${isManager ? `
            <button class="btn btn-primary" onclick="window.sbblApp.triggerScheduledTest()">
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              Jalankan Eksekusi Sekarang
            </button>
          ` : `
            <span style="font-size: 12px; color: var(--text-muted);">Hanya Admin yang dapat memicu pengujian.</span>
          `}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>Riwayat Eksekusi Penjadwalan (Delivery Logs)</h3>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Job Name</th>
                <th>Waktu Eksekusi (WITA)</th>
                <th>Status</th>
                <th>Penerima</th>
                <th>Keterangan</th>
              </tr>
            </thead>
            <tbody>
              ${state.deliveryLogs.length === 0 ? `
                <tr><td colspan="5" style="text-align: center; padding: 24px; color: var(--text-muted);">
                  Belum ada riwayat eksekusi penjadwalan.
                </td></tr>
              ` : state.deliveryLogs.map(log => `
                <tr>
                  <td><code style="font-size: 12px;">${escapeHtml(log.job_name)}</code></td>
                  <td style="white-space: nowrap;">${formatDateWITA(log.executed_at || log.created_at)}</td>
                  <td><span class="badge ${log.status === 'success' ? 'badge-success' : log.status === 'running' ? 'badge-info' : 'badge-danger'}">${log.status}</span></td>
                  <td>${log.recipients_count} anggota</td>
                  <td style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(log.details || '-')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // 6. MEMBERS VIEW (FR-07)
  renderMembersView() {
    const user = state.currentUser;
    const isSuperAdmin = user.role === 'super_admin';
    const isManager = ['super_admin', 'admin'].includes(user.role);

    let membersList = [...state.members];
    if (this.memberFilter !== 'all') {
      membersList = membersList.filter(m => m.status === this.memberFilter);
    }

    const adminCount = state.members.filter(m => m.role === 'admin').length;
    const superAdminCount = state.members.filter(m => m.role === 'super_admin').length;
    const totalManagers = adminCount + superAdminCount;

    return `
      <div class="formula-banner">
        <div class="formula-text">
          <strong>Aturan Kuota Pengelola Kas:</strong>
          Maksimal 1 Super Admin + 4 Admin Biasa (Saat ini: <strong>${superAdminCount} Super Admin</strong> & <strong>${adminCount} Admin</strong> = Total <strong>${totalManagers}/5 Pengelola</strong>).
        </div>
        <div style="font-size: 11.5px; color: var(--text-muted);">
          Ditegakkan oleh Supabase RPC & RLS
        </div>
      </div>

      <div class="filters-bar">
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          ${['all', 'approved', 'pending', 'suspended', 'rejected'].map(st => `
            <button class="btn btn-sm ${this.memberFilter === st ? 'btn-primary' : 'btn-secondary'}" onclick="window.sbblApp.filterMembers('${st}')">
              ${st.toUpperCase()} (${st === 'all' ? state.members.length : state.members.filter(m => m.status === st).length})
            </button>
          `).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>Daftar Anggota Kas Bersama (${membersList.length})</h3>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nama & Email</th>
                <th>Peran (Role)</th>
                <th>Status Akun</th>
                <th>Bergabung</th>
                ${isManager ? `<th style="text-align: right;">Aksi Pengelolaan</th>` : ''}
              </tr>
            </thead>
            <tbody>
              ${membersList.length === 0 ? `
                <tr>
                  <td colspan="${isManager ? 5 : 4}" style="text-align: center; padding: 32px; color: var(--text-muted);">
                    Belum ada anggota terdaftar dalam kategori ini.
                  </td>
                </tr>
              ` : membersList.map(m => {
                const statusBadges = {
                  approved: 'badge-success',
                  pending: 'badge-warning',
                  suspended: 'badge-danger',
                  rejected: 'badge-danger'
                };

                return `
                  <tr>
                    <td>
                      <div style="display: flex; align-items: center; gap: 10px;">
                        <img src="${escapeHtml(m.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100')}" class="user-avatar" style="width: 32px; height: 32px;" alt="Avatar">
                        <div>
                          <div style="font-weight: 600;">${escapeHtml(m.full_name)}</div>
                          <div style="font-size: 11.5px; color: var(--text-muted);">${escapeHtml(m.email)}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span class="role-tag role-${m.role}">${m.role.replace('_', ' ')}</span>
                    </td>
                    <td>
                      <span class="badge ${statusBadges[m.status] || 'badge-neutral'}">
                        ${m.status}
                      </span>
                      ${m.suspension_reason ? `<div style="font-size: 11px; color: var(--danger); margin-top: 2px;">Alasan: ${escapeHtml(m.suspension_reason)}</div>` : ''}
                    </td>
                    <td style="white-space: nowrap;">${formatDateShort(m.created_at ? m.created_at.split('T')[0] : '')}</td>
                    ${isManager ? `
                      <td style="text-align: right; white-space: nowrap;">
                        <div style="display: inline-flex; gap: 6px; flex-wrap: wrap;">
                          ${m.status === 'pending' ? `
                            <button class="btn btn-sm btn-success" onclick="window.sbblApp.updateMemberStatus('${m.id}', 'approved')">Setujui</button>
                            <button class="btn btn-sm btn-danger" onclick="window.sbblApp.updateMemberStatus('${m.id}', 'rejected')">Tolak</button>
                          ` : ''}

                          ${m.status === 'approved' ? `
                            ${isSuperAdmin && m.role === 'member' ? `
                              <button class="btn btn-sm btn-outline-primary" onclick="window.sbblApp.promoteMember('${m.id}')" title="Angkat menjadi Admin Kas">
                                + Jadikan Admin
                              </button>
                            ` : ''}

                            ${isSuperAdmin && m.role === 'admin' ? `
                              <button class="btn btn-sm btn-secondary" onclick="window.sbblApp.demoteMember('${m.id}')" title="Turunkan ke Anggota Biasa">
                                Turunkan Role
                              </button>
                            ` : ''}

                            ${m.id !== user.id && m.role !== 'super_admin' ? `
                              <button class="btn btn-sm btn-danger" onclick="window.sbblApp.openSuspendModal('${m.id}')">
                                Suspend
                              </button>
                            ` : ''}
                          ` : ''}

                          ${m.status === 'suspended' ? `
                            <button class="btn btn-sm btn-success" onclick="window.sbblApp.updateMemberStatus('${m.id}', 'approved')">
                              Aktifkan Kembali
                            </button>
                          ` : ''}
                        </div>
                      </td>
                    ` : ''}
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // 7. CATEGORIES VIEW (FR-08)
  renderCategoriesView() {
    const user = state.currentUser;
    const isManager = ['super_admin', 'admin'].includes(user.role);

    return `
      <div class="filters-bar" style="justify-content: space-between;">
        <div style="font-size: 13px; color: var(--text-secondary);">
          Kelola kategori kas. Kategori aktif akan tersedia pada formulir pencatatan kas.
        </div>
        ${isManager ? `
          <button class="btn btn-primary" onclick="window.sbblApp.openAddCategoryModal()">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Tambah Kategori Baru
          </button>
        ` : ''}
      </div>

      <div class="dashboard-grid">
        <div class="card">
          <div class="card-header">
            <h3>
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 11l5-5m0 0l5 5m-5-5v12"/></svg>
              Kategori Pemasukan Kas
            </h3>
          </div>
          <table class="data-table">
            <thead>
              <tr><th>Nama Kategori</th><th>Status</th>${isManager ? `<th style="text-align:right;">Aksi</th>` : ''}</tr>
            </thead>
            <tbody>
              ${state.categories.filter(c => c.type === 'income').map(c => `
                <tr>
                  <td style="font-weight: 600;">${escapeHtml(c.name)}</td>
                  <td>
                    <span class="badge ${c.is_active ? 'badge-success' : 'badge-neutral'}">
                      ${c.is_active ? 'Aktif' : 'Non-Aktif'}
                    </span>
                  </td>
                  ${isManager ? `
                    <td style="text-align: right; white-space: nowrap;">
                      <div style="display: inline-flex; gap: 6px;">
                        <button class="btn btn-sm btn-outline-primary" onclick="window.sbblApp.openEditCategoryModal('${c.id}')" title="Ubah Nama Kategori">
                          Edit
                        </button>
                        <button class="btn btn-sm ${c.is_active ? 'btn-danger' : 'btn-success'}" onclick="window.sbblApp.toggleCategory('${c.id}')">
                          ${c.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                      </div>
                    </td>
                  ` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 13l-5 5m0 0l-5-5m5 5V6"/></svg>
              Kategori Pengeluaran Kas
            </h3>
          </div>
          <table class="data-table">
            <thead>
              <tr><th>Nama Kategori</th><th>Status</th>${isManager ? `<th style="text-align:right;">Aksi</th>` : ''}</tr>
            </thead>
            <tbody>
              ${state.categories.filter(c => c.type === 'expense').map(c => `
                <tr>
                  <td style="font-weight: 600;">${escapeHtml(c.name)}</td>
                  <td>
                    <span class="badge ${c.is_active ? 'badge-success' : 'badge-neutral'}">
                      ${c.is_active ? 'Aktif' : 'Non-Aktif'}
                    </span>
                  </td>
                  ${isManager ? `
                    <td style="text-align: right; white-space: nowrap;">
                      <div style="display: inline-flex; gap: 6px;">
                        <button class="btn btn-sm btn-outline-primary" onclick="window.sbblApp.openEditCategoryModal('${c.id}')" title="Ubah Nama Kategori">
                          Edit
                        </button>
                        <button class="btn btn-sm ${c.is_active ? 'btn-danger' : 'btn-success'}" onclick="window.sbblApp.toggleCategory('${c.id}')">
                          ${c.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                      </div>
                    </td>
                  ` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // 8. AUDIT LOG VIEW (FR-09)
  renderAuditLogView() {
    let logs = [...state.auditLogs];

    if (this.auditFilter.search) {
      const q = this.auditFilter.search.toLowerCase();
      logs = logs.filter(l =>
        l.actor_email.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q)
      );
    }

    if (this.auditFilter.entity !== 'all') {
      logs = logs.filter(l => l.entity === this.auditFilter.entity);
    }

    return `
      <div class="filters-bar">
        <div class="search-box">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          <input type="text" id="audit-search-input" placeholder="Cari email aktor atau jenis tindakan..." value="${escapeHtml(this.auditFilter.search)}">
        </div>

        <select class="filter-select" id="audit-entity-filter">
          <option value="all">Semua Entitas</option>
          <option value="transactions" ${this.auditFilter.entity === 'transactions' ? 'selected' : ''}>Transactions</option>
          <option value="profiles" ${this.auditFilter.entity === 'profiles' ? 'selected' : ''}>Profiles</option>
          <option value="categories" ${this.auditFilter.entity === 'categories' ? 'selected' : ''}>Categories</option>
          <option value="system_settings" ${this.auditFilter.entity === 'system_settings' ? 'selected' : ''}>Settings</option>
          <option value="notifications" ${this.auditFilter.entity === 'notifications' ? 'selected' : ''}>Notifications</option>
        </select>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>Jejak Audit Aktivitas Pengelolaan (${logs.length} Log)</h3>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Waktu (WITA)</th>
                <th>Aktor (Email)</th>
                <th>Tindakan (Action)</th>
                <th>Entitas</th>
                <th>Rincian Detail</th>
              </tr>
            </thead>
            <tbody>
              ${logs.length === 0 ? `
                <tr><td colspan="5" style="text-align: center; padding: 24px; color: var(--text-muted);">Tidak ada jejak audit yang ditemukan.</td></tr>
              ` : logs.map(l => `
                <tr>
                  <td style="white-space: nowrap;">${formatDateWITA(l.created_at)}</td>
                  <td style="font-weight: 600;">${escapeHtml(l.actor_email)}</td>
                  <td><span class="badge badge-info">${escapeHtml(l.action)}</span></td>
                  <td><code>${escapeHtml(l.entity)}</code></td>
                  <td style="font-size: 12px; font-family: monospace; color: var(--text-secondary); max-width: 380px; word-break: break-all;">
                    ${escapeHtml(JSON.stringify(l.details))}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // 9. SETTINGS VIEW
  renderSettingsView() {
    const user = state.currentUser;
    const isSuperAdmin = user.role === 'super_admin';

    return `
      <div class="dashboard-grid">
        <div class="card">
          <div class="card-header">
            <h3>Identitas & Nama Sistem Kas</h3>
          </div>

          <form id="settings-org-form" onsubmit="window.sbblApp.saveOrganizationInfo(event)">
            <div class="form-group">
              <label>Nama Sistem / Organisasi Kas <span class="required">*</span></label>
              <input type="text" class="form-control" id="settings-app-name" value="${escapeHtml(state.settings.organization_info?.app_name || 'SISTEM BERBAGI BALIK LAYAR')}" ${!isSuperAdmin ? 'disabled' : ''} required>
            </div>
            <div class="form-group">
              <label>Nama Singkatan (Short Name)</label>
              <input type="text" class="form-control" id="settings-short-name" value="${escapeHtml(state.settings.organization_info?.short_name || 'SBBL')}" ${!isSuperAdmin ? 'disabled' : ''} required>
            </div>
            <div class="form-group">
              <label>Tagline / Deskripsi Sistem</label>
              <input type="text" class="form-control" id="settings-tagline" value="${escapeHtml(state.settings.organization_info?.tagline || 'Cash Management System Terpusat & Transparan')}" ${!isSuperAdmin ? 'disabled' : ''}>
            </div>
            ${isSuperAdmin ? `
              <button type="submit" class="btn btn-primary btn-sm">Simpan Identitas Sistem</button>
            ` : `
              <div style="font-size: 11.5px; color: var(--text-muted);">Hanya Super Admin yang dapat mengubah identitas sistem.</div>
            `}
          </form>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>Pengaturan Global Kas SBBL</h3>
          </div>

          <form id="settings-opening-balance-form" onsubmit="window.sbblApp.saveOpeningBalance(event)">
            <div class="form-group">
              <label>Saldo Awal Pembukuan Kas (IDR) <span class="required">*</span></label>
              <input type="number" class="form-control" id="settings-opening-balance-input" value="${state.settings.opening_balance}" ${!isSuperAdmin ? 'disabled' : ''}>
              <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 4px;">
                ${isSuperAdmin ? 'Hanya Super Admin yang berhak memperbarui saldo awal kas pembukuan.' : 'Hanya dapat diubah oleh Super Admin.'}
              </div>
            </div>

            ${isSuperAdmin ? `
              <button type="submit" class="btn btn-primary btn-sm">Simpan Saldo Awal</button>
            ` : ''}
          </form>

          <hr style="border: none; border-top: 1px solid var(--border-color); margin: 24px 0;">

          <div class="form-group">
            <label>Pengaturan Iuran Mingguan</label>
            <div style="font-size: 13px; color: var(--text-secondary);">
              • Iuran per Anggota: <strong>Rp 10.000 / minggu</strong><br>
              • Jadwal: <strong>Kamis pukul 09.00 WITA</strong><br>
              • Zona Waktu: <strong>Asia/Makassar</strong>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>Koneksi Supabase (Live Cloud Database)</h3>
          </div>

          <form id="supabase-config-form" onsubmit="window.sbblApp.saveSupabaseConfig(event)">
            <div class="form-group">
              <label>Supabase Project URL</label>
              <input type="url" class="form-control" id="cfg-supabase-url" placeholder="https://xxxx.supabase.co" value="${escapeHtml(supabaseAdapter.url)}">
            </div>

            <div class="form-group">
              <label>Supabase Anon / Public Key</label>
              <input type="password" class="form-control" id="cfg-supabase-key" placeholder="eyJhbGciOi..." value="${escapeHtml(supabaseAdapter.anonKey)}">
            </div>

            <div class="form-group" style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" id="cfg-enable-live" ${supabaseAdapter.useLive ? 'checked' : ''} style="width: 16px; height: 16px;">
              <label for="cfg-enable-live" style="margin-bottom: 0; cursor: pointer;">Gunakan Koneksi Live Supabase</label>
            </div>

            <button type="submit" class="btn btn-primary btn-sm">Simpan Konfigurasi</button>
          </form>
        </div>
      </div>
    `;
  }

  // ============================================================================
  // MODALS
  // ============================================================================
  renderAllModals() {
    return `
      <!-- Modal: Tambah Transaksi -->
      <div class="modal-backdrop" id="modal-create-tx">
        <div class="modal-window">
          <div class="modal-header">
            <h3 id="modal-tx-title">Catat Transaksi Kas</h3>
            <button class="modal-close-btn" onclick="window.sbblApp.closeModal('modal-create-tx')">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <form id="form-create-tx" onsubmit="window.sbblApp.handleCreateTxSubmit(event)">
            <div class="modal-body">
              <div class="type-toggle-container">
                <button type="button" class="type-toggle-btn active income" id="btn-toggle-type-income" onclick="window.sbblApp.setModalTxType('income')">Pemasukan (+)</button>
                <button type="button" class="type-toggle-btn expense" id="btn-toggle-type-expense" onclick="window.sbblApp.setModalTxType('expense')">Pengeluaran (-)</button>
              </div>
              <input type="hidden" id="modal-tx-type" value="income">

              <div class="form-row">
                <div class="form-group">
                  <label>Tanggal Transaksi <span class="required">*</span></label>
                  <input type="date" class="form-control" id="modal-tx-date" required value="${new Date().toISOString().split('T')[0]}">
                </div>
                <div class="form-group">
                  <label>Nominal Rupiah (Rp) <span class="required">*</span></label>
                  <input type="number" min="1" step="1000" class="form-control" id="modal-tx-amount" required placeholder="Contoh: 50000">
                </div>
              </div>

              <div class="form-group">
                <label>Kategori Kas <span class="required">*</span></label>
                <select class="form-control" id="modal-tx-category" required></select>
              </div>

              <div class="form-group">
                <label>Deskripsi / Keterangan <span class="required">*</span></label>
                <input type="text" class="form-control" id="modal-tx-desc" required placeholder="Contoh: Iuran Kas Anggota Minggu I">
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>Pihak Terkait (Sumber/Tujuan) <span class="required">*</span></label>
                  <input type="text" class="form-control" id="modal-tx-counterparty" required placeholder="Nama pembayar atau penerima">
                </div>
                <div class="form-group">
                  <label>Metode Pembayaran / Sumber Kas <span class="required">*</span></label>
                  <select class="form-control" id="modal-tx-payment-method" onchange="window.sbblApp.handlePaymentMethodChange(this, 'create')">
                  </select>
                  <input type="text" class="form-control" id="modal-tx-custom-payment-method" placeholder="Ketik nama bank/metode baru (misal: Bank SeaBank)..." style="display: none; margin-top: 8px;">
                </div>
              </div>

              <div class="form-group">
                <label>Catatan Tambahan (Opsional)</label>
                <textarea class="form-control" id="modal-tx-notes" rows="2" placeholder="Catatan internal pengelola kas..."></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.sbblApp.closeModal('modal-create-tx')">Batal</button>
              <button type="submit" class="btn btn-primary" id="btn-submit-tx">Simpan Transaksi</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Modal: Edit Transaksi Kas -->
      <div class="modal-backdrop" id="modal-edit-tx">
        <div class="modal-window">
          <div class="modal-header">
            <h3 id="modal-edit-tx-title">Edit Transaksi Kas</h3>
            <button class="modal-close-btn" onclick="window.sbblApp.closeModal('modal-edit-tx')">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <form id="form-edit-tx" onsubmit="window.sbblApp.handleEditTxSubmit(event)">
            <input type="hidden" id="modal-edit-tx-id">
            <div class="modal-body">
              <div class="type-toggle-container">
                <button type="button" class="type-toggle-btn active income" id="btn-edit-toggle-type-income" onclick="window.sbblApp.setModalEditTxType('income')">Pemasukan (+)</button>
                <button type="button" class="type-toggle-btn expense" id="btn-edit-toggle-type-expense" onclick="window.sbblApp.setModalEditTxType('expense')">Pengeluaran (-)</button>
              </div>
              <input type="hidden" id="modal-edit-tx-type" value="income">

              <div class="form-row">
                <div class="form-group">
                  <label>Tanggal Transaksi <span class="required">*</span></label>
                  <input type="date" class="form-control" id="modal-edit-tx-date" required>
                </div>
                <div class="form-group">
                  <label>Nominal Rupiah (Rp) <span class="required">*</span></label>
                  <input type="number" min="1" step="1000" class="form-control" id="modal-edit-tx-amount" required placeholder="Contoh: 50000">
                </div>
              </div>

              <div class="form-group">
                <label>Kategori Kas <span class="required">*</span></label>
                <select class="form-control" id="modal-edit-tx-category" required></select>
              </div>

              <div class="form-group">
                <label>Deskripsi / Keterangan <span class="required">*</span></label>
                <input type="text" class="form-control" id="modal-edit-tx-desc" required placeholder="Contoh: Iuran Kas Anggota Minggu I">
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>Pihak Terkait (Sumber/Tujuan) <span class="required">*</span></label>
                  <input type="text" class="form-control" id="modal-edit-tx-counterparty" required placeholder="Nama pembayar atau penerima">
                </div>
                <div class="form-group">
                  <label>Metode Pembayaran / Rekening Bank <span class="required">*</span></label>
                  <select class="form-control" id="modal-edit-tx-payment-method" onchange="window.sbblApp.handlePaymentMethodChange(this, 'edit')">
                  </select>
                  <input type="text" class="form-control" id="modal-edit-tx-custom-payment-method" placeholder="Ketik nama bank/metode baru (misal: Bank SeaBank)..." style="display: none; margin-top: 8px;">
                </div>
              </div>

              <div class="form-group">
                <label>Catatan Tambahan (Opsional)</label>
                <textarea class="form-control" id="modal-edit-tx-notes" rows="2" placeholder="Catatan internal pengelola kas..."></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.sbblApp.closeModal('modal-edit-tx')">Batal</button>
              <button type="submit" class="btn btn-primary" id="btn-submit-edit-tx">Simpan Perubahan</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Modal: Void Transaksi (FR-04) -->
      <div class="modal-backdrop" id="modal-void-tx">
        <div class="modal-window">
          <div class="modal-header">
            <h3>Batalkan Transaksi Kas (Void)</h3>
            <button class="modal-close-btn" onclick="window.sbblApp.closeModal('modal-void-tx')">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <form id="form-void-tx" onsubmit="window.sbblApp.handleVoidTxSubmit(event)">
            <div class="modal-body">
              <p style="font-size: 13px; color: var(--danger); margin-bottom: 14px;">
                <strong>Perhatian:</strong> Transaksi tidak akan dihapus permanen untuk menjaga integritas data kas, melainkan ditandai sebagai 'Void' dan dikeluarkan dari perhitungan saldo.
              </p>
              <div class="form-group">
                <label>Alasan Pembatalan <span class="required">*</span></label>
                <textarea class="form-control" id="modal-void-reason" rows="3" required placeholder="Contoh: Kesalahan input nominal..."></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.sbblApp.closeModal('modal-void-tx')">Batal</button>
              <button type="submit" class="btn btn-danger">Konfirmasi Void</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Modal: Broadcast Pengumuman (FR-10, FR-12) -->
      <div class="modal-backdrop" id="modal-broadcast">
        <div class="modal-window">
          <div class="modal-header">
            <h3>Kirim Pengumuman Kas Internal</h3>
            <button class="modal-close-btn" onclick="window.sbblApp.closeModal('modal-broadcast')">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <form id="form-broadcast" onsubmit="window.sbblApp.handleBroadcastSubmit(event)">
            <div class="modal-body">
              <div class="form-group">
                <label>Judul Pengumuman <span class="required">*</span></label>
                <input type="text" class="form-control" id="modal-broadcast-title" required placeholder="Contoh: Jadwal Iuran Kas Minggu Ini">
              </div>

              <div class="form-group">
                <label>Isi Pesan Pengumuman <span class="required">*</span></label>
                <textarea class="form-control" id="modal-broadcast-body" rows="4" required placeholder="Tuliskan isi pengumuman untuk seluruh anggota kas..."></textarea>
              </div>

              <div style="font-size: 12px; color: var(--text-muted); background: var(--bg-card-subtle); padding: 10px; border-radius: var(--radius-sm);">
                Pesan ini akan dikirimkan ke <strong>${state.members.filter(m => m.status === 'approved').length} Anggota Approved</strong> melalui lonceng notifikasi internal.
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.sbblApp.closeModal('modal-broadcast')">Batal</button>
              <button type="submit" class="btn btn-primary">Siarkan Pengumuman</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Modal: Suspend Member (FR-07) -->
      <div class="modal-backdrop" id="modal-suspend-member">
        <div class="modal-window">
          <div class="modal-header">
            <h3>Tangguhkan Akun Anggota (Suspend)</h3>
            <button class="modal-close-btn" onclick="window.sbblApp.closeModal('modal-suspend-member')">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <form id="form-suspend-member" onsubmit="window.sbblApp.handleSuspendSubmit(event)">
            <div class="modal-body">
              <div class="form-group">
                <label>Alasan Penonaktifan Wajib Diisi <span class="required">*</span></label>
                <textarea class="form-control" id="modal-suspend-reason" rows="3" required placeholder="Contoh: Menunggak pembayaran iuran..."></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.sbblApp.closeModal('modal-suspend-member')">Batal</button>
              <button type="submit" class="btn btn-danger">Tangguhkan Akun</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Modal: Tambah Kategori (FR-08) -->
      <div class="modal-backdrop" id="modal-add-category">
        <div class="modal-window">
          <div class="modal-header">
            <h3>Tambah Kategori Kas Baru</h3>
            <button class="modal-close-btn" onclick="window.sbblApp.closeModal('modal-add-category')">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <form id="form-add-category" onsubmit="window.sbblApp.handleAddCategorySubmit(event)">
            <div class="modal-body">
              <div class="form-group">
                <label>Nama Kategori <span class="required">*</span></label>
                <input type="text" class="form-control" id="modal-cat-name" required placeholder="Contoh: Iuran Keamanan / Biaya Cetak">
              </div>

              <div class="form-group">
                <label>Jenis Kategori <span class="required">*</span></label>
                <select class="form-control" id="modal-cat-type">
                  <option value="income">Pemasukan (Income)</option>
                  <option value="expense">Pengeluaran (Expense)</option>
                </select>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.sbblApp.closeModal('modal-add-category')">Batal</button>
              <button type="submit" class="btn btn-primary">Tambah Kategori</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Modal: Edit Kategori Kas -->
      <div class="modal-backdrop" id="modal-edit-category">
        <div class="modal-window" style="max-width: 440px;">
          <div class="modal-header">
            <h3>Edit Kategori Kas</h3>
            <button class="modal-close-btn" onclick="window.sbblApp.closeModal('modal-edit-category')">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <form id="form-edit-category" onsubmit="window.sbblApp.handleEditCategorySubmit(event)">
            <input type="hidden" id="modal-edit-cat-id">
            <div class="modal-body">
              <div class="form-group">
                <label>Nama Kategori <span class="required">*</span></label>
                <input type="text" class="form-control" id="modal-edit-cat-name" required placeholder="Contoh: Iuran Kas, Donasi...">
              </div>
              <div class="form-group">
                <label>Jenis Kas <span class="required">*</span></label>
                <select class="form-control" id="modal-edit-cat-type" required>
                  <option value="income">Pemasukan (Income)</option>
                  <option value="expense">Pengeluaran (Expense)</option>
                </select>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.sbblApp.closeModal('modal-edit-category')">Batal</button>
              <button type="submit" class="btn btn-primary">Simpan Kategori</button>
            </div>
          </form>
        </div>
      </div>

      ${this.renderSupabaseSetupModal()}

      <!-- Modal: Edit Bank Accounts (Super Admin only) -->
      <div class="modal-backdrop" id="modal-edit-bank-accounts">
        <div class="modal-window" style="max-width: 600px;">
          <div class="modal-header">
            <h3>Edit Rekening Bank Kas SBBL</h3>
            <button class="modal-close-btn" onclick="window.sbblApp.closeModal('modal-edit-bank-accounts')">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <form id="form-edit-bank-accounts" onsubmit="window.sbblApp.handleEditBankAccountsSubmit(event)">
            <div class="modal-body">
              <div style="font-size: 12.5px; color: var(--text-secondary); margin-bottom: 16px; padding: 10px 12px; background: var(--bg-card-subtle); border-radius: var(--radius-md);">
                Kelola rekening bank / QRIS resmi kas bersama SBBL. Nomor rekening ini akan ditampilkan kepada seluruh anggota.
              </div>
              <div id="bank-accounts-editor">
                ${state.settings.bank_accounts.map((acc, idx) => `
                  <div class="bank-account-row" data-idx="${idx}" style="background: var(--bg-card-subtle); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 14px; margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                      <strong style="font-size: 13px;">Rekening #${idx + 1}</strong>
                      <button type="button" class="btn btn-sm btn-danger" onclick="window.sbblApp.removeBankAccountRow(${idx})">Hapus</button>
                    </div>
                    <div class="form-row">
                      <div class="form-group">
                        <label>Nama Bank / Metode</label>
                        <input type="text" class="form-control bank-name-input" value="${escapeHtml(acc.bank_name)}" placeholder="Contoh: Bank BCA" required>
                      </div>
                      <div class="form-group">
                        <label>Nomor Rekening / ID</label>
                        <input type="text" class="form-control bank-number-input" value="${escapeHtml(acc.account_number)}" placeholder="Contoh: 1234567890" required>
                      </div>
                    </div>
                    <div class="form-group">
                      <label>Atas Nama</label>
                      <input type="text" class="form-control bank-holder-input" value="${escapeHtml(acc.holder_name)}" placeholder="Contoh: KAS BERSAMA SBBL" required>
                    </div>
                  </div>
                `).join('')}
              </div>
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.sbblApp.addBankAccountRow()" style="width: 100%; margin-top: 4px;">
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                Tambah Rekening Baru
              </button>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.sbblApp.closeModal('modal-edit-bank-accounts')">Batal</button>
              <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Modal: Edit Schedule Config (Super Admin only) -->
      <div class="modal-backdrop" id="modal-edit-schedule">
        <div class="modal-window" style="max-width: 480px;">
          <div class="modal-header">
            <h3>Edit Konfigurasi Jadwal Iuran</h3>
            <button class="modal-close-btn" onclick="window.sbblApp.closeModal('modal-edit-schedule')">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <form id="form-edit-schedule" onsubmit="window.sbblApp.handleEditScheduleSubmit(event)">
            <div class="modal-body">
              <div style="font-size: 12.5px; color: var(--warning); background: var(--warning-bg); padding: 10px 12px; border-radius: var(--radius-md); margin-bottom: 16px; border-left: 3px solid var(--warning);">
                <strong>Perhatian:</strong> Perubahan konfigurasi jadwal akan mempengaruhi nominal iuran yang tertera pada pengingat otomatis seluruh anggota.
              </div>
              <div class="form-group">
                <label>Nominal Iuran per Anggota (IDR) <span class="required">*</span></label>
                <input type="number" class="form-control" id="modal-schedule-amount" min="1000" step="1000" value="${(state.settings.weekly_contribution_config || {}).amount || 10000}" required>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Hari Pelaksanaan <span class="required">*</span></label>
                  <select class="form-control" id="modal-schedule-day">
                    ${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => {
                      const labels = { Monday:'Senin', Tuesday:'Selasa', Wednesday:'Rabu', Thursday:'Kamis', Friday:'Jumat', Saturday:'Sabtu', Sunday:'Minggu' };
                      const curDay = (state.settings.weekly_contribution_config || {}).day || 'Thursday';
                      return `<option value="${d}" ${curDay === d ? 'selected' : ''}>${labels[d]}</option>`;
                    }).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label>Waktu Pelaksanaan (WITA) <span class="required">*</span></label>
                  <input type="time" class="form-control" id="modal-schedule-time" value="${(state.settings.weekly_contribution_config || {}).time || '09:00'}" required>
                </div>
              </div>
              <div class="form-group">
                <label>Zona Waktu</label>
                <input type="text" class="form-control" value="Asia/Makassar (WITA)" disabled>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.sbblApp.closeModal('modal-edit-schedule')">Batal</button>
              <button type="submit" class="btn btn-primary">Simpan Konfigurasi</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  renderSupabaseSetupModal() {
    return `
      <div class="modal-backdrop" id="modal-supabase-quick-setup">
        <div class="modal-window">
          <div class="modal-header">
            <h3>Konfigurasi Supabase (Live Cloud)</h3>
            <button class="modal-close-btn" onclick="window.sbblApp.closeModal('modal-supabase-quick-setup')">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <form onsubmit="window.sbblApp.handleQuickSupabaseSave(event)">
            <div class="modal-body">
              <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 14px;">
                Masukkan <strong>Project URL</strong> dan <strong>Anon Public Key</strong> dari dashboard Supabase Anda (<em>Project Settings &gt; API</em>).
              </p>
              <div class="form-group">
                <label>Supabase Project URL <span class="required">*</span></label>
                <input type="url" class="form-control" id="quick-cfg-url" required placeholder="https://xxxxxxxxxxxx.supabase.co" value="${escapeHtml(supabaseAdapter.url)}">
              </div>

              <div class="form-group">
                <label>Supabase Anon / Public Key <span class="required">*</span></label>
                <input type="password" class="form-control" id="quick-cfg-key" required placeholder="eyJhbGciOiJIUzI1NiIsInR5..." value="${escapeHtml(supabaseAdapter.anonKey)}">
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="window.sbblApp.closeModal('modal-supabase-quick-setup')">Batal</button>
              <button type="submit" class="btn btn-primary">Simpan & Aktifkan</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  // ============================================================================
  // EVENT ATTACHMENTS
  // ============================================================================
  setupGlobalEvents() {
    document.addEventListener('click', (e) => {
      if (e.target && (e.target.id === 'btn-toggle-theme' || e.target.closest('#btn-toggle-theme'))) {
        const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
        state.setTheme(nextTheme);
      }
    });

    document.addEventListener('click', (e) => {
      if (e.target && (e.target.id === 'btn-toggle-fullscreen' || e.target.closest('#btn-toggle-fullscreen'))) {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
          showToast('Mode Layar Penuh diaktifkan', 'info');
        } else {
          document.exitFullscreen().catch(() => {});
          showToast('Keluar dari Layar Penuh', 'info');
        }
      }
    });

    document.addEventListener('click', (e) => {
      if (e.target && (e.target.id === 'btn-toggle-sidebar' || e.target.closest('#btn-toggle-sidebar'))) {
        document.querySelector('.sidebar')?.classList.toggle('open');
        document.querySelector('.sidebar-backdrop')?.classList.toggle('open');
      }
      if (e.target && (e.target.id === 'sidebar-backdrop' || e.target.id === 'btn-close-sidebar' || e.target.closest('#btn-close-sidebar'))) {
        document.querySelector('.sidebar')?.classList.remove('open');
        document.querySelector('.sidebar-backdrop')?.classList.remove('open');
      }
    });

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('#btn-toggle-notifs');
      const panel = document.getElementById('notifications-panel');
      if (btn && panel) {
        panel.classList.toggle('open');
      } else if (panel && !panel.contains(e.target)) {
        panel.classList.remove('open');
      }
    });

    document.addEventListener('click', async (e) => {
      if (e.target && e.target.id === 'btn-mark-all-read') {
        await supabaseAdapter.markMyNotificationsRead();
        showToast('Semua notifikasi ditandai sudah dibaca.', 'success');
      }
    });

    document.addEventListener('click', async (e) => {
      if (e.target && (e.target.id === 'btn-header-logout' || e.target.closest('#btn-header-logout') || e.target.id === 'btn-logout')) {
        await supabaseAdapter.signOut();
        showToast('Anda telah keluar.', 'info');
        this.render();
      }
    });
  }

  attachLoginEvents() {
    const btnGoogle = document.getElementById('btn-google-login');
    if (btnGoogle) {
      btnGoogle.addEventListener('click', async () => {
        if (supabaseAdapter.isLiveMode()) {
          try {
            await supabaseAdapter.signInWithGoogle();
          } catch (err) {
            showToast(err.message, 'danger');
          }
        } else {
          openModal('modal-supabase-quick-setup');
        }
      });
    }
  }

  attachStatusScreenEvents() {
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', async () => {
        await supabaseAdapter.signOut();
        this.render();
      });
    }
  }

  attachAppEvents() {
    const searchInput = document.getElementById('tx-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.txFilter.search = e.target.value;
        this.render();
        const nextInput = document.getElementById('tx-search-input');
        if (nextInput) {
          nextInput.focus();
          nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
        }
      });
    }

    const typeFilter = document.getElementById('tx-type-filter');
    if (typeFilter) {
      typeFilter.addEventListener('change', (e) => {
        this.txFilter.type = e.target.value;
        this.render();
      });
    }

    const catFilter = document.getElementById('tx-category-filter');
    if (catFilter) {
      catFilter.addEventListener('change', (e) => {
        this.txFilter.category = e.target.value;
        this.render();
      });
    }

    const monthFilter = document.getElementById('tx-month-filter');
    if (monthFilter) {
      monthFilter.addEventListener('change', (e) => {
        this.txFilter.month = e.target.value;
        this.render();
      });
    }

    const repMonth = document.getElementById('report-month-select');
    if (repMonth) {
      repMonth.addEventListener('change', (e) => {
        this.reportFilter.month = parseInt(e.target.value, 10);
        this.render();
      });
    }

    const repYear = document.getElementById('report-year-select');
    if (repYear) {
      repYear.addEventListener('change', (e) => {
        this.reportFilter.year = parseInt(e.target.value, 10);
        this.render();
      });
    }

    const auditSearch = document.getElementById('audit-search-input');
    if (auditSearch) {
      auditSearch.addEventListener('input', (e) => {
        this.auditFilter.search = e.target.value;
        this.render();
        const nextIn = document.getElementById('audit-search-input');
        if (nextIn) {
          nextIn.focus();
          nextIn.setSelectionRange(nextIn.value.length, nextIn.value.length);
        }
      });
    }

    const auditEntity = document.getElementById('audit-entity-filter');
    if (auditEntity) {
      auditEntity.addEventListener('change', (e) => {
        this.auditFilter.entity = e.target.value;
        this.render();
      });
    }
  }

  // ============================================================================
  // ACTION HANDLERS
  // ============================================================================
  openSupabaseSetupModal() {
    openModal('modal-supabase-quick-setup');
  }

  handleQuickSupabaseSave(e) {
    e.preventDefault();
    const url = document.getElementById('quick-cfg-url').value;
    const key = document.getElementById('quick-cfg-key').value;

    supabaseAdapter.setLiveConfig(url, key, true);
    closeModal('modal-supabase-quick-setup');
    showToast('Koneksi Supabase berhasil disimpan! Silakan klik Masuk dengan Google.', 'success');
    this.render();
  }

  filterMembers(status) {
    this.memberFilter = status;
    this.render();
  }

  renderPaymentMethodOptions(selected = '') {
    const accounts = state.settings.bank_accounts || [];
    let html = '';

    accounts.forEach(acc => {
      const val = `Transfer Bank (${acc.bank_name})`;
      const isSel = selected === val || selected === acc.bank_name;
      html += `<option value="${escapeHtml(val)}" ${isSel ? 'selected' : ''}>${escapeHtml(acc.bank_name)} (${escapeHtml(acc.account_number)})</option>`;
    });

    const standard = ['QRIS SBBL', 'Kas Tunai (Fisik)'];
    standard.forEach(std => {
      const isSel = selected === std;
      html += `<option value="${escapeHtml(std)}" ${isSel ? 'selected' : ''}>${escapeHtml(std)}</option>`;
    });

    if (selected && !accounts.some(a => a.bank_name === selected || `Transfer Bank (${a.bank_name})` === selected) && !standard.includes(selected)) {
      html += `<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)}</option>`;
    }

    html += `<option value="__CUSTOM__">+ Ketik Nama Bank / Metode Lainnya...</option>`;
    return html;
  }

  handlePaymentMethodChange(selectEl, mode) {
    const customIn = document.getElementById(mode === 'create' ? 'modal-tx-custom-payment-method' : 'modal-edit-tx-custom-payment-method');
    if (selectEl.value === '__CUSTOM__') {
      if (customIn) {
        customIn.style.display = 'block';
        customIn.focus();
        customIn.required = true;
      }
    } else {
      if (customIn) {
        customIn.style.display = 'none';
        customIn.required = false;
      }
    }
  }

  openCreateTxModal(type = 'income') {
    this.setModalTxType(type);
    const pmSelect = document.getElementById('modal-tx-payment-method');
    if (pmSelect) {
      pmSelect.innerHTML = this.renderPaymentMethodOptions();
    }
    const customIn = document.getElementById('modal-tx-custom-payment-method');
    if (customIn) {
      customIn.style.display = 'none';
      customIn.value = '';
    }
    openModal('modal-create-tx');
  }

  setModalTxType(type) {
    const inputType = document.getElementById('modal-tx-type');
    const btnInc = document.getElementById('btn-toggle-type-income');
    const btnExp = document.getElementById('btn-toggle-type-expense');
    const catSelect = document.getElementById('modal-tx-category');
    const titleEl = document.getElementById('modal-tx-title');

    if (!inputType) return;
    inputType.value = type;

    if (type === 'income') {
      btnInc.classList.add('active');
      btnExp.classList.remove('active');
      if (titleEl) titleEl.innerText = 'Catat Pemasukan Kas';
    } else {
      btnExp.classList.add('active');
      btnInc.classList.remove('active');
      if (titleEl) titleEl.innerText = 'Catat Pengeluaran Kas';
    }

    if (catSelect) {
      const activeCats = state.categories.filter(c => c.type === type && c.is_active);
      catSelect.innerHTML = activeCats.map(c => `
        <option value="${c.id}">${escapeHtml(c.name)}</option>
      `).join('');
    }
  }

  async handleCreateTxSubmit(e) {
    e.preventDefault();
    try {
      let pm = document.getElementById('modal-tx-payment-method').value;
      if (pm === '__CUSTOM__') {
        const customVal = document.getElementById('modal-tx-custom-payment-method').value.trim();
        if (!customVal) throw new Error('Silakan ketik nama bank atau metode pembayaran baru.');
        pm = customVal;
      }

      const payload = {
        transaction_date: document.getElementById('modal-tx-date').value,
        type: document.getElementById('modal-tx-type').value,
        amount: document.getElementById('modal-tx-amount').value,
        category_id: document.getElementById('modal-tx-category').value,
        description: document.getElementById('modal-tx-desc').value,
        counterparty: document.getElementById('modal-tx-counterparty').value,
        payment_method: pm,
        notes: document.getElementById('modal-tx-notes').value
      };

      const res = await supabaseAdapter.createTransaction(payload);
      closeModal('modal-create-tx');
      showToast(res.message, 'success');
      e.target.reset();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  openEditTxModal(txId) {
    const tx = state.transactions.find(t => t.id === txId);
    if (!tx) {
      showToast('Transaksi tidak ditemukan.', 'danger');
      return;
    }
    this.pendingEditTxId = txId;

    document.getElementById('modal-edit-tx-id').value = tx.id;
    document.getElementById('modal-edit-tx-date').value = tx.transaction_date;
    document.getElementById('modal-edit-tx-amount').value = tx.amount;
    document.getElementById('modal-edit-tx-desc').value = tx.description;
    document.getElementById('modal-edit-tx-counterparty').value = tx.counterparty;
    document.getElementById('modal-edit-tx-notes').value = tx.notes || '';

    this.setModalEditTxType(tx.type, tx.category_id);

    const pmSelect = document.getElementById('modal-edit-tx-payment-method');
    if (pmSelect) {
      pmSelect.innerHTML = this.renderPaymentMethodOptions(tx.payment_method);
    }
    const customIn = document.getElementById('modal-edit-tx-custom-payment-method');
    if (customIn) {
      customIn.style.display = 'none';
      customIn.value = '';
    }

    openModal('modal-edit-tx');
  }

  setModalEditTxType(type, selectedCatId = null) {
    const inputType = document.getElementById('modal-edit-tx-type');
    const btnInc = document.getElementById('btn-edit-toggle-type-income');
    const btnExp = document.getElementById('btn-edit-toggle-type-expense');
    const catSelect = document.getElementById('modal-edit-tx-category');

    if (!inputType) return;
    inputType.value = type;

    if (type === 'income') {
      btnInc.classList.add('active');
      btnExp.classList.remove('active');
    } else {
      btnExp.classList.add('active');
      btnInc.classList.remove('active');
    }

    if (catSelect) {
      const activeCats = state.categories.filter(c => c.type === type && c.is_active);
      catSelect.innerHTML = activeCats.map(c => `
        <option value="${c.id}" ${c.id === selectedCatId ? 'selected' : ''}>${escapeHtml(c.name)}</option>
      `).join('');
    }
  }

  async handleEditTxSubmit(e) {
    e.preventDefault();
    try {
      const txId = document.getElementById('modal-edit-tx-id').value;
      let pm = document.getElementById('modal-edit-tx-payment-method').value;
      if (pm === '__CUSTOM__') {
        const customVal = document.getElementById('modal-edit-tx-custom-payment-method').value.trim();
        if (!customVal) throw new Error('Silakan ketik nama bank atau metode pembayaran baru.');
        pm = customVal;
      }

      const payload = {
        transaction_date: document.getElementById('modal-edit-tx-date').value,
        type: document.getElementById('modal-edit-tx-type').value,
        amount: document.getElementById('modal-edit-tx-amount').value,
        category_id: document.getElementById('modal-edit-tx-category').value,
        description: document.getElementById('modal-edit-tx-desc').value,
        counterparty: document.getElementById('modal-edit-tx-counterparty').value,
        payment_method: pm,
        notes: document.getElementById('modal-edit-tx-notes').value
      };

      const res = await supabaseAdapter.updateTransaction(txId, payload);
      closeModal('modal-edit-tx');
      showToast(res.message, 'success');
      this.pendingEditTxId = null;
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  openVoidTxModal(txId) {
    this.pendingVoidTxId = txId;
    openModal('modal-void-tx');
  }

  async handleVoidTxSubmit(e) {
    e.preventDefault();
    try {
      const reason = document.getElementById('modal-void-reason').value;
      if (!this.pendingVoidTxId) return;

      const res = await supabaseAdapter.voidTransaction(this.pendingVoidTxId, reason);
      closeModal('modal-void-tx');
      showToast(res.message, 'success');
      this.pendingVoidTxId = null;
      e.target.reset();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  openAnnouncementModal() {
    openModal('modal-broadcast');
  }

  async handleBroadcastSubmit(e) {
    e.preventDefault();
    try {
      const title = document.getElementById('modal-broadcast-title').value;
      const body = document.getElementById('modal-broadcast-body').value;

      const res = await supabaseAdapter.broadcastAnnouncement(title, body);
      closeModal('modal-broadcast');
      showToast(res.message, 'success');
      e.target.reset();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  openSuspendModal(memberId) {
    this.pendingSuspendMemberId = memberId;
    openModal('modal-suspend-member');
  }

  async handleSuspendSubmit(e) {
    e.preventDefault();
    try {
      const reason = document.getElementById('modal-suspend-reason').value;
      if (!this.pendingSuspendMemberId) return;

      const res = await supabaseAdapter.updateMemberStatus(this.pendingSuspendMemberId, 'suspended', reason);
      closeModal('modal-suspend-member');
      showToast(res.message, 'warning');
      this.pendingSuspendMemberId = null;
      e.target.reset();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  async updateMemberStatus(memberId, status) {
    try {
      const res = await supabaseAdapter.updateMemberStatus(memberId, status);
      showToast(res.message, 'success');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  async promoteMember(memberId) {
    try {
      const res = await supabaseAdapter.updateMemberRole(memberId, 'admin');
      showToast(res.message, 'success');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  async demoteMember(memberId) {
    try {
      const res = await supabaseAdapter.updateMemberRole(memberId, 'member');
      showToast(res.message, 'info');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  openAddCategoryModal() {
    openModal('modal-add-category');
  }

  async handleAddCategorySubmit(e) {
    e.preventDefault();
    try {
      const name = document.getElementById('modal-cat-name').value;
      const type = document.getElementById('modal-cat-type').value;

      await supabaseAdapter.createCategory(name, type);
      closeModal('modal-add-category');
      showToast('Kategori baru berhasil ditambahkan.', 'success');
      e.target.reset();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  async toggleCategory(categoryId) {
    try {
      const res = await supabaseAdapter.toggleCategoryStatus(categoryId);
      showToast(`Status kategori diperbarui (${res.is_active ? 'Aktif' : 'Non-Aktif'}).`, 'info');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  openEditCategoryModal(catId) {
    const cat = state.categories.find(c => c.id === catId);
    if (!cat) return;
    document.getElementById('modal-edit-cat-id').value = cat.id;
    document.getElementById('modal-edit-cat-name').value = cat.name;
    document.getElementById('modal-edit-cat-type').value = cat.type;
    openModal('modal-edit-category');
  }

  async handleEditCategorySubmit(e) {
    e.preventDefault();
    try {
      const catId = document.getElementById('modal-edit-cat-id').value;
      const name = document.getElementById('modal-edit-cat-name').value;
      const type = document.getElementById('modal-edit-cat-type').value;

      const res = await supabaseAdapter.updateCategory(catId, name, type);
      closeModal('modal-edit-category');
      showToast(res.message, 'success');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  async saveOrganizationInfo(e) {
    e.preventDefault();
    try {
      const app_name = document.getElementById('settings-app-name').value;
      const short_name = document.getElementById('settings-short-name').value;
      const tagline = document.getElementById('settings-tagline').value;

      const res = await supabaseAdapter.updateOrganizationInfo({ app_name, short_name, tagline });
      showToast(res.message, 'success');
      this.render();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  async triggerScheduledTest() {
    try {
      const res = await supabaseAdapter.triggerWeeklyReminder();
      if (res.skipped) {
        showToast(res.message, 'warning');
      } else {
        showToast(res.message, 'success');
      }
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  async saveOpeningBalance(e) {
    e.preventDefault();
    try {
      const val = document.getElementById('settings-opening-balance-input').value;
      const res = await supabaseAdapter.updateOpeningBalance(val);
      showToast(res.message, 'success');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  saveSupabaseConfig(e) {
    e.preventDefault();
    const url = document.getElementById('cfg-supabase-url').value;
    const key = document.getElementById('cfg-supabase-key').value;
    const live = document.getElementById('cfg-enable-live').checked;

    supabaseAdapter.setLiveConfig(url, key, live);
    showToast('Konfigurasi Supabase berhasil disimpan.', 'success');
    this.render();
  }

  exportReportCSV() {
    const stats = state.getMonthlyStats(this.reportFilter.year, this.reportFilter.month);
    let csv = 'Tanggal,Deskripsi,Pihak Terkait,Kategori,Tipe,Nominal (IDR),Metode,Status,Alasan Void\n';

    stats.transactions.forEach(t => {
      const cat = state.categories.find(c => c.id === t.category_id);
      const row = [
        `"${t.transaction_date}"`,
        `"${(t.description || '').replace(/"/g, '""')}"`,
        `"${(t.counterparty || '').replace(/"/g, '""')}"`,
        `"${(cat ? cat.name : '').replace(/"/g, '""')}"`,
        `"${t.type}"`,
        t.amount,
        `"${(t.payment_method || '').replace(/"/g, '""')}"`,
        `"${t.status}"`,
        `"${(t.void_reason || '').replace(/"/g, '""')}"`
      ];
      csv += row.join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Laporan_Kas_SBBL_${this.reportFilter.year}_${String(this.reportFilter.month).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('File laporan CSV berhasil diunduh.', 'success');
  }

  openEditBankAccountsModal() {
    openModal('modal-edit-bank-accounts');
  }

  openEditScheduleModal() {
    openModal('modal-edit-schedule');
  }

  addBankAccountRow() {
    const editor = document.getElementById('bank-accounts-editor');
    if (!editor) return;
    const idx = editor.querySelectorAll('.bank-account-row').length;
    const row = document.createElement('div');
    row.className = 'bank-account-row';
    row.dataset.idx = idx;
    row.style.cssText = 'background: var(--bg-card-subtle); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 14px; margin-bottom: 12px;';
    row.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <strong style="font-size: 13px;">Rekening #${idx + 1}</strong>
        <button type="button" class="btn btn-sm btn-danger" onclick="window.sbblApp.removeBankAccountRow(${idx})">Hapus</button>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Nama Bank / Metode</label>
          <input type="text" class="form-control bank-name-input" placeholder="Contoh: Bank BCA" required>
        </div>
        <div class="form-group">
          <label>Nomor Rekening / ID</label>
          <input type="text" class="form-control bank-number-input" placeholder="Contoh: 1234567890" required>
        </div>
      </div>
      <div class="form-group">
        <label>Atas Nama</label>
        <input type="text" class="form-control bank-holder-input" placeholder="Contoh: KAS BERSAMA SBBL" required>
      </div>
    `;
    editor.appendChild(row);
  }

  removeBankAccountRow(idx) {
    const editor = document.getElementById('bank-accounts-editor');
    if (!editor) return;
    const rows = editor.querySelectorAll('.bank-account-row');
    if (rows.length <= 1) {
      showToast('Minimal harus ada 1 rekening bank.', 'warning');
      return;
    }
    rows[idx]?.remove();
    // Re-index labels
    editor.querySelectorAll('.bank-account-row').forEach((row, i) => {
      const label = row.querySelector('strong');
      if (label) label.textContent = `Rekening #${i + 1}`;
    });
  }

  async handleEditBankAccountsSubmit(e) {
    e.preventDefault();
    try {
      const user = state.currentUser;
      if (user.role !== 'super_admin') {
        showToast('Hanya Super Admin yang dapat mengubah rekening bank.', 'danger');
        return;
      }
      const rows = document.querySelectorAll('#bank-accounts-editor .bank-account-row');
      const bankAccounts = [];
      rows.forEach(row => {
        const bank_name = row.querySelector('.bank-name-input')?.value?.trim();
        const account_number = row.querySelector('.bank-number-input')?.value?.trim();
        const holder_name = row.querySelector('.bank-holder-input')?.value?.trim();
        if (bank_name && account_number && holder_name) {
          bankAccounts.push({ bank_name, account_number, holder_name });
        }
      });
      const res = await supabaseAdapter.updateBankAccounts(bankAccounts);
      closeModal('modal-edit-bank-accounts');
      showToast(res.message, 'success');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  async handleEditScheduleSubmit(e) {
    e.preventDefault();
    try {
      const user = state.currentUser;
      if (user.role !== 'super_admin') {
        showToast('Hanya Super Admin yang dapat mengubah konfigurasi jadwal.', 'danger');
        return;
      }
      const config = {
        amount: document.getElementById('modal-schedule-amount').value,
        day: document.getElementById('modal-schedule-day').value,
        time: document.getElementById('modal-schedule-time').value
      };
      const res = await supabaseAdapter.updateScheduleConfig(config);
      closeModal('modal-edit-schedule');
      showToast(res.message, 'success');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  copyFeedback() {
    showToast('Nomor rekening disalin ke clipboard!', 'success');
  }

  closeModal(modalId) {
    closeModal(modalId);
  }
}

window.sbblApp = new SBBLApp();
document.addEventListener('DOMContentLoaded', () => {
  window.sbblApp.init();
});
