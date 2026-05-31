const ytdl = require('@distube/ytdl-core');
const fs = require('fs');

async function test() {
  try {
    const info = await ytdl.getInfo('https://www.youtube.com/watch?v=aqz-KE-bpKQ');
    console.log("Success! Title:", info.videoDetails.title);
  } catch (e) {
    console.error("Failed:", e.message);
  }
}
test();
