const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient()
const qrcode = require('qrcode')

async function createRoom(req, res) {
    const user_id = req.user?.id
    const { name, type, isPublic, wifiSSID } = req.body;
    const frontend_url = process.env.FRONTEND_URL

    console.log('Creating room - user_id:', user_id);

    if (!user_id) return res.status(401).json({ message: "Unauthorized" });
    if (!name) return res.status(400).json({ message: "Room Name Can't be empty" })
    if (!type) return res.status(400).json("Room type not selected")

    try {

        const userExists = await prisma.Users.findUnique({
            where: { id: user_id }
        });

        console.log('User exists check:', !!userExists, 'user_id:', user_id);

        if (!userExists) {
            return res.status(404).json({
                message: "User not found in database. Please login again."
            });
        }

        const online_devices = await prisma.device.findMany({
            where: { DeviceUserId: user_id, status: "online" }
        });

        console.log('Online devices count:', online_devices.length);

        if (type === 'single' && online_devices.length < 2) {
            return res.status(400).json({
                message: "Single User room needs atleast two online devices"
            });
        }

        const room = await prisma.room.create({
            data: {
                name,
                type,
                isPublic: isPublic || false,
                wifiSSID: wifiSSID || null,
                hostId: user_id,
                participants: { create: { userId: user_id } },
                devices: { create: online_devices.map(d => ({ deviceId: d.id })) }
            },
            include: { participants: true, devices: true }
        })
        console.log('Room created successfully:', room.code)
        const room_url = `${frontend_url}/join/${room.code}`
        const qr_url = await qrcode.toDataURL(room_url)
        return res.status(200).json({
            message: "Room Created successfully!",
            room,
            qrDataURL: qr_url
        });
    } catch (err) {
        console.log("CreateRoom:", err)
        return res.status(500).json({ message: "Failed to create room" })
    }
}

async function joinRoom(req, res) {
    const { code } = req.body;
    const user_id = req.user?.id;

    if (!code) return res.status(400).json({ message: "Enter Code" });
    if (!user_id) return res.status(401).json({ message: "Unauthorised" });

    try {
        const userExists = await prisma.Users.findUnique({ where: { id: user_id } });
        console.log(userExists)
        if (!userExists) return res.status(400).json({ message: "User not found in database" });

        const room = await prisma.room.findUnique({
            where: { code },
            include: { participants: true, devices: true }
        });

        if (!room) return res.status(404).json({ message: "Room Not Found" });
        if (room.type === 'single' && room.hostId !== user_id) {
            return res.status(403).json({
                message: "This is a private room. Only the host can access it."
            });
        }

        const isParticipant = room.participants.some(p => p.userId === user_id);
        if (!isParticipant) {
            await prisma.roomUsers.create({
                data: {
                    roomId: room.id,
                    userId: user_id
                }
            });
        }
        if (room.type === 'multi') {
            const userDevices = await prisma.device.findMany({
                where: {
                    DeviceUserId: user_id,
                    status: 'online'
                }
            });

            for (const device of userDevices) {
                const deviceInRoom = room.devices.some(d => d.deviceId === device.id);
                if (!deviceInRoom) {
                    await prisma.roomDevices.create({
                        data: {
                            roomId: room.id,
                            deviceId: device.id
                        }
                    });
                }
            }
        }

        const updatedRoom = await prisma.room.findUnique({
            where: { code },
            include: {
                participants: {
                    include: {
                        user: {
                            select: { id: true, name: true }
                        }
                    }
                },
                devices: {
                    include: {
                        devices: {
                            select: {
                                id: true,
                                name: true,
                                type: true,
                                status: true,
                                DeviceUserId: true,
                                user: {
                                    select: { id: true, name: true }
                                }
                            }
                        }
                    }
                }
            }
        });

        return res.status(200).json({ message: "Joined room successfully", room: updatedRoom });
    } catch (err) {
        console.log(`JoinRoom Err: ${err}`);
        return res.status(500).json({ message: "Failed to join room" });
    }
}

