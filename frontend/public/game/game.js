/* ============================================================
   CATCH! — Falling Objects Arcade
   Single-file game engine. Modular classes, 60fps target,
   pointer + keyboard controls, procedural art via Canvas 2D.
   ============================================================ */
(() => {
'use strict';

// ---------- Constants -----------
const OBJ_TYPES = {
  COIN:    { emoji: '🪙', points: 10, coins: 1, color: '#ffd93d', good: true,  rarity: 0.55, size: 34 },
  GEM:     { emoji: '💎', points: 30, coins: 3, color: '#4fc3f7', good: true,  rarity: 0.10, size: 32 },
  STAR:    { emoji: '⭐', points: 50, coins: 5, color: '#ffe066', good: true,  rarity: 0.06, size: 36 },
  FRUIT:   { emoji: '🍎', points: 15, coins: 1, color: '#ff6b6b', good: true,  rarity: 0.22, size: 34 },
  BOMB:    { emoji: '💣', points: 0,  coins: 0, color: '#2d3436', good: false, rarity: 0.14, size: 36, damage: true },
  POWERUP: { emoji: '⚡', points: 0,  coins: 0, color: '#9d4edd', good: true,  rarity: 0.04, size: 38, powerup: true },
};

const POWERUPS = ['MAGNET', 'DOUBLE', 'SLOW', 'SHIELD', 'MULTI', 'FREEZE'];
const POWERUP_META = {
  MAGNET:  { icon: '🧲', name: 'Magnet',      duration: 8, color: '#ff6b6b' },
  DOUBLE:  { icon: '✖2', name: 'Double',      duration: 8, color: '#ffd93d' },
  SLOW:    { icon: '🐢', name: 'Slow Motion', duration: 6, color: '#4ecdc4' },
  SHIELD:  { icon: '🛡️', name: 'Shield',      duration: 10, color: '#95e1d3' },
  MULTI:   { icon: '✨', name: 'Multiplier',  duration: 8, color: '#ff8fa3' },
  FREEZE:  { icon: '❄️', name: 'Freeze',      duration: 5, color: '#a0e7e5' },
};

// ---------- Utils -----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function weightedPick(entries) {
  const total = entries.reduce((s, e) => s + e.w, 0);
  let r = Math.random() * total;
  for (const e of entries) { r -= e.w; if (r <= 0) return e.v; }
  return entries[0].v;
}

// ---------- Save Manager -----------
const SaveManager = {
  KEY: 'catchgame_v1',
  data: null,
  defaults() {
    return {
      player: '',
      coins: 50,
      gems: 3,
      stars: 0,
      bestScore: 0,
      bestCombo: 0,
      levelsCompleted: 0,
      levelStars: {},         // { "1": 3, "2": 2, ... }
      shop: {
        baskets: { classic: { owned: true, equipped: true } },
        trails:  { none:    { owned: true, equipped: true } },
        themes:  { sunset:  { owned: true, equipped: true } },
      },
      achievements: {},
      settings: { music: 60, sfx: 80, dark: true, reducedMotion: false },
      daily: { lastClaim: null, streak: 0, spinDate: null },
      missions: { date: null, active: [], progress: {}, claimed: {} },
      firstRun: true,
    };
  },
  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      this.data = raw ? { ...this.defaults(), ...JSON.parse(raw) } : this.defaults();
    } catch { this.data = this.defaults(); }
    return this.data;
  },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch {} },
  reset() { this.data = this.defaults(); this.save(); },
};

// ---------- Mission Manager -----------
const Missions = {
  ensureToday() {
    const today = new Date().toDateString();
    const m = SaveManager.data.missions;
    if (m.date !== today) {
      m.date = today;
      m.active = pickDailyMissions(today);
      m.progress = {};
      m.claimed = {};
      SaveManager.save();
    }
  },
  track(key, delta = 1) {
    this.ensureToday();
    const m = SaveManager.data.missions;
    for (const id of m.active) {
      const tpl = MISSION_TEMPLATES.find(t => t.id === id);
      if (!tpl || tpl.track !== key) continue;
      if (key === 'maxCombo' || key === 'perfect') {
        m.progress[id] = Math.max(m.progress[id] || 0, delta);
      } else {
        m.progress[id] = (m.progress[id] || 0) + delta;
      }
    }
    SaveManager.save();
  },
  claim(id) {
    const m = SaveManager.data.missions;
    if (m.claimed[id]) return false;
    const tpl = MISSION_TEMPLATES.find(t => t.id === id);
    if (!tpl) return false;
    if ((m.progress[id] || 0) < tpl.goal) return false;
    m.claimed[id] = true;
    if (tpl.reward.coins) SaveManager.data.coins += tpl.reward.coins;
    if (tpl.reward.gems)  SaveManager.data.gems  += tpl.reward.gems;
    SaveManager.save();
    return true;
  },
  timeUntilRefresh() {
    const now = new Date();
    const midnight = new Date(now); midnight.setHours(24, 0, 0, 0);
    const ms = midnight - now;
    const h = Math.floor(ms / 3600000);
    const min = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${min}m`;
  },
};

// ---------- Backend Leaderboard client -----------
const Leaderboard = {
  API: (window.__BACKEND_URL__ || (window.location.origin)),
  playerId: null,
  init() {
    let pid = localStorage.getItem('catchgame_pid');
    if (!pid) {
      pid = 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem('catchgame_pid', pid);
    }
    this.playerId = pid;
  },
  async submit(score, combo, level) {
    if (!this.playerId) this.init();
    try {
      const s = SaveManager.data;
      await fetch(`${this.API}/api/leaderboard/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: this.playerId,
          name: s.player || 'Player',
          avatar: (CATALOG.baskets.find(b => s.shop.baskets[b.id]?.equipped) || {}).emoji || '🧺',
          score, combo, level,
        }),
      });
    } catch (e) { /* offline is fine — local + seeded board still works */ }
  },
  async fetchTop() {
    try {
      const r = await fetch(`${this.API}/api/leaderboard/top?limit=25`);
      if (!r.ok) return [];
      const data = await r.json();
      return data.entries || [];
    } catch { return []; }
  },
};

// ---------- Audio (procedural via Web Audio API) -----------
class Audio {
  constructor() {
    this.ctx = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.musicOsc = null;
    this.musicVol = 0.6;
    this.sfxVol = 0.8;
    this.enabled = false;
  }
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVol * 0.15;
      this.sfxGain.gain.value = this.sfxVol * 0.3;
      this.musicGain.connect(this.ctx.destination);
      this.sfxGain.connect(this.ctx.destination);
      this.enabled = true;
    } catch (e) { this.enabled = false; }
  }
  setVolumes(music, sfx) {
    this.musicVol = music / 100;
    this.sfxVol = sfx / 100;
    if (this.musicGain) this.musicGain.gain.value = this.musicVol * 0.15;
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxVol * 0.3;
  }
  beep(freq = 440, dur = 0.12, type = 'sine', vol = 1) {
    if (!this.enabled) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(); o.stop(this.ctx.currentTime + dur);
  }
  play(name) {
    if (!this.enabled) return;
    switch (name) {
      case 'coin':      this.beep(880, 0.08, 'triangle'); setTimeout(() => this.beep(1320, 0.08, 'triangle'), 40); break;
      case 'gem':       this.beep(1200, 0.06, 'sine'); setTimeout(() => this.beep(1600, 0.06, 'sine'), 40); setTimeout(() => this.beep(2000, 0.08, 'sine'), 80); break;
      case 'star':      this.beep(1500, 0.1, 'triangle'); setTimeout(() => this.beep(2000, 0.15, 'sine'), 80); break;
      case 'bomb':      this.beep(120, 0.25, 'sawtooth'); this.beep(80, 0.3, 'square'); break;
      case 'powerup':   this.beep(500, 0.06, 'square'); setTimeout(() => this.beep(700, 0.06, 'square'), 60); setTimeout(() => this.beep(1000, 0.12, 'square'), 120); break;
      case 'combo':     this.beep(800, 0.06, 'triangle'); setTimeout(() => this.beep(1200, 0.06, 'triangle'), 40); setTimeout(() => this.beep(1600, 0.1, 'triangle'), 80); break;
      case 'click':     this.beep(600, 0.04, 'triangle', 0.5); break;
      case 'victory':   [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.beep(f, 0.15, 'triangle'), i * 100)); break;
      case 'gameover':  [400, 350, 300, 250].forEach((f, i) => setTimeout(() => this.beep(f, 0.2, 'sawtooth'), i * 120)); break;
    }
  }
}
const audio = new Audio();

// ---------- Levels -----------
const WHEEL_PRIZES = [10, 20, 50, 100, 200, 5, 25, 500];

