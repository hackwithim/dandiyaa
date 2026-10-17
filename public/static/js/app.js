/**
 * RAAS DANDIYA & GARBA NIGHT 2026 — CLIENT APPLICATION
 * High-Speed Barcode Scanner, Web Audio API Synthesis, Live Access Control
 */

// Application State
const AppState = {
    user: null, // { role: 'admin'|'volunteer', username, name, token }
    activeView: 'login',
    html5QrCode: null,
    cameras: [],
    currentCameraIndex: 0,
    isCameraRunning: false,
    isTorchOn: false,
    audioCtx: null,
    scanCooldownUntil: 0,
    searchDebounceTimer: null,
    statsPollInterval: null,
    lastScannedBarcode: null
};

// ==================== AUDIO SYNTHESIZER (WEB AUDIO API) ====================
function initAudio() {
    if (!AppState.audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            AppState.audioCtx = new AudioContext();
        }
    }
    if (AppState.audioCtx && AppState.audioCtx.state === 'suspended') {
        AppState.audioCtx.resume();
    }
}

function playSound(type) {
    try {
        initAudio();
        if (!AppState.audioCtx) return;

        const ctx = AppState.audioCtx;
        const now = ctx.currentTime;

        if (type === 'granted') {
            // Harmonic Celebratory Dual Chime (880Hz -> 1320Hz)
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();

            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(880, now); // A5
            osc1.frequency.exponentialRampToValueAtTime(1320, now + 0.18); // E6

            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(1100, now);
            osc2.frequency.exponentialRampToValueAtTime(1760, now + 0.22);

            gain.gain.setValueAtTime(0.35, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(ctx.destination);

            osc1.start(now);
            osc2.start(now);
            osc1.stop(now + 0.55);
            osc2.stop(now + 0.55);

            // Haptic vibration
            if (navigator.vibrate) navigator.vibrate(100);

        } else if (type === 'denied') {
            // Security Warning Sawtooth Buzzer (160Hz with low wobble)
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(180, now);
            osc.frequency.linearRampToValueAtTime(140, now + 0.45);

            gain.gain.setValueAtTime(0.5, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(now);
            osc.stop(now + 0.5);

            // Haptic warning pattern
            if (navigator.vibrate) navigator.vibrate([150, 80, 200]);

        } else if (type === 'notfound') {
            // Amber Alert Ping
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.setValueAtTime(330, now + 0.12);

            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(now);
            osc.stop(now + 0.35);

            if (navigator.vibrate) navigator.vibrate([80, 50, 80]);
        }
    } catch (e) {
        console.warn('Audio synthesis failed:', e);
    }
}

// ==================== AUTHENTICATION & SESSION ====================
function selectLoginRole(role) {
    const tabAdmin = document.getElementById('tabAdmin');
    const tabVol = document.getElementById('tabVolunteer');
    const adminFields = document.getElementById('adminLoginFields');
    const volFields = document.getElementById('volunteerLoginFields');
    const feedback = document.getElementById('loginFeedback');
    feedback.classList.add('hidden');

    if (role === 'admin') {
        tabAdmin.classList.add('active');
        tabVol.classList.remove('active');
        adminFields.classList.remove('hidden');
        volFields.classList.add('hidden');
    } else {
        tabVol.classList.add('active');
        tabAdmin.classList.remove('active');
        volFields.classList.remove('hidden');
        adminFields.classList.add('hidden');
    }
}

function togglePasswordVisibility(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

async function submitLogin(e) {
    e.preventDefault();
    initAudio();

    const isAdmin = document.getElementById('tabAdmin').classList.contains('active');
    const username = isAdmin 
        ? document.getElementById('adminEmailInput').value.trim() 
        : document.getElementById('volunteerStationInput').value.trim();
    const password = isAdmin 
        ? document.getElementById('adminPasswordInput').value.trim() 
        : document.getElementById('volunteerPasswordInput').value.trim();

    const feedback = document.getElementById('loginFeedback');
    const submitBtn = document.getElementById('loginSubmitBtn');

    if (!username || !password) {
        feedback.textContent = 'Please enter both username/email and password.';
        feedback.className = 'login-feedback error';
        feedback.classList.remove('hidden');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (res.ok && data.success) {
            AppState.user = data;
            sessionStorage.setItem('dandiya_user', JSON.stringify(data));
            setupAppSession();
            showToast(`Welcome, ${data.name}!`, 'success');
        } else {
            feedback.textContent = data.message || 'Invalid username or password.';
            feedback.className = 'login-feedback error';
            feedback.classList.remove('hidden');
            playSound('denied');
        }
    } catch (err) {
        feedback.textContent = 'Network or server error during login.';
        feedback.className = 'login-feedback error';
        feedback.classList.remove('hidden');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Authenticate & Open Portal</span> <i class="fa-solid fa-arrow-right"></i>';
    }
}

function handleLogout() {
    sessionStorage.removeItem('dandiya_user');
    AppState.user = null;
    if (AppState.isCameraRunning) {
        stopCamera();
    }
    if (AppState.statsPollInterval) {
        clearInterval(AppState.statsPollInterval);
    }
    document.getElementById('userInfoPill').classList.add('hidden');
    document.getElementById('navScannerBtn').classList.add('hidden');
    document.getElementById('navAnalyticsBtn').classList.add('hidden');
    document.getElementById('navDirectoryBtn').classList.add('hidden');
    document.getElementById('navAdminBtn').classList.add('hidden');
    document.getElementById('navLogoutBtn').classList.add('hidden');

    switchView('login');
    showToast('Signed out of Dandiya Access Portal', 'info');
}

function setupAppSession() {
    const user = AppState.user;
    if (!user) return;

    // Update Header Pill
    const userPill = document.getElementById('userInfoPill');
    const roleBadge = document.getElementById('userRoleBadge');
    const nameDisplay = document.getElementById('userNameDisplay');

    userPill.classList.remove('hidden');
    roleBadge.textContent = user.role.toUpperCase();
    roleBadge.className = `role-tag ${user.role}`;
    nameDisplay.textContent = user.username;

    // Show appropriate Navigation buttons
    document.getElementById('navScannerBtn').classList.remove('hidden');
    document.getElementById('navAnalyticsBtn').classList.remove('hidden');
    document.getElementById('navDirectoryBtn').classList.remove('hidden');
    document.getElementById('navLogoutBtn').classList.remove('hidden');

    if (user.role === 'admin') {
        document.getElementById('navAdminBtn').classList.remove('hidden');
    } else {
        document.getElementById('navAdminBtn').classList.add('hidden');
    }

    // Default to Scanner view
    switchView('scanner');

    // Start background stats polling
    refreshStats();
    if (AppState.statsPollInterval) clearInterval(AppState.statsPollInterval);
    AppState.statsPollInterval = setInterval(refreshStats, 10000);
}

// ==================== NAVIGATION VIEWS ====================
function switchView(viewName) {
    AppState.activeView = viewName;

    // Update nav links
    const links = ['scanner', 'analytics', 'directory', 'admin'];
    links.forEach(v => {
        const btn = document.getElementById(`nav${v.charAt(0).toUpperCase() + v.slice(1)}Btn`);
        if (btn) btn.classList.toggle('active', v === viewName);
    });

    // Update view panels
    const panels = {
        login: document.getElementById('viewLogin'),
        scanner: document.getElementById('viewScanner'),
        analytics: document.getElementById('viewAnalytics'),
        directory: document.getElementById('viewDirectory'),
        admin: document.getElementById('viewAdmin')
    };

    Object.keys(panels).forEach(k => {
        if (panels[k]) {
            panels[k].classList.toggle('active', k === viewName);
        }
    });

    // View-specific actions
    if (viewName === 'scanner') {
        if (!AppState.isCameraRunning) {
            initCameraScanner();
        }
        refocusGunInput();
    } else {
        // Pause camera in non-scanner tabs to save battery
        if (AppState.isCameraRunning) {
            stopCamera();
        }
    }

    if (viewName === 'analytics') {
        refreshStats();
    }
    if (viewName === 'directory') {
        loadDirectory();
    }
}

function refocusGunInput() {
    setTimeout(() => {
        const inp = document.getElementById('barcodeInput');
        if (inp && AppState.activeView === 'scanner') {
            inp.focus();
        }
    }, 150);
}

// ==================== BARCODE SCANNING (CAMERA & GUN) ====================
async function initCameraScanner() {
    try {
        const devices = await Html5Qrcode.getCameras();
        AppState.cameras = devices || [];

        const select = document.getElementById('cameraSelect');
        select.innerHTML = '';

        if (!devices || devices.length === 0) {
            select.innerHTML = '<option value="">No Camera Detected</option>';
            return;
        }

        devices.forEach((cam, idx) => {
            const opt = document.createElement('option');
            opt.value = cam.id;
            opt.textContent = cam.label || `Camera ${idx + 1}`;
            select.appendChild(opt);
        });

        // Default to environment (back) camera if found
        let backCamIdx = devices.findIndex(c => c.label.toLowerCase().includes('back') || c.label.toLowerCase().includes('environment'));
        if (backCamIdx < 0) backCamIdx = 0;
        AppState.currentCameraIndex = backCamIdx;
        select.selectedIndex = backCamIdx;

        startCameraWithId(devices[backCamIdx].id);
    } catch (e) {
        console.warn('Camera detection error:', e);
    }
}

function startCameraWithId(cameraId) {
    if (AppState.html5QrCode) {
        AppState.html5QrCode.stop().then(() => {
            launchCameraStream(cameraId);
        }).catch(() => {
            launchCameraStream(cameraId);
        });
    } else {
        AppState.html5QrCode = new Html5Qrcode('qrReader');
        launchCameraStream(cameraId);
    }
}

function launchCameraStream(cameraId) {
    const config = {
        fps: 20,
        qrbox: { width: 280, height: 160 },
        aspectRatio: 1.77
    };

    AppState.html5QrCode.start(
        cameraId,
        config,
        (decodedText) => {
            onBarcodeDetected(decodedText);
        },
        (error) => {
            // Ignore frame decode misses
        }
    ).then(() => {
        AppState.isCameraRunning = true;
        document.getElementById('camStateBtn').classList.add('active');
        checkTorchSupport();
    }).catch(err => {
        console.warn('Failed to start camera stream:', err);
        AppState.isCameraRunning = false;
        document.getElementById('camStateBtn').classList.remove('active');
    });
}

function stopCamera() {
    if (AppState.html5QrCode && AppState.isCameraRunning) {
        AppState.html5QrCode.stop().then(() => {
            AppState.isCameraRunning = false;
            document.getElementById('camStateBtn').classList.remove('active');
        }).catch(err => console.warn(err));
    }
}

function toggleCameraActive() {
    if (AppState.isCameraRunning) {
        stopCamera();
    } else if (AppState.cameras.length > 0) {
        const id = AppState.cameras[AppState.currentCameraIndex].id;
        startCameraWithId(id);
    }
}

function flipCamera() {
    if (AppState.cameras.length <= 1) return;
    AppState.currentCameraIndex = (AppState.currentCameraIndex + 1) % AppState.cameras.length;
    document.getElementById('cameraSelect').selectedIndex = AppState.currentCameraIndex;
    startCameraWithId(AppState.cameras[AppState.currentCameraIndex].id);
}

function onCameraSelected(id) {
    if (!id) return;
    const idx = AppState.cameras.findIndex(c => c.id === id);
    if (idx >= 0) AppState.currentCameraIndex = idx;
    startCameraWithId(id);
}

function checkTorchSupport() {
    // Check if flashlight track is available
    const torchBtn = document.getElementById('torchToggleBtn');
    try {
        const track = AppState.html5QrCode?.getRunningTrackCameraCapabilities?.();
        if (track && track.torch) {
            torchBtn.classList.remove('hidden');
        } else {
            torchBtn.classList.add('hidden');
        }
    } catch {
        torchBtn.classList.add('hidden');
    }
}

async function toggleCameraTorch() {
    const torchBtn = document.getElementById('torchToggleBtn');
    try {
        AppState.isTorchOn = !AppState.isTorchOn;
        await AppState.html5QrCode.applyVideoConstraints({
            advanced: [{ torch: AppState.isTorchOn }]
        });
        torchBtn.classList.toggle('active', AppState.isTorchOn);
    } catch (e) {
        console.warn('Torch error:', e);
    }
}

// Hardware gun submit handler
function handleManualBarcodeSubmit(e) {
    e.preventDefault();
    const input = document.getElementById('barcodeInput');
    const val = input.value.trim();
    if (val) {
        onBarcodeDetected(val);
        input.value = '';
    }
}

// Centralized Verification Processor
async function onBarcodeDetected(rawBarcode) {
    const barcode = rawBarcode.trim();
    if (!barcode) return;

    // Check client cooldown
    const now = Date.now();
    if (now < AppState.scanCooldownUntil) {
        return; // Anti-duplicate delay active
    }

    AppState.scanCooldownUntil = now + 2800; // 2.8s client cooldown
    AppState.lastScannedBarcode = barcode;

    const volunteerName = AppState.user ? (AppState.user.name || AppState.user.username) : 'Gate Station';

    try {
        const res = await fetch('/api/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode, volunteer: volunteerName })
        });
        const data = await res.json();
        renderScanResult(data, barcode);
        refreshStats();
    } catch (e) {
        renderScanResult({
            success: false,
            status: 'ERROR',
            message: 'Server communication error. Please check connection.'
        }, barcode);
    } finally {
        refocusGunInput();
    }
}

// Render Status Display Card
function renderScanResult(data, scannedBarcode) {
    const card = document.getElementById('scanResultCard');
    const content = document.getElementById('resultContent');
    const placeholder = card.querySelector('.result-placeholder');

    placeholder.classList.add('hidden');
    content.classList.remove('hidden');

    card.className = 'festive-card result-card';

    if (data.status === 'GRANTED') {
        card.classList.add('granted');
        playSound('granted');
        showToast(`Access Granted: ${data.student?.name || ''}`, 'success');

        const student = data.student || {};
        content.innerHTML = `
            <div class="result-badge-header">
                <div class="status-stamp granted">
                    <i class="fa-solid fa-circle-check"></i> ACCESS GRANTED
                </div>
                <div class="cooldown-indicator"><i class="fa-solid fa-clock"></i> 3s Cooldown</div>
            </div>
            <div class="result-attendee-name">${escapeHtml(student.name || 'UNKNOWN')}</div>
            <div class="result-tags-row">
                <span class="result-tag college-tag"><i class="fa-solid fa-building-columns"></i> ${escapeHtml(student.college || '')}</span>
                <span class="result-tag barcode-tag"><i class="fa-solid fa-barcode"></i> ${escapeHtml(student.barcode || scannedBarcode)}</span>
                ${student.division ? `<span class="result-tag"><i class="fa-solid fa-graduation-cap"></i> ${escapeHtml(student.division)}</span>` : ''}
            </div>
            <div class="result-detail-box">
                <div class="detail-row">
                    <span class="label">Admission Time:</span>
                    <span class="val">${student.entry_time || ''} • ${student.entry_date || ''}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Verified At Gate:</span>
                    <span class="val">${escapeHtml(student.volunteer || '')}</span>
                </div>
            </div>
            <div class="result-actions-row">
                <span class="event-tag-pill"><i class="fa-solid fa-sparkles"></i> Valid Pass Verified</span>
                <button class="undo-btn" onclick="undoCheckin('${escapeHtml(student.barcode)}')">
                    <i class="fa-solid fa-rotate-left"></i> Undo Check-in
                </button>
            </div>
        `;

    } else if (data.status === 'DUPLICATE_DENIED') {
        card.classList.add('denied');
        playSound('denied');
        showToast(`SECOND ENTRY DENIED! Pass already used.`, 'error');

        const student = data.student || {};
        const firstEntry = data.first_entry || {};

        content.innerHTML = `
            <div class="result-badge-header">
                <div class="status-stamp denied">
                    <i class="fa-solid fa-shield-xmark"></i> SECOND ENTRY DENIED
                </div>
                <div class="cooldown-indicator"><i class="fa-solid fa-triangle-exclamation"></i> DUPLICATE ALERT</div>
            </div>
            <div class="result-attendee-name">${escapeHtml(student.name || 'PASS ALREADY USED')}</div>
            <div class="result-tags-row">
                <span class="result-tag college-tag">${escapeHtml(student.college || '')}</span>
                <span class="result-tag barcode-tag">${escapeHtml(student.barcode || scannedBarcode)}</span>
            </div>
            <div class="denied-alert-banner">
                <i class="fa-solid fa-hand"></i> <strong>STRICT SECURITY ALERT:</strong> This pass was already admitted through the gate. Do not allow second entry!
            </div>
            <div class="result-detail-box">
                <div class="detail-row">
                    <span class="label">Original Check-in:</span>
                    <span class="val" style="color: #f87171">${firstEntry.time || ''} on ${firstEntry.date || ''}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Verified Prior By:</span>
                    <span class="val">${escapeHtml(firstEntry.volunteer || 'Gate')}</span>
                </div>
            </div>
            <div class="result-actions-row">
                <span style="color: #fca5a5; font-size: 0.8rem; font-weight: 700;">DUPLICATE PASS REFUSED</span>
                <button class="undo-btn" onclick="undoCheckin('${escapeHtml(student.barcode)}')">
                    <i class="fa-solid fa-rotate-left"></i> Override / Undo Prior
                </button>
            </div>
        `;

    } else if (data.status === 'NOT_FOUND') {
        card.classList.add('notfound');
        playSound('notfound');
        showToast(`Pass not registered: ${scannedBarcode}`, 'warning');

        content.innerHTML = `
            <div class="result-badge-header">
                <div class="status-stamp notfound">
                    <i class="fa-solid fa-circle-question"></i> UNREGISTERED PASS
                </div>
                <div class="cooldown-indicator">NOT FOUND</div>
            </div>
            <div class="result-attendee-name" style="color: #fcd34d">Barcode Not Found</div>
            <div class="result-tags-row">
                <span class="result-tag barcode-tag"><i class="fa-solid fa-barcode"></i> ${escapeHtml(scannedBarcode)}</span>
            </div>
            <div class="denied-alert-banner" style="background: rgba(245, 158, 11, 0.2); border-color: #f59e0b; color: #fef3c7;">
                <i class="fa-solid fa-circle-exclamation"></i> This barcode is not in the official Dandiya 2026 database. Verify if the attendee is registered under a different college or phone number.
            </div>
            <div class="result-actions-row">
                <button class="secondary-btn btn-sm" onclick="searchInDirectory('${escapeHtml(scannedBarcode)}')">
                    <i class="fa-solid fa-magnifying-glass"></i> Search in Directory
                </button>
            </div>
        `;

    } else {
        // Cooldown or error
        content.innerHTML = `
            <div class="result-badge-header">
                <div class="status-stamp notfound">
                    <i class="fa-solid fa-clock"></i> DELAY ACTIVE
                </div>
            </div>
            <p style="padding: 20px 0; color: #ffffff;">${escapeHtml(data.message || 'Please wait a moment.')}</p>
        `;
    }
}

async function undoCheckin(barcode) {
    if (!confirm(`Are you sure you want to revert check-in for barcode [${barcode}] back to PENDING?`)) return;

    try {
        const res = await fetch('/api/undo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                barcode, 
                admin: AppState.user ? AppState.user.name : 'Gate Operator' 
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast('Pass reverted to PENDING', 'info');
            refreshStats();
            // Reset result card to placeholder
            const card = document.getElementById('scanResultCard');
            card.className = 'festive-card result-card empty';
            card.querySelector('.result-placeholder').classList.remove('hidden');
            document.getElementById('resultContent').classList.add('hidden');
        } else {
            alert(data.message);
        }
    } catch (e) {
        alert('Failed to undo checkin');
    }
}

// ==================== LIVE STATS & AUDIT LOGS ====================
async function refreshStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();

        // Update Top Metrics
        document.getElementById('statTotalAttendees').textContent = data.total?.toLocaleString() || '1,362';
        document.getElementById('statAdmittedAttendees').textContent = data.entered?.toLocaleString() || '0';
        document.getElementById('statPendingAttendees').textContent = data.pending?.toLocaleString() || '1,362';

        const admittedPct = data.percentage || 0;
        document.getElementById('statAdmittedProgress').style.width = `${admittedPct}%`;
        document.getElementById('statTurnoutRate').textContent = `${admittedPct}% Turnout`;

        // Calculate Duplicate Attempts from logs
        const recentLogs = data.recent_logs || [];
        const duplicatesBlocked = recentLogs.filter(l => l.status === 'DUPLICATE_DENIED').length;
        document.getElementById('statDuplicateDenied').textContent = duplicatesBlocked;

        // Render 5 College Breakdown Cards
        renderCollegeCards(data.colleges || {});

        // Render Mini Gate Activity Feed
        renderMiniLogFeed(recentLogs);

        // Render Full Audit Table in Analytics View
        renderAuditTable(recentLogs);
    } catch (e) {
        console.warn('Failed to refresh stats:', e);
    }
}

