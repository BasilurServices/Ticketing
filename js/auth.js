/**
 * ============================================================
 *  IT TICKETING PLATFORM — Auth & Session Helper
 *  File: js/auth.js
 *  Include this on every page (before page-specific scripts).
 * ============================================================
 */

// ── SESSION HELPERS ──────────────────────────────────────────

/**
 * Save logged-in user to sessionStorage AND Cookie (for persistent login).
 * @param {{ email:string, name:string, role:string, department:string }} user
 */
function sessionSave(user) {
    const data = JSON.stringify(user);
    sessionStorage.setItem('bte_user', data);
    setCookie('bte_user', encodeURIComponent(data), 30); // 30 Day persistent login
}

/**
 * Get the currently logged-in user object.
 * Checks sessionStorage first, then Cookies if not found.
 * @returns {{ email:string, name:string, role:string, department:string }|null}
 */
function sessionGet() {
    try {
        let raw = sessionStorage.getItem('bte_user');
        if (!raw) {
            const cookieVal = getCookie('bte_user');
            if (cookieVal) {
                raw = decodeURIComponent(cookieVal);
                // Restore to sessionStorage for the current session
                sessionStorage.setItem('bte_user', raw);
            }
        }
        return raw ? JSON.parse(raw) : null;
    } catch (_) {
        return null;
    }
}

/** Clear session and persistent cookies (logout). */
function sessionClear() {
    sessionStorage.removeItem('bte_user');
    eraseCookie('bte_user');
    if (typeof CACHE_MANAGER !== 'undefined') {
        CACHE_MANAGER.clearAll();
    }
}

// ── COOKIE UTILITIES ──────────────────────────────────────────

function setCookie(name, value, days) {
    let expires = "";
    if (days) {
        let date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax";
}

function getCookie(name) {
    let nameEQ = name + "=";
    let ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

function eraseCookie(name) {
    document.cookie = name + '=; Max-Age=-99999999; path=/; SameSite=Lax';
}

/** Is any user logged in? */
function isLoggedIn() {
    return sessionGet() !== null;
}

/** Is the logged-in user an admin? */
function isAdmin() {
    const u = sessionGet();
    return u && u.role === 'admin';
}

// ── AUTH GUARD ────────────────────────────────────────────────

/**
 * Call at the top of any protected page.
 * Redirects to login.html if no session exists.
 * @param {boolean} [requireAdmin=false] - also require admin role
 */
function requireLogin(requireAdmin) {
    const user = sessionGet();
    if (!user) {
        window.location.replace('login.html');
        return null;
    }
    if (requireAdmin && user.role !== 'admin') {
        // Non-admin trying to access admin page → redirect to submit ticket
        window.location.replace('index.html');
        return null;
    }
    return user;
}

// ── NAV RENDERER ─────────────────────────────────────────────

/**
 * Injects the correct nav links based on role and highlights the active page.
 * Also populates the mobile dropdown and wires up the hamburger toggle.
 * Call this after DOM is ready on every page.
 * @param {string} activePage - 'submit' | 'track' | 'admin'
 */
function renderNav(activePage) {
    const user = sessionGet();
    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) return;

    const isAdminUser = user && user.role === 'admin';

    const links = [
        { href: 'index.html', label: '📝 Submit Ticket', key: 'submit' },
        { href: 'track.html', label: '🔍 My Tickets', key: 'track' },
    ];
    if (isAdminUser) {
        links.push({ href: 'admin.html', label: '⚙️ Admin Panel', key: 'admin' });
    }

    // Build desktop nav HTML
    let html = links.map(l =>
        `<a href="${l.href}" class="nav-link${activePage === l.key ? ' active' : ''}">${l.label}</a>`
    ).join('');

    // User info + logout
    if (user) {
        const initials = (user.name || user.email).charAt(0).toUpperCase();
        html += `
            <div class="nav-user-pill" title="${user.email}" onclick="openProfileModal()" style="cursor:pointer;">
                <div class="nav-avatar">${initials}</div>
                <span class="nav-user-name">${user.name || user.email}</span>
            </div>
            <button class="nav-logout-btn" onclick="logoutUser()" title="Sign out">↩ Sign Out</button>
        `;
    }

    if (isAdminUser) {
        html += `<span class="admin-badge">IT Admin</span>`;
    }

    navLinks.innerHTML = html;

    // ── MOBILE MENU ─────────────────────────────────────────────
    // Build mobile dropdown HTML (same links + sign out)
    let mobileHtml = links.map(l =>
        `<a href="${l.href}" class="nav-link${activePage === l.key ? ' active' : ''}">${l.label}</a>`
    ).join('');

    if (user) {
        mobileHtml += `<button class="nav-link" style="background:none;border:none;text-align:left;cursor:pointer;font-family:inherit;width:100%;" onclick="openProfileModal()">👤 My Profile (${user.name || user.email})</button>`;
        mobileHtml += `<button class="nav-link" style="background:none;border:none;text-align:left;cursor:pointer;font-family:inherit;color:var(--muted);width:100%;" onclick="logoutUser()">↩ Sign Out</button>`;
    }

    if (isAdminUser) {
        mobileHtml += `<span class="admin-badge">IT Admin</span>`;
    }

    // Find or create the mobile menu container
    let mobileMenu = document.querySelector('.nav-mobile-menu');
    if (mobileMenu) {
        mobileMenu.innerHTML = mobileHtml;
    }

    // Wire up hamburger button
    const hamburger = document.querySelector('.nav-hamburger');
    if (hamburger && mobileMenu) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('open');
            mobileMenu.classList.toggle('open');
        });
    }

    // Inject Profile Modal if it doesn't exist
    injectProfileModal();
}

