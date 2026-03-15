/**
 * ============================================================
 *  IT TICKETING PLATFORM — Admin Panel Logic
 *  File: js/admin_panel.js
 * ============================================================
 */

let allTickets = [];
let allUsers = [];
let currentTicketId = null;
let currentUserEmail = null;
let taskPieChartInstance = null;
let categoryBarChartInstance = null;
let deptBarChartInstance = null;

// ── PAGINATION STATE ──
let currentPage = 1;
const ticketsPerPage = 20;
let filteredTickets = []; // Store current filtered set for pagination
let isFirstLoad = true;

// ── USER PAGINATION STATE ──
let userCurrentPage = 1;
const usersPerPage = 20;
let filteredUsers = [];

window.addEventListener('DOMContentLoaded', () => {

    // ── Auth guard: must be logged in AND an admin ────────
    const user = requireLogin(true);
    if (!user) return; // redirecting...

    currentUserEmail = user.email || 'admin@basilur.com';

    // ── Render nav ────────────────────────────────────────
    renderNav('admin');

    // ── Populate Hero Welcome ─────────────────────────────
    const heroWelcome = document.getElementById('heroWelcome');
    const userNameText = document.getElementById('userNameText');
    if (heroWelcome && userNameText && user) {
        const firstName = (user.name || user.email.split('@')[0]).split(' ')[0];
        userNameText.textContent = firstName;
        heroWelcome.style.display = 'block';
    }

    // ── Skip password gate — role already confirmed ───────
    const authGate = document.getElementById('authGate');
    const adminPanel = document.getElementById('adminPanel');
    if (authGate) authGate.style.display = 'none';
    if (adminPanel) adminPanel.style.display = 'block';

    // ── Pre-load users (needed for ticket assignment modals) ──
    loadUsers();

    // ── Restore Active Tab ──
    const lastTab = localStorage.getItem('adminActiveTab') || 'tickets';
    switchTab(lastTab);

    // ── Populate departments dynamically ──────────────────
    populateAdminDepartmentDropdowns();

    // Close modal when clicking outside
    const ticketModal = document.getElementById('ticketModal');
    if (ticketModal) {
        ticketModal.addEventListener('click', function (e) {
            if (e.target === this) closeModal();
        });
    }

    // Close modal with Escape key
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeModal();
    });
});

// ── AUTHENTICATION ────────────────────────────────────────────

function authenticate() {
    const authInput = document.getElementById('authInput');
    const authError = document.getElementById('authError');
    const authBtn = document.getElementById('authBtn');

    if (typeof CONFIG === 'undefined') {
        showAdminToast('❌ Config not loaded. Refresh the page.');
        return;
    }

    const pw = authInput ? authInput.value : '';

    if (pw === CONFIG.ADMIN_PASSWORD) {
        document.getElementById('authGate').style.display = 'none';
        document.getElementById('adminPanel').style.display = 'block';
        if (authError) authError.style.display = 'none';
        loadTickets();
        loadUsers();
    } else {
        if (authError) authError.style.display = 'block';
        if (authInput) {
            authInput.value = '';
            authInput.focus();
            authInput.classList.add('shake');
            setTimeout(() => authInput.classList.remove('shake'), 400);
        }
    }
}

// ── LOAD ALL TICKETS ──────────────────────────────────────────

async function refreshTickets() {
    const btn = document.getElementById('refreshBtn');
    const icon = btn ? btn.querySelector('.refresh-icon') : null;
    if (icon) icon.classList.add('spinning');

    CACHE_MANAGER.remove('tickets_cache_data');
    await loadTickets(true);

    if (icon) {
        setTimeout(() => icon.classList.remove('spinning'), 600);
    }
    showAdminToast('🔄 Tickets refreshed from server');
}

