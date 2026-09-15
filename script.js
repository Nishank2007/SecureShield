/* 
    SecureShield - Premium Integrated Authentication Engine
*/

let failedAttempts = 0;
const MAX_ATTEMPTS = 3;
let cooldownActive = false;
let loginCaptchaCode = '';
let signupCaptchaCode = '';
let currentIdentifier = '';
let currentEmail = ''; // actual email address for display
let latestDemoOTP = ''; // dev-mode OTP for display

const API_BASE = window.__API_ORIGIN__ || 'http://127.0.0.1:5000';

// ═══════════════════════════════════════════════════════════════
//  FIRE ALARM SYSTEM — SecurityAlarm integration
//  Triggers on 3 wrong password attempts, plays continuously
//  until lockout timer expires. Uses security-alarm.js engine.
// ═══════════════════════════════════════════════════════════════
let breachAlarm = null;

// CAPTCHA Management
function generateCaptcha(type) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let res = '';
    for(let i=0; i<5; i++) res += chars.charAt(Math.floor(Math.random()*chars.length));
    if(type === 'login') {
        loginCaptchaCode = res;
        document.getElementById('login-captcha-code').innerText = res;
    } else {
        signupCaptchaCode = res;
        document.getElementById('signup-captcha-code').innerText = res.split('').join(' ');
    }
}

function refreshCaptcha(type) { generateCaptcha(type); }

// UI View Management
function switchTab(type) {
    if (cooldownActive) return;
    document.querySelectorAll('.auth-view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    if(type === 'login') {
        document.getElementById('loginSection').classList.add('active');
        document.getElementById('tab-login').classList.add('active');
    } else if(type === 'signup') {
        document.getElementById('signupSection').classList.add('active');
        document.getElementById('tab-signup').classList.add('active');
    } else {
        document.getElementById('otpSection').classList.add('active');
        // Show OTP destination info
        const infoEl = document.getElementById('otp-dest-info');
        if (infoEl) {
            infoEl.innerHTML = currentEmail ? `OTP sent to <strong>${currentEmail}</strong>` : 'OTP sent to your email';
        }
    }
}

// Security Failure Tracking
function handleFailure() {
    failedAttempts++;
    if (failedAttempts >= MAX_ATTEMPTS) {
        triggerRedAlert();
    } else {
        const card = document.querySelector('.auth-card');
        card.style.animation = 'none';
        card.offsetHeight;
        card.style.animation = 'shake 0.4s cubic-bezier(.36,.07,.19,.97) both';
    }
}

// Red Alert Orchestration — FIRE ALARM MODE
function triggerRedAlert() {
    cooldownActive = true;
    const alertOverlay = document.getElementById('red-alert');
    const alertBtn = document.getElementById('alert-btn');
    
    alertOverlay.classList.add('active');
    alertBtn.disabled = true;
    alertBtn.innerText = 'SYSTEM LOCKED';
    
    // ═══ START FIRE ALARM — continuous until lockout ends ═══
    if (breachAlarm) { breachAlarm.stop(); breachAlarm = null; }
    breachAlarm = new SecurityAlarm({
        primaryFreq:   3100,    // authentic fire alarm pitch
        secondaryFreq: 2350,
        blastDuration: 500,     // 500ms ON
        blastGap:      500,     // 500ms OFF between blasts
        burstPause:    1500,    // 1.5s pause after 3 blasts
        blastsPerCycle: 3,
        volume:        0.85,
        voiceEnabled:  true,
        voiceInterval: 8000     // repeat voice every 8 seconds
    });
    breachAlarm.start();
    
    let sec = 30;
    const countEl = document.getElementById('cooldown-timer');
    
    // Intense visual feedback — screen shakes
    document.body.classList.add('alarm-active');
    
    const interval = setInterval(() => {
        sec--;
        countEl.innerText = sec;
        
        if (sec <= 0) {
            clearInterval(interval);
            // Stop the fire alarm when timer expires
            if (breachAlarm) { breachAlarm.stop(); breachAlarm = null; }
            alertBtn.disabled = false;
            alertBtn.innerText = 'RETRY SESSION';
            document.body.classList.remove('alarm-active');
        }
    }, 1000);
}

function resetAlert() {
    failedAttempts = 0; cooldownActive = false;
    // Kill the alarm immediately on reset
    if (breachAlarm) { breachAlarm.stop(); breachAlarm = null; }
    document.body.classList.remove('alarm-active');
    document.getElementById('red-alert').classList.remove('active');
    refreshCaptcha('login');
}

// Authentication Actions
async function submitLogin() {
    if (cooldownActive) return;
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const cap = document.getElementById('login-captcha-input').value;

    if (cap.toUpperCase() !== loginCaptchaCode) {
        showMsg('login', 'Security Verification Failed');
        handleFailure();
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.success) {
            currentIdentifier = data.mobile || email;
            currentEmail = email;
            latestDemoOTP = data.demoOTP || '';
            switchTab('otp');
        } else {
            showMsg('login', data.message);
            handleFailure();
        }
    } catch(e) { showMsg('login', 'Protocol Communications Error'); }
}

