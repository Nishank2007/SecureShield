// keyboardMonitor.js — Bot Detection via Typing Speed Analysis
// Include this script in ALL your HTML pages (index.html, user.html, admin.html)
// <script src="keyboardMonitor.js"></script>

(function () {
    'use strict';

    // ── Config ──────────────────────────────────────────────────
    const CONFIG = {
        // Minimum time (ms) between keystrokes — humans can't type faster than this
        // World's fastest typist = ~200 WPM = ~60ms per key
        // Bots type at 0-10ms per key
        MIN_HUMAN_INTERVAL_MS: 30,

        // Kitne consecutive fast keystrokes ke baad suspicious maane
        FAST_STROKE_THRESHOLD: 8,

        // Kitne total suspicious events ke baad BLOCK karo
        BLOCK_THRESHOLD: 2,

        // Analysis window — last N keystrokes analyze karo
        ANALYSIS_WINDOW: 20,
    };

    // ── State ───────────────────────────────────────────────────
    let keystrokeHistory  = [];
    let fastStrokeCount   = 0;
    let suspiciousCount   = 0;
    let isBlocked         = false;
    let lastKeyTime       = null;

    // ── Block the page ───────────────────────────────────────────
    function blockPage(reason) {
        isBlocked = true;

        reportToBackend(reason);

        const overlay = document.createElement('div');
        overlay.id = 'keyboard-block-overlay';
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
                <div style="font-size: 4rem; margin-bottom: 1rem;">⌨️🤖</div>
                <h1 style="font-size: 1.8rem; font-weight: 700; color: #ff4757; margin-bottom: 0.75rem;">
                    Suspicious Typing Detected
                </h1>
                <p style="color: #8892a4; font-size: 0.95rem; margin-bottom: 1.5rem; line-height: 1.6;">
                    Automated or bot-like keyboard activity detected.<br>
                    Your session has been blocked for security reasons.
                </p>
                <div style="background: rgba(255,71,87,0.1); border: 1px solid rgba(255,71,87,0.3);
                            border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem;
                            font-size: 0.83rem; color: #ff6b81; text-align: left;">
                    <strong>Reason:</strong> ${reason}<br><br>
                    ⚠️ If you are a real user, please refresh and type normally.
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
        document.body.style.pointerEvents = 'none';
        overlay.style.pointerEvents = 'all';

        console.warn(`🚫 [KeyboardMonitor] Page blocked! Reason: ${reason}`);
    }

    // ── Report to backend ────────────────────────────────────────
    async function reportToBackend(reason) {
        try {
            const apiBase = typeof window !== 'undefined' && window.__API_ORIGIN__ ? window.__API_ORIGIN__ : '';
            await fetch(`${apiBase}/api/auth/report-suspicious`, {
                method : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body   : JSON.stringify({
                    type     : 'BOT_KEYBOARD_ACTIVITY',
                    page     : window.location.pathname,
                    userAgent: navigator.userAgent,
                    timestamp: new Date().toISOString(),
                    details  : reason
                })
            });
        } catch (e) {
            // Non-fatal
        }
    }

    // ── Analyze keystroke speed ──────────────────────────────────
    function analyzeKeystrokes() {
        if (keystrokeHistory.length < CONFIG.ANALYSIS_WINDOW) return;

        const recent = keystrokeHistory.slice(-CONFIG.ANALYSIS_WINDOW);
        let fastCount = 0;
        let totalInterval = 0;

        for (let i = 1; i < recent.length; i++) {
            const interval = recent[i].time - recent[i - 1].time;
            totalInterval += interval;
            if (interval < CONFIG.MIN_HUMAN_INTERVAL_MS) {
                fastCount++;
            }
        }

        const avgInterval = totalInterval / (recent.length - 1);
        const fastRatio   = fastCount / (recent.length - 1);

        console.log(`⌨️ [KeyboardMonitor] Avg interval: ${avgInterval.toFixed(1)}ms | Fast ratio: ${(fastRatio * 100).toFixed(1)}%`);

        // Agar 70%+ keystrokes bahut fast hain — bot hai!
        if (fastCount >= CONFIG.FAST_STROKE_THRESHOLD && fastRatio > 0.7) {
            suspiciousCount++;
            console.warn(`⚠️ [KeyboardMonitor] Suspicious typing #${suspiciousCount}! Fast strokes: ${fastCount}/${recent.length - 1} | Avg: ${avgInterval.toFixed(1)}ms`);

            if (suspiciousCount >= CONFIG.BLOCK_THRESHOLD) {
                blockPage(
                    `Typing speed too fast for human input. 
                     Average interval: ${avgInterval.toFixed(1)}ms 
                     (minimum human: ${CONFIG.MIN_HUMAN_INTERVAL_MS}ms). 
                     Fast keystrokes: ${fastCount}/${recent.length - 1}`
                );
            }
        }
    }

    // ── Keydown listener ─────────────────────────────────────────
    document.addEventListener('keydown', function (e) {
        if (isBlocked) return;

        const now = Date.now();

        if (lastKeyTime !== null) {
            const interval = now - lastKeyTime;

            keystrokeHistory.push({
                key     : e.key,
                time    : now,
                interval: interval
            });

            // Keep history manageable
            if (keystrokeHistory.length > 200) {
                keystrokeHistory.shift();
            }

            // Real-time fast stroke counter
            if (interval < CONFIG.MIN_HUMAN_INTERVAL_MS) {
                fastStrokeCount++;
            } else {
                // Reset agar normal typing start ho
                fastStrokeCount = Math.max(0, fastStrokeCount - 1);
            }

            // Turant block karo agar bahut zyada consecutive fast strokes
            if (fastStrokeCount >= CONFIG.FAST_STROKE_THRESHOLD * 2) {
                suspiciousCount++;
                if (suspiciousCount >= CONFIG.BLOCK_THRESHOLD) {
                    blockPage(`${fastStrokeCount} consecutive ultra-fast keystrokes detected (< ${CONFIG.MIN_HUMAN_INTERVAL_MS}ms each)`);
                    return;
                }
            }

            // Periodic analysis
            if (keystrokeHistory.length % 10 === 0) {
                analyzeKeystrokes();
            }
        }

        lastKeyTime = now;
    });

    console.log('🛡️ [KeyboardMonitor] Keyboard monitoring active.');

})();