async function loadTickets(isForce = false) {
    const tbody = document.getElementById('ticketsTable');

    // ── CACHING: Instant Load ──
    if (!isForce) {
        const cached = CACHE_MANAGER.get('tickets_cache_data');
        if (cached) {
            try {
                allTickets = cached;
                filteredTickets = allTickets;
                updateStats();
                renderTable();
            } catch (e) {
                console.error("Cache parsing error", e);
            }
        } else {
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="9">
                            <div class="state-loading-row">
                                <div class="loading-dots">
                                    <span></span><span></span><span></span>
                                </div>
                                <div style="margin-top:12px; color:var(--muted); font-size:13px; font-weight:500;">Fetching all tickets...</div>
                            </div>
                        </td>
                    </tr>`;
            }
        }
    } else {
        // Show loading state if forced
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="9" class="empty-row">⏳ Syncing with server...</td></tr>';
        }
    }

    try {
        if (typeof CONFIG === 'undefined' || !CONFIG.APPS_SCRIPT_URL) {
            throw new Error('Config missing');
        }

        const res = await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=getAllTickets`);
        if (!res.ok) throw new Error('HTTP ' + res.status);

        const data = await res.json();
        if (data.success) {
            allTickets = data.tickets || [];
            CACHE_MANAGER.set('tickets_cache_data', allTickets, 15); // Save cache for 15 mins
        } else {
            throw new Error(data.message || 'Unknown error');
        }

    } catch (err) {
        console.error('Error loading tickets:', err);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                  <td colspan="9" class="empty-row">
                    ⚠️ Failed to load tickets. Check your network and Apps Script URL.
                    <br><small style="color:var(--muted);margin-top:6px;display:block;">${err.message}</small>
                  </td>
                </tr>`;
        }
        allTickets = [];
    }

    updateStats();
    // Default to all tickets on first load
    filteredTickets = allTickets;
    isFirstLoad = false;
    renderTable();

    // If currently on stats tab, refresh stats view too
    const activeTab = localStorage.getItem('adminActiveTab') || 'tickets';
    if (activeTab === 'stats') {
        renderWorkloadStats();
    }
}

// ── STATS ─────────────────────────────────────────────────────

function updateStats() {
    const total = allTickets.length;
    const open = allTickets.filter(t => t.status === 'Open').length;
    const inProgress = allTickets.filter(t => t.status === 'In Progress').length;
    const resolved = allTickets.filter(t => t.status === 'Resolved' || t.status === 'Closed').length;

    animateNumber('statTotal', total);
    animateNumber('statOpen', open);
    animateNumber('statInProgress', inProgress);
    animateNumber('statResolved', resolved);

    // ── CHART.JS INTEGRATION ──
    const ctx = document.getElementById('taskPieChart');
    if (ctx) {
        const closed = allTickets.filter(t => t.status === 'Closed').length;
        const resOnly = allTickets.filter(t => t.status === 'Resolved').length;

        if (taskPieChartInstance) {
            taskPieChartInstance.data.datasets[0].data = [open, inProgress, resOnly, closed];
            taskPieChartInstance.update();
        } else if (typeof Chart !== 'undefined') {
            taskPieChartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Open', 'In Progress', 'Resolved', 'Closed'],
                    datasets: [{
                        data: [open, inProgress, resOnly, closed],
                        backgroundColor: ['#2563eb', '#f59e0b', '#10b981', '#64748b'],
                        borderWidth: 0,
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                font: { family: "'IBM Plex Sans', sans-serif", size: 12 },
                                color: '#4A6080',
                                usePointStyle: true,
                                boxWidth: 8
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    let label = context.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed !== null) {
                                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                        const pct = total === 0 ? 0 : Math.round((context.parsed / total) * 100);
                                        label += context.parsed + ' (' + pct + '%)';
                                    }
                                    return label;
                                }
                            }
                        }
                    }
                }
            });
        }
    }
}

function animateNumber(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    const start = parseInt(el.textContent) || 0;
    if (start === target) return;
    const duration = 400;
    const startTime = performance.now();

    function tick(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        el.textContent = Math.round(start + (target - start) * progress);
        if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

// ── RENDER TABLE ──────────────────────────────────────────────

function renderTable() {
    const tbody = document.getElementById('ticketsTable');
    if (!tbody) return;

    if (!filteredTickets.length) {
        if (isFirstLoad) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9">
                        <div class="state-loading-row">
                            <div class="loading-dots">
                                <span></span><span></span><span></span>
                            </div>
                            <div style="margin-top:12px; color:var(--muted); font-size:13px; font-weight:500;">Loading database...</div>
                        </div>
                    </td>
                </tr>`;
        } else {
            tbody.innerHTML = '<tr><td colspan="9" class="empty-row">📋 No tickets found matching your filters.</td></tr>';
        }
        document.getElementById('ticketsPagination').style.display = 'none';
        return;
    }

    document.getElementById('ticketsPagination').style.display = 'flex';

    const priorityClass = {
        'Low': 'priority-low',
        'Medium': 'priority-medium',
        'High': 'priority-high',
        'Urgent': 'priority-high'
    };

    const statusChip = {
        'Open': 'chip-open',
        'In Progress': 'chip-in-progress',
        'Resolved': 'chip-resolved',
        'Closed': 'chip-closed'
    };

    // ── SLICE DATA FOR PAGINATION ──
    const start = (currentPage - 1) * ticketsPerPage;
    const end = start + ticketsPerPage;
    const paginatedItems = filteredTickets.slice(start, end);

    tbody.innerHTML = paginatedItems.map(t => `
      <tr onclick="openModal('${escHtml(t.ticketId)}')">
        <td><span class="ticket-id-cell">${escHtml(t.ticketId)}</span></td>
        <td><strong>${escHtml(t.name)}</strong></td>
        <td style="color:var(--text-light);font-size:12px;">${escHtml(t.department)}</td>
        <td>${escHtml(t.category)}</td>
        <td><span class="priority-badge ${priorityClass[t.priority] || ''}">${escHtml(t.priority)}</span></td>
        <td><span class="status-chip ${statusChip[t.status] || 'chip-open'}">${escHtml(t.status)}</span></td>
        <td style="color:var(--text-light);font-size:12px;white-space:nowrap;">${formatDisplayDate(t.dateCreated)}</td>
        <td style="font-size:12px;">${t.assignedTechnician
            ? escHtml(t.assignedTechnician)
            : '<span style="color:var(--muted);font-style:italic;">Unassigned</span>'
        }</td>
        <td><button class="btn-view" onclick="openModal('${escHtml(t.ticketId)}')">View →</button></td>
      </tr>
    `).join('');

    renderPagination();
}

