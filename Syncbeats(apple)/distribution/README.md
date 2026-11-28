# Mac beta packaging

From the repository root, build a new beta with:

```bash
python3 'Syncbeats(apple)/distribution/package-beta.py' --beta 3 --build-number 4
```

Choose a beta number whose `releases/macos/1.0-beta.N` folder does not already exist. The script produces an ad-hoc-signed app, compressed DMG, ZIP, installation notes and checksums. No uploads or paid Apple Developer account are required.

The DMG opens in a 720 × 440 Finder icon view with the app on the left, Applications on the right, and “Drag SyncBeats into Applications” embedded in the background. The full installation notes stay alongside the download and inside the ZIP. The DMG contains only the two visible installation icons.

`build-dmg.py` uses `dmgbuild` 2.0.0 to generate Finder metadata and the image's background alias for each volume. Its first run downloads that dependency into an isolated environment under `~/Library/Caches/SyncBeats`; later runs reuse it.

To regenerate the Retina background PNG after changing its Swift drawing source:

```bash
swift 'Syncbeats(apple)/distribution/render-dmg-background.swift' 'Syncbeats(apple)/distribution/dmg-background.png'
```
