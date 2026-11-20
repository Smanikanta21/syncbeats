export const SITE_URL = "https://www.syncbeats.in";
export const SITE_TITLE = "SyncBeats — Play Music Together Across Devices";
export const SITE_DESCRIPTION =
  "Play the same music together on phones, tablets, and laptops. Create a SyncBeats room, share your code, and listen in sync in your browser. Mac app coming soon.";
export const LANDING_FAQS = [
  {
    question: "What is SyncBeats?",
    answer:
      "SyncBeats is a web app for synchronized music playback across multiple devices. People join the same listening room on their phones, tablets, or laptops, share a queue, and play the same track together. Use it for a gathering at home, a shared workspace, or a listening session with friends in different places.",
  },
  {
    question: "How do I listen together with friends?",
    answer:
      "Sign in to SyncBeats and create a room. Share its six-digit room code, link, or QR code with your friends. They sign in and join from their browsers. Add a track to the queue, let everyone's audio load, and press play. Anyone in the room can play, pause, or seek.",
  },
  {
    question: "Do I need to download an app?",
    answer:
      "No download is needed for the web app. Open SyncBeats in a modern browser on a phone, tablet, or computer. A dedicated Mac app is in development and coming soon; it is not available to download yet.",
  },
  {
    question: "Is SyncBeats free to use?",
    answer:
      "The current SyncBeats web app is free to use. Create an account to start or join a listening room.",
  },
  {
    question: "What music can I play?",
    answer:
      "You can upload audio files you have permission to share, or use the music search available inside a room. Everyone listens from the shared queue. Track availability depends on the source; SyncBeats does not provide unrestricted access to paid streaming catalogs.",
  },
  {
    question: "Do all devices need to be on the same Wi-Fi?",
    answer:
      "No. Devices can join the same room over different internet connections, so friends can listen from different places. The current web app needs internet access. For devices playing out loud in one space, a stable shared Wi-Fi connection can help keep playback consistent.",
  },
  {
    question: "How closely will my devices stay in sync?",
    answer:
      "SyncBeats estimates the difference between each device's clock and the server's clock, schedules playback together, and corrects drift. The result depends on your connection, browser, and audio hardware. Bluetooth can introduce extra output delay, so exact alignment is not guaranteed. Keep the room open and allow a few seconds for a new device to settle.",
  },
  {
    question: "When will the Mac app be available?",
    answer:
      "The native SyncBeats Mac app is coming soon. There is no announced release date yet. You can already use SyncBeats on your Mac in a browser, and release updates will appear on this website.",
  },
] as const;
