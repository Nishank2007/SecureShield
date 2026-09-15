// routes/userRoutes.js — /api/user/* (authenticated users)

const express = require('express');
const router  = express.Router();

const User              = require('./User');
const { verifyToken }   = require('./auth');
const { safeUser }      = require('./helpers');

// ── GET /api/user/profile ─────────────────────────────────────
router.get('/profile', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user)
            return res.status(404).json({ success: false, message: 'User not found.' });
        res.json({ success: true, user: safeUser(user) });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── PUT /api/user/progress ────────────────────────────────────
router.put('/progress', verifyToken, async (req, res) => {
    try {
        const { courseId, courseName, progress } = req.body;
        const user = await User.findById(req.user.id);

        const existing = user.courses.find(c => c.courseId === courseId);
        if (existing) {
            existing.progress = progress;
        } else {
            user.courses.push({ courseId, courseName, progress });
        }

        await user.save();
        res.json({ success: true, message: 'Progress updated.', courses: user.courses });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

module.exports = router;
