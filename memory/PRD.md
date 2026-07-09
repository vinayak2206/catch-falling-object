# CATCH! — Falling Objects Arcade — PRD

## Original Problem Statement
Upgrade the existing HTML5 Canvas "Catch the Falling Objects" game (type.html + game1.js) into a
professional-quality browser arcade game with 30+ levels, worlds, shop, achievements, missions,
powerups, particles, sound, modern UI/UX and mobile support — no framework install required.

## Architecture
- **Frontend shell**: React 18 (CRA) — mounts a full-viewport iframe to `/game/index.html`.
- **Game engine**: Vanilla JS + Canvas 2D in `/app/frontend/public/game/`.
  - `index.html` — game shell / all screens / overlays
  - `style.css`  — glassmorphism UI, gradients, animations, responsive
  - `game.js`    — modular engine (Game, Player, FallingObject, ParticleSystem, FloatingText,
    Background, Audio (WebAudio SFX), SaveManager (localStorage), UI controller, Levels, Shop
    catalog, Achievements)
- **Backend**: FastAPI stub (`/api/health`) — not required by gameplay; kept for platform conventions.
- **Persistence**: localStorage (`catchgame_v1`). No backend save yet.

## Design language
- Warm sunset (coral / amber / gold / teal) — deliberately avoids the AI-slop purple-on-white palette.
- Fonts: Fredoka (body), Bungee (display), JetBrains Mono (numbers).
- Glassmorphism cards, layered gradients, grain overlay, generous spacing.

## Implemented (v1)
- Loading screen with animated progress bar
- Main menu (Play, Levels, Shop, Achievements, Daily, Settings) with wallet (coins/gems/stars)
- Name prompt on first run
- 30 levels across 6 worlds (Meadow, Beach, Snow Peak, Space, Candy Land, Volcano) with
  progressive difficulty (spawn rate, fall speed, bomb chance, wind ≥ L15, night mode ≥ L25,
  boss levels every 10)
- Sequential unlock via star ratings; per-level 1★/2★/3★ (perfect run bonus)
- Falling objects: coins, gems, stars, fruits, bombs, powerups (spawned via weighted RNG)
- 6 powerups: Magnet, Double Score, Slow Motion, Shield, Freeze Time, Multiplier — each with
  active-timer HUD pill and coloured particle bursts
- 3-lives system with hearts HUD, screen-shake + red-flash on damage
- Combo system (x3/x5/x10/x15/x20 popups, combo multiplier on score)
- Floating score numbers, particle pool (500 cap), pooled objects, 60fps loop
- Shop with 3 tabs (Baskets, Trails, Themes), 4 rarity tiers (Common/Rare/Epic/Legendary),
  purchase + equip with coins, localStorage-persisted ownership
- 9 achievements with progress bars and coin/gem rewards on unlock
- Daily rewards (7-day streak with escalating rewards) + Lucky Spin wheel
- Settings (name, music/SFX volume sliders, reduced motion, reset progress)
- Pause / Restart / Quit / Retry / Next Level flows
- Victory screen with earned stars, Game Over screen with best-score comparison
- Toast notifications
- Controls: keyboard (←/→ or A/D), mouse drag, touch drag, on-screen buttons on mobile
- Responsive canvas + safe-area insets, DPR-aware rendering
- Procedural WebAudio SFX (coin/gem/star/bomb/powerup/combo/victory/gameover/click)

## Deferred / Backlog (P1)
- Missions system UI (daily/weekly cards)
- Boss level unique mechanics (currently generic increased difficulty)
- Background music tracks (currently SFX only)
- Cloud save via backend
- More basket / trail / theme skins
- Leaderboard screen (data model exists in save; UI pending)
- Fullscreen toggle button
- Live wallpaper / parallax world backgrounds (currently gradient + clouds/stars)

## User Personas
- **Casual mobile gamer** — quick-play sessions, progression rewards, low friction.
- **Completionist** — chasing 3★ on all 30 levels, all achievements, all shop skins.
- **Kids** — friendly cartoon aesthetic, easy controls (touch drag).

## Core requirements (static)
- No installs / offline capable / mobile-first / 60 FPS / < 200 KB game code.

## Tech Stack
- React 18 + CRA (frontend shell)
- FastAPI (health endpoint stub)
- Vanilla JS + Canvas 2D (game engine)
- localStorage (persistence)
- WebAudio API (SFX)

## Next Action Items
1. Playtest 30 levels for balance and unlock pacing.
2. Add missions/leaderboard UIs (data models already saved).
3. Add background music channel and loop tracks per world.
4. Add fullscreen toggle in Settings.
5. Optional: back-end sync via MongoDB (`/api/save` `/api/leaderboard`).

## Test Credentials
No authentication implemented — no credentials required.
Player identity is a self-typed nickname stored in localStorage.
