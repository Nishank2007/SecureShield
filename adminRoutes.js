// routes/adminRoutes.js — /api/admin/* (admin only)

const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();

const User                        = require('./User');
const { verifyToken, adminOnly, authLimiter } = require('./auth');
const { signToken, safeUser }     = require('./helpers');

// ── POST /api/admin/login  (username + password) ──────────────
router.post('/login', authLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password)
            return res.status(400).json({ success: false, message: 'Username and password required.' });

        const user = await User.findOne({ username });
        if (!user || user.role !== 'admin')
            return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
        if (!user.isActive)
            return res.status(403).json({ success: false, message: 'Account suspended.' });

        const match = await bcrypt.compare(password, user.passwordHash);
        if (!match)
            return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });

        user.lastLogin = new Date();
        await user.save();

        const token = signToken({ id: user._id, username: user.username, role: user.role });
        res.json({ success: true, message: 'Admin login successful.', token, user: safeUser(user) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// All routes below require a valid admin JWT
router.use(verifyToken, adminOnly);

// ── GET /api/admin/stats ──────────────────────────────────────
router.get('/stats', async (req, res) => {
    try {
        const [total, active, verified, admins, locked] = await Promise.all([
            User.countDocuments({ role: 'user' }),
            User.countDocuments({ role: 'user', isActive: true }),
            User.countDocuments({ role: 'user', mobileVerified: true }),
            User.countDocuments({ role: 'admin' }),
            User.countDocuments({ role: 'user', status: 'Locked' })
        ]);
        res.json({ success: true, stats: {
            total,
            active,
            suspended: total - active,
            verified,
            admins,
            breached: locked, // Use locked count for breached stat
            locked
        } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── GET /api/admin/users  (paginated, searchable) ─────────────
router.get('/users', async (req, res) => {
    try {
        const page   = parseInt(req.query.page)  || 1;
        const limit  = parseInt(req.query.limit) || 25;
        const skip   = (page - 1) * limit;
        const filter = req.query.search
            ? { email: new RegExp(req.query.search, 'i'), role: 'user' }
            : { role: 'user' };

        const [users, total] = await Promise.all([
            User.find(filter, '-passwordHash').sort({ createdAt: -1 }).skip(skip).limit(limit),
            User.countDocuments(filter)
        ]);
        res.json({ success: true, total, page, pages: Math.ceil(total / limit), users });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── GET /api/admin/users/:id ──────────────────────────────────
router.get('/users/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id, '-passwordHash');
        if (!user)
            return res.status(404).json({ success: false, message: 'User not found.' });
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── PATCH /api/admin/users/:id/toggle-status ─────────────────
router.patch('/users/:id/toggle-status', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user)
            return res.status(404).json({ success: false, message: 'User not found.' });
        
        user.isActive = !user.isActive;
        
        // Agar suspend hoga toh unverify automatically ho jayega
        if (!user.isActive) {
            user.mobileVerified = false;
            user.status = 'Unverified';
        }

        await user.save();
        res.json({
            success : true,
            message : `User ${user.isActive ? 'activated' : 'suspended'}.`,
            isActive: user.isActive
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── PATCH /api/admin/users/:id/toggle-verification ──────────
router.patch('/users/:id/toggle-verification', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user)
            return res.status(404).json({ success: false, message: 'User not found.' });
        
        user.mobileVerified = !user.mobileVerified;
        user.status = user.mobileVerified ? 'Verified' : 'Unverified';

        // Auto-activate if verified while suspended? The user didn't ask for this. 
        // We will leave isActive as is.
        
        await user.save();
        res.json({
            success : true,
            message : `Mobile verification ${user.mobileVerified ? 'enabled' : 'disabled'}.`,
            mobileVerified: user.mobileVerified
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── PATCH /api/admin/users/:id/unlock ────────────────────────
router.patch('/users/:id/unlock', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user)
            return res.status(404).json({ success: false, message: 'User not found.' });

        // Reset all security tracking and unlock account
        user.failedPasswordAttempts = 0;
        user.failedOtpAttempts = 0;
        user.failedCaptchaAttempts = 0;
        user.status = 'Unverified';
        user.mobileVerified = false;
        user.lockedAt = undefined;

        await user.save();
        res.json({
            success: true,
            message: 'Account unlocked successfully. User must verify again.',
            user: {
                _id: user._id,
                email: user.email,
                status: user.status,
                mobileVerified: user.mobileVerified,
                failedPasswordAttempts: user.failedPasswordAttempts,
                failedOtpAttempts: user.failedOtpAttempts,
                failedCaptchaAttempts: user.failedCaptchaAttempts
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── DELETE /api/admin/users/:id ───────────────────────────────
router.delete('/users/:id', async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user)
            return res.status(404).json({ success: false, message: 'User not found.' });
        res.json({ success: true, message: 'User deleted permanently.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

module.exports = router;
