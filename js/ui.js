// ==============================================================================
// SISTEM BERBAGI BALIK LAYAR (SBBL) - UI COMPONENTS & HELPERS
// ==============================================================================

import { state } from './state.js';

// Toast Notification System
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = {
    success: `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`,
    danger: `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`,
    warning: `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`,
    info: `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
  };

  toast.innerHTML = `
    <div style="flex-shrink:0; display:flex;">${icons[type] || icons.info}</div>
    <div style="flex:1;">${escapeHtml(message)}</div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 200);
  }, 4000);
}

// Modal Helpers
export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
}

// Close modal on click backdrop
export function setupModalBackdrops() {
  document.querySelectorAll('.modal-backdrop').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal(modal.id);
      }
    });
  });
}

// HTML escape helper to prevent XSS (NFR-01)
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Real-time WITA Clock Updater in Header
export function initWITAClock() {
  const clockEl = document.getElementById('header-wita-clock');
  if (!clockEl) return;

  function update() {
    const now = new Date();
    const witaTime = now.toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Makassar',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    clockEl.innerText = `${witaTime} WITA`;
  }

  update();
  setInterval(update, 1000);
}

// Notification Drawer Toggle & Badge Updater
export function updateNotificationBadge() {
  const badgeEl = document.getElementById('notif-badge-count');
  const panelListEl = document.getElementById('notif-panel-list');
  const user = state.currentUser;

  if (!user) return;

  // Filter notifications for current user
  const userNotifs = state.notifications.filter(n => n.recipient_id === user.id);
  const unreadCount = userNotifs.filter(n => !n.read_at).length;

  if (badgeEl) {
    if (unreadCount > 0) {
      badgeEl.style.display = 'block';
      badgeEl.innerText = unreadCount > 99 ? '99+' : unreadCount;
    } else {
      badgeEl.style.display = 'none';
    }
  }

  if (panelListEl) {
    if (userNotifs.length === 0) {
      panelListEl.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">
          Belum ada notifikasi untuk Anda.
        </div>
      `;
    } else {
      panelListEl.innerHTML = userNotifs.map(n => {
        const isUnread = !n.read_at;
        const timeFormatted = new Date(n.created_at).toLocaleString('id-ID', {
          timeZone: 'Asia/Makassar',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }) + ' WITA';

        const typeBadges = {
          announcement: `<span class="badge badge-info">Pengumuman</span>`,
          contribution_reminder: `<span class="badge badge-warning">Iuran</span>`,
          payment_recorded: `<span class="badge badge-success">Pembayaran</span>`,
          transaction_update: `<span class="badge badge-neutral">Kas</span>`,
          system: `<span class="badge badge-neutral">Sistem</span>`
        };

        return `
          <div class="notif-item ${isUnread ? 'unread' : ''}" data-id="${n.id}">
            <div class="notif-dot"></div>
            <div class="notif-content">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 2px;">
                <div class="notif-title">${escapeHtml(n.title)}</div>
                ${typeBadges[n.type] || ''}
              </div>
              <div class="notif-body">${escapeHtml(n.body)}</div>
              <div class="notif-time">${timeFormatted}</div>
            </div>
          </div>
        `;
      }).join('');
    }
  }
}
