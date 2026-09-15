// config/db.js — MongoDB connection + admin account seeding

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

async function connectDB() {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/w3schools_db');
    console.log('✅  MongoDB connected');
}

// Runs once after DB connects — creates the hardcoded admin if not present
async function seedAdmin() {
    // Import here to avoid circular-dependency issues at startup
    const User = require('./User');

    const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'CyberSprint';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Anshika1908';

    const exists = await User.findOne({ username: ADMIN_USERNAME });
    if (exists) {
        console.log('ℹ️   Admin account already exists.');
        return;
    }

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await User.create({
        username      : ADMIN_USERNAME,
        email         : 'admin@cybersprint.internal',
        passwordHash,
        mobile        : '0000000000',
        mobileVerified: true,
        role          : 'admin',
        isActive      : true
    });
    console.log('🔑  Admin account seeded successfully.');
}

module.exports = { connectDB, seedAdmin };
