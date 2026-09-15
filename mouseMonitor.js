// mouseMonitor.js — Bot Detection via Mouse Movement Analysis
// Include this script in ALL your HTML pages (index.html, user.html, admin.html)
// <script src="mouseMonitor.js"></script>

(function () {
    'use strict';

    // ── Config ──────────────────────────────────────────────────
    const CONFIG = {
        // Kitne straight moves ke baad suspicious maane
        STRAIGHT_MOVE_THRESHOLD: 10,

        // Kitne ms mein movements check karein
        CHECK_INTERVAL_MS: 2000,

        // Minimum movement distance (pixels) — ignore tiny moves
        MIN_DISTANCE: 5,

        // Kitne total suspicious events ke baad BLOCK karo
        BLOCK_THRESHOLD: 3,

        // Angle tolerance (degrees) — exactly 0/90/180/270 +/- tolerance
        ANGLE_TOLERANCE: 2,
    };

    // ── State ───────────────────────────────────────────────────
    let mouseHistory      = [];
    let straightMoveCount = 0;
    let suspiciousCount   = 0;
    let isBlocked         = false;
    let lastX             = null;
    let lastY             = null;

    // ── Utility: Angle between two points ───────────────────────
    function getAngle(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
        if (angle < 0) angle += 360;
        return angle;
    }

    // ── Utility: Distance between two points ────────────────────
    function getDistance(x1, y1, x2, y2) {
        return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    }

    // ── Check if angle is exactly 0, 90, 180, 270 degrees ───────
    function isStraightAngle(angle) {
        const straightAngles = [0, 90, 180, 270, 360];
        return straightAngles.some(sa => Math.abs(angle - sa) <= CONFIG.ANGLE_TOLERANCE);
    }

    // ── Block the page ───────────────────────────────────────────
    function blockPage() {
        isBlocked = true;

        // Report to backend
        reportToBackend();

        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'bot-block-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100vw; height: 100vh;
            background: rgba(10, 14, 26, 0.97);
            z-index: 999999;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-family: 'Space Grotesk', sans-serif;
            color: #e8eaf0;
        `;

        overlay.innerHTML = `
            <div style="text-align:center; max-width: 480px; padding: 2rem;">
                <div style="font-size: 4rem; margin-bottom: 1rem;">🤖</div>
                <h1 style="font-size: 1.8rem; font-weight: 700; color: #ff4757; margin-bottom: 0.75rem;">
                    Suspicious Activity Detected
                </h1>
                <p style="color: #8892a4; font-size: 0.95rem; margin-bottom: 2rem; line-height: 1.6;">
                    Automated or bot-like mouse movement detected on this page.
                    Your session has been blocked for security reasons.
                </p>
                <div style="background: rgba(255,71,87,0.1); border: 1px solid rgba(255,71,87,0.3);
                            border-radius: 12px; padding: 1rem; margin-bottom: 2rem; font-size: 0.85rem; color: #ff6b81;">
                    ⚠️ If you are a real user, please refresh the page and try again.
                </div>
                <button onclick="location.reload()"
                    style="padding: 0.75rem 2rem; background: #04AA6D; border: none;
                           border-radius: 10px; color: white; font-size: 1rem;
                           font-weight: 600; cursor: pointer; font-family: inherit;">
                    🔄 Refresh & Try Again
                </button>
            </div>
        `;

        document.body.appendChild(overlay);

        // Disable all interactions
        document.body.style.pointerEvents = 'none';
        overlay.style.pointerEvents = 'all';

        console.warn('🚫 [BotDetector] Page blocked due to suspicious mouse activity.');
    }

    // ── Report suspicious activity to backend ───────────────────
    async function reportToBackend() {
        try {
            const apiBase = typeof window !== 'undefined' && window.__API_ORIGIN__ ? window.__API_ORIGIN__ : '';
            await fetch(`${apiBase}/api/auth/report-suspicious`, {
                method : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body   : JSON.stringify({
                    type     : 'BOT_MOUSE_MOVEMENT',
                    page     : window.location.pathname,
                    userAgent: navigator.userAgent,
                    timestamp: new Date().toISOString(),
                    details  : `Straight mouse moves detected: ${straightMoveCount} times`
                })
            });
        } catch (e) {
            // Non-fatal — backend might not have this endpoint yet
        }
    }

    // ── Analyze mouse movements ──────────────────────────────────
    function analyzeMovements() {
        if (isBlocked || mouseHistory.length < 5) return;

        let straightCount = 0;

        for (let i = 1; i < mouseHistory.length; i++) {
            const prev = mouseHistory[i - 1];
            const curr = mouseHistory[i];

            const dist  = getDistance(prev.x, prev.y, curr.x, curr.y);
            if (dist < CONFIG.MIN_DISTANCE) continue;

            const angle = getAngle(prev.x, prev.y, curr.x, curr.y);

            if (isStraightAngle(angle)) {
                straightCount++;
            }
        }

        const straightRatio = straightCount / mouseHistory.length;

        // If more than 80% moves are perfectly straight — suspicious!
        if (straightCount >= CONFIG.STRAIGHT_MOVE_THRESHOLD && straightRatio > 0.8) {
            suspiciousCount++;
            console.warn(`⚠️ [BotDetector] Suspicious movement #${suspiciousCount} detected! Straight moves: ${straightCount}/${mouseHistory.length}`);

            if (suspiciousCount >= CONFIG.BLOCK_THRESHOLD) {
                blockPage();
            }
        }

        // Reset history for next interval
        mouseHistory = [];
    }

    // ── Mouse move listener ──────────────────────────────────────
    document.addEventListener('mousemove', function (e) {
        if (isBlocked) return;

        const x = e.clientX;
        const y = e.clientY;

        if (lastX !== null && lastY !== null) {
            mouseHistory.push({ x, y, t: Date.now() });

            // Keep history size manageable
            if (mouseHistory.length > 100) {
                mouseHistory.shift();
            }
        }

        lastX = x;
        lastY = y;
    });

    // ── Periodic analysis ────────────────────────────────────────
    setInterval(analyzeMovements, CONFIG.CHECK_INTERVAL_MS);

    // ── Also detect no mouse movement at all (headless browser) ──
    let mouseMoved = false;
    document.addEventListener('mousemove', () => { mouseMoved = true; }, { once: true });

    setTimeout(() => {
        if (!mouseMoved && !isBlocked) {
            console.warn('⚠️ [BotDetector] No mouse movement detected — possible headless browser!');
            suspiciousCount++;
            if (suspiciousCount >= CONFIG.BLOCK_THRESHOLD) blockPage();
        }
    }, 10000); // 10 seconds baad check karo

    console.log('🛡️ [BotDetector] Mouse monitoring active.');

})();
