/**
 * ============================================================
 *  IT TICKETING PLATFORM — Submit Ticket Logic
 *  File: js/submit_ticket.js
 * ============================================================
 */

window.addEventListener('DOMContentLoaded', () => {

    // ── Auth guard ────────────────────────────────────────
    const user = requireLogin();
    if (!user) return; // redirecting...

    // ── Render nav ────────────────────────────────────────
    renderNav('submit');

    // ── Populate Hero Welcome ─────────────────────────────
    const heroWelcome = document.getElementById('heroWelcome');
    const userNameText = document.getElementById('userNameText');
    if (heroWelcome && userNameText && user) {
        const firstName = (user.name || user.email.split('@')[0]).split(' ')[0];
        userNameText.textContent = firstName;
        heroWelcome.style.display = 'block';
    }

    // ── Pre-fill user data ────────────────────────────────
    const nameInput = document.getElementById('inputName');
    const emailInput = document.getElementById('inputEmail');
    const deptSelect = document.getElementById('inputDept');
    const changeNote = document.getElementById('nameChangeNote');

    if (nameInput) nameInput.value = user.name || '';
    if (emailInput) emailInput.value = user.email || '';

    // ── Populate departments dynamically ──────────────────
    if (deptSelect && typeof CONFIG !== 'undefined' && CONFIG.DEPARTMENTS) {
        // Keep the first "Select your department" option
        const firstOption = deptSelect.options[0];
        deptSelect.innerHTML = '';
        if (firstOption) deptSelect.appendChild(firstOption);

        CONFIG.DEPARTMENTS.forEach(dept => {
            const opt = document.createElement('option');
            opt.value = dept;
            opt.textContent = dept;
            deptSelect.appendChild(opt);
        });
    }

    // Pre-select department if stored
    if (deptSelect && user.department) {
        const opts = Array.from(deptSelect.options);
        const match = opts.find(o => o.value === user.department || o.text === user.department);
        if (match) deptSelect.value = match.value;
    }

    // Track name changes to update the Users sheet on submit
    let originalName = user.name || '';
    if (nameInput && changeNote) {
        nameInput.addEventListener('input', () => {
            if (nameInput.value.trim() !== originalName) {
                changeNote.style.cssText = 'display:inline;font-size:11px;color:var(--muted);margin-top:4px;';
            } else {
                changeNote.style.display = 'none';
            }
        });
    }

    // ── Priority button selector ──────────────────────────
    const priorityBtns = document.querySelectorAll('.priority-btn');
    const priorityValInput = document.getElementById('priorityVal');

    priorityBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            priorityBtns.forEach(b => {
                b.classList.remove('selected');
                b.setAttribute('aria-pressed', 'false');
            });
            btn.classList.add('selected');
            btn.setAttribute('aria-pressed', 'true');
            priorityValInput.value = btn.dataset.val;
        });
        btn.setAttribute('aria-pressed', 'false');
    });

    // ── File drop & input handling ────────────────────────
    const fileDrop = document.getElementById('fileDrop');
    const fileInput = document.getElementById('fileInput');
    const fileNameDisplay = document.getElementById('fileName');

    if (fileInput) {
        fileInput.addEventListener('change', () => {
            if (fileInput.files[0]) {
                const f = fileInput.files[0];
                fileNameDisplay.textContent = '📄 ' + f.name + ' (' + formatFileSize(f.size) + ')';
                fileDrop.classList.add('has-file');
            } else {
                fileNameDisplay.textContent = '';
                fileDrop.classList.remove('has-file');
            }
        });
    }

    if (fileDrop) {
        fileDrop.addEventListener('dragover', e => {
            e.preventDefault();
            fileDrop.classList.add('dragover');
        });
        fileDrop.addEventListener('dragleave', () => {
            fileDrop.classList.remove('dragover');
        });
        fileDrop.addEventListener('drop', e => {
            e.preventDefault();
            fileDrop.classList.remove('dragover');
            const dt = e.dataTransfer;
            if (dt && dt.files[0]) {
                const f = dt.files[0];
                if (!f.type.startsWith('image/') && f.type !== 'application/pdf') {
                    showError('Only image files (PNG, JPG, GIF) and PDFs are accepted.');
                    return;
                }
                try {
                    const transfer = new DataTransfer();
                    transfer.items.add(f);
                    fileInput.files = transfer.files;
                } catch (_) { }
                fileNameDisplay.textContent = '📄 ' + f.name + ' (' + formatFileSize(f.size) + ')';
            }
        });
    }

    // ── Form submission ───────────────────────────────────
    const ticketForm = document.getElementById('ticketForm');
    if (ticketForm) {
        ticketForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideError();

            const form = e.target;
            const name = nameInput ? nameInput.value.trim() : user.name;
            const email = user.email; // always from session — read-only
            const department = form.department.value;
            const category = form.category.value;
            const priority = form.priority.value;
            const description = form.description.value.trim();

            // ── Validation ────────────────────────────────
            if (!name || name.length < 2) { showError('Please enter your full name.'); return; }
            if (!department) { showError('Please select your department.'); return; }
            if (!category) { showError('Please select an issue category.'); return; }
            if (!priority) { showError('Please select a priority level (Low, Medium, or High).'); return; }
            if (!description || description.length < 10) {
                showError('Please provide a description of the issue (at least 10 characters).');
                return;
            }

            const file = fileInput ? fileInput.files[0] : null;
            if (file && file.size > 10 * 1024 * 1024) {
                showError('The uploaded file is too large. Maximum size is 10 MB.');
                return;
            }
            if (typeof CONFIG === 'undefined' || !CONFIG.APPS_SCRIPT_URL) {
                showError('Configuration error: Apps Script URL not set. Please contact your IT administrator.');
                return;
            }

            // ── If name changed, update Users sheet first ─
            if (name !== originalName) {
                try {
                    const nameFormData = new FormData();
                    nameFormData.append('action', 'updateUserName');
                    nameFormData.append('email', email);
                    nameFormData.append('name', name);
                    await fetch(CONFIG.APPS_SCRIPT_URL, {
                        method: 'POST',
                        body: nameFormData
                    });
                    const u = sessionGet();
                    if (u) { u.name = name; sessionSave(u); }
                    originalName = name;
                    if (changeNote) changeNote.style.display = 'none';
                } catch (_) { /* Non-critical — ticket still submits */ }
            }

            setLoading(true);

            try {
                const formData = new FormData();
                formData.append('action', 'createTicket');
                formData.append('name', name);
                formData.append('email', email);
                formData.append('department', department);
                formData.append('category', category);
                formData.append('priority', priority);
                formData.append('description', description);

                if (file) {
                    const base64 = await fileToBase64(file);
                    formData.append('fileName', file.name);
                    formData.append('fileData', base64);
                    formData.append('fileType', file.type || 'application/octet-stream');
                }

                const response = await fetch(CONFIG.APPS_SCRIPT_URL, { method: 'POST', body: formData });
                if (!response.ok) throw new Error('Server returned status ' + response.status);

                const result = await response.json();
                if (result.success) {
                    const u = sessionGet();
                    if (u) {
                        u.department = department;
                        sessionSave(u);
                        // Clear caches
                        CACHE_MANAGER.remove(`my_tickets_cache_${email}`);
                        CACHE_MANAGER.remove('tickets_cache_data');
                    }
                    showSuccess(result.ticketId);
                } else {
                    throw new Error(result.message || 'Submission failed. Please try again.');
                }

            } catch (err) {
                console.error('Submission error:', err);
                showError('Connection error. Please check your internet connection and try again. If the problem persists, contact your IT administrator.');
            } finally {
                setLoading(false);
            }
        });
    }
});