/**
 * Renders pagination controls (buttons, info text)
 */
function renderPagination() {
    const total = filteredTickets.length;
    const totalPages = Math.ceil(total / ticketsPerPage);
    const info = document.getElementById('paginationInfo');
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    const pageNumbers = document.getElementById('pageNumbers');

    // Update Info Text
    const startRange = (currentPage - 1) * ticketsPerPage + 1;
    const endRange = Math.min(currentPage * ticketsPerPage, total);
    if (info) info.textContent = `Showing ${total > 0 ? startRange : 0} - ${endRange} of ${total} tickets`;

    // Update Buttons
    if (prevBtn) prevBtn.disabled = currentPage === 1;
    if (nextBtn) nextBtn.disabled = currentPage === totalPages || totalPages === 0;

    // Render Page Numbers
    if (pageNumbers) {
        let html = '';
        // Only show first, last, and around current
        const range = 1;
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - range && i <= currentPage + range)) {
                html += `<div class="page-num ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</div>`;
            } else if (i === currentPage - range - 1 || i === currentPage + range + 1) {
                html += `<div style="padding: 0 4px; color: var(--muted);">...</div>`;
            }
        }
        pageNumbers.innerHTML = html;
    }
}

/**
 * Navigation helpers
 */
function changePage(delta) {
    const totalPages = Math.ceil(filteredTickets.length / ticketsPerPage);
    const newPage = currentPage + delta;
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        renderTable();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function goToPage(page) {
    currentPage = page;
    renderTable();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── FILTERS ───────────────────────────────────────────────────

function applyFilters() {
    const search = (document.getElementById('filterSearch')?.value || '').toLowerCase();
    const status = document.getElementById('filterStatus')?.value || '';
    const priority = document.getElementById('filterPriority')?.value || '';
    const category = document.getElementById('filterCategory')?.value || '';
    const department = document.getElementById('filterDepartment')?.value || '';

    currentPage = 1; // Reset to page 1 on search/filter
    filteredTickets = allTickets.filter(t => {
        const haystack = [t.ticketId, t.name, t.email, t.department, t.category, t.description]
            .join(' ').toLowerCase();
        const matchSearch = !search || haystack.includes(search);
        const matchStatus = !status || t.status === status;
        const matchPriority = !priority || t.priority === priority;
        const matchCategory = !category || t.category === category;
        const matchDepartment = !department || t.department === department;
        return matchSearch && matchStatus && matchPriority && matchCategory && matchDepartment;
    });

    renderTable();
}

// ── OPEN MODAL ────────────────────────────────────────────────

function openModal(ticketId) {
    const t = allTickets.find(x => x.ticketId === ticketId);
    if (!t) return;
    currentTicketId = ticketId;

    // Header
    document.getElementById('modalTitle').textContent = `Ticket — ${ticketId}`;

    // Info fields
    document.getElementById('mTicketId').textContent = t.ticketId;
    document.getElementById('mDate').textContent = formatDisplayDate(t.dateCreated);
    document.getElementById('mName').textContent = t.name;
    document.getElementById('mEmail').textContent = t.email;
    document.getElementById('mDept').textContent = t.department;
    document.getElementById('mCat').textContent = t.category;
    document.getElementById('mAssignedBy').textContent = t.assignedBy || '—';

    // Description
    document.getElementById('mDesc').textContent = t.description || '—';

    // Editable fields
    const mTechBoxes = document.querySelectorAll('#mTechCheckboxes input[type="checkbox"]');
    const assignedArr = (t.assignedTechnician || '').split(',').map(s => s.trim());
    mTechBoxes.forEach(ch => {
        ch.checked = assignedArr.includes(ch.value);
    });
    document.getElementById('mStatus').value = t.status || 'Open';
    document.getElementById('mPriority').value = t.priority || 'Medium';
    document.getElementById('mComments').value = t.comments || '';
    document.getElementById('mResolution').value = t.resolution || '';

    // Screenshot
    const screenRow = document.getElementById('mScreenshotRow');
    const screenBtn = document.getElementById('mScreenshotLink');
    const screenImg = document.getElementById('mScreenshotImg');

    if (t.screenshotLink && t.screenshotLink.trim()) {
        screenRow.style.display = 'block'; // Changed to block to allow vertical layout
        screenBtn.href = t.screenshotLink;
        if (screenImg) {
            screenImg.src = t.screenshotLink;
            screenImg.style.display = 'block';
        }
    } else {
        screenRow.style.display = 'none';
        if (screenImg) screenImg.src = '';
    }

    document.getElementById('ticketModal').classList.add('show');
    document.body.style.overflow = 'hidden';
}

// ── CLOSE MODAL ───────────────────────────────────────────────

function closeModal() {
    document.getElementById('ticketModal').classList.remove('show');
    document.body.style.overflow = '';
    currentTicketId = null;
}

// ── SAVE TICKET ───────────────────────────────────────────────

async function saveTicket() {
    if (!currentTicketId) return;

    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = '⏳ Saving...';
    }

    const currentUser = sessionGet();
    const assignedByName = currentUser ? currentUser.name : 'Unknown Admin';

    const updates = {
        action: 'updateTicket',
        ticketId: currentTicketId,
        assignedTechnician: checkedTechs.join(', '),
        status: document.getElementById('mStatus').value,
        priority: document.getElementById('mPriority').value,
        comments: document.getElementById('mComments').value.trim(),
        resolution: document.getElementById('mResolution').value.trim(),
        assignedBy: assignedByName
    };

    try {
        if (typeof CONFIG !== 'undefined' && CONFIG.APPS_SCRIPT_URL) {
            // Use FormData to avoid preflight OPTIONS request (CORS fix for GAS)
            const formData = new FormData();
            formData.append('action', 'updateTicket');
            formData.append('ticketId', updates.ticketId);
            formData.append('assignedTechnician', updates.assignedTechnician);
            formData.append('status', updates.status);
            formData.append('priority', updates.priority);
            formData.append('comments', updates.comments);
            formData.append('resolution', updates.resolution);
            formData.append('assignedBy', updates.assignedBy);

            const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
                method: 'POST',
                body: formData
            });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.message || 'Update failed');
            }
        }

        // Update local state
        const idx = allTickets.findIndex(t => t.ticketId === currentTicketId);
        if (idx !== -1) {
            allTickets[idx] = {
                ...allTickets[idx],
                assignedTechnician: updates.assignedTechnician,
                status: updates.status,
                priority: updates.priority,
                comments: updates.comments,
                resolution: updates.resolution,
                assignedBy: updates.assignedBy
            };
        }

        updateStats();
        // Force manual cache purge to reflect instantaneous updates cleanly
        CACHE_MANAGER.remove('tickets_cache_data');
        CACHE_MANAGER.remove('users_cache_data');

        applyFilters();
        closeModal();
        showAdminToast('✅ Ticket updated successfully');

    } catch (err) {
        console.error('Save error:', err);
        showAdminToast('❌ Error saving changes: ' + err.message);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = '💾 Save Changes';
        }
    }
}

