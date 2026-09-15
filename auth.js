// middleware/auth.js — JWT verification, admin guard, rate limiter

const jwt       = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const SECRET = process.env.JWT_SECRET || 'change_this_secret_in_production';

// Verify Bearer token and attach decoded payload to req.user
function verifyToken(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer '))
        return res.status(401).json({ success: false, message: 'No token provided.' });
    try {
        req.user = jwt.verify(header.split(' ')[1], SECRET);
        next();
    } catch {
        return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
    }
}

// Must come after verifyToken — blocks non-admin users
function adminOnly(req, res, next) {
    if (req.user.role !== 'admin')
        return res.status(403).json({ success: false, message: 'Admin access required.' });
    next();
}

// Rate limiter — max 20 requests per 15 min per IP on auth routes
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max     : 20,
    message : { success: false, message: 'Too many requests, please try again later.' }
});

module.exports = { verifyToken, adminOnly, authLimiter };