/** Sign user out and go to login page. */
function logoutUser() {
    sessionClear();
    window.location.replace('login.html');
}

/** 
 * Format a Date object or string to: YYYY-MM-DD  HH:mm (Sri Lankan Time)
 * @param {Date|string} date 
 */
function formatDisplayDate(date) {
    if (!date) return '—';
    try {
        let d = (date instanceof Date) ? date : new Date(typeof date === 'string' ? date.replace('  ', ' ') : date);
        if (isNaN(d.getTime())) {
            // Check if it's our target format but without TZ
            if (typeof date === 'string' && date.includes('-')) {
                d = new Date(date.replace(/\s+/g, ' ') + ' GMT+0530');
            }
        }
        if (isNaN(d.getTime())) return String(date);

        const opts = { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false };
        const parts = new Intl.DateTimeFormat('en-GB', opts).formatToParts(d);
        const p = {};
        parts.forEach(pt => p[pt.type] = pt.value);
        return `${p.year}-${p.month}-${p.day}  ${p.hour}:${p.minute}`;
    } catch (e) {
        return String(date);
    }
}

// ── PROFILE MODAL ──────────────────────────────────────────

/**
 * Injects the Profile Modal HTML into the body.
 */
function injectProfileModal() {
    if (document.getElementById('profileModal')) return;

    const modalHtml = `
    <div class="modal-overlay" id="profileModal" role="dialog" aria-modal="true" aria-labelledby="profileModalTitle" style="display:none; z-index: 10001;">
        <div class="modal">
            <div class="modal-header">
                <h3 id="profileModalTitle">My Profile</h3>
                <button class="modal-close" onclick="closeProfileModal()">✕</button>
            </div>
            <div class="modal-body">
                <div class="modal-field">
                    <label>Email Address</label>
                    <input type="text" id="pEmail" readonly style="background:var(--off-white); cursor:default; color:var(--text-light);" />
                </div>
                <div class="modal-field">
                    <label>Department</label>
                    <input type="text" id="pDept" readonly style="background:var(--off-white); cursor:default; color:var(--text-light);" />
                </div>
                <div class="modal-field">
                    <label for="pName">Full Name</label>
                    <input type="text" id="pName" placeholder="Enter your full name" />
                </div>
                <div class="modal-field">
                    <label for="pMobile">Mobile Number</label>
                    <input type="text" id="pMobile" placeholder="e.g. 07XXXXXXXX" />
                </div>
                <div class="modal-field">
                    <label for="pPassword">Change Password</label>
                    <input type="password" id="pPassword" placeholder="Enter new password to change" />
                    <p class="auth-hint" style="font-size:10px; margin-top:4px;">Leave blank if you don't want to change it.</p>
                </div>
                <div class="modal-actions">
                    <button class="btn-cancel" onclick="closeProfileModal()">Cancel</button>
                    <button class="btn-submit btn-save" onclick="saveProfile()" id="saveProfileBtn">💾 Save Profile</button>
                </div>
            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function openProfileModal() {
    const user = sessionGet();
    if (!user) return;

    const modal = document.getElementById('profileModal');
    if (!modal) return;

    document.getElementById('pEmail').value = user.email || '';
    document.getElementById('pName').value = user.name || '';
    document.getElementById('pDept').value = user.department || '';
    document.getElementById('pMobile').value = user.mobile || '';
    document.getElementById('pPassword').value = '';

    modal.style.display = 'flex';
    
    // Close mobile menu if open
    const hamburger = document.querySelector('.nav-hamburger');
    const mobileMenu = document.querySelector('.nav-mobile-menu');
    if (hamburger) hamburger.classList.remove('open');
    if (mobileMenu) mobileMenu.classList.remove('open');
}

function closeProfileModal() {
    const modal = document.getElementById('profileModal');
    if (modal) modal.style.display = 'none';
}

async function saveProfile() {
    const user = sessionGet();
    if (!user) return;

    const btn = document.getElementById('saveProfileBtn');
    const originalText = btn.innerHTML;
    
    const name = document.getElementById('pName').value.trim();
    const mobile = document.getElementById('pMobile').value.trim();
    const password = document.getElementById('pPassword').value.trim();

    if (!name) {
        alert('Name is required.');
        return;
    }

    btn.innerHTML = 'Saving...';
    btn.disabled = true;

    try {
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'updateUserProfile',
                email: user.email,
                name: name,
                mobile: mobile,
                password: password
            })
        });

        const result = await response.json();

        if (result.success) {
            // Update session
            sessionSave(result.user);
            
            // Update UI elements if they exist
            const userNameText = document.getElementById('userNameText');
            if (userNameText) userNameText.innerText = result.user.name;
            
            // Re-render nav to update avatar/name
            if (typeof renderNav === 'function') {
                // Determine active page from URL
                const path = window.location.pathname;
                let active = 'submit';
                if (path.includes('track.html')) active = 'track';
                if (path.includes('admin.html')) active = 'admin';
                renderNav(active);
            }

            alert('Profile updated successfully!');
            closeProfileModal();
        } else {
            alert('Error: ' + result.message);
        }
    } catch (err) {
        console.error('Profile update error:', err);
        alert('Failed to update profile. Please try again.');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
