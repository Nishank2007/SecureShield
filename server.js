// server.js — entry point
// Run: node server.js
//
// User login  →  http://localhost:6000
// Admin panel →  http://localhost:6000/admin.html

require('dotenv').config();

const express     = require('express');
const cors        = require('cors');
const fs          = require('fs');
const path        = require('path');
const { connectDB, seedAdmin } = require('./db');
const { isMailConfigured } = require('./helpers');

const authRoutes  = require('./authRoutes');
const userRoutes  = require('./userRoutes');
const adminRoutes = require('./adminRoutes');

const app  = express();
const PORT = process.env.PORT || 6000;

// ── Middleware ────────────────────────────────────────────────

// Serve frontend files (index.html, admin.html, styles.css, script.js)
app.use(express.static(path.join(__dirname)));

const allowedOrigins = [
    process.env.CLIENT_URL || 'http://localhost:3000',
    'http://localhost:6000',
    'http://127.0.0.1:6000',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:5501',
    'http://127.0.0.1:5501',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'null'
];

function isLocalDevOrigin(origin) {
    if (!origin || origin === 'null') return true;
    if (allowedOrigins.includes(origin)) return true;
    // Any port on localhost / 127.0.0.1 / ::1 (Brave, Live Server, alternate PORT, etc.)
    return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin);
}

app.use(
    cors({
        origin(origin, cb) {
            cb(null, isLocalDevOrigin(origin));
        },
        credentials: true
    })
);
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────
app.use('/api/auth',  authRoutes);
app.use('/api/user',  userRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (_, res) => res.json({ status: 'ok', time: new Date() }));

// ── Start ─────────────────────────────────────────────────────
connectDB()
    .then(seedAdmin)
    .then(() => {
        const originJs = path.join(__dirname, 'api-origin.generated.js');
        fs.writeFileSync(
            originJs,
            `window.__API_PORT__=${JSON.stringify(String(PORT))};` +
                `window.__API_ORIGIN__=${JSON.stringify('http://127.0.0.1:' + PORT)};`,
            'utf8'
        );

        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀  Server  →  http://localhost:${PORT}  (also http://127.0.0.1:${PORT})`);
            console.log(`🛡️   Admin   →  http://localhost:${PORT}/admin.html`);
            console.log(
                `[startup] email OTP (SMTP): ${isMailConfigured() ? 'enabled' : 'disabled — set SMTP_HOST, MAIL_FROM or SMTP_USER, SMTP_PASS'}`
            );
            console.log(
                `[startup] SMS OTP (Fast2SMS): ${process.env.FAST2SMS_API_KEY ? 'API key set' : 'disabled — set FAST2SMS_API_KEY'}`
            );
        });
        server.on('error', err => {
            if (err.code === 'EADDRINUSE') {
                console.error(
                    `❌  Port ${PORT} is already in use. Stop the other process or change PORT in .env, then run npm start again.`
                );
            } else {
                console.error('❌  Server listen error:', err.message);
            }
            process.exit(1);
        });
    })
    .catch(err => {
        console.error('❌  Startup error:', err.message);
        process.exit(1);
    });