function renderCollegeCards(colleges) {
    const grid = document.getElementById('collegesBreakdownGrid');
    if (!grid) return;

    const collegeList = ['DYPIMED', 'DYPCOEI', 'DYPTC', 'DYPSOA', 'BOX OFFICE'];
    grid.innerHTML = '';

    collegeList.forEach(col => {
        const info = colleges[col] || { total: 0, entered: 0, percentage: 0 };
        const card = document.createElement('div');
        card.className = 'college-stat-card';
        card.innerHTML = `
            <div class="college-card-title">${col}</div>
            <div class="college-stat-nums">
                <span class="college-stat-admitted">${info.entered}</span>
                <span class="college-stat-total">/ ${info.total} passes</span>
            </div>
            <div class="college-progress">
                <div class="college-progress-bar" style="width: ${info.percentage}%"></div>
            </div>
            <div class="college-pct-text">${info.percentage}% admitted (${info.total - info.entered} pending)</div>
        `;
        grid.appendChild(card);
    });
}

function renderMiniLogFeed(logs) {
    const container = document.getElementById('miniLogList');
    if (!container) return;

    if (!logs || logs.length === 0) {
        container.innerHTML = '<div class="empty-log-state">No scans recorded yet.</div>';
        return;
    }

    container.innerHTML = '';
    logs.slice(0, 15).forEach(l => {
        const item = document.createElement('div');
        item.className = 'mini-log-item';
        const dotClass = l.status === 'GRANTED' ? 'granted' : (l.status === 'DUPLICATE_DENIED' ? 'denied' : 'notfound');
        item.innerHTML = `
            <div class="mini-log-left">
                <span class="mini-log-dot ${dotClass}"></span>
                <strong>${escapeHtml(l.student_name || l.barcode)}</strong>
                <span style="color: rgba(255,255,255,0.4)">(${escapeHtml(l.college || 'N/A')})</span>
            </div>
            <span class="mini-log-time">${l.time || ''}</span>
        `;
        container.appendChild(item);
    });
}

