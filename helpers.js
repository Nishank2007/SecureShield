// utils/helpers.js — shared utility functions

const jwt = require('jsonwebtoken');
const axios = require('axios');
const nodemailer = require('nodemailer');

const SECRET = process.env.JWT_SECRET || 'change_this_secret_in_production';

/** Lazy SMTP transporter (reuse connections). */
let mailTransporter = null;

function getMailTransporter() {
    if (mailTransporter) return mailTransporter;
    const host = process.env.SMTP_HOST;
    if (!host) return null;

    const port = Number(process.env.SMTP_PORT || 587);
    const secure =
        process.env.SMTP_SECURE === 'true' ||
        process.env.SMTP_SECURE === '1' ||
        port === 465;

    mailTransporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth:
            process.env.SMTP_USER && process.env.SMTP_PASS
                ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
                : undefined
    });
    return mailTransporter;
}

function isMailConfigured() {
    const from = process.env.MAIL_FROM || process.env.SMTP_USER;
    return !!(process.env.SMTP_HOST && from);
}
 
// Sign a JWT valid for 7 days
function signToken(payload) {
    return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}
 
// Strip passwordHash and __v before sending user data to client
function safeUser(u) {
    const { passwordHash, __v, ...safe } = u.toObject ? u.toObject() : u;
    return safe;
}
 
// Generate a random 6-digit OTP string
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
 
// Send OTP via Fast2SMS (Indian numbers)
async function sendSMSOTP(mobile, countryCode, otp) {
    const tag = '[sms:otp]';
    if (!process.env.FAST2SMS_API_KEY) {
        console.warn(`${tag} skipped | reason=FAST2SMS_API_KEY not set`);
        return false;
    }
    try {
        console.log(`${tag} request | to=${countryCode}${mobile}`);
        const response = await axios.get('https://www.fast2sms.com/dev/bulkV2', {
            params: {
                authorization: process.env.FAST2SMS_API_KEY,
                variables_values: otp,
                route: 'otp',
                numbers: mobile
            },
            headers: { 'cache-control': 'no-cache' },
            validateStatus: () => true
        });

        const data = response.data;
        const rejected = data && data.return === false;
        const ok = response.status === 200 && !rejected;
        if (ok) {
            console.log(`${tag} ok | to=${countryCode}${mobile} | request_id=${data && data.request_id ? data.request_id : 'n/a'}`);
        } else {
            console.error(
                `${tag} failed | to=${countryCode}${mobile} | status=${response.status}`,
                typeof data === 'object' ? JSON.stringify(data) : data
            );
        }
        return ok;
    } catch (err) {
        console.error(`${tag} error | to=${countryCode}${mobile} | ${err.message}`);
        if (err.response) {
            console.error(`${tag} response | status=${err.response.status}`, err.response.data);
        }
        return false;
    }
}

/**
 * Send signup / resend OTP to email via Nodemailer.
 * Does not throw — returns { ok, skipped?, messageId?, error? } for logging and optional branching.
 */
async function sendSignupOTPEmail({ to, otp, context = 'signup' }) {
    const tag = `[mail:otp:${context}]`;

    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        console.warn(`${tag} skipped | reason=invalid or missing to address`);
        return { ok: false, skipped: true, reason: 'invalid_to' };
    }

    if (!isMailConfigured()) {
        console.warn(
            `${tag} skipped | reason=SMTP not configured (need SMTP_HOST and MAIL_FROM or SMTP_USER; SMTP_PASS if auth required)`
        );
        return { ok: false, skipped: true, reason: 'not_configured' };
    }

    const tx = getMailTransporter();
    if (!tx) {
        console.warn(`${tag} skipped | reason=no transporter`);
        return { ok: false, skipped: true, reason: 'no_transporter' };
    }

    const from = process.env.MAIL_FROM || `"SecureShield" <${process.env.SMTP_USER}>`;
    const contextLabel = context === 'login' ? 'Login' : context === 'resend' ? 'Access' : 'Signup';
    const subject = process.env.MAIL_OTP_SUBJECT || `SecureShield: Your ${contextLabel} OTP Code`;

    console.log(`${tag} sending | to=${to}`);

    try {
        const info = await tx.sendMail({
            from,
            to,
            subject,
            text: `SecureShield OTP\n\nYour one-time password (OTP) is: ${otp}\n\nThis code expires in 5 minutes. Do not share this with anyone.\n\nIf you did not request this, please ignore this email.\n\n-- SecureShield Security Team`,
            html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>SecureShield OTP</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
        <tr><td style="background:#282A35;padding:24px 32px;">
          <h1 style="color:#04AA6D;margin:0;font-size:22px;">&#128737; SecureShield</h1>
          <p style="color:#94a3b8;margin:4px 0 0;font-size:13px;">Secure Learning Platform</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="color:#1a1a2e;margin:0 0 8px;font-size:20px;">Your ${contextLabel} OTP Code</h2>
          <p style="color:#555;margin:0 0 24px;font-size:14px;">Use the code below to complete your ${context === 'login' ? 'login' : context === 'resend' ? 'verification' : 'account setup'}. It expires in <strong>5 minutes</strong>.</p>
          <div style="background:#f0fdf8;border:2px solid #04AA6D;border-radius:10px;padding:20px;text-align:center;margin-bottom:24px;">
            <p style="color:#888;font-size:12px;margin:0 0 8px;text-transform:uppercase;letter-spacing:2px;">One-Time Password</p>
            <p style="color:#04AA6D;font-size:36px;font-weight:900;letter-spacing:10px;margin:0;font-family:'Courier New',monospace;">${otp}</p>
          </div>
          <p style="color:#ef4444;font-size:13px;margin:0 0 16px;">&#9888; Never share this code with anyone. SecureShield will never ask for your OTP.</p>
          <p style="color:#888;font-size:12px;margin:0;">If you did not request this code, you can safely ignore this email.</p>
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:16px 32px;border-top:1px solid #eee;">
          <p style="color:#aaa;font-size:11px;margin:0;text-align:center;">SecureShield &bull; This is an automated message, do not reply.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
        });

        console.log(
            `${tag} sent | to=${to} | messageId=${info.messageId || 'n/a'} | accepted=${JSON.stringify(info.accepted || [])} | rejected=${JSON.stringify(info.rejected || [])}`
        );
        return { ok: true, messageId: info.messageId };
    } catch (err) {
        console.error(
            `${tag} failed | to=${to} | code=${err.code || 'n/a'} | command=${err.command || 'n/a'} | ${err.message}`
        );
        if (err.response) console.error(`${tag} smtp_response`, err.response);
        return { ok: false, error: err.message };
    }
}

module.exports = {
    signToken,
    safeUser,
    generateOTP,
    sendSMSOTP,
    sendSignupOTPEmail,
    isMailConfigured
};