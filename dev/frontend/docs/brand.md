# SyncBeats — Linked Play

Two rounded play loops share one direction: separate devices, the same music. The overlapping shapes replace the waveform mark throughout the web client and existing native Mac assets.

The palette uses solid charcoal (`#171C1A`), off-white (`#F4F5EF`), and silver (`#B7BAB5`). The landing page and its buttons share system sans-serif typography. Controls use a native arrow cursor, neutral fills, and restrained corners; regular text links use the native hand cursor. Color stays in the music artwork.

## Source and exports

`lib/brand-shape.json` is the source for geometry and colors. `components/brand/SyncBeatsLogo.tsx` renders it in the web app. Run `npm run brand:generate` from `dev/frontend` after changing the source to regenerate:

- `public/favicon.svg` and the 16, 32, and 48px entries in `app/favicon.ico`.
- PWA icons at 192px and 512px, plus the 180px Apple touch icon.
- `public/brand/syncbeats-app-icon-1024.png`, a full-bleed app icon export.
- `public/brand/syncbeats-app-icon.svg` and `syncbeats-symbol.svg`.
- The native Mac logo image and the replacement layer in `AppIcon.icon`.

App icon exports have a solid square background so platforms can apply their own masks. The favicon and in-app mark have rounded corners. Native appearance still needs a check in Xcode/Icon Composer before release.

The landing page uses a minimal masthead and a bottom navigation dock. The Explore disclosure supports Escape, outside-click dismissal, keyboard focus, and page-section links. Toast notifications and the Sonner dependency have been removed; existing inline error and connection states remain.
