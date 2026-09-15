// models/User.js — User schema & model

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username       : { type: String, unique: true, sparse: true, trim: true },
    email          : { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    passwordHash   : { type: String, required: true },
    mobile         : { type: String, default: '' },
    countryCode    : { type: String, default: '+91' },
    mobileVerified : { type: Boolean, default: false },
    role           : { type: String, enum: ['user', 'admin'], default: 'user' },
    isActive       : { type: Boolean, default: true },
    lastLogin      : { type: Date },
    courses        : [{
        courseId  : String,
        courseName: String,
        progress  : { type: Number, default: 0 },
        startedAt : { type: Date, default: Date.now }
    }],
    streak        : { type: Number, default: 0 },
    certificates  : [{ type: String }],
    // Security tracking fields
    failedPasswordAttempts: { type: Number, default: 0 },
    failedOtpAttempts     : { type: Number, default: 0 },
    failedCaptchaAttempts : { type: Number, default: 0 },
    status                : { type: String, enum: ['Verified', 'Unverified', 'Breach', 'Locked'], default: 'Unverified' },
    lockedAt              : { type: Date },
    createdAt     : { type: Date, default: Date.now }
}, { versionKey: false });

module.exports = mongoose.model('User', userSchema);