async function submitSignup() {
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const confirm = document.getElementById('signupConfirmPassword').value;
    const mobile = document.getElementById('signupMobile').value;
    const country = document.getElementById('countryCode').value;
    const cap = document.getElementById('signup-captcha-input').value;

    if (password !== confirm) { showMsg('signup', 'Access Keys Do Not Match'); return; }
    if (cap.toUpperCase() !== signupCaptchaCode.replace(/\s/g, '')) { showMsg('signup', 'Security Code Mismatch'); return; }

    try {
        const res = await fetch(`${API_BASE}/api/auth/signup`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email, password, mobile, countryCode: country })
        });
        const data = await res.json();
        if (data.success) {
            currentIdentifier = email;
            currentEmail = email;
            latestDemoOTP = data.demoOTP || '';
            switchTab('otp');
        } else {
            showMsg('signup', data.message);
        }
    } catch(e) { showMsg('signup', 'Initialization Error'); }
}

async function verifyOTP() {
    const boxes = document.querySelectorAll('.otp-box');
    let otp = ''; boxes.forEach(b => otp += b.value);
    
    try {
        const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ mobile: currentIdentifier, otp })
        });
        const data = await res.json();
        if (data.success) {
            // SYNCING WITH user.html EXPECTATIONS
            localStorage.setItem('authToken', data.token);
            window.location.href = 'w3dashboard.html';
        } else {
            showMsg('otp', data.message);
        }
    } catch(e) { showMsg('otp', 'Verification Link Broken'); }
}

async function resendOTP() {
    try {
        const res = await fetch(`${API_BASE}/api/auth/resend-otp`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ mobile: currentIdentifier })
        });
        const data = await res.json();
        if (data.demoOTP) {
            latestDemoOTP = data.demoOTP;
        }
        showMsg('otp', 'New OTP sent! Check your email (and spam folder).', 'success');
    } catch(e) { showMsg('otp', 'Resend failed. Try again.'); }
}

function showMsg(section, text, type = 'error') {
    const el = document.getElementById(`${section}Msg`);
    el.innerText = text;
    el.className = `msg-box ${type}`;
    refreshCaptcha(section === 'otp' ? 'login' : section); 
}

// Pasword Strength Engine
function updateStrength(p) {
    const bar = document.getElementById('strength-bar');
    const txt = document.getElementById('strength-text');
    let s = 0;
    if (p.length >= 8) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;

    bar.className = 'strength-bar-fill';
    if (s <= 1) { bar.style.width = '33%'; bar.style.backgroundColor='#ef4444'; txt.innerText = 'Weak'; txt.style.color='#ef4444'; }
    else if (s <= 3) { bar.style.width = '66%'; bar.style.backgroundColor='#f59e0b'; txt.innerText = 'Medium'; txt.style.color='#f59e0b'; }
    else { bar.style.width = '100%'; bar.style.backgroundColor='#10b981'; txt.innerText = 'Strong'; txt.style.color='#10b981'; }
}

function generateStrongPassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let p = ''; for(let i=0; i<16; i++) p += chars.charAt(Math.floor(Math.random()*chars.length));
    const input = document.getElementById('signupPassword');
    input.value = p; input.type = 'text';
    updateStrength(p);
    setTimeout(() => input.type = 'password', 3000);
}

// OTP Interaction Driver with Accessibility & Paste Support
function initOTP() {
    const boxes = document.querySelectorAll('.otp-box');
    
    boxes.forEach((b, i) => {
        // Handle input and auto-focus next
        b.addEventListener('input', (e) => {
            if (e.inputType === 'deleteContentBackward') return;
            const val = e.target.value;
            if (val.length === 1 && i < boxes.length - 1) {
                boxes[i + 1].focus();
            }
            checkComplete();
        });

        // Advanced Keyboard Navigation
        b.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && b.value === '' && i > 0) {
                boxes[i - 1].focus();
            } else if (e.key === 'ArrowLeft' && i > 0) {
                boxes[i - 1].focus();
            } else if (e.key === 'ArrowRight' && i < boxes.length - 1) {
                boxes[i + 1].focus();
            }
        });

        // Auto-Paste Support
        b.addEventListener('paste', (e) => {
            const data = e.clipboardData.getData('text').trim();
            if (data.length === boxes.length) {
                const chars = data.split('');
                boxes.forEach((box, idx) => {
                    box.value = chars[idx] || '';
                });
                boxes[boxes.length - 1].focus();
                checkComplete();
            }
            e.preventDefault();
        });

        // Focus styling
        b.addEventListener('focus', () => b.select());
    });

    function checkComplete() {
        const otp = Array.from(boxes).map(b => b.value).join('');
        if (otp.length === boxes.length) {
            // Optional: Auto-submit or highlight
            document.querySelector('#otpSection .btn-submit').classList.add('ready');
        } else {
            document.querySelector('#otpSection .btn-submit').classList.remove('ready');
        }
    }
}

window.onload = () => {
    generateCaptcha('login');
    generateCaptcha('signup');
    initOTP();
};
