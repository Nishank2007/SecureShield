// routes/authRoutes.js — /api/auth/* and /api/admin/login

const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();

const User          = require('./User');
const OTP           = require('./OTP');
const { authLimiter }             = require('./auth');
const {
    signToken,
    safeUser,
    generateOTP,
    sendSMSOTP,
    sendSignupOTPEmail
} = require('./helpers');

// ── POST /api/auth/signup ─────────────────────────────────────
router.post('/signup', authLimiter, async (req, res) => {
    try {
        const { email, password, mobile, countryCode } = req.body;

        if (!email || !password || !mobile)
            return res.status(400).json({ success: false, message: 'Email, password and mobile are required.' });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            return res.status(400).json({ success: false, message: 'Invalid email address.' });
        if (!/^\d{10}$/.test(mobile))
            return res.status(400).json({ success: false, message: 'Mobile must be 10 digits.' });
        if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(password))
            return res.status(400).json({ success: false, message: 'Password needs 8+ chars, upper, lower, number & special char.' });
        if (await User.findOne({ email }))
            return res.status(409).json({ success: false, message: 'Email already registered.' });

        const passwordHash = await bcrypt.hash(password, 12);
        const user = await User.create({ email, passwordHash, mobile, countryCode: countryCode || '+91' });

        const otp = generateOTP();
        await OTP.deleteMany({ 
            $or: [
                { mobile: email.toLowerCase() },
                { mobile: mobile }
            ] 
        });
        await OTP.create({ mobile: email.toLowerCase(), otp });

        console.log(`[auth:signup] user created | id=${user._id} | email=${email} | mobile=${countryCode || '+91'}${mobile}`);

        const smsOk = await sendSMSOTP(mobile, countryCode || '+91', otp);
        const mailResult = await sendSignupOTPEmail({ to: email, otp, context: 'signup' });

        if (!smsOk && !mailResult.ok && !mailResult.skipped) {
            console.error('[auth:signup] warning | OTP channels may have failed (check SMS and mail logs above)');
        }

        res.status(201).json({
            success: true,
            message: 'Account created. Check your mobile for OTP (and email if configured).',
            demoOTP: process.env.NODE_ENV === 'production' ? undefined : otp,
            userId: user._id
        });
    } catch (err) {
        console.error('[auth:signup] error', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── POST /api/auth/verify-otp ─────────────────────────────────
router.post('/verify-otp', authLimiter, async (req, res) => {
    try {
        const { mobile, otp } = req.body;
        if (!mobile || !otp)
            return res.status(400).json({ success: false, message: 'Mobile or Email and OTP required.' });

        let user = await User.findOne({ $or: [{ mobile }, { email: mobile.toLowerCase() }, { email: mobile }] });
        if (!user)
            return res.status(400).json({ success: false, message: 'User not found.' });

        // Check if account is locked
        if (user.status === 'Locked')
            return res.status(403).json({ success: false, message: 'Account is permanently locked due to security breach. Contact administrator.' });

        const record = await OTP.findOne({ 
            $or: [
                { mobile }, 
                { mobile: user.email }, 
                { mobile: user.mobile }
            ] 
        });
        if (!record)
            return res.status(400).json({ success: false, message: 'OTP expired or not found. Resend.' });

        if (record.otp !== otp.toString()) {
            // Increment failed OTP attempts
            user.failedOtpAttempts += 1;

            // Check for breach condition
            if (user.failedOtpAttempts >= 3) {
                user.status = 'Locked';
                user.mobileVerified = false;
                user.lockedAt = new Date();
                await user.save();
                return res.status(403).json({ success: false, message: 'Security breach detected. Account permanently locked. Contact administrator.' });
            }

            await user.save();
            return res.status(400).json({ success: false, message: 'Incorrect OTP.' });
        }

        // Successful OTP verification
        if (user.mobile && !user.mobileVerified) {
            user.mobileVerified = true;
            user.status = 'Verified';
        }
        user.lastLogin = new Date();

        // Reset all failed attempts on successful verification
        user.failedPasswordAttempts = 0;
        user.failedOtpAttempts = 0;
        user.failedCaptchaAttempts = 0;

        await user.save();
        await OTP.deleteMany({ 
            $or: [
                { mobile }, 
                { mobile: user.email }, 
                { mobile: user.mobile }
            ] 
        });

        const token = signToken({ id: user._id, email: user.email, role: user.role });
        res.json({ success: true, message: 'Verified successfully!', token, user: safeUser(user) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── POST /api/auth/resend-otp ─────────────────────────────────
router.post('/resend-otp', authLimiter, async (req, res) => {
    try {
        const { mobile, countryCode } = req.body;
        if (!mobile)
            return res.status(400).json({ success: false, message: 'Mobile required.' });

        const user = await User.findOne({ $or: [{ mobile }, { email: mobile.toLowerCase() }, { email: mobile }] });
        if (!user)
            return res.status(404).json({ success: false, message: 'User not found.' });

        const otp = generateOTP();
        await OTP.deleteMany({ 
            $or: [
                { mobile: user.email }, 
                { mobile: user.mobile }
            ] 
        });
        await OTP.create({ mobile: user.email, otp });

        console.log(`[auth:resend-otp] user=${user.email} | mobile=${user.mobile}`);

        if (user.mobile) {
            await sendSMSOTP(user.mobile, user.countryCode || countryCode || '+91', otp);
        }

        if (user.email) {
            await sendSignupOTPEmail({ to: user.email, otp, context: 'resend' });
        }

        res.json({
            success: true,
            message: 'New OTP sent.',
            demoOTP: process.env.NODE_ENV === 'production' ? undefined : otp
        });
    } catch (err) {
        console.error('[auth:resend-otp] error', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── POST /api/auth/login  (regular users) ────────────────────
router.post('/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.status(400).json({ success: false, message: 'Email and password required.' });

        const user = await User.findOne({ email: email.toLowerCase() }) || await User.findOne({ email });
        if (!user)
            return res.status(401).json({ success: false, message: 'Invalid credentials.' });

        // Check if account is locked
        if (user.status === 'Locked')
            return res.status(403).json({ success: false, message: 'Account is permanently locked due to security breach. Contact administrator.' });

        if (!user.isActive)
            return res.status(403).json({ success: false, message: 'Account suspended. Contact support.' });

        const match = await bcrypt.compare(password, user.passwordHash);
        if (!match) {
            // Increment failed password attempts
            user.failedPasswordAttempts += 1;

            // Check for breach condition
            if (user.failedPasswordAttempts >= 3) {
                user.status = 'Locked';
                user.mobileVerified = false;
                user.lockedAt = new Date();
                await user.save();
                return res.status(403).json({ success: false, message: 'Security breach detected. Account permanently locked. Contact administrator.' });
            }

            await user.save();
            return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        }

        // Reset failed attempts on successful login
        user.failedPasswordAttempts = 0;
        user.failedOtpAttempts = 0;
        user.failedCaptchaAttempts = 0;

        const otpIdentifier = user.email; // Send OTP to their email
        const otp = generateOTP();
        await OTP.deleteMany({ mobile: otpIdentifier });
        await OTP.create({ mobile: otpIdentifier, otp });

        console.log(`[auth:login] user login attempt | id=${user._id} | email=${email} | Generating OTP`);

        // Use the existing email utility to send login OTP
        await sendSignupOTPEmail({ to: user.email, otp, context: 'login' });

        res.json({
            success: true,
            message: 'Login credentials correct. An OTP has been sent to your email.',
            requireLoginOTP: true,
            mobile: otpIdentifier,
            demoOTP: process.env.NODE_ENV === 'production' ? undefined : otp
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ── POST /api/auth/report-suspicious ─────────────────────────
router.post('/report-suspicious', (req, res) => {
    const { type, page, userAgent, details } = req.body;
    console.warn(`[SuspiciousActivity] ${type} detected!`);
    console.warn(`  - Page: ${page}`);
    console.warn(`  - UserAgent: ${userAgent}`);
    console.warn(`  - Details: ${details}`);
    
    // In a real app, you might save this to a database or trigger an alert
    res.json({ success: true });
});

module.exports = router;