function renderAuditTable(logs) {
    const tbody = document.getElementById('auditTableBody');
    if (!tbody) return;

    if (!logs || logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">No audit activity recorded yet.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    logs.forEach(l => {
        const tr = document.createElement('tr');
        const pillClass = l.status === 'GRANTED' ? 'granted' : (l.status === 'DUPLICATE_DENIED' ? 'denied' : 'notfound');
        const pillLabel = l.status === 'GRANTED' ? 'GRANTED' : (l.status === 'DUPLICATE_DENIED' ? 'DENIED' : 'UNREGISTERED');

        tr.innerHTML = `
            <td><span class="table-status-pill ${pillClass}">${pillLabel}</span></td>
            <td><strong>${escapeHtml(l.student_name || 'N/A')}</strong></td>
            <td><code>${escapeHtml(l.barcode || '')}</code></td>
            <td>${escapeHtml(l.college || '')}</td>
            <td>${l.time || ''} • ${l.date || ''}</td>
            <td>${escapeHtml(l.volunteer || '')}</td>
            <td>${escapeHtml(l.message || '')}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ==================== ATTENDEE DIRECTORY ====================
function debounceDirectorySearch() {
    clearTimeout(AppState.searchDebounceTimer);
    AppState.searchDebounceTimer = setTimeout(loadDirectory, 250);
}

function clearDirectorySearch() {
    document.getElementById('dirSearchInput').value = '';
    document.getElementById('clearSearchBtn').classList.add('hidden');
    loadDirectory();
}

function searchInDirectory(query) {
    switchView('directory');
    const input = document.getElementById('dirSearchInput');
    input.value = query;
    loadDirectory();
}

async function loadDirectory() {
    const search = document.getElementById('dirSearchInput')?.value.trim() || '';
    const college = document.getElementById('dirCollegeSelect')?.value || 'ALL';
    const status = document.getElementById('dirStatusSelect')?.value || 'ALL';

    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) clearBtn.classList.toggle('hidden', !search);

    const tbody = document.getElementById('directoryTableBody');
    const countLabel = document.getElementById('directoryResultsCount');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="loading-cell">Searching attendees...</td></tr>';

    try {
        const params = new URLSearchParams({ search, college, status });
        const res = await fetch(`/api/students?${params.toString()}`);
        const data = await res.json();

        if (countLabel) {
            countLabel.textContent = `Showing ${data.students?.length || 0} of ${data.total || 0} matching attendees`;
        }

        if (!data.students || data.students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="loading-cell">No attendees match your search filters.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        data.students.forEach(s => {
            const tr = document.createElement('tr');
            const isEntered = s.status === 'ENTERED';
            tr.innerHTML = `
                <td>
                    <span class="table-status-pill ${isEntered ? 'granted' : 'notfound'}">
                        ${isEntered ? 'ADMITTED' : 'PENDING'}
                    </span>
                </td>
                <td><strong>${escapeHtml(s.name || '')}</strong></td>
                <td><code>${escapeHtml(s.barcode || '')}</code></td>
                <td><span class="result-tag college-tag">${escapeHtml(s.college || '')}</span></td>
                <td>${escapeHtml(s.division || '—')}</td>
                <td>${s.entry_time ? `${s.entry_time} (${s.entry_date})` : '—'}</td>
                <td>${escapeHtml(s.volunteer || '—')}</td>
                <td>
                    ${!isEntered ? `
                        <button class="action-checkin-btn" onclick="manualCheckinDirect('${escapeHtml(s.barcode)}', '${escapeHtml(s.name)}')">
                            <i class="fa-solid fa-check"></i> Admit
                        </button>
                    ` : `
                        <button class="undo-btn" onclick="undoCheckin('${escapeHtml(s.barcode)}')">
                            <i class="fa-solid fa-rotate-left"></i> Undo
                        </button>
                    `}
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="loading-cell">Failed to load directory.</td></tr>';
    }
}

