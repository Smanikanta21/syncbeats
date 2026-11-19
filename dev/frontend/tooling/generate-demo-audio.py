"""Generate SyncBeats' original 16-second demo loops. Requires Python 3 + ffmpeg.
No recordings or third-party music are used; every note is synthesized here.
Run from any directory: python3 tooling/generate-demo-audio.py
"""
import array
import math
from pathlib import Path
import subprocess
import tempfile
import wave

RATE = 24000
SECONDS = 16
OUTPUT = Path(__file__).resolve().parents[1] / 'public' / 'audio'
OUTPUT.mkdir(parents=True, exist_ok=True)
TAU = 2 * math.pi


def frequency(note):
    return 440 * 2 ** ((note - 69) / 12)


def render(name, chords, melody):
    samples = [0.0] * (RATE * SECONDS)

    def note(midi, start, duration, gain, pad=False):
        hz = frequency(midi)
        for n in range(int(duration * RATE)):
            index = int(start * RATE) + n
            if index >= len(samples):
                break
            t = n / RATE
            attack = min(1, t / (0.24 if pad else 0.012))
            release = min(1, (duration - t) / (0.4 if pad else 0.08))
            decay = 1 if pad else math.exp(-3.6 * t)
            tone = math.sin(TAU * hz * t) + 0.16 * math.sin(TAU * 2 * hz * t)
            samples[index] += gain * attack * release * decay * tone

    for bar, chord in enumerate(chords):
        for midi in chord:
            note(midi, bar * 4, 4, 0.037, pad=True)
        for beat in range(8):
            note(chord[0] - 24, bar * 4 + beat * .5, .45, .07)
            note(melody[(bar * 8 + beat) % len(melody)], bar * 4 + beat * .5, .8, .085)
        for beat in range(4):
            # A soft synthesized low drum, deliberately quieter than the melody.
            for n in range(int(.15 * RATE)):
                t = n / RATE
                i = int((bar * 4 + beat) * RATE) + n
                samples[i] += .08 * math.sin(TAU * (62 * t + 3 * (1 - math.exp(-25 * t)))) * math.exp(-32 * t)
    peak = max(abs(x) for x in samples)
    pcm = array.array('h', (int(23000 * x / max(1, peak) * min(1, i / (RATE * .06), (len(samples) - i) / (RATE * .12))) for i, x in enumerate(samples)))
    with tempfile.TemporaryDirectory() as temp:
        wav = Path(temp) / 'loop.wav'
        with wave.open(str(wav), 'wb') as f:
            f.setnchannels(1)
            f.setsampwidth(2)
            f.setframerate(RATE)
            f.writeframes(pcm.tobytes())
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav), '-codec:a', 'libmp3lame', '-b:a', '64k', '-map_metadata', '-1', str(OUTPUT / f'demo-{name}.mp3')], check=True)
    print(f'Created demo-{name}.mp3')


render('closer', [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 67]], [72, 76, 79, 76, 74, 72, 71, 67])
render('daylight', [[62, 66, 69, 73], [59, 62, 66, 69], [55, 59, 62, 66], [57, 61, 64, 69]], [74, 78, 81, 85, 81, 78, 76, 73])
render('afterhours', [[57, 60, 64, 67], [53, 57, 60, 64], [60, 64, 67, 71], [55, 59, 62, 65]], [69, 72, 76, 72, 67, 71, 74, 71])