const THEME_PALETTES = {
  sunset: null, // use world default
  ocean:  { sky: ['#001d3d', '#003566', '#0077b6'], accent: '#48cae4' },
  aurora: { sky: ['#03071e', '#3c096c', '#5a189a'], accent: '#c77dff' },
  cyber:  { sky: ['#0a0014', '#240046', '#ff006e'], accent: '#00f5ff' },
};

const WORLDS = [
  { name: 'Meadow',    emoji: '🌳', sky: ['#4ecdc4', '#95e1d3', '#ffd93d'], accent: '#7ee787' },
  { name: 'Beach',     emoji: '🏖️', sky: ['#48cae4', '#ffb347', '#ff8fa3'], accent: '#ffd93d' },
  { name: 'Snow Peak', emoji: '❄️', sky: ['#a8dadc', '#e0f7fa', '#e8f0f7'], accent: '#4fc3f7' },
  { name: 'Space',     emoji: '🚀', sky: ['#0d0b26', '#2d1657', '#4a148c'], accent: '#9d4edd' },
  { name: 'Candy Land',emoji: '🍭', sky: ['#ff8fa3', '#ffb3c1', '#ffd93d'], accent: '#ff6b6b' },
  { name: 'Volcano',   emoji: '🌋', sky: ['#3d0000', '#ff4757', '#ff9500'], accent: '#ff6b35' },
];

function buildLevels() {
  const levels = [];
  for (let i = 1; i <= 30; i++) {
    const world = Math.min(Math.floor((i - 1) / 5), WORLDS.length - 1);
    const diff = (i - 1) / 29; // 0 → 1
    const isBoss = (i % 10 === 0);
    levels.push({
      id: i,
      world,
      // Shorter duration at higher levels (more pressure)
      duration: Math.round(85 - diff * 40),          // L1=85s, L30=45s
      // Faster spawn rate as levels grow
      spawnRate: Math.max(260, Math.round(1000 - i * 26)), // L1=974ms, L30=260ms
      // Slower fall at L1 for easier catches, MUCH faster late
      fallSpeed: Math.round(75 + i * 11),            // L1=86, L30=405
      // Bomb probability climbs from 10% (always present) up to 60% (more bombs than coins)
      bombChance: clamp(0.10 + diff * 0.50, 0.10, 0.60),
      // Good-object weight adjustment — coins get scarcer, bombs dominate late-game
      coinWeight:  0.55 - diff * 0.35,   // 0.55 → 0.20
      fruitWeight: 0.22 - diff * 0.15,   // 0.22 → 0.07
      // Target score to complete level (grows with level)
      target: Math.round(80 + i * 45),               // L1=125, L30=1430
      // Powerups are precious — cap per level so x2 / magnet etc. feel rare
      maxPowerups: 2,
      wind: i >= 15 ? Math.min(70, (i - 14) * 5) : 0,
      night: i >= 25,
      boss: isBoss,
      name: isBoss ? `Boss ${i / 10}` : `Level ${i}`,
    });
  }
  return levels;
}
const LEVELS = buildLevels();

// ---------- Shop catalog -----------
const CATALOG = {
  baskets: [
    { id: 'classic',  name: 'Classic',    emoji: '🧺', rarity: 'common',    price: 0 },
    { id: 'wooden',   name: 'Wooden',     emoji: '🪣', rarity: 'common',    price: 50 },
    { id: 'gold',     name: 'Golden Cup', emoji: '🏆', rarity: 'rare',      price: 200 },
    { id: 'shell',    name: 'Sea Shell',  emoji: '🐚', rarity: 'rare',      price: 250 },
    { id: 'magic',    name: 'Magic Hat',  emoji: '🎩', rarity: 'epic',      price: 500 },
    { id: 'crown',    name: 'Royal Crown',emoji: '👑', rarity: 'epic',      price: 750 },
    { id: 'ufo',     name: 'UFO Catcher', emoji: '🛸', rarity: 'legendary', price: 1500 },
    { id: 'dragon',   name: 'Dragon Mouth',emoji:'🐲', rarity: 'legendary', price: 2000 },
  ],
  trails: [
    { id: 'none',    name: 'None',      emoji: '🚫', rarity: 'common', price: 0 },
    { id: 'sparkle', name: 'Sparkle',   emoji: '✨', rarity: 'rare',   price: 150 },
    { id: 'fire',    name: 'Fire',      emoji: '🔥', rarity: 'epic',   price: 400 },
    { id: 'rainbow', name: 'Rainbow',   emoji: '🌈', rarity: 'legendary', price: 900 },
    { id: 'bubble',  name: 'Bubbles',   emoji: '🫧', rarity: 'rare',   price: 200 },
    { id: 'heart',   name: 'Hearts',    emoji: '💖', rarity: 'epic',   price: 350 },
  ],
  themes: [
    { id: 'sunset',  name: 'Sunset',    emoji: '🌅', rarity: 'common',    price: 0 },
    { id: 'ocean',   name: 'Ocean',     emoji: '🌊', rarity: 'rare',      price: 300 },
    { id: 'aurora',  name: 'Aurora',    emoji: '🌌', rarity: 'epic',      price: 600 },
    { id: 'cyber',   name: 'Cyberpunk', emoji: '🌃', rarity: 'legendary', price: 1200 },
  ],
};

// ---------- Achievements -----------
const ACHIEVEMENTS = [
  { id: 'first_catch',  name: 'First Catch',     desc: 'Catch your first object',   goal: 1,    icon: '🎯', check: (s) => s.totalCatches },
  { id: 'coins_100',    name: 'Coin Collector',  desc: 'Collect 100 coins',         goal: 100,  icon: '🪙', check: (s) => s.totalCoins },
  { id: 'coins_1000',   name: 'Coin Master',     desc: 'Collect 1000 coins',        goal: 1000, icon: '💰', check: (s) => s.totalCoins },
  { id: 'combo_10',     name: 'Combo Master',    desc: 'Reach a x10 combo',         goal: 10,   icon: '🔥', check: (s) => s.bestCombo },
  { id: 'combo_20',     name: 'Combo Legend',    desc: 'Reach a x20 combo',         goal: 20,   icon: '⚡', check: (s) => s.bestCombo },
  { id: 'perfect_lvl',  name: 'Flawless',        desc: 'Beat a level without damage',goal: 1,   icon: '💎', check: (s) => s.perfectLevels },
  { id: 'level_10',     name: 'Speed Runner',    desc: 'Complete 10 levels',        goal: 10,   icon: '🏃', check: (s) => s.levelsCompleted },
  { id: 'level_30',     name: 'Legend Player',   desc: 'Complete all 30 levels',    goal: 30,   icon: '🏆', check: (s) => s.levelsCompleted },
  { id: 'gems_50',      name: 'Treasure Hunter', desc: 'Collect 50 gems',           goal: 50,   icon: '💎', check: (s) => s.totalGems },
];

// ---------- Leaderboard seed (fake competitors so board isn't empty) -----------
const LB_SEED = [
  { name: 'MochiSlayer',   avatar: '🐉', score: 2450, combo: 24, level: 30 },
  { name: 'PixelPirate',   avatar: '🏴‍☠️', score: 2180, combo: 20, level: 28 },
  { name: 'NovaKid',       avatar: '👾', score: 1890, combo: 18, level: 25 },
  { name: 'CandyQueen',    avatar: '🍭', score: 1610, combo: 16, level: 22 },
  { name: 'CoinChaser',    avatar: '💰', score: 1320, combo: 14, level: 19 },
  { name: 'BasketNinja',   avatar: '🥷', score: 1080, combo: 12, level: 17 },
  { name: 'StarSurfer',    avatar: '🌟', score: 890,  combo: 11, level: 14 },
  { name: 'BubbleBot',     avatar: '🫧', score: 720,  combo: 9,  level: 12 },
  { name: 'Foxytail',      avatar: '🦊', score: 560,  combo: 8,  level: 10 },
  { name: 'DumplingDave',  avatar: '🥟', score: 420,  combo: 7,  level: 8 },
  { name: 'PenguinPal',    avatar: '🐧', score: 310,  combo: 6,  level: 6 },
  { name: 'RookieRon',     avatar: '🐣', score: 180,  combo: 4,  level: 3 },
];

