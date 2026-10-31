# Gilded Pages

Read your PDFs with Roxy Lark, a curly-haired barista at **Café Machorn** (New York, 2026) who steps into
F. Scott Fitzgerald's **1925** through every book she opens. Reading earns Gilt; Gilt and finished
chapters open real museums today and places inside the books.

React 19 + TypeScript + Vite · Phaser 4 · pdfjs-dist 6 · Zustand · Dexie (IndexedDB) · Howler.
Everything stays on the device — no backend.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 — opens on the character select
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/
npm test           # unit tests (Vitest)
npm run test:e2e   # end-to-end tests (Playwright, on your installed Microsoft Edge; starts the dev server)
```

`npm run dev` / `build` first copy pdf.js's character maps, standard fonts and wasm decoders into
`public/pdfjs/` so PDFs render offline.

On a phone: `npm run dev -- --host` and open the printed network address on the same Wi-Fi. The app is laid out
for a phone held upright first; *Add to Home Screen* (Safari) or *Install app* (Chrome) opens it full-screen with
Roxy's portrait as its icon (`public/manifest.webmanifest`, `public/icons/`).

Dev extras:

- `http://localhost:5173/sprites.html` — every animation frame of Roxy and the NPC sheets (`?scale=3`).
- `window.__roxy` in the console — Roxy's controller (e.g. `__roxy.chapterEnd()`).
- `#/dev/rhythm-test` — the Autoplay bot plays every chart (virtual, and real time through the audio clock).
- `#/dev/chart-editor` — load a Synth song or an audio file, record taps per lane, quantise, edit, export JSON.

## Architecture

```
React (screens, the PDF page, HUD)          ──emit──▶  typed event bus  ──▶  Phaser (one game, outside the router)
  #root, z-index 1, transparent where                    src/bus/events.ts        #game-layer, z-index 0, click-through
  Roxy should show through (the stage strip)  ◀──emit──                         BackdropScene  (the world behind the UI)
                                                                                  CompanionScene (Roxy + café routine)
Zustand store ◀── both sides subscribe ──▶ Dexie (IndexedDB): books, progress, highlights, bookmarks, player, inventory
```

- **Roxy never resets.** The Phaser game is mounted once in `main.tsx` into `#game-layer`, a sibling of the
  React root. Route changes only emit `scene:enter`; her controller keeps its x position.
- **Text is a no-walk zone.** Every screen has the same stage strip (≈20% of the viewport) under the content.
  It reports its rect on `stage:layout`; Roxy only walks inside it. She fades to 40% under the pointer.
- **Crisp pixels.** `src/game/pixelScale.ts` picks a whole number of *device* pixels per game pixel (so 125% /
  150% Windows scaling stays crisp) and sizes the strip to fit her 64 px frame. pdf.js renders pages at native
  device resolution in the React layer — book text is never pixelated.
- **Phone first.** Below 760 px wide (`PHONE_QUERY` in `src/ui/usePhone.ts`, mirrored in the CSS) the navigation
  is a bottom tab bar, panels are bottom sheets and safe-area insets are respected. The painted café fills the
  screen's height and is dragged sideways to look along it (`PaintedRoom.panBy`); while Roxy walks, the view eases
  after her. The reading cards leave the painting for a dock under the room (beside it on a phone on its side). The
  reader is full-screen: the page edge to edge, a tap on its outer third or a swipe turns it, and zoom, night and
  reading mode fold under a "more" button. Keyboard hints are hidden on touch screens.
- **Roxy's sprites** are her sprite pack v2 (88 frames and 35 animations cut from her three character mockups,
  plus 9 effects). `scripts/build-roxy-sheet.py <pack>/roxy` (Pillow + numpy) builds
  `public/assets/sprites/roxy/roxy_sheet.png` + `.json` (192×240 frames, Roxy 192 px tall, origin between her
  feet), copies `fx_sheet.*`, and writes the pack's timings to `src/game/companion/art/roxyPack.json`. The pack's
  behind-the-counter poses stop at the counter line; in the painted café she works on the near side of the counter,
  so the build adds full-figure copies (`*_full`) with her standing legs grafted on at the waist.
  `src/game/companion/art/roxyFrames.ts` maps every state onto the pack's animations (per-frame durations) in four
  views — front, three-quarter, side, back, with west mirrored — and cues the effects. Walking, the view follows
  her move on screen (eight ways). The pack has no apron, so apron changes don't change her art.
