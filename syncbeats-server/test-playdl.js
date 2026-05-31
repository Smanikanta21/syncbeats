const play = require('play-dl');

async function test() {
  try {
    const info = await play.video_info('https://www.youtube.com/watch?v=aqz-KE-bpKQ');
    console.log("Success! Title:", info.video_details.title);
    const stream = await play.stream('https://www.youtube.com/watch?v=aqz-KE-bpKQ');
    console.log("Stream URL:", stream.url);
  } catch (e) {
    console.error("Failed:", e.message);
  }
}
test();
