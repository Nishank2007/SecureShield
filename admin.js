/* ═══════════════════════════════════════════════════════════════
   SecureShield Admin — Dashboard Engine
   Features:
     • JWT admin login with 3-attempt lockout + fire alarm
     • Stats cards, user table with search
     • User management (verify, suspend, delete)
     • Sidebar navigation
   ═══════════════════════════════════════════════════════════════ */

const API_BASE =
    typeof window !== 'undefined' && window.__API_ORIGIN__ != null
        ? window.__API_ORIGIN__
        : 'http://localhost:6000';

let adminToken = sessionStorage.getItem('adminToken') || null;
let searchTimeout = null;

// ── Security: Failed login tracking ─────────────────────────────
let failedAttempts = 0;
const MAX_ATTEMPTS = 3;
let breachAlarm = null;
let cooldownActive = false;


// ═══════════════════════════════════════════════════════════════
//  VIEW MANAGEMENT
// ═══════════════════════════════════════════════════════════════

function showLoginView() {
    document.getElementById('loginView').style.display = 'flex';
    document.getElementById('dashboardView').style.display = 'none';
}

function showDashboardView() {
    document.getElementById('loginView').style.display = 'none';
    document.getElementById('dashboardView').style.display = 'flex';
}

// ── Message helpers ────────────────────────────────────────────
function showMsg(id, text, type = 'error') {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = (id === 'adminMsg' ? 'login-msg' : 'dashboard-msg') + ' ' + type;
}

function clearMsg(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = '';
    el.className = id === 'adminMsg' ? 'login-msg' : 'dashboard-msg';
}


// ═══════════════════════════════════════════════════════════════
//  SECURITY BREACH — 3 WRONG PASSWORDS → FIRE ALARM
// ═══════════════════════════════════════════════════════════════

function triggerBreach() {
    cooldownActive = true;

    const overlay    = document.getElementById('breachOverlay');
    const retryBtn   = document.getElementById('breachRetryBtn');
    const timerEl    = document.getElementById('breachTimer');

    overlay.classList.add('active');
    retryBtn.disabled = true;
    retryBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10"/><path d="M22 2v6h-6"/></svg>
        SYSTEM LOCKED`;

    // Start fire alarm (uses security-alarm.js)
    if (typeof SecurityAlarm !== 'undefined') {
        if (breachAlarm) { breachAlarm.stop(); breachAlarm = null; }
        breachAlarm = new SecurityAlarm({
            primaryFreq:   3100,
            secondaryFreq: 2350,
            blastDuration: 500,
            blastGap:      500,
            burstPause:    1500,
            blastsPerCycle: 3,
            volume:        0.85,
            voiceEnabled:  true,
            voiceInterval: 8000
        });
        breachAlarm.start();
    }

    // Shake the login card
    const loginCard = document.getElementById('loginCard');
    if (loginCard) {
        loginCard.classList.add('shake');
        setTimeout(() => loginCard.classList.remove('shake'), 600);
    }

    let sec = 30;
    timerEl.textContent = sec;

    const interval = setInterval(() => {
        sec--;
        timerEl.textContent = sec;

        if (sec <= 0) {
            clearInterval(interval);
            // Stop alarm
            if (breachAlarm) { breachAlarm.stop(); breachAlarm = null; }
            retryBtn.disabled = false;
            retryBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10"/><path d="M22 2v6h-6"/></svg>
                RETRY SESSION`;
        }
    }, 1000);
}

function resetBreach() {
    failedAttempts = 0;
    cooldownActive = false;
    if (breachAlarm) { breachAlarm.stop(); breachAlarm = null; }
    document.getElementById('breachOverlay').classList.remove('active');
    document.getElementById('loginAttempts').textContent = '';
    clearMsg('adminMsg');
}

function handleLoginFailure() {
    failedAttempts++;
    const remaining = MAX_ATTEMPTS - failedAttempts;

    if (failedAttempts >= MAX_ATTEMPTS) {
        triggerBreach();
    } else {
        // Show remaining attempts
        document.getElementById('loginAttempts').textContent =
            `⚠ ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before lockout`;

        // Shake card
        const loginCard = document.getElementById('loginCard');
        loginCard.classList.add('shake');
        setTimeout(() => loginCard.classList.remove('shake'), 600);
    }
}


// ═══════════════════════════════════════════════════════════════
//  ADMIN LOGIN
// ═══════════════════════════════════════════════════════════════

function saveToken(token) {
    adminToken = token;
    try { sessionStorage.setItem('adminToken', token); } catch (e) {}
}