- **Her tops** are the seven in her tops mockup (model B-001): Standard T-Shirt, Cream Peter Pan, Ivory Jabot,
  Dusty Rose Puff, Emerald Bow, Midnight Satin and Vermeer Blue (`src/content/blouses.json`).
  - *In the game:* the pack is drawn in the Cream Peter Pan. `scripts/dress-roxy.py` (run by `build-roxy-sheet.py`)
    finds that blouse in every frame and repaints it in each top's `colors` (the T-shirt gets red stripes), writing
    `roxy_sheet.<id>.png`; all sheets share `roxy_sheet.json`. The boot scene loads the sheet of the top she has
    on; another top's sheet loads the first time she wears it (`RoxySprite.setBlouse`), then swaps instantly. Only
    the colour changes: collars, bows, the jabot and sleeve lengths are the cream blouse's. Rerun the script after
    changing a top's colours.
  - *In the wardrobe:* `scripts/cut-roxy-tops.py <pack>/source/roxy_mockup_d.png` cuts each top's front pose into
    `public/assets/sprites/roxy/tops/<id>.png` (128×160, the game frames' proportions); the mockup cuts Vermeer
    Blue off at the waist, so its legs come from the front walking loop, joined at the belt.

### File tree

```
gilded-pages/
├── index.html, sprites.html (dev sprite viewer), vite.config.ts, tsconfig.json
├── scripts/copy-pdfjs-assets.mjs, build-roxy-sheet.py (Roxy's atlas from her sprite pack), dress-roxy.py,
│   cut-roxy-tops.py
├── public/assets/{sprites,scenes,ui,audio}/   real art/audio go here later (same keys)
└── src/
    ├── main.tsx                 pixel scale → React → boot() → mount the one Phaser game
    ├── app/                     App (screen switch), boot (DB → store, store → bus), router (hash), idle ticker
    ├── screens/                 Cafe (home), Reader, Museum, WorldMap, Apartment, Ledger, Settings
    │   └── cafe/                Bookshelf, RecordPlayerPanel, RegularsPanel, MorningRush
    ├── reader/                  pdfLoader (import, outline → chapters), pageCache (prefetch), PageView,
    │                            TextLayer CSS, highlights, page timer, search, ReaderPanel, ProgressLine
    ├── game/
    │   ├── GameRoot.ts          the single Phaser instance (sleeps in Text-only and when the tab is hidden)
    │   ├── pixelScale.ts, textures.ts
    │   ├── companion/           RoxySprite (layers), roxyMachine (FSM), RoxyController (follow logic)
    │   │   └── art/             palette, animation catalogue, poses, procedural sprite renderer
    │   ├── cafe/CafeRoutine.ts  counter, regulars as customers, the barista loop, courier, rush moves
    │   ├── scenes/              BootScene, BackdropScene (backdrops, parallax, era wipe), CompanionScene
    │   └── fx/                  scenery / café / museum textures, artwork renditions, backdrops, confetti
    ├── bus/events.ts            the typed event bus (contract below)
    ├── rules/                   page-count rule, Gilt, XP & levels, streaks, unlocks
    ├── store/                   Zustand slices: settings, player, route, ui
    ├── db/                      Dexie schema, queries, live-query hooks
    ├── audio/                   sfx (synth WAVs), chiptune (placeholder loops), music manager
    ├── ui/                      HUD, ScreenFrame, StageStrip, DecoPanel, PixelIcon, toasts, help
    └── content/                 blouses, locations, museums, regulars, cafe, soundtrack, quests (JSON)
```

### Event-bus contract (`src/bus/events.ts`)

| Event | Payload | Direction | Effect |
| --- | --- | --- | --- |
| `page:next` / `page:prev` | `{ page, pageCount, source }` | React → game | Run off the edge and re-enter (or page-pull at the end of a page); parallax push; flip sound |
| `page:jump` | `{ from, to, pageCount }` | React → game | Chapter / bookmark / search jump: the taxi |
| `scroll:progress` | `{ progress 0..1 }` | React → game | Her x in the strip (scroll position or time on page) |
| `highlight:add` | `{ page, text }` | React → game | Note-taking |
| `bookmark:add` | `{ page }` | React → game | Plants a gold flag |
| `chapter:end` | `{ title, page, bonusGilt }` | React → game | Charleston + confetti + champagne pop |
| `scene:enter` | `{ scene }` | React → game | Door transition; café ↔ reader plays the 2026 ↔ 1925 wipe; music crossfade |
| `stage:layout` | `{ rect \| null }` | React → game | Where she may walk (CSS px); `null` hides her |
| `outfit:change` | `{ blouseId }` | React → game | Puts her in that top's sheet mid-animation (loaded the first time) |
| `idle:tick` | `{ idleMs }` | React → game | 30 s → sitRead, 3 min → doze (not at the café or in museums) |
| `mode:change` | `{ mode }` | store → all | Full Gala / Calm / Text only |
| `page:counted` | `{ page, gilt }` | React → game | Sparkle + coin sound |
| `companion:goto` → `companion:arrived` | `{ x, tag, run?, admire? }` → `{ tag }` | React ⇄ game | Walk to a hotspot or artwork first, then open it |
| `break:start` → `break:seated`, `break:skip` | `{ bookId, shelfX }` → `{ bookId }` | React ⇄ game | The reading break (apron off → hook → shelf → window table → sit) |
| `cafe:delivery` | `{}` | React → game | Bike courier brings the dropped PDF |
| `rush:start` / `rush:order` / `rush:end` | `{}` / `{ drink, correct }` / `{ served }` | React → game | Morning Rush barista moves |

### Roxy's state machine (`src/game/companion/roxyMachine.ts`)

States: `idle, walk, run, sitRead, turnPage, sipCoffee, note, ribbonBookmark, doze, charleston, admireArt, wave,
playPiano`, the café set `wipeCounter, takeOrder, pullShot, steamMilk, latteArt, serve, untieApron` and the idle
variants and reactions `hairSwipe, sip, think, flustered`.
Events: `WALK, RUN, ARRIVE, ANIM_END, SIT, DOZE, WAKE, STOP, REACT(reaction)`. The idle animations blink and
breathe on their own.
Loops (`wipeCounter`, `steamMilk`, `admireArt`, `sitRead`, `doze`, `playPiano`) end on `STOP`/`WAKE`; one-shots
return to `idle` (or, seated, `sitRead`) on `ANIM_END`, and most give way to a walk. `untieApron` played in reverse
ties the apron back on.

## How to test each piece

1. **Café Machorn (home, `#/`)** — the barista loop runs on its own: wipe → a regular walks in → take order → pull
   shot → steam milk → latte art → serve → wave; every third order she glances at the shelf. In the painted café
   (no walk-in customers) she works the machine, turning to the room now and then for a sip, a hair swipe or a
   think; in Morning Rush she pulls the shot (espresso effect) and serves, or gets flustered. The window follows
   your clock (morning / afternoon / rainy evening with the neon glowing). Hover a hotspot in the strip, click it:
   she walks there first. Drop a PDF anywhere: the courier rides in and the book is shelved (title, author, cover,
   pages, chapters from the outline). On a phone: drag the café sideways, tap a labelled spot or the floor, and add
   books with *Add a PDF* in the dock.
2. **Reading break → Reading Room** — click a book: apron off, hung on the hook, book from the shelf, window
   table, sit; the café wipes into 1925. Any key skips. `Esc` or ◀ closes the book and plays it in reverse.
3. **Reader** — `→ ← Space PgUp PgDn`, swipe, click the page edges, or wheel past the page end. Two-page spread on
   wide screens. Select text → **Make a Quote Pearl** (`H`). `B` bookmark, `C` chapters, `K` bookmarks, `P` pearls,
   `/` search, `G` go to page, `+ − 0` zoom, `N` night, `M` mode. A page earns 1 Gilt only after
   max(4 s, words ÷ 600 wpm) on screen; crossing into a new chapter pays +5 Gilt and Roxy dances.
   Close the tab and reopen: you resume on the same page.
4. **Museums** — Map → Today (2026). Everything is open for now (`EVERYTHING_OPEN` in `src/rules/unlocks.ts`):
   every place, museum and record from the start. With it off: the Met opens at 50 counted pages, the Art Institute at reader level 5, Paris
   at 500 pages with one museum per finished book (Louvre, Orsay, Orangerie, Rodin). Click a work: Roxy walks
   over, admires it, the Art Card opens. All pieces → badge (the Met's also gives the Vermeer Blue blouse).
5. **Music** — each scene has a playlist with 1.5 s crossfades; lo-fi arrangements in 2026, period ones in 1925;
   quieter in Calm, off in Text only. The record player (café hotspot, apartment) plays any unlocked track with
   vinyl crackle. Volumes in Settings.
6. **Wardrobe** — Apartment: the seven tops, each pictured from her tops mockup. The T-shirt, Cream Peter Pan and
   Ivory Jabot are free, Dusty Rose, Emerald Bow and Midnight Satin cost Gilt, Vermeer Blue is the Met's reward —
   while everything is open, every top is hers to wear.
   Wear or try one on and Roxy changes into it in the game; it stays on after a reload.

## Acceptance criteria (phases 1–2)

- Upload, close the tab, reopen → same page. ✔ (hash route + Dexie progress, verified in Edge)
- Roxy never overlaps text and keeps her position between screens. ✔ (stage strip + persistent game)
- Blouse swap is instant in every animation. ✔ in colour (a top's sheet loads the first time she wears it, verified in
  Edge); the tops' own collars, bows and sleeves aren't drawn in her game frames yet.
- Page turns < 100 ms; game loop pauses when the tab is hidden. ✔ (pre-rendered neighbours, ~30 ms measured; `loop.sleep()` on hide)
- Keyboard-only. ✔ (shortcuts above; `?` lists them; every control is a focusable button)

## Placeholders and open items

- **Art**: Roxy's sprite pack still lacks ¾ back views (NE/NW use the plain back view), drawn reaction cycles
  (reactions are single poses with hops and shakes), barista close-ups (pulling a shot and steaming use the machine
  pose plus an effect), seated sipping and note-taking (seated reading stands in), the piano and the apron. The
  regulars are generated in code (32×48). Museum works are placeholder pixel renditions keyed by piece id.
- **Music** is original placeholder chiptune generated per track id — *not* the named pieces yet.
  Check copyright before shipping real arrangements: US compositions published 1930 or earlier are public
  domain as of 2026; *The Sheik of Araby* and *Tiger Rag* may still be protected in the EU (`copyrightNote` in
  `soundtrack.json`).
- **Museum links**: The Met, Art Institute and Louvre cards link to a collection search for the work. Orsay,
  Orangerie and Rodin have `searchUrl: null` — add each work's official page.
- Verify each artwork image's licence when real images are added (The Met / AIC open access).
- Phase 4–6 items shown but not built: the 1925 locations (dock, party, speakeasy, valley, atelier), quest
  rewards, the Writer's daily quest claim, roadster map travel, sync. The app installs to a home screen but has no
  service worker yet, so it still needs the server to open (the books themselves are on the device).

## The crew (Follow-up 8)

Four baristas work at the café; the app opens on **character select** (`#/`): the café dimmed, the four standing
on its floor. Arrow keys / mouse / touch focus one (they step forward, their card opens), Enter starts the shift.
The last pick is preselected; the HUD's ⇄ button saves and comes back here. Deep links (`#/reader/<book>`,
`#/cafe?c=<id>`) still open directly.

| Who | Plays | Currency | Break |
| --- | --- | --- | --- |
| Roxy | everything above, unchanged | Gilt | reading break |
| Jason | latte art at the espresso machine | Tips | never takes one |
| Joel | Morning Rush; DJ rhythm game | Fans | flies to the 电音节 neon festival |
| Jonas | Morning Rush; bass rhythm game | Applause | train to the Dorffest |

- **Registry** — `src/content/characters.json` (typed in `characters.ts`): features, currency, break, NPC routine,
  hotspot relabels. Screens and the HUD read the feature flags, never a name. Reading, wardrobe, museums, the map
  and Gilt are Roxy's only.
- **Saves** — Dexie v2 adds `profiles` (one row per character: currency, unlocks, bests, stats, Jason's photo board,
  a result log). The upgrade only *adds* rows: Roxy's profile is a link (`linked: 'player:me'`); her books,
  progress, highlights, bookmarks, inventory and Gilt stay in their tables. Shared settings (volumes, reduce
  flashing, calibration, keys, latte difficulty) live in the settings row. Currencies never convert.
- **The café for everyone** — whoever isn't playing works as an NPC: Roxy runs her normal barista loop (`CafeLife`),
  the crew theirs (`src/game/crew/CrewLife.ts`: Jason at the machine, Joel chatting at the counter, Jonas going to
  the tables). Crew sprites are the packs in `public/assets/sprites/{joel,jonas,jason,jonas_bass}`
  (`node scripts/copy-crew-sprites.mjs <crew_sprites folder>` refreshes them), drawn at Roxy's scale with each
  pack's origin, depth-sorted by the feet.
- **Coffee, any time** (`src/game/latte/`, `src/screens/cafe/latte/`) — every barista can make a cup at the
  counter whenever they want (Roxy, Joel and Jonas from the Espresso bar panel; Jason's counter opens his shift).
  A cup is three Hold stages (shot, milk, pour) on the button / Space / gamepad A / touch-and-hold, timed by event
  timestamps; the next cup starts at once, no waiting for a customer. Easy and medium patterns are poured for real,
  move by move from the pattern's `script` (`patterns.ts`): push (hold, let go when the layer fills its outline — a
  tulip is push, stop, push, stop…), tap (the wiggle: a tap as each ring closes, one leaf or drop a beat) and pull
  (hold to draw the line through); hard and master patterns still pour in one hold. The cup is drawn in code at 4× from the
  stages' signed errors. Only Jason's cups pay (Tips); for the others the best cup is kept — Roxy's Gilt is untouched.
- **Jason's latte art** — orders queue up in the panel (no extra people walk into the café); 15 patterns in four difficulties (easy → master:
  faster, steeper pours with tighter windows, tips ×1 / ×1.5 / ×2 / ×3), from the Heart through the Fitzgerald
  specials to the Phoenix, Dragon and Unicorn, unlocked with his tips (all open from the start while
  `EVERYTHING_OPEN` is on); a picker pours the customer's choice or any pattern he has. Roxy, Joel and Jonas
  pour the easy and medium patterns (8 of 15, `baristaMax` in `latte.json`) — hard and master are Jason's; rush hour every 4–6 min; the Daily Throwdown pins its best cup to his photo board (the mural
  wall).
