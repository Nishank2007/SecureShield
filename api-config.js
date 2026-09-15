/**
 * Sets window.__API_ORIGIN__ for fetch() to the Express app.
 * Load api-origin.generated.js first (written on each `npm start` with your .env PORT).
 *
 * Optional: <meta name="api-origin" content="http://localhost:YOUR_PORT"> overrides everything.
 */
(function () {
    var FALLBACK = 'http://127.0.0.1:6000';
    if (typeof window === 'undefined') return;

    var meta = document.querySelector('meta[name="api-origin"]');
    if (meta) {
        var raw = meta.getAttribute('content');
        if (raw != null && String(raw).trim() !== '') {
            window.__API_ORIGIN__ = String(raw).trim().replace(/\/$/, '');
            return;
        }
    }

    var loc = window.location;
    if (loc.protocol === 'file:') {
        window.__API_ORIGIN__ = window.__API_ORIGIN__ || FALLBACK;
        return;
    }

    var genPort = window.__API_PORT__;
    var genOrigin = window.__API_ORIGIN__;
    var port = loc.port || '';

    // Same browser tab as Express (port matches what server wrote) → true same-origin (fixes localhost vs 127.0.0.1)
    if (genPort && port === String(genPort)) {
        window.__API_ORIGIN__ = loc.origin;
        return;
    }

    if (genOrigin) {
        window.__API_ORIGIN__ = genOrigin;
        return;
    }

    if (port === '6000' || port === '5000') {
        window.__API_ORIGIN__ = loc.origin;
        return;
    }

    window.__API_ORIGIN__ = FALLBACK;
})();
