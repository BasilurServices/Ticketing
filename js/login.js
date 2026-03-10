/**
 * ============================================================
 *  IT TICKETING PLATFORM — Login Page Logic
 *  File: js/login.js
 * ============================================================
 */

window.addEventListener('DOMContentLoaded', () => {
    // If already logged in, redirect to correct page
    const user = sessionGet();
    if (user) {
        if (user.role === 'admin') {
            window.location.replace('admin.html');
        } else {
            window.location.replace('index.html');
        }
        return;
    }

    const emailInput = document.getElementById('loginEmail');
    const continueBtn = document.getElementById('continueBtn');

    // Allow Enter key
    if (emailInput) {
        emailInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') handleLogin();
        });
        // Focus on load
        setTimeout(() => emailInput.focus(), 100);
    }

    if (continueBtn) {
        continueBtn.addEventListener('click', handleLogin);
    }
});

async function handleLogin() {
    const emailInput = document.getElementById('loginEmail');
    const email = (emailInput?.value || '').trim().toLowerCase();

    // Basic email validation
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showLoginError('Please enter a valid email address.');
        return;
    }

    hideLoginError();
    setLoginLoading(true);

    try {
        if (typeof CONFIG === 'undefined' || !CONFIG.APPS_SCRIPT_URL) {
            throw new Error('Configuration error. Please contact IT.');
        }

        const url = `${CONFIG.APPS_SCRIPT_URL}?action=lookupUser&email=${encodeURIComponent(email)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Server error ' + res.status);
        const data = await res.json();

        if (data.success && data.user) {
            if (data.user.requiresPassword) {
                // ── Admin/Technician: needs password ──────────
                showPasswordStep(data.user);
            } else {
                // ── Known normal user: auto-fill session ──────
                const userData = {
                    email: data.user.email,
                    name: data.user.name,
                    role: data.user.role || 'normal',
                    department: data.user.department || ''
                };
                sessionSave(userData);

                if (userData.role === 'admin') {
                    window.location.replace('admin.html');
                } else {
                    window.location.replace('index.html');
                }
            }
        } else {
            // ── New user: show name entry step ─────────────────
            showNameStep(email);
        }
    } catch (err) {
        console.error('Login error:', err);
        showLoginError('Could not connect. Please check your internet connection and try again.');
    } finally {
        setLoginLoading(false);
    }
}

async function handleRegister() {
    const email = document.getElementById('loginEmail')?.value?.trim().toLowerCase() || '';
    const nameInput = document.getElementById('newUserName');
    const name = (nameInput?.value || '').trim();

    if (!name || name.length < 2) {
        showLoginError('Please enter your full name (at least 2 characters).');
        return;
    }

    hideLoginError();
    setLoginLoading(true);

    try {
        if (typeof CONFIG === 'undefined' || !CONFIG.APPS_SCRIPT_URL) {
            throw new Error('Configuration error. Please contact IT.');
        }

        // Use FormData (not JSON) to avoid CORS preflight issues with Google Apps Script
        const formData = new FormData();
        formData.append('action', 'registerUser');
        formData.append('email', email);
        formData.append('name', name);

        const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
            method: 'POST',
            body: formData
        });
        if (!response.ok) throw new Error('Server responded with status ' + response.status);

        const data = await response.json();

        if (data.success) {
            const userData = { email, name, role: 'normal', department: '' };
            sessionSave(userData);
            window.location.replace('index.html');
        } else if (data.message === 'User already exists') {
            // Race condition: user was registered between lookup and register
            // Just fetch their data and log them in
            const lookupUrl = `${CONFIG.APPS_SCRIPT_URL}?action=lookupUser&email=${encodeURIComponent(email)}`;
            const lu = await fetch(lookupUrl);
            const luData = await lu.json();
            if (luData.success && luData.user) {
                const userData = { email: luData.user.email, name: luData.user.name, role: luData.user.role || 'normal', department: luData.user.department || '' };
                sessionSave(userData);
                if (userData.role === 'admin') {
                    window.location.replace('admin.html');
                } else {
                    window.location.replace('index.html');
                }
            } else {
                const userData = { email, name, role: 'normal', department: '' };
                sessionSave(userData);
                window.location.replace('index.html');
            }
        } else {
            // Show the actual server error message
            showLoginError(data.message || 'Registration failed. Please try again.');
        }
    } catch (err) {
        console.error('Register error:', err);
        // Show the real error, not just a generic message
        showLoginError(err.message && !err.message.includes('fetch')
            ? err.message
            : 'Could not connect. Please check your connection and try again.');
    } finally {
        setLoginLoading(false);
    }
}

async function handlePasswordVerify() {
    const email = document.getElementById('loginEmail')?.value?.trim().toLowerCase() || '';
    const passInput = document.getElementById('loginPassword');
    const password = passInput?.value || '';

    if (!password) {
        showLoginError('Please enter your password.');
        return;
    }

    hideLoginError();
    setLoginLoading(true);

    try {
        const formData = new FormData();
        formData.append('action', 'verifyLogin');
        formData.append('email', email);
        formData.append('password', password);

        const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.success) {
            const userData = {
                email: data.user.email,
                name: data.user.name,
                role: data.user.role,
                department: data.user.department
            };
            sessionSave(userData);

            if (userData.role === 'admin') {
                window.location.replace('admin.html');
            } else {
                window.location.replace('index.html');
            }
        } else {
            showLoginError(data.message || 'Invalid password.');
            if (passInput) {
                passInput.value = '';
                passInput.focus();
            }
        }
    } catch (err) {
        console.error('Password verify error:', err);
        showLoginError('Connection error. Please try again.');
    } finally {
        setLoginLoading(false);
    }
}

// ── UI HELPERS ────────────────────────────────────────────────

function showNameStep(email) {
    const emailStep = document.getElementById('emailStep');
    const nameStep = document.getElementById('nameStep');
    const passStep = document.getElementById('passwordStep');
    const emailDisplay = document.getElementById('loginEmailDisplay');

    if (emailStep) emailStep.style.display = 'none';
    if (nameStep) nameStep.style.display = 'block';
    if (passStep) passStep.style.display = 'none';
    if (emailDisplay) emailDisplay.textContent = email;

    const nameInput = document.getElementById('newUserName');
    if (nameInput) setTimeout(() => nameInput.focus(), 50);
}

function showPasswordStep(user) {
    const emailStep = document.getElementById('emailStep');
    const nameStep = document.getElementById('nameStep');
    const passStep = document.getElementById('passwordStep');
    const nameDisplay = document.getElementById('loginNameDisplay');

    if (emailStep) emailStep.style.display = 'none';
    if (nameStep) nameStep.style.display = 'none';
    if (passStep) passStep.style.display = 'block';
    if (nameDisplay) nameDisplay.textContent = user.name;

    const passInput = document.getElementById('loginPassword');
    if (passInput) {
        passInput.value = '';
        setTimeout(() => passInput.focus(), 50);
    }
}

function goBackToEmail() {
    const emailStep = document.getElementById('emailStep');
    const nameStep = document.getElementById('nameStep');
    const passStep = document.getElementById('passwordStep');
    if (emailStep) emailStep.style.display = 'block';
    if (nameStep) nameStep.style.display = 'none';
    if (passStep) passStep.style.display = 'none';
    hideLoginError();
    const emailInput = document.getElementById('loginEmail');
    if (emailInput) emailInput.focus();
}

function setLoginLoading(on) {
    const btn = document.getElementById('continueBtn');
    const registerBtn = document.getElementById('registerBtn');
    const passBtn = document.getElementById('passwordBtn');
    const spinner = document.getElementById('loginSpinner');
    const spinner2 = document.getElementById('loginSpinner2');
    const spinner3 = document.getElementById('loginSpinner3');
    const btnText = document.getElementById('continueBtnText');

    [btn, registerBtn, passBtn].forEach(b => { if (b) b.disabled = on; });
    if (spinner) spinner.style.display = on ? 'block' : 'none';
    if (spinner2) spinner2.style.display = on ? 'block' : 'none';
    if (spinner3) spinner3.style.display = on ? 'block' : 'none';
    if (btnText) btnText.textContent = on ? 'Checking...' : 'Continue →';
}

function showLoginError(msg) {
    const el = document.getElementById('loginError');
    if (el) {
        el.textContent = msg;
        el.style.display = 'block';
    }
}

function hideLoginError() {
    const el = document.getElementById('loginError');
    if (el) el.style.display = 'none';
}