async function manualCheckinDirect(barcode, name) {
    if (!confirm(`Confirm manual admission for:\n${name}\nBarcode: ${barcode}?`)) return;

    try {
        const res = await fetch('/api/checkin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                barcode, 
                volunteer: AppState.user ? AppState.user.name : 'Directory Admin' 
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`Admitted: ${name}`, 'success');
            playSound('granted');
            loadDirectory();
            refreshStats();
        } else {
            alert(data.message);
        }
    } catch (e) {
        alert('Failed manual checkin');
    }
}

// ==================== ADMIN ACTIONS ====================
function exportAttendanceCSV() {
    window.location.href = '/api/export';
    showToast('Generating official CSV attendance sheet...', 'info');
}

async function handleChangePassword(e) {
    e.preventDefault();
    const current_password = document.getElementById('currentPassInput').value.trim();
    const new_password = document.getElementById('newPassInput').value.trim();
    const feedback = document.getElementById('changePassFeedback');

    try {
        const res = await fetch('/api/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ current_password, new_password })
        });
        const data = await res.json();
        feedback.textContent = data.message;
        feedback.className = `login-feedback ${data.success ? 'success' : 'error'}`;
        feedback.classList.remove('hidden');
        if (data.success) {
            document.getElementById('changePasswordForm').reset();
            showToast('Administrator password updated', 'success');
        }
    } catch (err) {
        feedback.textContent = 'Failed to update password.';
        feedback.className = 'login-feedback error';
        feedback.classList.remove('hidden');
    }
}

