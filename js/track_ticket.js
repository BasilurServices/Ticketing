/**
 * ============================================================
 *  IT TICKETING PLATFORM — Track Ticket Logic
 *  File: js/track_ticket.js
 *  Updated: Auto-loads all tickets for the logged-in user.
 * ============================================================
 */

window.addEventListener('DOMContentLoaded', () => {

    // ── Auth guard ────────────────────────────────────────
    const user = requireLogin();
    if (!user) return;

    // ── Render nav ────────────────────────────────────────
    renderNav('track');

    // ── Populate Hero Welcome ─────────────────────────────
    const heroWelcome = document.getElementById('heroWelcome');
    const userNameText = document.getElementById('userNameText');
    if (heroWelcome && userNameText && user) {
        const firstName = (user.name || user.email.split('@')[0]).split(' ')[0];
        userNameText.textContent = firstName;
        heroWelcome.style.display = 'block';
    }

    // ── Populate user banner ──────────────────────────────
    const banner = document.getElementById('userBanner');
    const bannerAvatar = document.getElementById('bannerAvatar');
    const bannerName = document.getElementById('bannerName');
    const bannerEmail = document.getElementById('bannerEmail');

    if (banner) {
        banner.style.display = 'flex';
        if (bannerAvatar) bannerAvatar.textContent = (user.name || user.email).charAt(0).toUpperCase();
        if (bannerName) bannerName.textContent = user.name || user.email;
        if (bannerEmail) bannerEmail.textContent = user.email;
    }

    // ── Load this user's tickets ──────────────────────────
    loadMyTickets(user.email);
});

// ── LOAD ALL TICKETS FOR USER ─────────────────────────────────