// ── TOAST ─────────────────────────────────────────────────────

function showAdminToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
}

// ── UTILITY ───────────────────────────────────────────────────

function escHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── TABS ──────────────────────────────────────────────────────

function switchTab(tabId) {
    document.getElementById('tabTickets').classList.remove('active');
    document.getElementById('tabUsers').classList.remove('active');
    document.getElementById('tabStats').classList.remove('active');

    document.getElementById('ticketsView').classList.remove('active');
    document.getElementById('usersView').classList.remove('active');
    document.getElementById('statsView').classList.remove('active');

    // Persist choice
    localStorage.setItem('adminActiveTab', tabId);

    if (tabId === 'tickets') {
        document.getElementById('tabTickets').classList.add('active');
        document.getElementById('ticketsView').classList.add('active');
        loadTickets();
    } else if (tabId === 'users') {
        document.getElementById('tabUsers').classList.add('active');
        document.getElementById('usersView').classList.add('active');
        loadUsers();
    } else if (tabId === 'stats') {
        document.getElementById('tabStats').classList.add('active');
        document.getElementById('statsView').classList.add('active');
        // Ensure tickets are loaded for stats
        if (allTickets.length === 0) {
            loadTickets().then(() => renderWorkloadStats());
        } else {
            renderWorkloadStats();
        }
    }
}

// ── LOAD USERS ────────────────────────────────────────────────

async function refreshUsers() {
    const btn = document.getElementById('refreshUsersBtn');
    const icon = btn ? btn.querySelector('.refresh-icon') : null;
    if (icon) icon.classList.add('spinning');

    CACHE_MANAGER.remove('users_cache_data');
    await loadUsers(true);

    if (icon) {
        setTimeout(() => icon.classList.remove('spinning'), 600);
    }
    showAdminToast('🔄 User list refreshed');
}

async function loadUsers(isForce = false) {
    const tbody = document.getElementById('usersTable');

    // ── CACHING: Instant Load ──
    if (!isForce) {
        const cached = CACHE_MANAGER.get('users_cache_data');
        if (cached) {
            try {
                allUsers = cached;
                filteredUsers = allUsers;
                applyUserFilters();
                updateTechDatalist();
            } catch (e) {
                console.error("Cache parsing error", e);
            }
        } else {
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="6" class="empty-row">⏳ Loading users...</td></tr>';
            }
        }
    } else {
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-row">⏳ Syncing users...</td></tr>';
        }
    }

    try {
        if (typeof CONFIG === 'undefined' || !CONFIG.APPS_SCRIPT_URL) throw new Error('Config missing');

        const res = await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=getAllUsers`);
        if (!res.ok) throw new Error('HTTP ' + res.status);

        const data = await res.json();
        if (data.success) {
            allUsers = data.users || [];
            filteredUsers = allUsers;
            CACHE_MANAGER.set('users_cache_data', allUsers, 15); // Save cache for 15 mins
        } else {
            throw new Error(data.message || 'Unknown error');
        }
    } catch (err) {
        console.error('Error loading users:', err);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="5" class="empty-row">⚠️ Failed to load users.<br><small style="color:var(--muted);">${err.message}</small></td></tr>`;
        }
        allUsers = [];
    }

    applyUserFilters();
    updateTechDatalist();
}