async function handleResetEventEntries() {
    const password = document.getElementById('resetPassInput').value.trim();
    if (!password) {
        alert('Master password required to confirm reset.');
        return;
    }

    if (!confirm('CRITICAL ACTION: This will reset ALL 1,362 attendee check-in records back to PENDING. An automated pre-reset backup will be created. Proceed?')) {
        return;
    }

    try {
        const res = await fetch('/api/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await res.json();
        if (data.success) {
            alert(`SUCCESS: ${data.message}\nBackup created: ${data.backup}`);
            document.getElementById('resetPassInput').value = '';
            showToast('Event entries successfully reset to PENDING', 'success');
            refreshStats();
        } else {
            alert(`ERROR: ${data.message}`);
        }
    } catch (e) {
        alert('Reset request failed.');
    }
}

// ==================== TOAST & UTILITIES ====================
function showToast(msg, type = 'success') {
    const toast = document.getElementById('toastNotification');
    const msgEl = document.getElementById('toastMessage');
    const iconEl = document.getElementById('toastIcon');

    msgEl.textContent = msg;
    if (type === 'success') {
        iconEl.innerHTML = '<i class="fa-solid fa-circle-check" style="color: #34d399"></i>';
    } else if (type === 'error') {
        iconEl.innerHTML = '<i class="fa-solid fa-circle-xmark" style="color: #f87171"></i>';
    } else if (type === 'warning') {
        iconEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color: #fbbf24"></i>';
    } else {
        iconEl.innerHTML = '<i class="fa-solid fa-circle-info" style="color: #60a5fa"></i>';
    }

    toast.classList.remove('hidden');
    clearTimeout(toast.timeout);
    toast.timeout = setTimeout(() => {
        toast.classList.add('hidden');
    }, 3800);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Check saved session
    const saved = sessionStorage.getItem('dandiya_user');
    if (saved) {
        try {
            AppState.user = JSON.parse(saved);
            setupAppSession();
        } catch {
            sessionStorage.removeItem('dandiya_user');
        }
    }

    // Keyboard shortcut: Space to refocus barcode gun
    document.addEventListener('keydown', (e) => {
        if (AppState.activeView === 'scanner' && e.code === 'Space' && document.activeElement.tagName !== 'INPUT') {
            e.preventDefault();
            refocusGunInput();
        }
    });
});