async function handleAdminLogin() {
    if (cooldownActive) return;
    clearMsg('adminMsg');

    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value;

    if (!username || !password) {
        return showMsg('adminMsg', 'Please enter both username and password.', 'error');
    }

    const button = document.getElementById('adminLoginBtn');
    button.disabled = true;
    button.innerHTML = '<span class="login-spinner"></span>Signing in…';

    try {
        const res = await fetch(`${API_BASE}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (!data.success) {
            showMsg('adminMsg', data.message || 'Invalid credentials.', 'error');
            handleLoginFailure();
        } else {
            saveToken(data.token);
            failedAttempts = 0;
            document.getElementById('loginAttempts').textContent = '';
            showDashboardView();
            loadAdminDashboard();
        }
    } catch (err) {
        showMsg('adminMsg', 'Unable to reach server. Is the backend running?', 'error');
    }

    button.disabled = false;
    button.innerHTML = '<span class="login-btn-text">Sign In</span><svg class="login-btn-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
}

// Allow Enter key to submit login
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const loginView = document.getElementById('loginView');
        if (loginView && loginView.style.display !== 'none') {
            handleAdminLogin();
        }
    }
});


// ═══════════════════════════════════════════════════════════════
//  DASHBOARD DATA
// ═══════════════════════════════════════════════════════════════

async function loadAdminDashboard() {
    clearMsg('adminMsgDashboard');
    if (!adminToken) {
        showLoginView();
        return;
    }
    await Promise.all([fetchAdminStats(), fetchAdminUsers()]);
}

async function fetchAdminStats() {
    try {
        const res = await fetch(`${API_BASE}/api/admin/stats`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Failed to load stats');

        // Animate counter
        animateValue('statTotal', data.stats.total);
        animateValue('statActive', data.stats.active);
        animateValue('statSuspended', data.stats.suspended);
        animateValue('statVerified', data.stats.verified);
        animateValue('statBreached', data.stats.breached || 0);
        animateValue('statLocked', data.stats.locked || 0);
    } catch (err) {
        showMsg('adminMsgDashboard', err.message || 'Unable to load stats.', 'error');
    }
}

function animateValue(id, target) {
    const el = document.getElementById(id);
    const start = parseInt(el.textContent) || 0;
    const duration = 600;
    const startTime = performance.now();

    function update(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        el.textContent = Math.round(start + (target - start) * eased);
        if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}

async function fetchAdminUsers() {
    const searchEl = document.getElementById('globalSearch') || document.getElementById('userSearch');
    const search = searchEl ? searchEl.value.trim() : '';
    const query  = search ? `?search=${encodeURIComponent(search)}` : '';

    try {
        const res = await fetch(`${API_BASE}/api/admin/users${query}`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Unable to load users');

        renderUserTable(data.users);

        // Update user count badge
        const countEl = document.getElementById('userCount');
        if (countEl) countEl.textContent = `${data.users.length} user${data.users.length !== 1 ? 's' : ''}`;
    } catch (err) {
        showMsg('adminMsgDashboard', err.message || 'Unable to load users.', 'error');
        document.getElementById('userTableBody').innerHTML =
            '<tr><td colspan="6" class="table-empty">Unable to load users.</td></tr>';
    }
}

function renderUserTable(users) {
    const tbody = document.getElementById('userTableBody');
    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No users found.</td></tr>';
        return;
    }

    tbody.innerHTML = users.map((user, i) => {
        let statusBadge = '';
        let borderColor = 'transparent';

        // 1. Locked / Breach
        if (user.status === 'Locked') {
            statusBadge = '<span class="badge danger" style="background: #7f1d1d;">Locked</span>';
            borderColor = '#ef4444'; // Red
        } 
        // 2. Suspended
        else if (user.isActive === false) {
            statusBadge = '<span class="badge danger" style="background: #ef4444;">Suspended</span>';
            borderColor = '#ef4444'; // Red
        } 
        // 3. Verified
        else if (user.status === 'Verified' || user.mobileVerified === true) {
            statusBadge = '<span class="badge active" style="background: #10b981;">Verified</span>';
            borderColor = '#10b981'; // Green
        } 
        // 4. Unverified
        else {
            statusBadge = '<span class="badge unverified" style="background: #f59e0b;">Unverified</span>';
            borderColor = '#f59e0b'; // Yellow
        }

        // Failed attempts display
        const failedAttempts = `P:${user.failedPasswordAttempts || 0} O:${user.failedOtpAttempts || 0} C:${user.failedCaptchaAttempts || 0}`;

        const roleBadge = user.role === 'admin'
            ? '<span class="badge admin">Admin</span>'
            : '<span class="badge active">User</span>';

        // Action buttons
        let actionButtons = `
            <div class="action-buttons">
                <button class="action-btn" onclick="toggleUserVerification('${user._id}', ${user.mobileVerified})">${user.mobileVerified ? 'Unverify' : 'Verify'}</button>
                <button class="action-btn" onclick="toggleUserStatus('${user._id}', ${user.isActive})">${user.isActive ? 'Suspend' : 'Activate'}</button>`;

        // Add unlock button for locked accounts
        if (user.status === 'Locked') {
            actionButtons += `<button class="action-btn unlock" onclick="unlockUser('${user._id}')" style="background: #059669;">Unlock</button>`;
        }

        actionButtons += `<button class="action-btn danger" onclick="deleteUser('${user._id}')">Delete</button></div>`;

        return `
            <tr style="animation-delay: ${i * 0.04}s">
                <td style="color:var(--text-primary);font-weight:500;border-left: 3px solid ${borderColor};">${user.email || '—'}</td>
                <td>${user.countryCode || ''} ${user.mobile || '—'}</td>
                <td>${statusBadge}</td>
                <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.9em;">${failedAttempts}</td>
                <td>${roleBadge}</td>
                <td>${actionButtons}</td>
            </tr>`;
    }).join('');
}


// ═══════════════════════════════════════════════════════════════
//  USER MANAGEMENT ACTIONS
// ═══════════════════════════════════════════════════════════════

async function toggleUserStatus(userId, currentStatus) {
    if (!confirm(`Are you sure you want to ${currentStatus ? 'suspend' : 'activate'} this user?`)) return;
    try {
        const res = await fetch(`${API_BASE}/api/admin/users/${userId}/toggle-status`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Unable to update user status');
        showMsg('adminMsgDashboard', data.message, 'success');
        loadAdminDashboard();
    } catch (err) {
        showMsg('adminMsgDashboard', err.message || 'Unable to update user.', 'error');
    }
}

async function toggleUserVerification(userId, currentStatus) {
    if (!confirm(`Are you sure you want to ${currentStatus ? 'unverify' : 'verify'} this user's mobile?`)) return;
    try {
        const res = await fetch(`${API_BASE}/api/admin/users/${userId}/toggle-verification`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Unable to update verification');
        showMsg('adminMsgDashboard', data.message, 'success');
        loadAdminDashboard();
    } catch (err) {
        showMsg('adminMsgDashboard', err.message || 'Unable to update user.', 'error');
    }
}

async function deleteUser(userId) {
    if (!confirm('Are you sure you want to permanently delete this user?')) return;
    try {
        const res = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Unable to delete user');
        showMsg('adminMsgDashboard', data.message, 'success');
        loadAdminDashboard();
    } catch (err) {
        showMsg('adminMsgDashboard', err.message || 'Unable to delete user.', 'error');
    }
}

async function unlockUser(userId) {
    if (!confirm('Are you sure you want to unlock this user? This will reset all failed attempts and require the user to verify again.')) return;
    try {
        const res = await fetch(`${API_BASE}/api/admin/users/${userId}/unlock`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Unable to unlock user');
        showMsg('adminMsgDashboard', data.message, 'success');
        loadAdminDashboard();
    } catch (err) {
        showMsg('adminMsgDashboard', err.message || 'Unable to unlock user.', 'error');
    }
}


// ═══════════════════════════════════════════════════════════════
//  SIDEBAR & NAVIGATION
// ═══════════════════════════════════════════════════════════════

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

// Close sidebar on outside click (mobile)
document.addEventListener('click', (e) => {
    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('sidebarToggle');
    if (sidebar && sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) && !toggle.contains(e.target)) {
        sidebar.classList.remove('open');
    }
});

// Nav item clicks
document.addEventListener('click', (e) => {
    const navItem = e.target.closest('.nav-item');
    if (!navItem) return;
    e.preventDefault();

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    navItem.classList.add('active');

    const page = navItem.dataset.page;
    const title = document.getElementById('pageTitle');
    const subtitle = document.getElementById('pageSubtitle');

    if (page === 'dashboard') {
        title.textContent = 'Dashboard';
        subtitle.textContent = 'Overview & analytics';
    } else if (page === 'users') {
        title.textContent = 'Users';
        subtitle.textContent = 'Manage registered accounts';
    } else if (page === 'settings') {
        title.textContent = 'Settings';
        subtitle.textContent = 'System configuration';
    }

    // Close sidebar on mobile
    document.getElementById('sidebar').classList.remove('open');
});


// ═══════════════════════════════════════════════════════════════
//  SEARCH
// ═══════════════════════════════════════════════════════════════

function debouncedSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(fetchAdminUsers, 350);
}


// ═══════════════════════════════════════════════════════════════
//  LOGOUT
// ═══════════════════════════════════════════════════════════════

function logoutAdmin() {
    adminToken = null;
    try { sessionStorage.removeItem('adminToken'); } catch (e) {}
    showLoginView();
    clearMsg('adminMsg');
    clearMsg('adminMsgDashboard');
    document.getElementById('adminUsername').value = '';
    document.getElementById('adminPassword').value = '';
}


// ═══════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════

window.addEventListener('DOMContentLoaded', () => {
    if (adminToken) {
        showDashboardView();
        loadAdminDashboard();
    } else {
        showLoginView();
    }
});
