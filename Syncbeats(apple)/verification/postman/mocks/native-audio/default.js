const http=require('http');
// Synthetic PCM WAV only. Exercises URLSession downloads; no upstream calls.
const namespace='syncbeatsNativeAudio';
if(!global[namespace]) {
 const n=44100*3, wav=Buffer.alloc(44+n*2);
 wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);
 wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
 wav.writeUInt32LE(44100,24);wav.writeUInt32LE(88200,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);
 wav.write('data',36);wav.writeUInt32LE(n*2,40);
 for(let i=0;i<n;i++)wav.writeInt16LE(Math.round(Math.sin(2*Math.PI*110*i/44100)*3000),44+i*2);
 global[namespace]={wav,calls:[]};
}
http.createServer((req,res)=>{
const fixture=global[namespace];fixture.calls.push({path:req.url,method:req.method});
if(req.url.startsWith('/__calls')) {res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(fixture.calls));}
else if(req.url.startsWith('/tone.wav')||/videoId=(aaaaaaaaaaa|ddddddddddd|eeeeeeeeeee|fffffffffff)/.test(req.url)){res.writeHead(200,{'content-type':'audio/wav'});res.end(fixture.wav);}
else if(req.url.includes('videoId=bbbbbbbbbbb')){res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:'fixture unavailable'}));}
else if(req.url.includes('videoId=ccccccccccc')){res.writeHead(200,{'content-type':'audio/mp4'});res.end('not an audio file');}
else {res.writeHead(501,{'content-type':'application/json'});res.end(JSON.stringify({error:'unmodeled fixture path'}));}

}).listen(process.env.PORT);