function updateTechDatalist() {
    const list1 = document.getElementById('mTechCheckboxes');
    const list2 = document.getElementById('ctTechCheckboxes');

    // Filter to only include admins, technicians, or anyone in the IT department
    const techs = allUsers.filter(u =>
        u.role === 'admin' ||
        u.role === 'technician' ||
        (u.department || '').toLowerCase() === 'it'
    );

    const html = techs.map(t => {
        const roleLabel = t.role === 'admin' ? 'Admin' : 'Support Eng.';
        return `<label class="tech-item-label">
           <input type="checkbox" value="${escHtml(t.name)}">
           <span class="tech-name">${escHtml(t.name)}</span>
           <span class="tech-role">(${roleLabel})</span>
         </label>`;
    }).join('');

    if (list1) list1.innerHTML = html;
    if (list2) list2.innerHTML = html;
}

function renderUsers() {
    const tbody = document.getElementById('usersTable');
    if (!tbody) return;

    if (!filteredUsers.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-row">📋 No users found.</td></tr>';
        document.getElementById('usersPagination').style.display = 'none';
        return;
    }

    document.getElementById('usersPagination').style.display = 'flex';

    const roleColors = {
        'admin': 'background: rgba(239, 68, 68, 0.1); color: #B91C1C; border: 1px solid rgba(239, 68, 68, 0.2);',
        'technician': 'background: rgba(245, 158, 11, 0.1); color: #B45309; border: 1px solid rgba(245, 158, 11, 0.2);',
        'normal': 'background: rgba(37, 99, 235, 0.05); color: #1D4ED8; border: 1px solid rgba(37, 99, 235, 0.1);'
    };

    // ── SLICE DATA FOR PAGINATION ──
    const start = (userCurrentPage - 1) * usersPerPage;
    const end = start + usersPerPage;
    const paginatedUsers = filteredUsers.slice(start, end);

    tbody.innerHTML = paginatedUsers.map(u => `
      <tr>
        <td><strong>${escHtml(u.email)}</strong></td>
        <td>${escHtml(u.name)}</td>
        <td><span class="status-chip" style="${roleColors[u.role] || ''}">${escHtml(u.role)}</span></td>
        <td>${escHtml(u.department)}</td>
        <td><button class="btn-view" onclick="openUserModal('${escHtml(u.email)}')">Edit →</button></td>
      </tr>
    `).join('');

    renderUserPagination();
}

function renderUserPagination() {
    const total = filteredUsers.length;
    const totalPages = Math.ceil(total / usersPerPage);
    const info = document.getElementById('userPaginationInfo');
    const prevBtn = document.getElementById('prevUserPage');
    const nextBtn = document.getElementById('nextUserPage');
    const pageNumbers = document.getElementById('userPageNumbers');

    // Update Info Text
    const startRange = (userCurrentPage - 1) * usersPerPage + 1;
    const endRange = Math.min(userCurrentPage * usersPerPage, total);
    if (info) info.textContent = `Showing ${total > 0 ? startRange : 0} - ${endRange} of ${total} users`;

    // Update Buttons
    if (prevBtn) prevBtn.disabled = userCurrentPage === 1;
    if (nextBtn) nextBtn.disabled = userCurrentPage === totalPages || totalPages === 0;

    // Render Page Numbers
    if (pageNumbers) {
        let html = '';
        const range = 1;
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= userCurrentPage - range && i <= userCurrentPage + range)) {
                html += `<div class="page-num ${i === userCurrentPage ? 'active' : ''}" onclick="goToUserPage(${i})">${i}</div>`;
            } else if (i === userCurrentPage - range - 1 || i === userCurrentPage + range + 1) {
                html += `<div style="padding: 0 4px; color: var(--muted);">...</div>`;
            }
        }
        pageNumbers.innerHTML = html;
    }
}

function changeUserPage(delta) {
    const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
    const newPage = userCurrentPage + delta;
    if (newPage >= 1 && newPage <= totalPages) {
        userCurrentPage = newPage;
        renderUsers();
    }
}

function goToUserPage(page) {
    userCurrentPage = page;
    renderUsers();
}

function applyUserFilters() {
    const search = (document.getElementById('userSearch')?.value || '').toLowerCase();
    const department = document.getElementById('userFilterDepartment')?.value || '';

    userCurrentPage = 1; // Reset to page 1 on search

    filteredUsers = allUsers.filter(u => {
        const haystack = [u.email, u.name, u.role, u.department].join(' ').toLowerCase();
        const matchSearch = !search || haystack.includes(search);
        const matchDepartment = !department || u.department === department;
        return matchSearch && matchDepartment;
    });

    // Sort: Admins first, then Technicians, then Normal users
    const rolePriority = { 'admin': 1, 'technician': 2, 'normal': 3 };
    filteredUsers.sort((a, b) => {
        const priorityA = rolePriority[a.role] || 4;
        const priorityB = rolePriority[b.role] || 4;

        // 1. Primary sort: Role (Admins first)
        if (priorityA !== priorityB) return priorityA - priorityB;

        // 2. Secondary sort: Department
        const deptA = a.department || '';
        const deptB = b.department || '';
        if (deptA !== deptB) return deptA.localeCompare(deptB);

        // 3. Tertiary sort: Name
        return (a.name || '').localeCompare(b.name || '');
    });

    renderUsers();
}