// ---------- Missions -----------
const MISSION_TEMPLATES = [
  { id:'catch_fruits', icon:'🍎', name:'Fruit Hunter',   desc:'Catch 50 fruits',              goal:50,  track:'fruits',   reward:{coins:40} },
  { id:'collect_coins',icon:'🪙', name:'Piggy Bank',      desc:'Collect 100 coins',            goal:100, track:'coins',    reward:{coins:30, gems:1} },
  { id:'finish_levels',icon:'🏁', name:'Speed Runner',    desc:'Finish 3 levels',              goal:3,   track:'levels',   reward:{coins:60} },
  { id:'use_powerups', icon:'⚡', name:'Power Grabber',   desc:'Grab 5 powerups',              goal:5,   track:'powerups', reward:{coins:35} },
  { id:'combo_master', icon:'🔥', name:'Combo Master',    desc:'Reach a x10 combo',            goal:10,  track:'maxCombo', reward:{coins:50, gems:1} },
  { id:'no_damage',    icon:'💎', name:'Untouchable',     desc:'Beat a level without damage',  goal:1,   track:'perfect',  reward:{coins:80, gems:2} },
  { id:'gem_collect',  icon:'💠', name:'Gem Digger',      desc:'Collect 10 gems',              goal:10,  track:'gems',     reward:{coins:50} },
  { id:'star_catcher', icon:'⭐', name:'Star Catcher',    desc:'Catch 5 stars',                goal:5,   track:'stars',    reward:{coins:60, gems:1} },
];

function pickDailyMissions(seedDate) {
  // Deterministic 3-of-N pick based on date, so all sessions on same day match
  const shuffled = [...MISSION_TEMPLATES];
  let seed = 0;
  for (let i = 0; i < seedDate.length; i++) seed = (seed * 31 + seedDate.charCodeAt(i)) | 0;
  for (let i = shuffled.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 3).map(m => m.id);
}

// ---------- Entities -----------
class FallingObject {
  constructor(type, x, y, speed) {
    this.type = type;
    this.meta = OBJ_TYPES[type];
    this.x = x; this.y = y;
    this.vx = 0;
    this.vy = speed;
    this.size = this.meta.size;
    this.rot = 0;
    this.rotSpeed = rand(-2, 2);
    this.wobble = Math.random() * Math.PI * 2;
    this.alive = true;
    this.powerupKind = this.meta.powerup ? pick(POWERUPS) : null;
    this.magnetized = false;
    this.bounce = 0;
  }
  update(dt, game) {
    this.wobble += dt * 3;
    this.rot += this.rotSpeed * dt;
    // Wind
    if (game.level.wind && !this.magnetized) {
      this.vx = game.windDir * game.level.wind;
    }
    // Freeze slows falling
    let speedFactor = 1;
    if (game.activePowerups.SLOW) speedFactor = 0.4;
    if (game.activePowerups.FREEZE) speedFactor = 0;

    // Magnet powerup
    if (game.activePowerups.MAGNET && this.meta.good && !this.meta.damage) {
      const dx = game.player.x - this.x;
      const dy = game.player.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 260) {
        this.magnetized = true;
        const pull = 400;
        this.vx = (dx / d) * pull;
        this.vy = Math.max(this.vy, (dy / d) * pull);
      }
    }

    this.x += (this.vx + Math.sin(this.wobble) * 30) * dt * speedFactor;
    this.y += this.vy * dt * speedFactor;

