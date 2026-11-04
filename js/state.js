// ==============================================================================
// SISTEM BERBAGI BALIK LAYAR (SBBL) - STATE MANAGEMENT & BUSINESS LOGIC
// Clean Production Version (Real Data & Dynamic Supabase Sync)
// ==============================================================================

import {
  APP_CONFIG,
  STORAGE_KEYS,
  INITIAL_CATEGORIES,
  INITIAL_MEMBERS,
  INITIAL_TRANSACTIONS,
  INITIAL_NOTIFICATIONS,
  INITIAL_AUDIT_LOGS,
  INITIAL_DELIVERY_LOGS
} from './config.js';

class AppState {
  constructor() {
    this.subscribers = [];
    this.categories = [...INITIAL_CATEGORIES];
    this.members = [...INITIAL_MEMBERS];
    this.transactions = [...INITIAL_TRANSACTIONS];
    this.notifications = [...INITIAL_NOTIFICATIONS];
    this.auditLogs = [...INITIAL_AUDIT_LOGS];
    this.deliveryLogs = [...INITIAL_DELIVERY_LOGS];
    this.settings = {
      opening_balance: APP_CONFIG.OPENING_BALANCE_DEFAULT,
      bank_accounts: [
        { bank_name: 'Bank Central Asia (BCA)', account_number: '8720194821', holder_name: 'KAS BERSAMA SBBL' },
        { bank_name: 'Bank Mandiri', account_number: '1420019283741', holder_name: 'KAS BERSAMA SBBL' },
        { bank_name: 'QRIS SBBL', account_number: 'NMID-938172948172', holder_name: 'KAS SBBL' }
      ]
    };
    this.currentUser = null;
    this.theme = localStorage.getItem(STORAGE_KEYS.THEME) || 'light';

    // Load persisted active session if any
    const savedUser = localStorage.getItem(STORAGE_KEYS.AUTH_USER);
    if (savedUser) {
      try {
        this.currentUser = JSON.parse(savedUser);
      } catch (e) {
        this.currentUser = null;
      }
    }
  }

  saveState() {
    if (this.currentUser) {
      localStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(this.currentUser));
    } else {
      localStorage.removeItem(STORAGE_KEYS.AUTH_USER);
    }
  }

  notify() {
    this.saveState();
    this.subscribers.forEach(cb => cb(this));
  }

  subscribe(callback) {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  setCurrentUser(user) {
    this.currentUser = user;
    this.saveState();
    this.notify();
  }

  setTheme(theme) {
    this.theme = theme;
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
    document.body.classList.toggle('dark', theme === 'dark');
    this.notify();
  }

  // ============================================================================
  // BUSINESS CALCULATIONS (As defined in PRD FR-03 & Section 11)
  // ============================================================================

  getTotalActiveIncome() {
    return this.transactions
      .filter(t => t.status === 'active' && t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }

  getTotalActiveExpense() {
    return this.transactions
      .filter(t => t.status === 'active' && t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }

  // Current Saldo: Saldo = Saldo Awal + Total Pemasukan Aktif - Total Pengeluaran Aktif
  getCurrentSaldo() {
    const opening = Number(this.settings.opening_balance || 0);
    const income = this.getTotalActiveIncome();
    const expense = this.getTotalActiveExpense();
    return opening + income - expense;
  }

  getMonthlyStats(year, month) {
    const now = new Date();
    const y = year || now.getFullYear();
    const m = month || (now.getMonth() + 1);

    const monthStr = String(m).padStart(2, '0');
    const periodPrefix = `${y}-${monthStr}`;

    const periodTransactions = this.transactions.filter(t => {
      return t.transaction_date && t.transaction_date.startsWith(periodPrefix);
    });

    const activePeriodTransactions = periodTransactions.filter(t => t.status === 'active');
    const income = activePeriodTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const expense = activePeriodTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const priorTransactions = this.transactions.filter(t => {
      return t.status === 'active' && t.transaction_date && t.transaction_date < `${periodPrefix}-01`;
    });

    const priorIncome = priorTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const priorExpense = priorTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const openingBalancePeriod = Number(this.settings.opening_balance || 0) + priorIncome - priorExpense;
    const closingBalancePeriod = openingBalancePeriod + income - expense;

    return {
      periodPrefix,
      year: y,
      month: m,
      openingBalance: openingBalancePeriod,
      income,
      expense,
      closingBalance: closingBalancePeriod,
      netChange: income - expense,
      totalCount: periodTransactions.length,
      activeCount: activePeriodTransactions.length,
      transactions: periodTransactions
    };
  }

  get6MonthTrend() {
    const result = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const monthName = d.toLocaleString('id-ID', { month: 'short' });
      const stats = this.getMonthlyStats(year, month);
      result.push({
        label: `${monthName} ${year}`,
        income: stats.income,
        expense: stats.expense,
        year,
        month
      });
    }
    return result;
  }

  logAudit(action, entity, details) {
    const entry = {
      id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      created_at: new Date().toISOString(),
      actor_email: this.currentUser ? this.currentUser.email : 'system@sbbl.id',
      action,
      entity,
      details
    };
    this.auditLogs.unshift(entry);
    this.saveState();
  }
}

export const state = new AppState();

export function formatCurrency(amount) {
  const num = Number(amount || 0);
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(num);
}

export function formatDateWITA(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  return d.toLocaleString('id-ID', {
    timeZone: 'Asia/Makassar',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) + ' WITA';
}

export function formatDateShort(dateStr) {
  if (!dateStr) return '-';
  const [year, month, day] = dateStr.split('-');
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}