// ── UTILITIES ─────────────────────────────────────────────────

function setLoading(isLoading) {
    const btn = document.getElementById('submitBtn');
    const txt = document.getElementById('submitText');
    const spin = document.getElementById('spinner');
    const arrow = document.getElementById('submitArrow');
    if (!btn) return;
    btn.disabled = isLoading;
    if (txt) txt.textContent = isLoading ? 'Submitting...' : 'Submit Ticket';
    if (spin) spin.style.display = isLoading ? 'block' : 'none';
    if (arrow) arrow.style.display = isLoading ? 'none' : 'inline';
}

function showError(msg) {
    const alert = document.getElementById('errorAlert');
    const msgEl = document.getElementById('errorMsg');
    if (alert && msgEl) {
        msgEl.textContent = msg;
        alert.style.display = 'flex';
        alert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function hideError() {
    const alert = document.getElementById('errorAlert');
    if (alert) alert.style.display = 'none';
}

function showSuccess(ticketId) {
    const overlay = document.getElementById('successOverlay');
    const idBadge = document.getElementById('displayTicketId');
    if (overlay && idBadge) {
        idBadge.textContent = ticketId;
        overlay.classList.add('show');
    }
}

function resetForm() {
    const form = document.getElementById('ticketForm');
    if (form) form.reset();

    // Re-fill from session after reset
    const user = sessionGet();
    if (user) {
        const n = document.getElementById('inputName');
        const em = document.getElementById('inputEmail');
        if (n) n.value = user.name || '';
        if (em) em.value = user.email || '';
    }

    const fileName = document.getElementById('fileName');
    if (fileName) fileName.textContent = '';

    const priorityVal = document.getElementById('priorityVal');
    if (priorityVal) priorityVal.value = '';

    document.querySelectorAll('.priority-btn').forEach(b => {
        b.classList.remove('selected');
        b.setAttribute('aria-pressed', 'false');
    });

    const overlay = document.getElementById('successOverlay');
    if (overlay) overlay.classList.remove('show');

    const changeNote = document.getElementById('nameChangeNote');
    if (changeNote) changeNote.style.display = 'none';

    hideError();
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}
