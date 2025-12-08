const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const PORT = process.env.PORT || 5002;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
const NODE_ENV = process.env.NODE_ENV || 'development';

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: NODE_ENV === 'production' ? FRONTEND_ORIGIN : "*",
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["*"]
  },
  pingTimeout: 20000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

const roomStates = {};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  socket.on('time:request', (clientT0, callback) => {
    callback(Date.now());
  });

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room ${roomId}`);
    if (roomStates[roomId]) {
      socket.emit('music:sync', roomStates[roomId]);
    }
  });

  socket.on('playlist:add', ({ roomId, song }) => {
    if (!roomStates[roomId]) roomStates[roomId] = { playlist: [] };
    if (!roomStates[roomId].playlist) roomStates[roomId].playlist = [];

    roomStates[roomId].playlist.push(song);

    io.to(roomId).emit('playlist:add', song);
    console.log(`Room ${roomId} added song: ${song.title}`);
  });

  socket.on('music:play', ({ roomId, currentTime }) => {
    if (!roomStates[roomId]) roomStates[roomId] = { playlist: [] };
    const serverTime = Date.now();
    roomStates[roomId].isPlaying = true;
    roomStates[roomId].currentTime = currentTime;
    roomStates[roomId].lastUpdated = serverTime;

    io.to(roomId).emit('music:play', { currentTime, serverTime });
    console.log(`Room ${roomId} playing at ${currentTime}, serverTime: ${serverTime}`);
  });

  socket.on('music:pause', ({ roomId }) => {
    if (!roomStates[roomId]) roomStates[roomId] = { playlist: [] };
    roomStates[roomId].isPlaying = false;

    io.to(roomId).emit('music:pause');
    console.log(`Room ${roomId} paused`);
  });

  socket.on('music:seek', ({ roomId, currentTime }) => {
    if (!roomStates[roomId]) roomStates[roomId] = { playlist: [] };
    const serverTime = Date.now();
    roomStates[roomId].currentTime = currentTime;

    io.to(roomId).emit('music:seek', { currentTime, serverTime });
    console.log(`Room ${roomId} seeked to ${currentTime}`);
  });

  socket.on('music:change', ({ roomId, songIndex }) => {
    if (!roomStates[roomId]) roomStates[roomId] = { playlist: [] };
    const serverTime = Date.now();
    roomStates[roomId].currentSongIndex = songIndex;
    roomStates[roomId].currentTime = 0;
    roomStates[roomId].isPlaying = true;

    io.to(roomId).emit('music:change', { songIndex, serverTime });
    console.log(`Room ${roomId} changed song to ${songIndex}`);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Sockets server listening on port ${PORT} (${NODE_ENV})`);
});