    if (this.y > game.height + 50) this.alive = false;
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    // shadow
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(0, this.size / 2 + 3, this.size * 0.4, this.size * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.rotate(this.rot);
    // Glow
    ctx.shadowBlur = 20;
    ctx.shadowColor = this.meta.color;
    // Emoji
    ctx.font = `${this.size}px 'Fredoka', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = this.powerupKind ? POWERUP_META[this.powerupKind].icon : this.meta.emoji;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
}

class Player {
  constructor(game) {
    this.game = game;
    this.width = 100;
    this.height = 60;
    this.x = game.width / 2;
    this.y = game.height - 80;
    this.targetX = this.x;
    this.speed = 1400;
    this.bounce = 0;
    this.hurt = 0;
    this.trailTimer = 0;
    this.emoji = CATALOG.baskets.find(b => SaveManager.data.shop.baskets[b.id]?.equipped)?.emoji || '🧺';
  }
  update(dt, game) {
    // Ease toward targetX for smooth motion (higher factor = snappier)
    const dx = this.targetX - this.x;
    const move = clamp(dx * 18, -this.speed, this.speed);
    this.x += move * dt;
    this.x = clamp(this.x, this.width / 2, game.width - this.width / 2);
    this.bounce = Math.max(0, this.bounce - dt * 4);
    this.hurt = Math.max(0, this.hurt - dt * 2);
    // Trail emit — richer for a satisfying look
    this.trailTimer += dt;
    const trail = CATALOG.trails.find(t => SaveManager.data.shop.trails[t.id]?.equipped);
    if (trail && trail.id !== 'none' && this.trailTimer > 0.035) {
      this.trailTimer = 0;
      const count = trail.id === 'rainbow' ? 3 : 2;
      for (let i = 0; i < count; i++) {
        game.particles.emit(this.x + rand(-32, 32), this.y + rand(10, 26), {
          vy: rand(-30, 40), vx: rand(-40, 40),
          gravity: 60,
          life: trail.id === 'bubble' ? 1.4 : 1.0,
          size: rand(5, 10),
          color:
            trail.id === 'fire' ? (Math.random() < 0.5 ? '#ff6b35' : '#ffd93d') :
            trail.id === 'rainbow' ? `hsl(${(Date.now() / 10 + i * 60) % 360},85%,62%)` :
            trail.id === 'bubble' ? '#a0e7e5' :
            trail.id === 'heart' ? '#ff8fa3' :
            '#ffd93d',
          emoji: trail.id === 'heart' ? '💖' : trail.id === 'bubble' ? '🫧' : trail.id === 'sparkle' ? '✨' : trail.id === 'fire' ? '🔥' : null,
        });
      }
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y - this.bounce * 8);
    // shadow
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, this.height / 2 + 8, this.width * 0.45, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // hurt flash
    if (this.hurt > 0) {
      ctx.shadowBlur = 30; ctx.shadowColor = '#ff4757';
    } else if (this.game.activePowerups.SHIELD) {
      ctx.shadowBlur = 30; ctx.shadowColor = '#95e1d3';
      ctx.strokeStyle = 'rgba(149,225,211,0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 55, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.shadowBlur = 18; ctx.shadowColor = 'rgba(255,255,255,0.4)';
    }

    ctx.font = '78px "Fredoka", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.emoji, 0, 0);
    ctx.restore();
  }
  catches(obj) {
    const dx = obj.x - this.x;
    const dy = obj.y - this.y;
    return Math.abs(dx) < this.width / 2 && Math.abs(dy) < this.height / 2 + 10;
  }
  refreshSkin() {
    this.emoji = CATALOG.baskets.find(b => SaveManager.data.shop.baskets[b.id]?.equipped)?.emoji || '🧺';
  }
}

// ---------- Particle system (object pooled) -----------
class ParticleSystem {
  constructor(cap = 400) {
    this.pool = [];
    this.active = [];
    this.cap = cap;
    for (let i = 0; i < cap; i++) this.pool.push({});
  }
  emit(x, y, opts = {}) {
    if (!this.pool.length) return;
    const p = this.pool.pop();
    p.x = x; p.y = y;
    p.vx = opts.vx ?? rand(-80, 80);
    p.vy = opts.vy ?? rand(-160, -40);
    p.gravity = opts.gravity ?? 200;
    p.life = opts.life ?? 0.8;
    p.maxLife = p.life;
    p.size = opts.size ?? rand(3, 8);
    p.color = opts.color ?? '#ffd93d';
    p.emoji = opts.emoji ?? null;
    p.rot = 0; p.rotSpeed = rand(-4, 4);
    this.active.push(p);
  }
  burst(x, y, n, opts = {}) {
    for (let i = 0; i < n; i++) this.emit(x, y, {
      ...opts,
      vx: rand(-200, 200),
      vy: rand(-260, -40),
    });
  }
  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.active.splice(i, 1);
        this.pool.push(p);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.rotSpeed * dt;
    }
  }
  draw(ctx) {
    for (const p of this.active) {
      const a = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.emoji) {
        ctx.font = `${p.size * 2}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(p.emoji, 0, 0);
      } else {
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

// ---------- Floating score numbers -----------
class FloatingText {
  constructor(list) { this.list = list; }
  add(x, y, text, color = '#ffd93d', size = 24) {
    this.list.push({ x, y, text, color, size, life: 1.0, maxLife: 1.0, vy: -80 });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy *= 0.96;
      if (f.life <= 0) this.list.splice(i, 1);
    }
  }
  draw(ctx) {
    for (const f of this.list) {
      const a = f.life / f.maxLife;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `700 ${f.size}px 'Fredoka', sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = f.color;
      ctx.shadowBlur = 8; ctx.shadowColor = f.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 4;
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }
}

// ---------- Background -----------
class Background {
  constructor(game) {
    this.game = game;
    this.stars = [];
    for (let i = 0; i < 60; i++) this.stars.push({ x: Math.random(), y: Math.random(), r: rand(0.5, 2), phase: Math.random() * Math.PI * 2 });
    this.clouds = [];
    for (let i = 0; i < 6; i++) this.clouds.push({ x: Math.random(), y: rand(0.05, 0.4), speed: rand(6, 20), size: rand(60, 140) });
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    for (const c of this.clouds) {
      c.x += (c.speed * dt) / this.game.width;
      if (c.x > 1.2) c.x = -0.2;
    }
  }
  draw(ctx) {
    const w = this.game.width, h = this.game.height;
    const worldDefault = WORLDS[this.game.level.world];
    // Apply equipped theme override (if any)
    const eqTheme = Object.keys(SaveManager.data.shop.themes).find(k => SaveManager.data.shop.themes[k]?.equipped);
    const themePal = THEME_PALETTES[eqTheme];
    const world = themePal ? { ...worldDefault, sky: themePal.sky, accent: themePal.accent } : worldDefault;
    const night = this.game.level.night;

    // sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (night) {
      g.addColorStop(0, '#0d0b26'); g.addColorStop(0.5, '#1a1140'); g.addColorStop(1, '#2d1657');
    } else {
      g.addColorStop(0, world.sky[0]); g.addColorStop(0.55, world.sky[1]); g.addColorStop(1, world.sky[2]);
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Stars (visible in space and night mode)
    if (this.game.level.world === 3 || night) {
      for (const s of this.stars) {
        const alpha = 0.5 + 0.5 * Math.sin(this.t * 2 + s.phase);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h * 0.7, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else {
      // Clouds
      for (const c of this.clouds) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        const cx = c.x * w, cy = c.y * h;
        ctx.beginPath();
        ctx.ellipse(cx, cy, c.size, c.size * 0.4, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + c.size * 0.6, cy - 5, c.size * 0.7, c.size * 0.3, 0, 0, Math.PI * 2);
        ctx.ellipse(cx - c.size * 0.5, cy + 3, c.size * 0.6, c.size * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Ground
    ctx.fillStyle = world.accent + '55';
    ctx.fillRect(0, h - 30, w, 30);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, h - 30, w, 3);

    // World logo (subtle)
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.font = '200px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(world.emoji, w / 2, h / 2);
    ctx.restore();
  }
}

// ---------- Game -----------
class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = 0; this.height = 0;
    this.running = false;
    this.paused = false;
    this.lastTime = 0;

    this.player = null;
    this.objects = [];
    this.particles = new ParticleSystem(500);
    this.floats = new FloatingText([]);
    this.background = null;

    this.currentLevelIndex = 0;
    this.level = LEVELS[0];

    this.score = 0;
    this.coinsEarned = 0;
    this.gemsEarned = 0;
    this.hearts = 3;
    this.combo = 0;
    this.bestCombo = 0;
    this.comboTimer = 0;
    this.spawnTimer = 0;
    this.timeLeft = 0;
    this.perfectRun = true;
    this.totalCatches = 0;

    this.activePowerups = {};
    this.windDir = 1;
    this.windTimer = 0;
    this.shake = 0;
    this.flash = 0;

    this.controls = { left: false, right: false };
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.setupInput();
  }
  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.player) this.player.y = this.height - 80;
  }
  setupInput() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'a', 'A'].includes(e.key)) this.controls.left = true;
      else if (['ArrowRight', 'd', 'D'].includes(e.key)) this.controls.right = true;
      else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (this.running) UI.togglePause(); }
    });
    window.addEventListener('keyup', (e) => {
      if (['ArrowLeft', 'a', 'A'].includes(e.key)) this.controls.left = false;
      else if (['ArrowRight', 'd', 'D'].includes(e.key)) this.controls.right = false;
    });

    // Pointer drag
    const onPointer = (e) => {
      if (!this.running || this.paused) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      if (this.player) this.player.targetX = x;
    };
    this.canvas.addEventListener('pointerdown', onPointer);
    this.canvas.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') onPointer(e); });
    this.canvas.addEventListener('touchmove', onPointer, { passive: true });

    // Mobile buttons
    document.querySelectorAll('[data-mc]').forEach((btn) => {
      const dir = btn.getAttribute('data-mc');
      const set = (v) => { this.controls[dir] = v; };
      btn.addEventListener('touchstart', (e) => { e.preventDefault(); set(true); }, { passive: false });
      btn.addEventListener('touchend',   (e) => { e.preventDefault(); set(false); }, { passive: false });
      btn.addEventListener('mousedown', () => set(true));
      btn.addEventListener('mouseup',   () => set(false));
      btn.addEventListener('mouseleave',() => set(false));
    });
  }
  startLevel(index) {
    this.currentLevelIndex = index;
    this.level = LEVELS[index];
    this.score = 0;
    this.coinsEarned = 0;
    this.gemsEarned = 0;
    this.hearts = 3;
    this.combo = 0;
    this.bestCombo = 0;
    this.comboTimer = 0;
    this.spawnTimer = 0;
    this.timeLeft = this.level.duration;
    this._targetHitAt = null;
    this.powerupsSpawned = 0;
    this.objects.length = 0;
    this.particles.active.length = 0;
    this.floats.list.length = 0;
    this.activePowerups = {};
    this.perfectRun = true;
    this.player = new Player(this);
    this.background = new Background(this);
    this.running = true;
    this.paused = false;
    this.lastTime = performance.now();
    UI.showScreen('game');
    UI.updateHUD(this);
    requestAnimationFrame(this.loop.bind(this));
  }
  loop(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    if (!this.paused) {
      this.update(dt);
      this.draw();
    }
    requestAnimationFrame(this.loop.bind(this));
  }
  update(dt) {
    // Time acceleration — the deeper you are into a level, the faster the
    // clock burns. Starts at 1x and climbs to 1.6x by the end for late-game
    // pressure. Higher-difficulty levels start with a bigger multiplier.
    const elapsed = this.level.duration - this.timeLeft;
    const t = clamp(elapsed / this.level.duration, 0, 1);
    const levelDiff = (this.level.id - 1) / 29;               // 0..1
    const timeMult = 1 + t * 0.6 + levelDiff * 0.25;          // L1 late ~1.6, L30 start ~1.25, L30 late ~1.85
    this.timeLeft -= dt * timeMult;
    if (this.timeLeft <= 0) { this.endLevel(this.score >= this.level.target); return; }

    // Player input direction (keyboard)
    const kbSpeed = 900; // px/s — snappy arcade feel
    if (this.controls.left) this.player.targetX = Math.max(0, this.player.targetX - kbSpeed * dt);
    if (this.controls.right) this.player.targetX = Math.min(this.width, this.player.targetX + kbSpeed * dt);

    // Wind direction shift
    this.windTimer -= dt;
    if (this.windTimer <= 0) { this.windDir = Math.random() < 0.5 ? -1 : 1; this.windTimer = rand(3, 6); }

    // Spawn objects
    let rate = this.level.spawnRate;
    if (this.activePowerups.FREEZE) rate *= 3;
    this.spawnTimer += dt * 1000;
    if (this.spawnTimer >= rate) {
      this.spawnTimer = 0;
      this.spawn();
    }

    // Powerup timers
    for (const k of Object.keys(this.activePowerups)) {
      this.activePowerups[k] -= dt;
      if (this.activePowerups[k] <= 0) delete this.activePowerups[k];
    }
    UI.updatePowerups(this);

    // Combo decay
    this.comboTimer -= dt;
    if (this.comboTimer <= 0 && this.combo > 0) this.combo = 0;

    // Auto-complete when target reached
    if (this.score >= this.level.target && !this._targetHitAt) {
      this._targetHitAt = performance.now();
      UI.showCombo('TARGET! 🎯');
      // small victory particle burst on player
      this.particles.burst(this.player.x, this.player.y, 30, { color: '#ffd93d', life: 1 });
      audio.play('star');
      // Finish shortly after so the burst is visible
      setTimeout(() => { if (this.running) this.endLevel(true); }, 700);
    }

    // Background & entities
    this.background.update(dt);
    this.player.update(dt, this);
    this.particles.update(dt);
    this.floats.update(dt);

    for (let i = this.objects.length - 1; i >= 0; i--) {
      const o = this.objects[i];
      o.update(dt, this);
      if (!o.alive) {
        // Missed
        if (o.meta.good && !o.meta.powerup) {
          this.combo = 0;
        }
        this.objects.splice(i, 1);
        continue;
      }
      if (this.player.catches(o)) {
        this.handleCatch(o);
        this.objects.splice(i, 1);
      }
    }

    // Screen shake decay
    this.shake = Math.max(0, this.shake - dt * 6);
    this.flash = Math.max(0, this.flash - dt * 3);

    UI.updateHUD(this);
  }
  spawn() {
    // Per-level weighted RNG: bombs get scarier as level rises
    const L = this.level;
    const powerupExhausted = this.powerupsSpawned >= (L.maxPowerups || 2);
    const entries = [
      { v: 'COIN',    w: L.coinWeight },
      { v: 'FRUIT',   w: L.fruitWeight },
      { v: 'GEM',     w: OBJ_TYPES.GEM.rarity },
      { v: 'STAR',    w: OBJ_TYPES.STAR.rarity },
      // Powerups only appear until the per-level cap is reached
      { v: 'POWERUP', w: powerupExhausted ? 0 : OBJ_TYPES.POWERUP.rarity },
      { v: 'BOMB',    w: L.bombChance },
    ];
    const type = weightedPick(entries);
    if (type === 'POWERUP') this.powerupsSpawned++;
    const x = rand(30, this.width - 30);
    const speed = L.fallSpeed + rand(-30, 30);
    this.objects.push(new FallingObject(type, x, -30, speed));
  }
  handleCatch(o) {
    this.player.bounce = 1;
    if (o.meta.damage) {
      if (this.activePowerups.SHIELD) {
        // Shield absorbs
        this.particles.burst(o.x, o.y, 20, { color: '#95e1d3', life: 0.7 });
        this.floats.add(o.x, o.y - 20, 'BLOCKED!', '#95e1d3', 22);
        delete this.activePowerups.SHIELD;
        audio.play('powerup');
      } else {
        this.hearts--;
        this.combo = 0;
        this.shake = 1.2;
        this.flash = 1;
        this.player.hurt = 1;
        this.perfectRun = false;
        this.particles.burst(o.x, o.y, 34, { color: '#ff4757', life: 0.9, size: rand(4, 12) });
        this.floats.add(o.x, o.y - 20, '💥 -1 LIFE', '#ff4757', 26);
        audio.play('bomb');
        if (this.hearts <= 0) { this.endLevel(false); return; }
      }
      return;
    }

    if (o.meta.powerup) {
      this.activePowerups[o.powerupKind] = POWERUP_META[o.powerupKind].duration;
      this.floats.add(o.x, o.y - 20, POWERUP_META[o.powerupKind].name, POWERUP_META[o.powerupKind].color, 22);
      this.particles.burst(o.x, o.y, 24, { color: POWERUP_META[o.powerupKind].color, life: 0.9 });
      audio.play('powerup');
      UI.toast(`${POWERUP_META[o.powerupKind].icon} ${POWERUP_META[o.powerupKind].name}!`, 'success');
      Missions.track('powerups', 1);
      return;
    }

    // Good catch
    this.combo++;
    this.comboTimer = 2.2;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    this.totalCatches++;

    let mult = 1;
    if (this.activePowerups.DOUBLE) mult *= 2;
    if (this.activePowerups.MULTI) mult *= 3;
    const comboMult = 1 + Math.min(this.combo - 1, 20) * 0.1;

    const points = Math.round(o.meta.points * mult * comboMult);
    const coins = Math.round(o.meta.coins * mult);
    this.score += points;
    this.coinsEarned += coins;
    if (o.type === 'GEM') this.gemsEarned += 1;

    // Mission tracking per object type
    if (o.type === 'FRUIT') Missions.track('fruits', 1);
    if (o.type === 'COIN')  Missions.track('coins', coins);
    if (o.type === 'GEM')   Missions.track('gems', 1);
    if (o.type === 'STAR')  Missions.track('stars', 1);
    Missions.track('maxCombo', this.combo);

    // Effects
    this.particles.burst(o.x, o.y, 14, { color: o.meta.color, life: 0.7 });
    this.floats.add(o.x, o.y - 20, `+${points}`, o.meta.color, o.type === 'STAR' ? 30 : 22);
    audio.play(o.type === 'COIN' ? 'coin' : o.type === 'GEM' ? 'gem' : o.type === 'STAR' ? 'star' : 'coin');

    // Combo display
    if (this.combo >= 3 && this.combo % 1 === 0) {
      if ([3, 5, 10, 15, 20].includes(this.combo)) {
        UI.showCombo(`COMBO x${this.combo}`);
        audio.play('combo');
      }
    }
  }
  endLevel(won) {
    this.running = false;
    const s = SaveManager.data;
    s.coins += this.coinsEarned;
    s.gems += this.gemsEarned;
    if (this.score > s.bestScore) s.bestScore = this.score;
    if (this.bestCombo > s.bestCombo) s.bestCombo = this.bestCombo;

    // Aggregate lifetime stats
    s.totalCoins = (s.totalCoins || 0) + this.coinsEarned;
    s.totalGems = (s.totalGems || 0) + this.gemsEarned;
    s.totalCatches = (s.totalCatches || 0) + this.totalCatches;

    if (won) {
      // Star rating: 1★ = clear; 2★ = 1.5x target; 3★ = 2x target OR perfect
      let stars = 1;
      if (this.score >= this.level.target * 1.5) stars = 2;
      if (this.score >= this.level.target * 2 || this.perfectRun) stars = 3;
      s.levelStars[this.level.id] = Math.max(s.levelStars[this.level.id] || 0, stars);
      s.stars += stars;
      s.levelsCompleted = Math.max(s.levelsCompleted, this.level.id);
      if (this.perfectRun) s.perfectLevels = (s.perfectLevels || 0) + 1;
      // Mission progress
      Missions.track('levels', 1);
      if (this.perfectRun) Missions.track('perfect', 1);
      // Sync to backend leaderboard (best-effort, no blocking)
      Leaderboard.submit(this.score, this.bestCombo, this.level.id);
      audio.play('victory');
    } else {
      audio.play('gameover');
    }
    SaveManager.save();
    this.checkAchievements();
    if (won) UI.showVictory(this); else UI.showGameOver(this);
  }
  checkAchievements() {
    const s = SaveManager.data;
    for (const a of ACHIEVEMENTS) {
      if (s.achievements[a.id]) continue;
      if (a.check(s) >= a.goal) {
        s.achievements[a.id] = true;
        UI.toast(`🏆 Achievement: ${a.name}`, 'success');
        // Reward
        s.coins += 25; s.gems += 1;
      }
    }
    SaveManager.save();
  }
  draw() {
    const ctx = this.ctx;
    const sx = this.shake > 0 ? rand(-8, 8) * this.shake : 0;
    const sy = this.shake > 0 ? rand(-8, 8) * this.shake : 0;
    ctx.save();
    ctx.translate(sx, sy);
    this.background.draw(ctx);
    // Objects
    for (const o of this.objects) o.draw(ctx);
    // Player
    this.player.draw(ctx);
    // Particles
    this.particles.draw(ctx);
    // Floats
    this.floats.draw(ctx);
    ctx.restore();
    // Flash overlay
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 71, 87, ${this.flash * 0.4})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }
}

// ---------- UI Controller -----------
const UI = {
  game: null,
  screens: ['loading', 'menu', 'levels', 'shop', 'achievements', 'daily', 'settings', 'game'],
  init() {
    // Screen navigation
    document.querySelectorAll('[data-action]').forEach((el) => {
      el.addEventListener('click', (e) => {
        audio.play('click');
        this.handleAction(el.getAttribute('data-action'));
      });
    });
    // Menu tiles
    document.querySelector('#menu').addEventListener('click', (e) => {
      const b = e.target.closest('[data-action]'); if (!b) return;
    });
    // Shop tabs
    document.querySelectorAll('.tab').forEach((t) => {
      t.addEventListener('click', () => {
        const shopTab = t.getAttribute('data-shop-tab');
        const lbTab   = t.getAttribute('data-lb-tab');
        if (shopTab) {
          document.querySelectorAll('.tab[data-shop-tab]').forEach((x) => x.classList.remove('active'));
          t.classList.add('active');
          this.renderShop(shopTab);
        } else if (lbTab) {
          document.querySelectorAll('.tab[data-lb-tab]').forEach((x) => x.classList.remove('active'));
          t.classList.add('active');
          this.renderLeaderboard(lbTab);
        }
      });
    });
    // Pause button
    document.getElementById('pause-btn').addEventListener('click', () => this.togglePause());
    // Settings
    const musicVol = document.getElementById('music-vol');
    const sfxVol = document.getElementById('sfx-vol');
    const musicVal = document.getElementById('music-val');
    const sfxVal = document.getElementById('sfx-val');
    const settingName = document.getElementById('setting-name');
    const reducedMotion = document.getElementById('reduced-motion');
    musicVol.addEventListener('input', () => {
      musicVal.textContent = `${musicVol.value}%`;
      SaveManager.data.settings.music = +musicVol.value;
      audio.setVolumes(SaveManager.data.settings.music, SaveManager.data.settings.sfx);
      SaveManager.save();
    });
    sfxVol.addEventListener('input', () => {
      sfxVal.textContent = `${sfxVol.value}%`;
      SaveManager.data.settings.sfx = +sfxVol.value;
      audio.setVolumes(SaveManager.data.settings.music, SaveManager.data.settings.sfx);
      SaveManager.save();
    });
    settingName.addEventListener('input', () => {
      SaveManager.data.player = settingName.value.trim();
      SaveManager.save();
      this.updateMenu();
    });
    reducedMotion.addEventListener('change', () => {
      SaveManager.data.settings.reducedMotion = reducedMotion.checked;
      document.body.classList.toggle('reduced-motion', reducedMotion.checked);
      SaveManager.save();
    });
    document.getElementById('reset-progress').addEventListener('click', () => {
      if (confirm('Reset ALL progress? This cannot be undone.')) {
        SaveManager.reset();
        location.reload();
      }
    });

    // Name prompt
    document.getElementById('name-save').addEventListener('click', () => {
      const name = document.getElementById('name-input').value.trim() || 'Player';
      SaveManager.data.player = name;
      SaveManager.data.firstRun = false;
      SaveManager.save();
      this.hideOverlay('name-prompt');
      this.updateMenu();
      this.showScreen('menu');
    });

    // Daily
    document.getElementById('claim-daily').addEventListener('click', () => this.claimDaily());
    document.getElementById('spin-btn').addEventListener('click', () => this.spinWheel());
  },
  handleAction(action) {
    switch (action) {
      case 'play':
        // Start next uncompleted level or level 1
        const next = LEVELS.find(l => !SaveManager.data.levelStars[l.id]);
        this.game.startLevel(next ? next.id - 1 : 0);
        break;
      case 'levels': this.showScreen('levels'); this.renderLevels(); break;
      case 'shop': this.showScreen('shop'); this.renderShop('baskets'); break;
      case 'achievements': this.showScreen('achievements'); this.renderAchievements(); break;
      case 'leaderboard':  this.showScreen('leaderboard');  this.renderLeaderboard('score'); break;
      case 'missions':     this.showScreen('missions');     this.renderMissions(); break;
      case 'daily': this.showScreen('daily'); this.renderDaily(); break;
      case 'settings': this.showScreen('settings'); this.loadSettingsForm(); break;
      case 'back-menu': this.showScreen('menu'); this.updateMenu(); break;
      case 'resume': this.togglePause(); break;
      case 'restart': this.hideOverlay('pause'); this.game.startLevel(this.game.currentLevelIndex); break;
      case 'quit': this.hideOverlay('pause'); this.hideOverlay('gameover'); this.hideOverlay('victory'); this.showScreen('menu'); this.updateMenu(); break;
      case 'retry': this.hideOverlay('gameover'); this.game.startLevel(this.game.currentLevelIndex); break;
      case 'next-level':
        this.hideOverlay('victory');
        const nx = this.game.currentLevelIndex + 1;
        if (nx < LEVELS.length) this.game.startLevel(nx);
        else { UI.toast('🏆 You beat all levels!', 'success'); this.showScreen('menu'); this.updateMenu(); }
        break;
    }
  },
  showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  },
  showOverlay(id) { document.getElementById(id).classList.add('active'); },
  hideOverlay(id) { document.getElementById(id).classList.remove('active'); },
  togglePause() {
    if (!this.game.running) return;
    this.game.paused = !this.game.paused;
    if (this.game.paused) this.showOverlay('pause'); else this.hideOverlay('pause');
  },
  updateMenu() {
    const s = SaveManager.data;
    document.getElementById('menu-coins').textContent = s.coins;
    document.getElementById('menu-gems').textContent = s.gems;
    document.getElementById('menu-stars').textContent = s.stars;
    const eqBasket = CATALOG.baskets.find(b => s.shop.baskets[b.id]?.equipped);
    const eqTheme  = CATALOG.themes.find(t => s.shop.themes[t.id]?.equipped);
    const eqTrail  = CATALOG.trails.find(t => s.shop.trails[t.id]?.equipped);
    const preview = `${eqBasket ? eqBasket.emoji : '🧺'}${eqTrail && eqTrail.id !== 'none' ? eqTrail.emoji : ''}${eqTheme && eqTheme.id !== 'sunset' ? eqTheme.emoji : ''}`;
    document.getElementById('menu-player-name').textContent = `${preview} ${s.player || 'Player'}`;
    document.getElementById('menu-best').textContent = `Best: ${s.bestScore}`;
    document.getElementById('levels-coins').textContent = s.coins;
    document.getElementById('shop-coins').textContent = s.coins;
    document.getElementById('shop-gems').textContent = s.gems;
    // Also refresh in-game player emoji if a game is running
    if (this.game && this.game.player) this.game.player.refreshSkin();
  },
  updateHUD(g) {
    // Hearts
    const hEl = document.getElementById('hud-hearts');
    hEl.innerHTML = '';
    for (let i = 0; i < 3; i++) hEl.innerHTML += `<span>${i < g.hearts ? '❤️' : '🤍'}</span>`;
    document.getElementById('hud-coins').textContent = g.coinsEarned;
    document.getElementById('hud-score').textContent = g.score;
    document.getElementById('hud-level-label').textContent = g.level.name.toUpperCase();
    const pct = Math.min(100, (g.score / g.level.target) * 100);
    document.getElementById('hud-progress-fill').style.width = `${pct}%`;
    const mm = Math.max(0, Math.floor(g.timeLeft / 60));
    const ss = Math.max(0, Math.floor(g.timeLeft % 60));
    document.getElementById('hud-timer').textContent = `${mm}:${ss.toString().padStart(2, '0')}`;
  },
  updatePowerups(g) {
    const wrap = document.getElementById('powerup-display');
    wrap.innerHTML = '';
    for (const k of Object.keys(g.activePowerups)) {
      const el = document.createElement('div');
      el.className = 'pwr-pill';
      el.style.borderColor = POWERUP_META[k].color;
      el.innerHTML = `<span>${POWERUP_META[k].icon}</span><span>${g.activePowerups[k].toFixed(1)}s</span>`;
      wrap.appendChild(el);
    }
  },
  showCombo(text) {
    const el = document.getElementById('combo-display');
    el.textContent = text;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  },
  renderLevels() {
    const container = document.getElementById('worlds-container');
    container.innerHTML = '';
    for (let w = 0; w < WORLDS.length; w++) {
      const world = WORLDS[w];
      const worldLevels = LEVELS.filter(l => l.world === w);
      // A world "unlocks" once the previous world's last level was cleared
      const prevWorldLast = w > 0 ? LEVELS.filter(l => l.world === w - 1).slice(-1)[0] : null;
      const worldLocked = prevWorldLast && !SaveManager.data.levelStars[prevWorldLast.id];
      const cleared = worldLevels.filter(l => SaveManager.data.levelStars[l.id]).length;
      const div = document.createElement('div');
      div.className = 'world glass';
      div.innerHTML = `
        <div class="world-header">
          <div class="world-name">${world.emoji} ${world.name}${worldLocked ? ' 🔒' : ''}</div>
          <div class="world-count">${cleared} / ${worldLevels.length} cleared</div>
        </div>
        <div class="level-grid"></div>
      `;
      const grid = div.querySelector('.level-grid');
      for (const lvl of worldLevels) {
        const prev = LEVELS[lvl.id - 2];
        const locked = worldLocked || (lvl.id > 1 && !SaveManager.data.levelStars[prev.id]);
        const stars = SaveManager.data.levelStars[lvl.id] || 0;
        const cell = document.createElement('div');
        cell.className = `level-cell ${locked ? 'locked' : ''} ${stars ? 'completed' : ''} ${lvl.boss ? 'boss' : ''}`;
        cell.setAttribute('data-testid', `level-cell-${lvl.id}`);
        cell.innerHTML = `
          ${lvl.boss ? '<span class="lvl-boss-badge">BOSS</span>' : ''}
          <span class="lvl-num">${lvl.id}</span>
          <span class="lvl-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>
        `;
        if (!locked) cell.addEventListener('click', () => { audio.play('click'); this.game.startLevel(lvl.id - 1); });
        grid.appendChild(cell);
      }
      container.appendChild(div);
    }
  },
  renderShop(tab) {
    const grid = document.getElementById('shop-grid');
    grid.innerHTML = '';
    const items = CATALOG[tab];
    for (const it of items) {
      const state = SaveManager.data.shop[tab][it.id] || {};
      const owned = !!state.owned;
      const equipped = !!state.equipped;
      const card = document.createElement('div');
      card.className = `shop-item ${owned ? 'owned' : ''} ${equipped ? 'equipped' : ''}`;
      card.setAttribute('data-testid', `shop-item-${tab}-${it.id}`);
      const bg = ({
        common:    'linear-gradient(135deg, rgba(176,190,197,0.2), rgba(255,255,255,0.05))',
        rare:      'linear-gradient(135deg, rgba(79,195,247,0.2), rgba(78,205,196,0.1))',
        epic:      'linear-gradient(135deg, rgba(186,104,200,0.25), rgba(157,78,221,0.15))',
        legendary: 'linear-gradient(135deg, rgba(255,217,61,0.3), rgba(255,107,107,0.15))',
      })[it.rarity];
      card.innerHTML = `
        <div class="preview" style="background: ${bg};">${it.emoji}</div>
        <div class="name">${it.name}</div>
        <div class="rarity ${it.rarity}">${it.rarity}</div>
        <div class="price">${owned ? (equipped ? 'EQUIPPED' : 'OWNED') : `🪙 ${it.price}`}</div>
      `;
      card.addEventListener('click', () => {
        audio.play('click');
        if (!owned) {
          if (SaveManager.data.coins < it.price) return UI.toast('Not enough coins!', 'error');
          SaveManager.data.coins -= it.price;
          SaveManager.data.shop[tab][it.id] = { owned: true, equipped: false };
          SaveManager.save();
          UI.toast(`Purchased ${it.name}!`, 'success');
          this.updateMenu();
          this.renderShop(tab);
        } else if (!equipped) {
          for (const k of Object.keys(SaveManager.data.shop[tab])) {
            if (SaveManager.data.shop[tab][k]) SaveManager.data.shop[tab][k].equipped = false;
          }
          SaveManager.data.shop[tab][it.id].equipped = true;
          SaveManager.save();
          UI.toast(`${it.name} equipped!`, 'success');
          if (this.game.player) this.game.player.refreshSkin();
          this.updateMenu();
          this.renderShop(tab);
        }
      });
      grid.appendChild(card);
    }
  },
  renderMissions() {
    Missions.ensureToday();
    const m = SaveManager.data.missions;
    document.getElementById('missions-refresh').textContent = Missions.timeUntilRefresh();
    const list = document.getElementById('missions-list');
    list.innerHTML = '';
    for (const id of m.active) {
      const tpl = MISSION_TEMPLATES.find(t => t.id === id);
      if (!tpl) continue;
      const cur = m.progress[id] || 0;
      const done = cur >= tpl.goal;
      const claimed = !!m.claimed[id];
      const pct = Math.min(100, (cur / tpl.goal) * 100);
      const card = document.createElement('div');
      card.className = `mission-card ${done ? 'complete' : ''} ${claimed ? 'claimed' : ''}`;
      card.setAttribute('data-testid', `mission-card-${tpl.id}`);
      const rewardText = `${tpl.reward.coins ? tpl.reward.coins + '🪙 ' : ''}${tpl.reward.gems ? tpl.reward.gems + '💎' : ''}`;
      card.innerHTML = `
        <div class="mission-icon">${tpl.icon}</div>
        <div class="mission-body">
          <h3>${tpl.name}${claimed ? ' ✅' : ''}</h3>
          <div class="desc">${tpl.desc}</div>
          <div class="mission-bar"><div class="mission-bar-fill" style="width:${pct}%"></div></div>
          <span class="progress-text">${Math.min(cur, tpl.goal)} / ${tpl.goal}</span>
        </div>
        <div class="mission-reward">
          <div class="amount">${rewardText}</div>
          <button class="mission-claim-btn ${claimed ? 'claimed' : ''}" data-mission-id="${tpl.id}" ${done && !claimed ? '' : 'disabled'}>${claimed ? 'CLAIMED' : done ? 'CLAIM' : 'LOCKED'}</button>
        </div>
      `;
      list.appendChild(card);
    }
    // Wire claim buttons
    list.querySelectorAll('.mission-claim-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-mission-id');
        if (Missions.claim(id)) {
          audio.play('victory');
          UI.toast('🎁 Mission reward claimed!', 'success');
          UI.updateMenu();
          UI.renderMissions();
        }
      });
    });
  },

  async renderLeaderboard(tab) {
    const s = SaveManager.data;
    const you = {
      name: s.player || 'You',
      avatar: (CATALOG.baskets.find(b => s.shop.baskets[b.id]?.equipped) || {}).emoji || '🧺',
      score: s.bestScore || 0,
      combo: s.bestCombo || 0,
      level: s.levelsCompleted || 0,
      isYou: true,
      player_id: Leaderboard.playerId,
    };
    // Merge: seeded + live backend entries
    const live = await Leaderboard.fetchTop();
    const liveMapped = (live || [])
      .filter(e => e.player_id !== Leaderboard.playerId)
      .map(e => ({ name: e.name, avatar: e.avatar || '🧺', score: e.score, combo: e.combo, level: e.level, isYou: false, live: true }));
    const all = [you, ...LB_SEED.map(e => ({ ...e, isYou: false })), ...liveMapped];
    const keyMap = { score: 'score', combo: 'combo', level: 'level' };
    const unitMap = { score: 'pts', combo: 'x', level: 'lvl' };
    const key = keyMap[tab];
    all.sort((a, b) => b[key] - a[key]);

    // Podium (top 3): silver-1, gold-0, bronze-2 (visual order)
    const podium = document.getElementById('lb-podium');
    podium.innerHTML = '';
    const podiumOrder = [1, 0, 2]; // silver, gold, bronze
    const rankStyle = ['gold', 'silver', 'bronze'];
    podiumOrder.forEach(i => {
      const p = all[i]; if (!p) return;
      const slot = document.createElement('div');
      slot.className = `podium-slot ${rankStyle[i]} ${p.isYou ? 'you' : ''}`;
      slot.innerHTML = `
        <div class="rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</div>
        <div class="avatar">${p.avatar}</div>
        <div class="name">${p.name}${p.live ? ' 🌐' : ''}</div>
        <div class="val">${p[key]}<span class="unit"> ${unitMap[tab]}</span></div>
      `;
      podium.appendChild(slot);
    });

    // Full list (4th place onward)
    const list = document.getElementById('lb-list');
    list.innerHTML = '';
    all.slice(3).forEach((p, i) => {
      const rank = i + 4;
      const row = document.createElement('div');
      row.className = `lb-row ${p.isYou ? 'you' : ''}`;
      row.innerHTML = `
        <div class="lb-rank">#${rank}</div>
        <div class="lb-avatar">${p.avatar}</div>
        <div class="lb-name">${p.name}${p.isYou ? ' <span class="sub">that\'s you!</span>' : (p.live ? ' <span class="sub">🌐 online</span>' : '')}</div>
        <div class="lb-val">${p[key]}<span class="unit"> ${unitMap[tab]}</span></div>
      `;
      list.appendChild(row);
    });
  },

  renderAchievements() {
    const grid = document.getElementById('ach-grid');
    grid.innerHTML = '';
    for (const a of ACHIEVEMENTS) {
      const s = SaveManager.data;
      const cur = Math.min(a.check(s) || 0, a.goal);
      const unlocked = !!s.achievements[a.id];
      const card = document.createElement('div');
      card.className = `ach-card ${unlocked ? 'unlocked' : 'locked'}`;
      card.innerHTML = `
        <div class="ach-icon">${a.icon}</div>
        <div class="ach-info" style="flex:1;">
          <h3>${a.name}${unlocked ? ' ✅' : ''}</h3>
          <p>${a.desc}</p>
          <div class="ach-bar"><div class="ach-bar-fill" style="width:${(cur / a.goal) * 100}%"></div></div>
          <p style="text-align:right;margin:4px 0 0;font-family:var(--font-mono)">${cur} / ${a.goal}</p>
        </div>
      `;
      grid.appendChild(card);
    }
  },
  renderDaily() {
    const s = SaveManager.data;
    const today = new Date().toDateString();
    const grid = document.getElementById('daily-days');
    grid.innerHTML = '';
    const rewards = [10, 20, 30, 50, 75, 100, 200];
    const claimed = s.daily.streak || 0;
    for (let i = 0; i < 7; i++) {
      const d = document.createElement('div');
      const isClaimed = i < claimed;
      const isToday = i === claimed && s.daily.lastClaim !== today;
      d.className = `day-cell ${isClaimed ? 'claimed' : ''} ${isToday ? 'today' : ''}`;
      d.innerHTML = `<div class="day-num">DAY ${i + 1}</div><div class="day-emoji">🎁</div><div style="font-weight:700">${rewards[i]}🪙</div>`;
      grid.appendChild(d);
    }
    document.getElementById('daily-status').textContent =
      s.daily.lastClaim === today ? '✅ Already claimed today. Come back tomorrow!' : `Streak: ${claimed} days.`;
    // Wheel prize labels (matches WHEEL_PRIZES order)
    const wl = document.getElementById('wheel-labels');
    wl.innerHTML = '';
    WHEEL_PRIZES.forEach((prize, i) => {
      const angle = i * 45 + 22.5; // center of segment
      const lbl = document.createElement('div');
      lbl.className = 'wheel-label';
      lbl.style.transform = `rotate(${angle}deg) translateY(-72px) rotate(-${angle}deg)`;
      lbl.innerHTML = `<div style="font-size:11px;opacity:.85">🪙</div><div style="font-family:var(--font-display);font-size:14px">${prize}</div>`;
      wl.appendChild(lbl);
    });
  },
  claimDaily() {
    const s = SaveManager.data;
    const today = new Date().toDateString();
    if (s.daily.lastClaim === today) return UI.toast('Already claimed today!', 'warn');
    const rewards = [10, 20, 30, 50, 75, 100, 200];
    const day = Math.min(s.daily.streak || 0, 6);
    const reward = rewards[day];
    s.coins += reward;
    s.daily.streak = (s.daily.streak || 0) + 1;
    if (s.daily.streak > 7) s.daily.streak = 1;
    s.daily.lastClaim = today;
    SaveManager.save();
    audio.play('coin');
    UI.toast(`Claimed ${reward} coins! 🪙`, 'success');
    this.renderDaily();
    this.updateMenu();
  },
  spinWheel() {
    const s = SaveManager.data;
    const today = new Date().toDateString();
    if (s.daily.spinDate === today) return UI.toast('Already spun today!', 'warn');
    const wheel = document.getElementById('wheel');
    // Choose landing segment
    const idx = randInt(0, 7);
    // Pointer is at top (0°). Segment i center is at (i*45 + 22.5)°.
    // We want segment idx centered under pointer, so rotate so that -angle lands there.
    const target = 360 * 5 - (idx * 45 + 22.5);
    wheel.style.transform = `rotate(${target}deg)`;
    setTimeout(() => {
      const reward = WHEEL_PRIZES[idx];
      s.coins += reward;
      s.daily.spinDate = today;
      SaveManager.save();
      audio.play('victory');
      UI.toast(`🎡 Won ${reward} coins!`, 'success');
      this.updateMenu();
    }, 4200);
  },
  loadSettingsForm() {
    const s = SaveManager.data;
    document.getElementById('setting-name').value = s.player;
    document.getElementById('music-vol').value = s.settings.music;
    document.getElementById('sfx-vol').value = s.settings.sfx;
    document.getElementById('music-val').textContent = `${s.settings.music}%`;
    document.getElementById('sfx-val').textContent = `${s.settings.sfx}%`;
    document.getElementById('reduced-motion').checked = s.settings.reducedMotion;
  },
  showGameOver(g) {
    document.getElementById('gameover-title').textContent = g.hearts <= 0 ? '💥 Game Over' : g.score >= g.level.target ? 'Time Up!' : 'Not Enough Points';
    document.getElementById('go-score').textContent = g.score;
    document.getElementById('go-coins').textContent = g.coinsEarned;
    document.getElementById('go-combo').textContent = `x${g.bestCombo}`;
    document.getElementById('go-best').textContent = SaveManager.data.bestScore;
    this.showOverlay('gameover');
  },
  showVictory(g) {
    let stars = 1;
    if (g.score >= g.level.target * 1.5) stars = 2;
    if (g.score >= g.level.target * 2 || g.perfectRun) stars = 3;
    document.getElementById('stars-earned').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    document.getElementById('v-score').textContent = g.score;
    document.getElementById('v-coins').textContent = g.coinsEarned;
    document.getElementById('v-combo').textContent = `x${g.bestCombo}`;
    this.showOverlay('victory');
  },
  toast(text, kind = '') {
    const wrap = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3800);
  },

  // ---------- Menu ambient animation (parallax falling objects) ----------
  menuAnim: {
    canvas: null, ctx: null, items: [], raf: 0, running: false,
    start() {
      if (this.running) return;
      this.canvas = document.getElementById('menu-canvas');
      this.ctx = this.canvas.getContext('2d');
      this.resize();
      window.addEventListener('resize', () => this.resize());
      const emojis = ['🪙', '💎', '⭐', '🍎', '🍇', '🍒', '✨'];
      this.items = [];
      for (let i = 0; i < 22; i++) {
        this.items.push({
          x: Math.random(), y: Math.random(),
          vy: 20 + Math.random() * 40,
          size: 22 + Math.random() * 22,
          rot: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 1.4,
          alpha: 0.25 + Math.random() * 0.35,
          emoji: emojis[Math.floor(Math.random() * emojis.length)],
          wobble: Math.random() * Math.PI * 2,
        });
      }
      this.running = true;
      this.lastTime = performance.now();
      this.loop();
    },
    resize() {
      if (!this.canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = window.innerWidth * dpr;
      this.canvas.height = window.innerHeight * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    loop() {
      if (!this.running) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;
      const w = window.innerWidth, h = window.innerHeight;
      const ctx = this.ctx;
      ctx.clearRect(0, 0, w, h);
      for (const it of this.items) {
        it.y += (it.vy * dt) / h;
        it.wobble += dt * 2;
        it.rot += it.rotSpeed * dt;
        if (it.y > 1.1) { it.y = -0.1; it.x = Math.random(); }
        const x = it.x * w + Math.sin(it.wobble) * 20;
        const y = it.y * h;
        ctx.save();
        ctx.globalAlpha = it.alpha;
        ctx.translate(x, y);
        ctx.rotate(it.rot);
        ctx.font = `${it.size}px "Fredoka", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowBlur = 12;
        ctx.shadowColor = 'rgba(255,217,61,0.4)';
        ctx.fillText(it.emoji, 0, 0);
        ctx.restore();
      }
      this.raf = requestAnimationFrame(() => this.loop());
    },
  },