// ── USER MODAL ────────────────────────────────────────────────

// ── USER MODAL ────────────────────────────────────────────────
let userModalMode = 'edit'; // 'edit' or 'add'

function openAddUserModal() {
    userModalMode = 'add';
    currentUserEmail = null;

    document.getElementById('userModalTitle').textContent = 'Add New User';

    const emailInput = document.getElementById('uEmail');
    emailInput.value = '';
    emailInput.readOnly = false;
    emailInput.style.opacity = '1';
    emailInput.style.cursor = 'text';
    document.getElementById('uEmailLabel').textContent = 'Email';

    document.getElementById('uName').value = '';
    document.getElementById('uRole').value = 'normal';
    document.getElementById('uDept').value = '';

    const passInput = document.getElementById('uPassword');
    passInput.value = '';
    passInput.placeholder = 'Enter password';
    document.getElementById('uPasswordHint').textContent = 'Admins & technicians MUST have a password to log in.';

    document.getElementById('userModal').classList.add('show');
    document.body.style.overflow = 'hidden';
}

function openUserModal(email) {
    userModalMode = 'edit';
    const u = allUsers.find(x => x.email === email);
    if (!u) return;
    currentUserEmail = email;

    document.getElementById('userModalTitle').textContent = 'Edit User';

    const emailInput = document.getElementById('uEmail');
    emailInput.value = u.email;
    emailInput.readOnly = true;
    emailInput.style.opacity = '0.7';
    emailInput.style.cursor = 'not-allowed';
    document.getElementById('uEmailLabel').textContent = 'Email (Read-only)';

    document.getElementById('uName').value = u.name;
    document.getElementById('uRole').value = u.role;
    document.getElementById('uDept').value = u.department || '';

    // Clear password field
    const passInput = document.getElementById('uPassword');
    passInput.value = '';
    passInput.placeholder = 'Leave blank to keep current password';
    document.getElementById('uPasswordHint').textContent = 'Admins & Support Engineers MUST have a password to log in. Leave blank to keep existing.';

    document.getElementById('userModal').classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeUserModal() {
    document.getElementById('userModal').classList.remove('show');
    document.body.style.overflow = '';
    currentUserEmail = null;
}

async function handleUserSubmit() {
    if (userModalMode === 'add') {
        await createNewUser();
    } else {
        await saveUser();
    }
}

async function createNewUser() {
    const email = document.getElementById('uEmail').value.trim();
    const name = document.getElementById('uName').value.trim();
    const role = document.getElementById('uRole').value;
    const department = document.getElementById('uDept').value;
    const password = document.getElementById('uPassword').value.trim();

    if (!email || !name) {
        showAdminToast('⚠️ Email and Name are required.');
        return;
    }

    if ((role === 'admin' || role === 'technician') && !password) {
        showAdminToast('⚠️ Password is required for Admins/Technicians.');
        return;
    }

    const saveBtn = document.getElementById('saveUserBtn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = '⏳ Creating...';
    }

    const payload = {
        action: 'createUser',
        email,
        name,
        role,
        department,
        password
    };

    try {
        if (typeof CONFIG !== 'undefined' && CONFIG.APPS_SCRIPT_URL) {
            const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.message || 'Creation failed');
        }

        // Update local state if successful
        allUsers.unshift({
            email,
            name,
            role,
            department
        });

        CACHE_MANAGER.remove('users_cache_data');
        applyUserFilters();
        closeUserModal();
        showAdminToast('✅ User created successfully');

    } catch (err) {
        console.error('Create user error:', err);
        showAdminToast('❌ Error creating user: ' + err.message);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = '💾 Save User';
        }
    }
}

async function saveUser() {
    if (!currentUserEmail) return;

    const saveBtn = document.getElementById('saveUserBtn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = '⏳ Saving...';
    }

    const updates = {
        action: 'updateUserDetails',
        email: currentUserEmail,
        name: document.getElementById('uName').value.trim(),
        role: document.getElementById('uRole').value,
        department: document.getElementById('uDept').value,
        password: document.getElementById('uPassword').value.trim()
    };

    try {
        if (typeof CONFIG !== 'undefined' && CONFIG.APPS_SCRIPT_URL) {
            const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.message || 'Update failed');
        }

        // Update local state
        const idx = allUsers.findIndex(u => u.email === currentUserEmail);
        if (idx !== -1) {
            allUsers[idx] = {
                ...allUsers[idx],
                name: updates.name,
                role: updates.role,
                department: updates.department
            };
        }
        CACHE_MANAGER.remove('users_cache_data');

        applyUserFilters();
        closeUserModal();
        showAdminToast('✅ User updated successfully');

    } catch (err) {
        console.error('Save user error:', err);
        showAdminToast('❌ Error saving changes: ' + err.message);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = '💾 Save User';
        }
    }
}