async function verifyRoom(req, res) {
    const { code } = req.params;
    const user_id = req.user?.id;

    if (!code) return res.status(400).json({ message: "Room code is required" });
    if (!user_id) return res.status(401).json({ message: "Unauthorised" });

    try {
        const room = await prisma.room.findUnique({
            where: { code },
            include: {
                participants: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true
                            }
                        }
                    }
                },
                devices: {
                    include: {
                        devices: {
                            select: {
                                id: true,
                                name: true,
                                type: true,
                                status: true,
                                DeviceUserId: true,
                                user: {
                                    select: { id: true, name: true }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!room) {
            return res.status(404).json({ message: "Room not found", room: null });
        }

        return res.status(200).json({
            message: "Room verified",
            room: {
                id: room.id,
                name: room.name,
                code: room.code,
                type: room.type,
                hostId: room.hostId,
                isActive: room.isActive,
                participants: room.participants,
                connectedDevices: room.devices
            }
        });
    } catch (err) {
        console.log(`VerifyRoom Err: ${err}`);
        return res.status(500).json({ message: "Failed to verify room" });
    }
}

async function getRoomDetails(req, res) {
    const { code } = req.params;
    const user_id = req.user?.id;

    if (!code) return res.status(400).json({ message: "Room code is required" });
    if (!user_id) return res.status(401).json({ message: "Unauthorised" });

    try {
        const room = await prisma.room.findUnique({
            where: { code },
            include: {
                participants: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                devices: true
                            }
                        }
                    }
                },
                devices: {
                    include: {
                        devices: {
                            select: {
                                id: true,
                                name: true,
                                type: true,
                                status: true,
                                DeviceUserId: true,
                                user: {
                                    select: { id: true, name: true }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!room) {
            return res.status(404).json({ message: "Room not found" });
        }

        const isParticipant = room.participants.some(p => p.userId === user_id);
        if (!isParticipant) {
            return res.status(403).json({ message: "You are not a participant of this room" });
        }

        return res.status(200).json({
            message: "Room details fetched successfully",
            room: {
                ...room,
                connectedDevices: room.devices
            }
        });
    } catch (err) {
        console.log(`GetRoomDetails Err: ${err}`);
        return res.status(500).json({ message: "Failed to fetch room details" });
    }
}

async function getRecentRooms(req, res) {
    const user_id = req.user?.id;
    const { page = 1, limit = 10, sortBy = 'joinedAt', order = 'desc', search } = req.query;

    if (!user_id) return res.status(401).json({ message: "Unauthorised" });

    try {
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const where = { userId: user_id };
        if (search) {
            where.room = {
                name: { contains: search, mode: 'insensitive' }
            };
        }

        const orderByMap = {
            'joinedAt': { joinedAt: order === 'asc' ? 'asc' : 'desc' },
            'name': { room: { name: order === 'asc' ? 'asc' : 'desc' } },
            'created': { room: { createdAt: order === 'asc' ? 'asc' : 'desc' } }
        };

        const orderBy = orderByMap[sortBy] || orderByMap['joinedAt'];

        const [recentRooms, total] = await Promise.all([
            prisma.roomUsers.findMany({
                where,
                include: {
                    room: {
                        select: { id: true, code: true, name: true, createdAt: true }
                    }
                },
                orderBy,
                skip,
                take: limitNum
            }),
            prisma.roomUsers.count({ where })
        ]);

        const rooms = recentRooms.map(record => ({
            code: record.room.code,
            name: record.room.name,
            joinedAt: record.joinedAt.toISOString(),
            createdAt: record.room.createdAt.toISOString()
        }));

        return res.status(200).json({
            message: "Recent rooms fetched successfully",
            rooms,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum)
            }
        });
    } catch (err) {
        console.log(`GetRecentRooms Err: ${err}`);
        return res.status(500).json({ message: "Failed to fetch recent rooms" });
    }
}






async function updateRoom(req, res) {
    const { code } = req.params;
    const { name } = req.body;
    const user_id = req.user?.id;

    if (!user_id) return res.status(401).json({ message: "Unauthorised" });
    if (!name) return res.status(400).json({ message: "Room name is required" });

    try {
        const room = await prisma.room.findUnique({ where: { code } });
        if (!room) return res.status(404).json({ message: "Room not found" });

        if (room.hostId !== user_id) {
            return res.status(403).json({ message: "Only the host can update the room" });
        }

        const updatedRoom = await prisma.room.update({
            where: { code },
            data: { name }
        });

        return res.status(200).json({ message: "Room updated successfully", room: updatedRoom });
    } catch (err) {
        console.log(`UpdateRoom Err: ${err}`);
        return res.status(500).json({ message: "Failed to update room" });
    }
}

async function deleteRoom(req, res) {
    const { code } = req.params;
    const user_id = req.user?.id;

    if (!user_id) return res.status(401).json({ message: "Unauthorised" });

    try {
        const room = await prisma.room.findUnique({ where: { code } });
        if (!room) return res.status(404).json({ message: "Room not found" });

        if (room.hostId !== user_id) {
            return res.status(403).json({ message: "Only the host can delete the room" });
        }


        await prisma.roomUsers.deleteMany({
            where: { roomId: room.id }
        });

        await prisma.roomDevices.deleteMany({
            where: { roomId: room.id }
        });


        await prisma.room.delete({ where: { code } });

        return res.status(200).json({ message: "Room deleted successfully" });
    } catch (err) {
        console.log(`DeleteRoom Err: ${err}`);
        return res.status(500).json({ message: "Failed to delete room" });
    }
}

async function leaveRoom(req, res) {
    const { code } = req.params;
    const user_id = req.user?.id;

    if (!user_id) return res.status(401).json({ message: "Unauthorised" });

    try {
        const room = await prisma.room.findUnique({ where: { code } });
        if (!room) return res.status(404).json({ message: "Room not found" });


        await prisma.roomUsers.deleteMany({
            where: {
                roomId: room.id,
                userId: user_id
            }
        });


        const userDevices = await prisma.device.findMany({
            where: { DeviceUserId: user_id }
        });
        const deviceIds = userDevices.map(d => d.id);

        await prisma.roomDevices.deleteMany({
            where: {
                roomId: room.id,
                deviceId: { in: deviceIds }
            }
        });

        return res.status(200).json({ message: "Left room successfully" });
    } catch (err) {
        console.log(`LeaveRoom Err: ${err}`);
        return res.status(500).json({ message: "Failed to leave room" });
    }
}

module.exports = { createRoom, joinRoom, verifyRoom, getRoomDetails, getRecentRooms, updateRoom, deleteRoom, leaveRoom }