- **Rhythm engine** (`src/game/rhythm/`) — AudioClock (Web Audio time, `getOutputTimestamp` for inputs), Chart
  (validated JSON), Judge (±45/90/135 ms, holds, doubles, slides, scratches, crossfades), ScoreModel, InputRouter
  (remappable keys, touch zones, swipes, rubbing, two-finger star power), HighwayView (wooden fretboard or LED
  grid), Calibration, Synth + ChartGen (one song data → audio and all four charts), Autoplay. Pausing: Esc or a
  hidden tab; resuming counts 3-2-1.
- **Songs** — `src/content/songs.ts` is empty on purpose: add your own (a Synth `SongDef`, or an audio file plus
  a chart JSON made in the chart editor). Dev builds list a plain test pattern at both venues.
- **Venues** — one isometric Tiled map, `src/content/rooms/festival.tmj` (64×32 tiles over a 1920×1080 frame;
  regenerate the first draft with `node scripts/build-festival-map.mjs`), two themes (`src/content/venues.ts`).
  Until the empty-venue art exists the two festival pictures are the background, with the stage front, the booth
  and the front tables cut out as overlays; clean lettering is drawn over the banners and stall signs only. The
  crowd is the one painted in the art: reaction bubbles (hearts, notes, stars, faces, mugs / lightning — pictures,
  no words) pop up over the painted heads (`cheer` points in the map) as you hit notes; every 25 in a row, star
  power and a cleared song set off celebration bubbles with confetti; three misses get a worried face. Neon lights
  follow Settings → Reduce flashing (on by default, forced on by prefers-reduced-motion).
- **Twins** — the twin in the café greets whoever comes back from a gig (`src/content/npcs.json`); the Twin Battle
  chalkboard shows this week's best Fans vs Applause. TODO: a twin collab song (DJ + bass).

Smoothness: crew walk/run animations follow their real speed on screen; actions open when the player arrives
at a hotspot; furniture, overlay, sign and bubble textures are built once and reused; the latte gauges and cup update
outside React while you hold (the cup's base is cached); the neon highway draws cached note sprites; the select
screen and the venues fade in from black. Dev builds expose `window.__app` (store, bus, db) for tests and the console.

Placeholders: the empty-venue art and the DJ sheet (`joel_dj_*` animations are used when they exist). The crew
stand at scale 1 per the sprite rules, so on the venue pictures they are larger than the painted band and crowd;
`figureScale` in `festival.tmj` adjusts that.
