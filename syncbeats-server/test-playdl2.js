const play = require('play-dl');

async function test() {
  try {
    const stream = await play.stream('https://www.youtube.com/watch?v=aqz-KE-bpKQ');
    console.log("Stream URL:", stream.url);
  } catch (e) {
    console.error("Failed:", e.message);
  }
}
test();
