// inspectBlocker.js — Anti-DevTools Security Module
// Prevents right-click and common keyboard shortcuts used to open Developer Tools

(function () {
    'use strict';

    // 1. Block Right-Click (Context Menu)
    document.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        console.warn('🚫 [Security] Right-click is disabled on this platform.');
    });

    // 2. Block Keyboard Shortcuts
    document.addEventListener('keydown', function (e) {
        // Prevent F12
        if (e.key === 'F12' || e.keyCode === 123) {
            e.preventDefault();
            console.warn('🚫 [Security] F12 is disabled.');
            return false;
        }

        // Prevent Ctrl+Shift+I / Cmd+Option+I (Inspect)
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.keyCode === 73)) {
            e.preventDefault();
            console.warn('🚫 [Security] Developer tools are blocked.');
            return false;
        }

        // Prevent Ctrl+Shift+J / Cmd+Option+J (Console)
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'J' || e.key === 'j' || e.keyCode === 74)) {
            e.preventDefault();
            console.warn('🚫 [Security] Console access is blocked.');
            return false;
        }

        // Prevent Ctrl+Shift+C / Cmd+Option+C (Element Selection)
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c' || e.keyCode === 67)) {
            e.preventDefault();
            console.warn('🚫 [Security] Element inspection is blocked.');
            return false;
        }

        // Prevent Ctrl+U / Cmd+U (View Source)
        if ((e.ctrlKey || e.metaKey) && (e.key === 'U' || e.key === 'u' || e.keyCode === 85)) {
            e.preventDefault();
            console.warn('🚫 [Security] View Source is disabled.');
            return false;
        }
        
        // Prevent Ctrl+S / Cmd+S (Save Page)
        if ((e.ctrlKey || e.metaKey) && (e.key === 'S' || e.key === 's' || e.keyCode === 83)) {
            e.preventDefault();
            console.warn('🚫 [Security] Page saving is disabled.');
            return false;
        }
    });

    // 3. Optional: Trigger alarm if devtools are somehow opened (Advanced)
    // You can detect devtools by evaluating execution time differences or screen sizes
    // But basic key-blocking is sufficient for 99% of general visitors.

    console.log('🛡️ [InspectBlocker] Anti-Inspector module active.');
})();
