require('dotenv').config();
const UAParser = require('ua-parser-js')
const { PrismaClient } = require('../generated/prisma');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT;
const TOKEN_EXPIRY = '7d';

function getDeviceName(name, userAgent) {
    const parser = new UAParser(userAgent)
    const device = parser.getDevice()
    const os = parser.getOS()

    let device_type = 'device';
    if (os.name === 'iOS') device_type = 'iPhone';
    else if (os.name === 'Android') device_type = 'Android Phone';
    else if (device.type === "mobile") device_type = device.model || "Mobile";
    else if (device.type === "tablet") device_type = device.model || "Tablet";
    else if (device.type === "console") device_type = device.model || "Console";
    else if (os.name === 'macOS') device_type = 'Mac';
    else if (os.name === 'Windows') device_type = 'Windows PC';
    else if (os.name === 'Linux') device_type = 'Linux PC';

    return `${name}'s ${device_type}`
}

function generateToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, name: user.name },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
    );
}

const googleCallbackUrl = process.env.GOOGLE_CALLBACK_URL;
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: googleCallbackUrl
},
    async (accessToken, refreshToken, profile, done) => {
        try {
            const email = profile.emails[0].value;
            const name = profile.displayName;

            let user = await prisma.Users.findUnique({
                where: { email }
            });

            if (!user) {
                user = await prisma.Users.create({
                    data: {
                        name,
                        email,
                        username: email.split('@')[0] + Math.random().toString(36).substring(7),
                        pfp: profile.photos[0].value,
                        password: '',
                        googleId: profile.id
                    }
                });
            } else if (!user.googleId) {
                await prisma.Users.update({
                    where: { id: user.id },
                    data: { googleId: profile.id }
                });
            }

            return done(null, user);
        } catch (err) {
            return done(err, null);
        }
    }
));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await prisma.Users.findUnique({ where: { id } });
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

