const express = require('express')
const { signup, login, logout, googleAuthCallback, profilefetcher, profileeditor, deleteDevice } = require('../auth/auth')
const { authMiddleWare } = require('../middleware/middleware')
const { getDashboardData } = require('../dashboard/route')
const { createRoom, joinRoom, verifyRoom, getRoomDetails, getRecentRooms, getNearbyRooms } = require('../rooms/room')
const { searchUser } = require('../auth/search')
const passport = require('passport')
const router = express.Router()

router.post('/signup', signup);

router.post('/login', login);

router.post('/logout', logout);

router.get('/getprofiledata', authMiddleWare, profilefetcher);

router.patch('/profile', authMiddleWare, profileeditor);

router.delete('/device/:id', authMiddleWare, deleteDevice);

router.get('/dashboard', authMiddleWare, getDashboardData);

router.get('/profile', authMiddleWare, profilefetcher);

router.post('/createroom', authMiddleWare, createRoom);

router.post('/joinroom', authMiddleWare, joinRoom);

router.get('/verifyroom/:code', authMiddleWare, verifyRoom);

router.get('/room/:code', authMiddleWare, getRoomDetails);

router.get('/recent-rooms', authMiddleWare, getRecentRooms);

router.get('/users/search', authMiddleWare, searchUser);

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/callback/google', passport.authenticate('google', { failureRedirect: '/' }), googleAuthCallback);



module.exports = router;
