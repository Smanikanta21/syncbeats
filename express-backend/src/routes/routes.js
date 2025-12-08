const express = require('express')
const { signup, login, logout, googleAuthCallback, getUserProfile, updateUserProfile, deleteDevice, changePassword } = require('../auth/auth')
const { authMiddleWare } = require('../middleware/middleware')
const { getDashboardData } = require('../dashboard/route')
const { createRoom, joinRoom, verifyRoom, getRoomDetails, getRecentRooms, updateRoom, deleteRoom, leaveRoom } = require('../rooms/room')
const { searchUser } = require('../auth/search')
const { handleFileUpload, uploadMiddleware } = require('./upload');
const passport = require('passport')
const router = express.Router()

router.post('/upload', authMiddleWare, uploadMiddleware, handleFileUpload);

router.post('/signup', signup);

router.post('/login', login);

router.post('/logout', logout);

router.get('/getprofiledata', authMiddleWare, getUserProfile);

router.patch('/profile', authMiddleWare, updateUserProfile);

router.post('/change-password', authMiddleWare, changePassword);

router.delete('/device/:id', authMiddleWare, deleteDevice);

router.get('/dashboard', authMiddleWare, getDashboardData);

router.get('/profile', authMiddleWare, getUserProfile);

router.post('/createroom', authMiddleWare, createRoom);

router.post('/joinroom', authMiddleWare, joinRoom);

router.get('/verifyroom/:code', authMiddleWare, verifyRoom);

router.get('/room/:code', authMiddleWare, getRoomDetails);

router.get('/recent-rooms', authMiddleWare, getRecentRooms);

router.put('/room/:code', authMiddleWare, updateRoom);

router.delete('/room/:code', authMiddleWare, deleteRoom);

router.post('/room/:code/leave', authMiddleWare, leaveRoom);

router.get('/users/search', authMiddleWare, searchUser);

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/callback/google', passport.authenticate('google', { failureRedirect: '/' }), googleAuthCallback);



module.exports = router;