async function signup(req, res, next) {
    try {
        console.log("[Signup] Request body:", req.body);
        const { name, username, email, password } = req.body;
        if (!name) { console.log("[Signup] Missing name"); return res.status(400).json({ message: "Name required" }); }
        if (!username) { console.log("[Signup] Missing username"); return res.status(400).json({ message: "Username required" }); }
        if (!email) { console.log("[Signup] Missing email"); return res.status(400).json({ message: "Email required" }); }
        if (!password) { console.log("[Signup] Missing password"); return res.status(400).json({ message: "Password required" }); }

        const existing = await prisma.users.findUnique({ where: { email } });
        if (existing) { console.log("[Signup] User exists"); return res.status(400).json({ message: "User already exists" }); }

        const hash = await bcrypt.hash(password, 10);
        const user = await prisma.users.create({
            data: {
                name,
                username,
                email,
                pfp: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`,
                password: hash
            }
        });

        res.status(201).json({ message: "User created", id: user.id });
    } catch (err) {
        next(err);
    }
}

async function login(req, res, next) {
    try {
        const { identifier, password } = req.body;
        if (!identifier) return res.status(400).json({ message: "Email or Username required" });
        if (!password) return res.status(400).json({ message: "Password required" });

        const user = await prisma.Users.findFirst({
            where: {
                OR: [
                    { email: identifier },
                    { username: identifier }
                ]
            }
        });
        if (!user) return res.status(400).json({ message: "User not found" });

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return res.status(400).json({ message: "Invalid password" });

        const token = generateToken(user);
        const deviceName = getDeviceName(user.name, req.headers["user-agent"] || "Unknown Device");

        const existingDevice = await prisma.device.findFirst({
            where: { DeviceUserId: user.id, name: deviceName }
        });
        if (existingDevice) {
            await prisma.device.update({
                where: { id: existingDevice.id },
                data: {
                    status: "online",
                    ip: req.ip,
                    updatedAt: new Date()
                }
            });
        } else {
            await prisma.device.create({
                data: {
                    DeviceUserId: user.id,
                    name: deviceName,
                    status: "online",
                    ip: req.ip
                }
            });
        }

        res.cookie("token", token, {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            path: '/',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
        res.json({ message: "Login success", deviceName, token });
    } catch (err) {
        console.error(err);
        next(err);
    }
}

async function logout(req, res, next) {
    try {
        res.clearCookie("token", { httpOnly: true, secure: false, sameSite: 'none' })
            .json({ message: "Logout success" });
    } catch (err) {
        next(err);
    }
}

async function googleAuthCallback(req, res) {
    try {
        const user = req.user;

        if (!user) {
            return res.status(401).json({ message: "Authentication failed" });
        }

        console.log("🔐 Google OAuth user:", user.email);

        const token = generateToken(user);
        const deviceName = getDeviceName(user.name, req.headers["user-agent"] || "Google OAuth Device");

        const existingDevice = await prisma.device.findFirst({
            where: { DeviceUserId: user.id, name: deviceName }
        });

        if (existingDevice) {
            await prisma.device.update({
                where: { id: existingDevice.id },
                data: {
                    status: "online",
                    ip: req.ip,
                    updatedAt: new Date()
                }
            });
        } else {
            await prisma.device.create({
                data: {
                    DeviceUserId: user.id,
                    name: deviceName,
                    status: "online",
                    ip: req.ip
                }
            });
        }

        res.cookie("token", token, {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            path: '/',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        console.log("Google auth successful - Redirecting to dashboard");
        return res.redirect(`${process.env.FRONTEND_URL.replace(/\/$/, '')}/dashboard?auth=success&token=${encodeURIComponent(token)}`);

    } catch (err) {
        console.error("Google Auth Callback Error:", err);
        return res.redirect(`${process.env.FRONTEND_URL.replace(/\/$/, '')}/?error=google_auth_failed`);
    }
}

async function getUserProfile(req, res, next) {
    try {
        const userId = req.user.id;
        const user = await prisma.users.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                username: true,
                googleId: true,
                storageUsed: true,
                createdAt: true,
                devices: true
            }
        });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const currentDeviceName = getDeviceName(user.name, req.headers["user-agent"] || "Unknown Device");

        const userWithCurrentDevice = {
            ...user,
            devices: user.devices.map(device => ({
                ...device,
                isCurrent: device.name === currentDeviceName
            }))
        };

        res.json({ user: userWithCurrentDevice });
    } catch (err) {
        next(err);
    }
}


async function updateUserProfile(req, res, next) {
    try {
        const userId = req.user.id;
        const { name, username, email } = req?.body;

        const user = await prisma.users.update({
            where: { id: userId },
            data: { name, username, email }
        });

        res.json({ user });
    } catch (err) {
        next(err);
    }
}

async function deleteDevice(req, res, next) {
    try {
        const userId = req.user.id;
        const deviceId = req.params.id;

        const device = await prisma.device.findFirst({
            where: { id: deviceId, DeviceUserId: userId }
        });

        if (!device) {
            return res.status(404).json({ message: "Device not found" });
        }

        await prisma.roomDevices.deleteMany({
            where: { deviceId: deviceId }
        });

        await prisma.device.delete({
            where: { id: deviceId }
        });

        res.json({ message: "Device removed successfully" });
    } catch (err) {
        next(err);
    }
}


async function changePassword(req, res, next) {
    try {
        const userId = req.user.id;
        const { oldPassword, newPassword } = req.body;

        if (!oldPassword || !newPassword) {
            return res.status(400).json({ message: "Both old and new passwords are required" });
        }

        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ message: "User not found" });

        if (!user.password && user.googleId) {
            return res.status(400).json({ message: "You are logged in via Google. Please set a password first." });
        }

        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Incorrect old password" });
        }

        const hash = await bcrypt.hash(newPassword, 10);
        await prisma.users.update({
            where: { id: userId },
            data: { password: hash }
        });

        res.json({ message: "Password updated successfully" });
    } catch (err) {
        next(err);
    }
}

async function deleteUser(req, res, next) {
    try {
        const userId = req.user.id;

        // Delete all related data transactions
        // 1. Delete RoomUsers
        await prisma.roomUsers.deleteMany({ where: { userId } });

        // 2. Delete Devices & RoomDevices
        const userDevices = await prisma.device.findMany({ where: { DeviceUserId: userId } });
        const deviceIds = userDevices.map(d => d.id);

        await prisma.roomDevices.deleteMany({ where: { deviceId: { in: deviceIds } } });
        await prisma.device.deleteMany({ where: { DeviceUserId: userId } });

        // 3. Delete RefreshTokens
        await prisma.refreshToken.deleteMany({ where: { userId } });

        // 4. Delete Rooms hosted by user
        // First delete participants/devices in those rooms to avoid FK constraint errors if any remain
        const userHostedRooms = await prisma.room.findMany({ where: { hostId: userId } });
        const roomIds = userHostedRooms.map(r => r.id);

        await prisma.roomUsers.deleteMany({ where: { roomId: { in: roomIds } } });
        await prisma.roomDevices.deleteMany({ where: { roomId: { in: roomIds } } });
        await prisma.room.deleteMany({ where: { hostId: userId } });

        // 5. Finally delete user
        await prisma.users.delete({ where: { id: userId } });

        res.clearCookie("token").json({ message: "User account deleted successfully" });
    } catch (err) {
        next(err);
    }
}

async function updateDevice(req, res, next) {
    try {
        const userId = req.user.id;
        const deviceId = req.params.id;
        const { name } = req.body;

        if (!name) return res.status(400).json({ message: "Device name is required" });

        const device = await prisma.device.findFirst({
            where: { id: deviceId, DeviceUserId: userId }
        });

        if (!device) return res.status(404).json({ message: "Device not found" });

        const updatedDevice = await prisma.device.update({
            where: { id: deviceId },
            data: { name }
        });

        res.json({ message: "Device updated successfully", device: updatedDevice });
    } catch (err) {
        next(err);
    }
}

async function clearUserStorage(req, res) {
    try {
        const userId = req.user.id;
        await prisma.users.update({
            where: { id: userId },
            data: { storageUsed: 0 }
        });
        return res.status(200).json({ message: "Storage cleared" });
    } catch (error) {
        console.error("Clear Storage Error:", error);
        return res.status(500).json({ message: "Failed to clear storage" });
    }
}

module.exports = { signup, login, logout, getDeviceName, googleAuthCallback, getUserProfile, updateUserProfile, deleteDevice, changePassword, deleteUser, updateDevice, clearUserStorage };