// ── CREATE ADMIN TASK ─────────────────────────────────────────

function openCreateTaskModal() {
    document.getElementById('ctTitle').value = '';
    document.getElementById('ctDesc').value = '';
    document.getElementById('ctPriority').value = 'High';
    document.getElementById('ctCategory').value = 'Other Admin Task';

    const boxes = document.querySelectorAll('#ctTechCheckboxes input[type="checkbox"]');
    boxes.forEach(ch => ch.checked = false);

    document.getElementById('createTaskModal').classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeCreateTaskModal() {
    document.getElementById('createTaskModal').classList.remove('show');
    document.body.style.overflow = '';
}

async function submitAdminTask() {
    const btn = document.getElementById('ctSaveBtn');
    const title = document.getElementById('ctTitle').value.trim();
    const desc = document.getElementById('ctDesc').value.trim();
    const priority = document.getElementById('ctPriority').value;
    const category = document.getElementById('ctCategory').value;

    if (!title || !desc) {
        showAdminToast('⚠️ Please provide a title and description.');
        return;
    }

    const checkedTechs = Array.from(document.querySelectorAll('#ctTechCheckboxes input[type="checkbox"]:checked')).map(cb => cb.value);

    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Launching...';
    }

    const payload = {
        action: 'createTicket',
        name: 'IT Admin',
        email: currentUserEmail || 'admin@basilur.com',
        department: 'IT',
        category: category,
        priority: priority,
        description: `[INTERNAL TASK: ${title}]\n\n${desc}`,
        assignedTechnician: checkedTechs.join(', ')
    };

    try {
        if (typeof CONFIG !== 'undefined' && CONFIG.APPS_SCRIPT_URL) {
            const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.message || 'Failed to create task');

            showAdminToast('✅ Internal Task Created!');
            // Force manual cache purge to reflect instantaneous updates cleanly
            CACHE_MANAGER.remove('tickets_cache_data');
            closeCreateTaskModal();
            loadTickets(); // refresh view
        }
    } catch (err) {
        console.error('Error creating task:', err);
        showAdminToast('❌ Error: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '🚀 Launch Task';
        }
    }
}

// ── STATS & EXPORTS ───────────────────────────────────────────

