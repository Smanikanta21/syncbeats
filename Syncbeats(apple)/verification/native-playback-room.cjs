// Local-only fixture: real backend Room state + Socket.IO, synthetic downloaded audio.
require('../../dev/syncbeats-server/node_modules/ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'Node',ignoreDeprecations:'6.0'}});
const {Room}=require('../../dev/syncbeats-server/src/core/Room.ts');
const {Server}=require('../../dev/syncbeats-server/node_modules/socket.io');
const http=require('http');const calls=[];
let legacyCompletion=false;
const room=new Room('123456');
room.addTracks([{trackUrl:'youtube:aaaaaaaaaaa',title:'Synthetic tone',durationSec:3}],'fixture');

const server=http.createServer(async(req,res)=>{
 if(req.url.startsWith('/search/youtube/download')){
  const path=req.url.replace('ddddddddddd','aaaaaaaaaaa');
  const r=await fetch('http://127.0.0.1:4189/syncbeats-native-audio'+path);res.writeHead(r.status,{'content-type':r.headers.get('content-type')});res.end(Buffer.from(await r.arrayBuffer()));
 }else if(req.url==='/rooms/123456/enqueue-youtube' && req.method==='POST'){
  let data='';for await(const chunk of req)data+=chunk;const input=JSON.parse(data);
  const added=room.addTracks([{trackUrl:input.youtubeUrl,title:input.title,artist:input.artist,
    thumbnail:input.thumbnail,durationSec:3,metadataSource:input.metadataSource}], 'fixture');
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({item:added.first}));
 }else if(req.url==='/rooms/123456/enqueue-playlist' && req.method==='POST'){
  let data='';for await(const chunk of req)data+=chunk;const input=JSON.parse(data);
  room.addTracks(input.tracks.map(t=>({trackUrl:'youtube:'+t.id,title:t.title,artist:t.artist,thumbnail:t.thumbnail,durationSec:3})), 'fixture');
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({queue:room.getQueue()}));
 }else if(req.url==='/rooms/123456/queue/reorder' && req.method==='PUT'){
  let data='';for await(const chunk of req)data+=chunk;const input=JSON.parse(data);
  const moved=room.moveInQueue(input.itemId,input.newIndex);
  res.writeHead(moved?200:400,{'content-type':'application/json'});res.end(JSON.stringify({queue:room.getQueue()}));
 }else if(req.url.startsWith('/rooms/123456')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(room.snapshot()));}
 else if(req.url==='/__legacy'){legacyCompletion=true;res.writeHead(200);res.end();}
 else if(req.url==='/__calls'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(calls));}
 else if (req.method === 'POST' && req.url.startsWith('/__peer-telemetry/')) {
  const socketId = 'fixture-peer';
  const mode = req.url.slice('/__peer-telemetry/'.length);
  if (mode === 'leave') {
   room.removeParticipant(socketId);
   io.emit('room:stateChanged', room.snapshot());
  } else {
   if (!room.hasParticipant(socketId)) {
    room.addParticipant({ socketId, displayName: 'Fixture iPad', isReady: false, isBlocked: false });
    io.emit('room:stateChanged', room.snapshot());
   }
   const stats = { socketId, latency: 12, jitter: 2 };
   if (mode === 'measured') {
    stats.nativeTelemetry = {
     network: { rttMS: 40, jitterMS: 5 },
     playback: { epoch: room.snapshot().startEpoch, errorMS: -7 },
    };
   }
   io.emit('room:participantStats', stats);
  }
  res.writeHead(204); res.end();
 }
 else {res.writeHead(404);res.end();}
});
const io=new Server(server,{transports:['websocket']});
room.on('stateChanged',snapshot=>io.emit('room:stateChanged',snapshot));
room.on('pause',payload=>io.emit('playback:pause',payload));
io.on('connection',socket=>{
 socket.onAny((event,data)=>calls.push({event,data}));
 socket.on('room:join',()=>{room.addParticipant({socketId:socket.id,displayName:'Fixture Mac',isReady:false,isBlocked:false,userId:'fixture'});socket.emit('room:snapshot',room.snapshot());});
 socket.on('sync:ping',({t0,seq})=>socket.emit('sync:pong',{t0,seq,t1:Date.now(),t2:Date.now()}));
 socket.on('room:clientReady',({isReady,trackUrl})=>room.setParticipantReady(socket.id,!!isReady,trackUrl));
 socket.on('playback:blocked',({blocked})=>room.setParticipantBlocked(socket.id,blocked));
 socket.on('playback:play',()=>room.play(socket.id));socket.on('playback:pause',()=>room.pause(socket.id));
 socket.on('playback:seek',({position})=>room.seek(socket.id,position));
 socket.on('playback:next',()=>room.nextTrack(true));
 socket.on('playback:prev',()=>room.prevTrack(true));
 socket.on('playback:ended',({trackUrl,playbackInstanceId})=>{
  room.handleTrackEnded(trackUrl,playbackInstanceId);
  if(legacyCompletion && !room.snapshot().isPlaying)room.resetPlayback();
 });
 socket.on('room:toggleRepeat',({repeatMode})=>room.setRepeatMode(repeatMode));
 socket.on('room:toggleShuffle',({shuffle})=>room.setShuffle(shuffle));
 socket.on('room:toggleAutoplay',({autoplay})=>{
  if(room.hasParticipant(socket.id)&&typeof autoplay==='boolean')room.setAutoplay(autoplay);
 });
 socket.on('playback:jumpTo',({trackId})=>room.setCurrentItem(trackId,true));
 socket.on('disconnect',()=>room.removeParticipant(socket.id));
});
server.listen(4190,'127.0.0.1',()=>console.log('Native playback fixture listening on 4190'));
