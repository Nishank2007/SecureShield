require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
    try {
        console.log("Connecting to:", process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/w3schools_db');
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/w3schools_db');
        console.log("DB connected successfully");

        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log("Collections:", collections.map(c => c.name));

        const users = await mongoose.connection.db.collection('users').find({}).toArray();
        console.log("Users details:", users.map(u => ({ email: u.email, mobile: u.mobile, mobileVerified: u.mobileVerified, failedOtpAttempts: u.failedOtpAttempts, status: u.status })));

        process.exit(0);
    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
}
main();