function renderWorkloadStats() {
    const loadingEl = document.getElementById('statsLoading');
    const contentEl = document.getElementById('statsContent');

    if (!allTickets || allTickets.length === 0) {
        if (loadingEl) loadingEl.style.display = 'block';
        if (contentEl) contentEl.style.display = 'none';
        return;
    }

    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';

    const reportDateStr = formatDisplayDate(new Date()) + ' (SL Time)';

    // 1. Basic Stats
    const total = allTickets.length;
    const resolved = allTickets.filter(t => t.status === 'Resolved' || t.status === 'Closed').length;
    const sla = total === 0 ? 0 : Math.round((resolved / total) * 100);

    // Avg Resolution Time (Simplified)
    let totalDays = 0;
    let resolvedCount = 0;
    allTickets.forEach(t => {
        if ((t.status === 'Resolved' || t.status === 'Closed') && t.dateCreated && t.lastUpdated) {
            const start = new Date(t.dateCreated + ' GMT+5:30');
            const end = new Date(t.lastUpdated + ' GMT+5:30');
            if (!isNaN(start) && !isNaN(end)) {
                const diff = (end - start) / (1000 * 60 * 60 * 24);
                if (diff >= 0) {
                    totalDays += diff;
                    resolvedCount++;
                }
            }
        }
    });
    const avgDays = resolvedCount === 0 ? 0 : (totalDays / resolvedCount).toFixed(1);

    // Update Report Cards
    animateNumber('reportStatTotal', total);
    animateNumber('reportStatResolved', resolved);
    animateNumber('reportStatAvgTime', avgDays);
    const slaEl = document.getElementById('reportStatSLA');
    if (slaEl) slaEl.textContent = `${sla}%`;

    // 2. Initial Status Chart (re-use logic but Ensure Instance)
    updateStatusChart(allTickets);

    // 3. Category Chart
    updateCategoryChart(allTickets);

    // 4. Department Chart
    updateDeptChart(allTickets);

    // 5. Technician Table
    updateTechPerformanceTable(allTickets);

    // 6. Detailed Workload Summary
    const unassigned = allTickets.filter(t => !t.assignedTechnician).length;
    const highUrgent = allTickets.filter(t => (t.priority === 'High' || t.priority === 'Urgent') && (t.status !== 'Resolved' && t.status !== 'Closed')).length;
    const maintenance = allTickets.filter(t => t.category === 'Maintenance').length;

    container.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom: 10px;">
            <span style="color:var(--text-light)">Unassigned Tickets</span>
            <strong style="${unassigned > 0 ? 'color:var(--danger)' : ''}">${unassigned}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom: 10px;">
            <span style="color:var(--text-light)">Active High Priority</span>
            <strong style="color:var(--danger)">${highUrgent}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom: 10px;">
            <span style="color:var(--text-light)">Maintenance Tasks</span>
            <strong>${maintenance}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom: 10px;">
            <span style="color:var(--text-light)">Resolution Rate</span>
            <strong>${sla}%</strong>
        </div>
    `;
}

function updateStatusChart(tickets) {
    const ctx = document.getElementById('taskPieChart');
    if (!ctx || typeof Chart === 'undefined') return;

    const open = tickets.filter(t => t.status === 'Open').length;
    const inProgress = tickets.filter(t => t.status === 'In Progress').length;
    const resolved = tickets.filter(t => t.status === 'Resolved').length;
    const closed = tickets.filter(t => t.status === 'Closed').length;

    const data = [open, inProgress, resolved, closed];

    if (taskPieChartInstance) {
        taskPieChartInstance.data.datasets[0].data = data;
        taskPieChartInstance.update();
    } else {
        taskPieChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Open', 'In Progress', 'Resolved', 'Closed'],
                datasets: [{
                    data: data,
                    backgroundColor: ['#2563eb', '#f59e0b', '#10b981', '#64748b'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }
}

function updateCategoryChart(tickets) {
    const ctx = document.getElementById('categoryBarChart');
    if (!ctx || typeof Chart === 'undefined') return;

    const counts = {};
    tickets.forEach(t => { counts[t.category] = (counts[t.category] || 0) + 1; });

    const labels = Object.keys(counts);
    const data = Object.values(counts);

    if (categoryBarChartInstance) {
        categoryBarChartInstance.data.labels = labels;
        categoryBarChartInstance.data.datasets[0].data = data;
        categoryBarChartInstance.update();
    } else {
        categoryBarChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Tickets',
                    data: data,
                    backgroundColor: '#2563eb',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, grid: { display: false } } }
            }
        });
    }
}

function updateDeptChart(tickets) {
    const ctx = document.getElementById('deptBarChart');
    if (!ctx || typeof Chart === 'undefined') return;

    const counts = {};
    tickets.forEach(t => { counts[t.department] = (counts[t.department] || 0) + 1; });

    // Sort top 8
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const labels = sorted.map(x => x[0]);
    const data = sorted.map(x => x[1]);

    if (deptBarChartInstance) {
        deptBarChartInstance.data.labels = labels;
        deptBarChartInstance.data.datasets[0].data = data;
        deptBarChartInstance.update();
    } else {
        deptBarChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Tickets',
                    data: data,
                    backgroundColor: '#1e293b',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        });
    }
}

function updateTechPerformanceTable(tickets) {
    const tbody = document.getElementById('topTechsTable');
    if (!tbody) return;

    const techs = {};
    tickets.forEach(t => {
        if (!t.assignedTechnician) return;
        const names = t.assignedTechnician.split(',').map(n => n.trim());
        names.forEach(name => {
            if (!techs[name]) techs[name] = { solved: 0, pending: 0 };
            if (t.status === 'Resolved' || t.status === 'Closed') techs[name].solved++;
            else techs[name].pending++;
        });
    });

    const sortedTechs = Object.entries(techs).sort((a, b) => b[1].solved - a[1].solved).slice(0, 5);

    if (sortedTechs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="empty-row">No technician data</td></tr>';
        return;
    }

    tbody.innerHTML = sortedTechs.map(([name, stats]) => `
        <tr>
            <td><strong>${escHtml(name)}</strong></td>
            <td><span style="color:var(--green); font-weight:600;">${stats.solved}</span></td>
            <td><span style="color:var(--muted);">${stats.pending}</span></td>
        </tr>
    `).join('');
}

/**
 * Enhanced PDF Export. 
 * Note: To get "text based" PDF from HTML/JS, 
 * standard html2pdf does a decent job if formatting is clean.
 * The best "text" PDF is often generated by browser print.
 */
function exportToPDF() {
    const element = document.getElementById('pdfExportArea');
    if (!element) return;

    // Apply temporary print-optimized style
    const originalStyles = element.style.cssText;
    element.style.boxShadow = 'none';
    element.style.border = 'none';
    element.style.padding = '0';

    const opt = {
        margin: [0.3, 0.3],
        filename: `IT_Report_${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            letterRendering: true
        },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    html2pdf().set(opt).from(element).save().then(() => {
        element.style.cssText = originalStyles;
    });
}

/**
 * Populates all department dropdowns in the Admin Panel from CONFIG.DEPARTMENTS.
 */
function populateAdminDepartmentDropdowns() {
    if (typeof CONFIG === 'undefined' || !CONFIG.DEPARTMENTS) return;

    const selectors = ['filterDepartment', 'userFilterDepartment', 'uDept'];

    selectors.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;

        // Keep the first option
        const firstOption = select.options[0];
        select.innerHTML = '';
        if (firstOption) select.appendChild(firstOption);

        CONFIG.DEPARTMENTS.forEach(dept => {
            const opt = document.createElement('option');
            opt.value = dept;
            opt.textContent = dept;
            select.appendChild(opt);
        });
    });
}