  rotateTip() {
    const tips = [
      'Catch coins to build a combo — but avoid the bombs!',
      'Powerups appear only twice per level — grab them fast.',
      'A perfect (no-damage) run always earns 3 stars ⭐.',
      'Finish every level in a world to unlock the next theme.',
      'Time speeds up as you get deeper into a level — stay sharp!',
      'Shop skins are cosmetic and buff nothing but style 😎.',
      'Missions refresh at midnight. Come back for fresh challenges.',
      'On mobile? Drag anywhere on the screen to move the basket.',
    ];
    const el = document.getElementById('menu-tip-text');
    if (!el) return;
    let idx = 0;
    setInterval(() => {
      idx = (idx + 1) % tips.length;
      el.style.opacity = '0';
      setTimeout(() => {
        el.textContent = tips[idx];
        el.style.opacity = '1';
      }, 250);
    }, 5000);
    el.textContent = tips[0];
    el.style.transition = 'opacity .3s';
  },
};

// ---------- Boot -----------
function boot() {
  SaveManager.load();
  Leaderboard.init();
  audio.setVolumes(SaveManager.data.settings.music, SaveManager.data.settings.sfx);
  if (SaveManager.data.settings.reducedMotion) document.body.classList.add('reduced-motion');

  const game = new Game();
  UI.game = game;
  UI.init();
  UI.updateMenu();
  UI.menuAnim.start();
  UI.rotateTip();

  // Fast loading animation (~500ms) — assets are inline, no need to fake-load for long
  let p = 0;
  const bar = document.getElementById('loader-fill');
  const txt = document.getElementById('loader-text');
  const steps = ['Loading assets…', 'Building levels…', 'Tuning physics…', 'Ready!'];
  const iv = setInterval(() => {
    p += 25 + Math.random() * 15; // 25–40% per tick
    if (p >= 100) p = 100;
    bar.style.width = `${p}%`;
    txt.textContent = steps[Math.min(steps.length - 1, Math.floor(p / 26))];
    if (p >= 100) {
      clearInterval(iv);
      setTimeout(() => {
        UI.showScreen('menu');
        if (SaveManager.data.firstRun || !SaveManager.data.player) UI.showOverlay('name-prompt');
      }, 150);
    }
  }, 90);

  // Initialize audio on first user gesture
  const initAudioOnce = () => {
    audio.init();
    audio.setVolumes(SaveManager.data.settings.music, SaveManager.data.settings.sfx);
    document.removeEventListener('pointerdown', initAudioOnce);
    document.removeEventListener('keydown', initAudioOnce);
  };
  document.addEventListener('pointerdown', initAudioOnce);
  document.addEventListener('keydown', initAudioOnce);
}

let __booted = false;
function safeBoot() { if (__booted) return; __booted = true; boot(); }
document.addEventListener('DOMContentLoaded', safeBoot);
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(safeBoot, 0);
}
})();
