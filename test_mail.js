require('dotenv').config();
const nodemailer = require('nodemailer');

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT || 587);
const secure = process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1' || port === 465;

console.log("Config:", { host, port, secure, user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ? "***" : "none" });

const tx = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined
});

tx.sendMail({
    from: process.env.MAIL_FROM || `"App" <${process.env.SMTP_USER}>`,
    to: 'yashagarwal9389@gmail.com',
    subject: 'Test OTP Mail',
    text: 'Test OTP is 123456'
}).then(info => {
    console.log("Mail sent successfully", info);
    process.exit(0);
}).catch(err => {
    console.error("Mail send failed", err);
    process.exit(1);
});