async function loadMyTickets(email) {
    // ── CACHING: Instant Load ──
    const cacheKey = `my_tickets_cache_${email}`;
    const cached = CACHE_MANAGER.get(cacheKey);
    if (cached) {
        showTrackState('list');
        renderMyTickets(cached);
    } else {
        showTrackState('stateLoading');
    }

    try {
        if (typeof CONFIG === 'undefined' || !CONFIG.APPS_SCRIPT_URL) {
            throw new Error('Config missing');
        }

        const url = `${CONFIG.APPS_SCRIPT_URL}?action=getTicketsByEmail&email=${encodeURIComponent(email)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();

        if (data.success && data.tickets && data.tickets.length > 0) {
            CACHE_MANAGER.set(cacheKey, data.tickets, 15); // 15 mins
            showTrackState('list');
            renderMyTickets(data.tickets);
        } else if (data.success) {
            // Logged in successfully but no tickets yet
            showTrackState('stateEmpty');
        } else {
            throw new Error(data.message || 'Failed to load tickets');
        }

    } catch (err) {
        console.error('Load error:', err);
        // Only show error if we haven't already rendered cached data
        if (!CACHE_MANAGER.get(cacheKey)) {
            showTrackState('stateError');
        }
    }
}

// ── RENDER MY TICKETS LIST ────────────────────────────────────

function renderMyTickets(tickets) {
    const listEl = document.getElementById('myTicketsList');
    const headerEl = document.getElementById('myTicketsHeader');
    const countLbl = document.getElementById('ticketCountLabel');

    if (!listEl) return;

    // Show header card
    if (headerEl) headerEl.style.display = 'block';
    if (countLbl) {
        const open = tickets.filter(t => t.status === 'Open' || t.status === 'In Progress').length;
        countLbl.textContent = `${tickets.length} ticket${tickets.length !== 1 ? 's' : ''} total · ${open} active`;
    }

    listEl.innerHTML = '';

    tickets.forEach(ticket => {
        const card = document.createElement('div');
        card.className = 'card my-ticket-card';
        card.style.cursor = 'pointer';

        const statusMap = { 'Open': 'status-open', 'In Progress': 'status-in-progress', 'Resolved': 'status-resolved', 'Closed': 'status-closed' };
        const statusClass = statusMap[ticket.status] || 'status-open';

        const priorityIcons = { 'High': '🔴', 'Medium': '🟡', 'Low': '🟢' };
        const pIcon = priorityIcons[ticket.priority] || '⚪';

        card.innerHTML = `
            <div class="my-ticket-row" style="padding:18px 24px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
                <div style="flex:1;min-width:200px;">
                    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px;">
                        <span style="font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:600;color:var(--blue);">${ticket.ticketId}</span>
                        <span class="status-badge ${statusClass}" style="font-size:11px;padding:2px 10px;">${ticket.status}</span>
                    </div>
                    <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:4px;">${escapeHtml(ticket.category)} — ${escapeHtml(ticket.description).slice(0, 80)}${ticket.description.length > 80 ? '…' : ''}</div>
                        ${pIcon} ${ticket.priority} Priority &nbsp;·&nbsp; ${ticket.department} &nbsp;·&nbsp; ${formatDisplayDate(ticket.dateCreated)}
                    </div>
                </div>
                <div style="color:var(--muted);font-size:18px;">›</div>
            </div>
        `;

        card.addEventListener('click', () => openTicketDetail(ticket));
        card.addEventListener('mouseenter', () => card.style.boxShadow = '0 8px 28px rgba(37,99,235,0.15)');
        card.addEventListener('mouseleave', () => card.style.boxShadow = '');
        listEl.appendChild(card);
    });
}

// ── OPEN TICKET DETAIL ────────────────────────────────────────

function openTicketDetail(t) {
    const resultEl = document.getElementById('ticketResult');
    const listEl = document.getElementById('myTicketsList');
    const headerEl = document.getElementById('myTicketsHeader');
    const banner = document.getElementById('userBanner');

    // Hide banner
    if (banner) banner.style.display = 'none';

    renderTicket(t);
    showTrackState('result');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Add a "← Back to My Tickets" button above ticket
    let backBar = document.getElementById('backToListBar');
    if (!backBar) {
        backBar = document.createElement('div');
        backBar.id = 'backToListBar';
        backBar.style.cssText = 'margin-bottom:16px;';
        backBar.innerHTML = `<button onclick="goBackToList()" style="background:none;border:1.5px solid var(--border);border-radius:8px;padding:8px 18px;font-size:13px;font-weight:600;color:var(--text-light);cursor:pointer;transition:all 0.2s;" onmouseenter="this.style.borderColor='var(--blue)';this.style.color='var(--blue)'" onmouseleave="this.style.borderColor='var(--border)';this.style.color='var(--text-light)'">← Back to My Tickets</button>`;
        const main = document.querySelector('main');
        if (main) main.insertBefore(backBar, resultEl);
    }
    backBar.style.display = 'block';
}

function goBackToList() {
    const resultEl = document.getElementById('ticketResult');
    const listEl = document.getElementById('myTicketsList');
    const headerEl = document.getElementById('myTicketsHeader');
    const backBar = document.getElementById('backToListBar');
    const banner = document.getElementById('userBanner');

    showTrackState('list');
    if (backBar) backBar.style.display = 'none';
    if (banner) banner.style.display = 'flex';
}

// ── STATE MANAGER ─────────────────────────────────────────────

function showTrackState(state) {
    const mainIds = ['stateEmpty', 'stateLoading', 'stateError', 'ticketResult', 'myTicketsHeader', 'myTicketsList'];
    mainIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    if (state === 'result') {
        const el = document.getElementById('ticketResult');
        if (el) el.style.display = 'block';
    } else if (state === 'list') {
        const header = document.getElementById('myTicketsHeader');
        const list = document.getElementById('myTicketsList');
        if (header) header.style.display = 'block';
        if (list) list.style.display = 'block';
    } else if (state) {
        const stateEl = document.getElementById(state);
        if (stateEl) stateEl.style.display = 'block';
    }
}

// ── RENDER SINGLE TICKET DETAIL ───────────────────────────────

function renderTicket(t) {
    setText('resTicketId', t.ticketId);
    setText('resName', t.name);
    setText('resDept', t.department);
    setText('resCat', t.category);
    setText('resDate', formatDisplayDate(t.dateCreated));
    setText('resTech', t.assignedTechnician || 'Not yet assigned');
    setText('resDesc', t.description);

    // Status badge
    const badge = document.getElementById('resStatusBadge');
    if (badge) {
        const statusMap = { 'Open': 'status-open', 'In Progress': 'status-in-progress', 'Resolved': 'status-resolved', 'Closed': 'status-closed' };
        badge.className = 'status-badge ' + (statusMap[t.status] || 'status-open');
        badge.textContent = t.status || 'Open';
    }

    // Priority
    const pEl = document.getElementById('resPriority');
    if (pEl) {
        const pClass = (t.priority || '').toLowerCase();
        pEl.innerHTML = `<span class="priority-dot ${pClass}">${t.priority || '—'}</span>`;
    }

    // Screenshot
    const screenBlock = document.getElementById('screenshotBlock');
    const screenLink = document.getElementById('screenshotLink');
    if (t.screenshotLink && t.screenshotLink.trim()) {
        if (screenBlock) screenBlock.style.display = 'block';
        if (screenLink) screenLink.href = t.screenshotLink;
    } else {
        if (screenBlock) screenBlock.style.display = 'none';
    }

    // Resolution
    const resBlock = document.getElementById('resolutionBlock');
    const resText = document.getElementById('resResolution');
    if (t.resolution && t.resolution.trim()) {
        if (resBlock) resBlock.style.display = 'block';
        if (resText) resText.textContent = t.resolution;
    } else {
        if (resBlock) resBlock.style.display = 'none';
    }

    buildTimeline(t);
}

// ── TIMELINE ──────────────────────────────────────────────────

function buildTimeline(t) {
    const container = document.getElementById('timeline');
    if (!container) return;
    container.innerHTML = '';

    const events = [];

    events.push({ dot: 'blue', icon: '🎟️', date: t.dateCreated, text: 'Ticket Submitted', detail: `By ${t.name} · ${t.department}` });

    if (t.assignedTechnician && t.assignedTechnician.trim()) {
        events.push({ dot: 'yellow', icon: '👤', date: t.lastUpdated || t.dateCreated, text: 'Support Engineer Assigned', detail: t.assignedTechnician });
    }
    if (t.comments && t.comments.trim()) {
        events.push({ dot: 'blue', icon: '💬', date: t.lastUpdated || t.dateCreated, text: 'Update Added', detail: t.comments });
    }
    if (t.status === 'Resolved' || t.status === 'Closed') {
        events.push({ dot: 'green', icon: '✅', date: t.lastUpdated || t.dateCreated, text: 'Issue ' + t.status, detail: t.resolution ? 'Resolution recorded' : 'Ticket marked as ' + t.status });
    }

    events.forEach(ev => {
        const item = document.createElement('div');
        item.className = 'timeline-item';
        item.innerHTML = `
            <div class="timeline-dot ${ev.dot}">${ev.icon}</div>
            <div class="timeline-content">
                <div class="timeline-date">${formatDisplayDate(ev.date) || ''}</div>
                <div class="timeline-text">${ev.text}</div>
                ${ev.detail ? `<div class="timeline-detail">${escapeHtml(ev.detail)}</div>` : ''}
            </div>
        `;
        container.appendChild(item);
    });
}

// ── HELPERS ───────────────────────────────────────────────────

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value || '—';
}

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}
