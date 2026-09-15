// models/OTP.js — OTP schema with 5-minute TTL auto-delete

const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
    mobile   : { type: String, required: true },
    otp      : { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 300 }  // auto-deleted after 5 min
});

module.exports = mongoose.model('OTP', otpSchema);
