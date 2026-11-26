// Local-only fixture: real backend Room state + Socket.IO, synthetic downloaded audio.
require('../../dev/syncbeats-server/node_modules/ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'Node',ignoreDeprecations:'6.0'}});
const {Room}=require('../../dev/syncbeats-server/src/core/Room.ts');
const {Server}=require('../../dev/syncbeats-server/node_modules/socket.io');
const http=require('http');const calls=[];
const room=new Room('123456');
room.addTracks([{trackUrl:'youtube:aaaaaaaaaaa',title:'Synthetic tone',durationSec:3}],'fixture');

const server=http.createServer(async(req,res)=>{
 if(req.url.startsWith('/search/youtube/download')){
  const r=await fetch('http://127.0.0.1:4189/syncbeats-native-audio'+req.url);res.writeHead(r.status,{'content-type':r.headers.get('content-type')});res.end(Buffer.from(await r.arrayBuffer()));
 }else if(req.url.startsWith('/rooms/123456')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(room.snapshot()));}
 else if(req.url==='/__calls'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(calls));}
 else {res.writeHead(404);res.end();}
});
const io=new Server(server,{transports:['websocket']});
room.on('stateChanged',snapshot=>io.emit('room:stateChanged',snapshot));
io.on('connection',socket=>{
 socket.onAny((event,data)=>calls.push({event,data}));
 socket.on('room:join',()=>{room.addParticipant({socketId:socket.id,displayName:'Fixture Mac',isReady:false,isBlocked:false,userId:'fixture'});socket.emit('room:snapshot',room.snapshot());});
 socket.on('sync:ping',({t0,seq})=>socket.emit('sync:pong',{t0,seq,t1:Date.now(),t2:Date.now()}));
 socket.on('room:clientReady',({isReady,trackUrl})=>room.setParticipantReady(socket.id,!!isReady,trackUrl));
 socket.on('playback:blocked',({blocked})=>room.setParticipantBlocked(socket.id,blocked));
 socket.on('playback:play',()=>room.play(socket.id));socket.on('playback:pause',()=>room.pause(socket.id));
 socket.on('playback:seek',({position})=>room.seek(socket.id,position));
 socket.on('playback:ended',({trackUrl,playbackInstanceId})=>room.handleEnded(socket.id,trackUrl,playbackInstanceId));
 socket.on('disconnect',()=>room.removeParticipant(socket.id));
});
server.listen(4190,'127.0.0.1',()=>console.log('Native playback fixture listening on 4190'));
