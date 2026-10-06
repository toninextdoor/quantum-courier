'use strict';
const express = require('express');
const http = require('node:http');
const path = require('node:path');
const { randomInt } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { Server } = require('socket.io');
const W = 28, H = 24, DT = 0.05, ROUND = 180000, QUOTA = 600, RADIUS = 0.28;
const HOME = { x: 3.5, z: 20.5, r: 1.8 };
const WALLS = [
  { x: 0, z: 0, w: W, d: 1 }, { x: 0, z: H - 1, w: W, d: 1 },
  { x: 0, z: 1, w: 1, d: H - 2 }, { x: W - 1, z: 1, w: 1, d: H - 2 },
  { x: 8, z: 2, w: 1, d: 7 }, { x: 8, z: 12, w: 1, d: 9 },
  { x: 18, z: 4, w: 1, d: 9 }, { x: 18, z: 17, w: 1, d: 5 },
  { x: 10, z: 9, w: 6, d: 1 }, { x: 2, z: 16, w: 4, d: 1 },
  { x: 11, z: 16, w: 5, d: 1 }, { x: 21, z: 16, w: 5, d: 1 },
  { x: 3, z: 5, w: 2, d: 2 }, { x: 22, z: 7, w: 2, d: 2 }
];
const HAZARDS = [{ x: 6, z: 11, r: 0.9 }, { x: 15, z: 13, r: 1 }, { x: 22, z: 19, r: 1 }];
const CARGO = [
  ['NEON RELIC', 150, 5.5, 19.5, 'relic'], ['PHASE CORE', 210, 4.5, 12.5, 'core'],
  ['GLASS SIGNAL', 180, 3.5, 3.5, 'vase'], ['ION CELL', 160, 11.5, 5.5, 'core'],
  ['OLD WORLD TV', 250, 14.5, 19.5, 'tv'], ['CHROME IDOL', 240, 23.5, 12.5, 'relic'],
  ['PRISM VESSEL', 220, 24.5, 3.5, 'vase'], ['VOID RECEIVER', 280, 24.5, 21.5, 'tv']
];
const PATROL = [{ x: 24.5, z: 3.5 }, { x: 24.5, z: 20.5 }, { x: 12.5, z: 20.5 }, { x: 12.5, z: 3.5 }];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function solid(x, z, radius = RADIUS) {
  return WALLS.some(b => Math.hypot(x - clamp(x, b.x, b.x + b.w), z - clamp(z, b.z, b.z + b.d)) < radius);
}
function clearLine(a, b) {
  const steps = Math.ceil(dist(a, b) * 5);
  for (let i = 1; i < steps; i++) if (solid(a.x + (b.x - a.x) * i / steps, a.z + (b.z - a.z) * i / steps, 0.05)) return false;
  return true;
}
// Grid BFS gives the sentinel a real route through doorways rather than wall clipping.
function route(a, b) {
  const start = [Math.floor(a.x), Math.floor(a.z)], end = [Math.floor(b.x), Math.floor(b.z)];
  const key = (x, z) => `${x},${z}`;
  const queue = [start], parents = new Map([[key(...start), null]]);
  let found = false;
  for (let i = 0; i < queue.length; i++) {
    const [x, z] = queue[i];
    if (x === end[0] && z === end[1]) { found = true; break; }
    for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx, nz = z + dz, k = key(nx, nz);
      if (nx < 1 || nx >= W - 1 || nz < 1 || nz >= H - 1 || parents.has(k) || solid(nx + 0.5, nz + 0.5, 0.3)) continue;
      parents.set(k, [x, z]); queue.push([nx, nz]);
    }
  }
  if (!found) return [];
  const result = []; let current = end;
  while (current && (current[0] !== start[0] || current[1] !== start[1])) {
    result.push({ x: current[0] + 0.5, z: current[1] + 0.5 }); current = parents.get(key(...current));
  }
  return result.reverse();
}
function freshGame(players, now) {
  return {
    started: now, deadline: now + ROUND, elapsed: 0, score: 0, deliveries: 0, catches: 0, damage: 0,
    actors: players.filter(p => p.role !== 'Navigator').map((p, i) => ({ id: p.id, name: p.name, x: 3 + i * 0.7, z: 20.5, yaw: 0, carrying: null, safeUntil: now + 3000, bumpAt: -Infinity, speed: 0, steps: 0 })),
    items: CARGO.map(([name, value, x, z, kind], id) => ({ id, name, value, x, z, kind, condition: 100, carrier: null, delivered: false })),
    enemy: { x: 24.5, z: 5.5, yaw: 0, mode: 'patrol', target: null, patrol: 0, path: [], recalc: 0 },
    ping: null, cue: null, eventId: 0, event: 'Shift started. Find valuables and return them to the green extraction pad.', outcome: null
  };
}
function createGameServer() {
  const app = express(), server = http.createServer(app);
  const io = new Server(server, { maxHttpBufferSize: 8192 });
  const rooms = new Map();
  app.get('/vendor/three.module.js', (_req, res) => res.sendFile(path.join(__dirname, 'node_modules/three/build/three.module.js')));
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('/health', (_req, res) => res.json({ ok: true, version: '2.0.0' }));
  function roles(room) { room.players.forEach((p, i) => { p.role = i === 0 ? 'Navigator' : 'Scavenger'; p.input = {}; p.inputAt = 0; }); }
  function roster(room) {
    io.to(room.code).emit('lobby', { code: room.code, host: room.players[0]?.id, phase: room.phase, notice: room.notice || '', players: room.players.map(({ id, name, role }) => ({ id, name, role })) });
  }
  function event(g, text, kind = 'info') { g.eventId++; g.event = text; g.eventKind = kind; }
  function cargoDamage(g, item, amount) {
    if (!item) return;
    const before = item.condition; item.condition = Math.max(10, item.condition - amount);
    g.damage += Math.round(item.value * (before - item.condition) / 100);
  }
  function resetActor(room, a, now, cause) {
    const g = room.game;
    if (now < a.safeUntil || dist(a, HOME) < HOME.r) return;
    if (a.carrying !== null) {
      const item = g.items[a.carrying]; item.carrier = null; item.x = a.x; item.z = a.z;
      cargoDamage(g, item, cause === 'sentinel' ? 35 : 20); a.carrying = null;
    }
    a.x = HOME.x; a.z = HOME.z; a.speed = 0; a.safeUntil = now + 3000;
    g.deadline -= cause === 'sentinel' ? 10000 : 5000;
    if (cause === 'sentinel') g.catches++;
    event(g, `${a.name}: ${cause === 'sentinel' ? 'caught by the Sentinel. −10s' : 'stepped into a breach. −5s'}. Cargo dropped; returned to extraction.`, 'danger');
  }
  function finish(room, outcome) {
    room.phase = 'finished'; room.game.outcome = outcome; room.game.finalRemaining = Math.max(0, (room.game.deadline - performance.now()) / 1000);
    event(room.game, outcome === 'won' ? 'QUOTA SECURED. Extraction complete.' : 'SHIFT CLOSED. Quota missed.', outcome === 'won' ? 'success' : 'danger');
  }
  function tick(room, now) {
    const g = room.game;
    if (now >= g.deadline) { finish(room, 'lost'); return; }
    g.elapsed += DT;
    for (const a of g.actors) {
      const p = room.players.find(p => p.id === a.id), input = now - p.inputAt < 350 ? p.input : {};
      let forward = (input.forward || 0), strafe = (input.strafe || 0), n = Math.max(1, Math.hypot(forward, strafe));
      forward /= n; strafe /= n;
      const carrying = a.carrying !== null;
      const speed = carrying ? (input.sprint ? 2.8 : 2.05) : (input.sprint ? 4.6 : 3.15);
      a.yaw = Number.isFinite(input.yaw) ? input.yaw : a.yaw;
      const dx = (Math.sin(a.yaw) * forward + Math.cos(a.yaw) * strafe) * speed * DT;
      const dz = (-Math.cos(a.yaw) * forward + Math.sin(a.yaw) * strafe) * speed * DT;
      const old = { x: a.x, z: a.z };
      let bumped = false;
      if (!solid(a.x + dx, a.z)) a.x += dx; else bumped = true;
      if (!solid(a.x, a.z + dz)) a.z += dz; else bumped = true;
      a.speed = dist(a, old) / DT; a.steps += a.speed * DT;
      if (carrying && bumped && input.sprint && now - a.bumpAt > 1100) {
        cargoDamage(g, g.items[a.carrying], 12); a.bumpAt = now;
        event(g, `${a.name} bumped the cargo! Slow down near walls.`, 'damage');
      }
      if (HAZARDS.some(h => dist(a, h) < h.r + RADIUS)) resetActor(room, a, now, 'breach');
      if (a.carrying !== null) {
        const item = g.items[a.carrying]; item.x = a.x; item.z = a.z;
        if (dist(a, HOME) < HOME.r) {
          const value = Math.round(item.value * item.condition / 100);
          item.delivered = true; item.carrier = null; a.carrying = null; g.score += value; g.deliveries++;
          event(g, `${a.name} extracted ${item.name}: +$${value}.`, 'success');
          if (g.score >= QUOTA) { finish(room, 'won'); return; }
        }
      }
    }
    const enemy = g.enemy;
    const targets = g.actors.filter(a => now >= a.safeUntil && dist(a, HOME) > HOME.r + 1 && ((dist(a, enemy) < 7.5 && clearLine(enemy, a)) || (a.speed > 3.5 && dist(a, enemy) < 10)));
    targets.sort((a, b) => dist(a, enemy) - dist(b, enemy));
    const target = targets[0]; enemy.mode = target ? 'hunting' : 'patrol'; enemy.target = target?.id || null;
    const destination = target || PATROL[enemy.patrol];
    if (!target && dist(enemy, destination) < 0.65) { enemy.patrol = (enemy.patrol + 1) % PATROL.length; enemy.recalc = 0; }
    if (now >= enemy.recalc) { enemy.path = route(enemy, target || PATROL[enemy.patrol]); enemy.recalc = now + 450; }
    let waypoint = enemy.path[0];
    if (waypoint && dist(enemy, waypoint) < 0.15) { enemy.path.shift(); waypoint = enemy.path[0]; }
    if (!waypoint && target && clearLine(enemy, target)) waypoint = target;
    if (waypoint) {
      const distance = dist(enemy, waypoint), stride = Math.min(distance, (target ? 2.15 : 1.3) * DT);
      if (distance > 0.001) {
        const dx = (waypoint.x - enemy.x) / distance * stride, dz = (waypoint.z - enemy.z) / distance * stride;
        enemy.yaw = Math.atan2(dx, -dz);
        if (!solid(enemy.x + dx, enemy.z, 0.3)) enemy.x += dx;
        if (!solid(enemy.x, enemy.z + dz, 0.3)) enemy.z += dz;
      }
    }
    for (const a of g.actors) if (dist(a, enemy) < 0.7) resetActor(room, a, now, 'sentinel');
    if (now >= g.deadline) finish(room, 'lost');
  }
  function snapshot(room, now) {
    const g = room.game;
    for (const p of room.players) {
      const me = g.actors.find(a => a.id === p.id), navigator = p.role === 'Navigator';
      // Scavengers get nearby entities only; the tactical overview belongs to Navigator.
      const visible = object => navigator || (me && dist(me, object) < 1.8 && clearLine(me, object));
      io.to(p.id).emit('state', {
        roundId: g.started, phase: room.phase, role: p.role, remaining: room.phase === 'finished' ? g.finalRemaining : Math.max(0, (g.deadline - now) / 1000),
        quota: QUOTA, score: g.score, deliveries: g.deliveries, catches: g.catches, damage: g.damage,
        actors: g.actors.map(a => ({ id: a.id, name: a.name, x: a.x, z: a.z, yaw: a.yaw, carrying: a.carrying, speed: a.speed, safe: now < a.safeUntil })),
        items: g.items.filter(i => !i.delivered && (i.carrier === p.id || visible(i))).map(i => ({ ...i })),
        enemy: navigator ? { x: g.enemy.x, z: g.enemy.z, yaw: g.enemy.yaw, mode: g.enemy.mode, target: g.enemy.target } : null,
        ping: g.ping && now < g.ping.until ? g.ping : null, cue: g.cue && now < g.cue.until ? g.cue : null,
        eventId: g.eventId, event: g.event, eventKind: g.eventKind || 'info', outcome: g.outcome,
        elapsed: g.elapsed
      });
    }
  }
  function leave(socket) {
    const room = rooms.get(socket.data.code);
    socket.leave(socket.data.code || ''); socket.data.code = null;
    if (!room) return;
    room.players = room.players.filter(p => p.id !== socket.id);
    if (!room.players.length) { rooms.delete(room.code); return; }
    if (room.phase === 'playing') { room.phase = 'lobby'; room.game = null; room.notice = 'A teammate disconnected. Roles reassigned; launch a fresh shift.'; }
    roles(room); roster(room);
  }
  io.on('connection', socket => {
    let lastEnter = -Infinity, lastChat = -Infinity, lastInteract = -Infinity, lastGuide = -Infinity;
    socket.on('enter', (data, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {}, now = performance.now();
      if (now - lastEnter < 400) return reply({ error: 'Wait a moment before trying again.' });
      lastEnter = now;
      if (!data || typeof data !== 'object') return reply({ error: 'Invalid room request.' });
      if (socket.data.code) return reply({ error: 'Leave your room first.' });
      const name = typeof data.name === 'string' ? data.name.trim().slice(0, 18) : '';
      if (!name) return reply({ error: 'Enter your callsign first.' });
      let room;
      if (data.create === true) {
        if (rooms.size >= 500) return reply({ error: 'Server full. Try again later.' });
        let code; do { code = Array.from({ length: 4 }, () => String.fromCharCode(65 + randomInt(26))).join(''); } while (rooms.has(code));
        room = { code, phase: 'lobby', players: [], game: null }; rooms.set(code, room);
      } else {
        const code = typeof data.code === 'string' ? data.code.trim().toUpperCase() : '';
        if (!/^[A-Z]{4}$/.test(code)) return reply({ error: 'Room codes have four letters.' });
        room = rooms.get(code);
        if (!room) return reply({ error: 'Room not found. Check the code.' });
        if (room.phase === 'playing') return reply({ error: 'Shift in progress. Join when it ends.' });
        if (room.players.length === 4) return reply({ error: 'Room full (4/4).' });
      }
      room.players.push({ id: socket.id, name, input: {}, inputAt: 0 }); roles(room);
      socket.data.code = room.code; socket.join(room.code); reply({ ok: true }); roster(room);
    });
    socket.on('start', (_data, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {}, room = rooms.get(socket.data.code);
      if (!room || room.players[0]?.id !== socket.id) return reply({ error: 'The host launches the shift.' });
      if (room.players.length < 2) return reply({ error: 'Need a Navigator and at least one Scavenger.' });
      if (room.phase === 'playing') return reply({ error: 'Shift already running.' });
      roles(room); room.phase = 'playing'; room.notice = ''; room.game = freshGame(room.players, performance.now());
      reply({ ok: true }); roster(room);
      for (const p of room.players) io.to(p.id).emit('world', { width: W, depth: H, walls: WALLS, hazards: p.role === 'Navigator' ? HAZARDS : [], home: HOME, quota: QUOTA, duration: ROUND / 1000 });
      snapshot(room, performance.now());
    });
    socket.on('input', data => {
      const room = rooms.get(socket.data.code), player = room?.players.find(p => p.id === socket.id), now = performance.now();
      if (!player || player.role === 'Navigator' || room.phase !== 'playing' || !data || typeof data !== 'object' || now - player.inputAt < 15) return;
      const axis = key => typeof data[key] === 'number' && Number.isFinite(data[key]) ? clamp(data[key], -1, 1) : 0;
      const actor = room.game.actors.find(a => a.id === socket.id);
      player.input = { forward: axis('forward'), strafe: axis('strafe'), yaw: typeof data.yaw === 'number' && Number.isFinite(data.yaw) ? ((data.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) : actor.yaw, sprint: data.sprint === true };
      player.inputAt = now;
    });
    socket.on('interact', () => {
      const room = rooms.get(socket.data.code), now = performance.now();
      if (!room || room.phase !== 'playing' || now - lastInteract < 350) return;
      lastInteract = now;
      const g = room.game, a = g.actors.find(a => a.id === socket.id);
      if (!a) return;
      if (a.carrying !== null) {
        const item = g.items[a.carrying]; item.carrier = null; item.x = a.x; item.z = a.z; a.carrying = null;
        cargoDamage(g, item, 8); event(g, `${a.name} dropped ${item.name}. Handle gently.`, 'damage'); return;
      }
      const item = g.items.filter(i => !i.delivered && !i.carrier && dist(a, i) < 1.8 && clearLine(a, i)).sort((i, j) => dist(a, i) - dist(a, j))[0];
      if (item) { item.carrier = a.id; a.carrying = item.id; event(g, `${a.name} secured ${item.name}. Return to extraction.`, 'pickup'); }
    });
    socket.on('guide', data => {
      const room = rooms.get(socket.data.code), now = performance.now();
      if (!room || room.phase !== 'playing' || room.players[0]?.id !== socket.id || !data || typeof data !== 'object' || now - lastGuide < 180) return;
      lastGuide = now;
      const commands = ['FORWARD', 'LEFT', 'RIGHT', 'STOP', 'DANGER', 'EXTRACT'];
      if (commands.includes(data.command)) room.game.cue = { text: data.command, until: now + 4500 };
      if (typeof data.x === 'number' && typeof data.z === 'number' && Number.isFinite(data.x) && Number.isFinite(data.z) && data.x > 1 && data.x < W - 1 && data.z > 1 && data.z < H - 1 && !solid(data.x, data.z)) room.game.ping = { x: data.x, z: data.z, until: now + 12000 };
    });
    socket.on('chat', text => {
      const room = rooms.get(socket.data.code), now = performance.now();
      if (!room || typeof text !== 'string' || now - lastChat < 650) return;
      const player = room.players.find(p => p.id === socket.id), message = text.trim().slice(0, 160);
      if (!message) return; lastChat = now;
      io.to(room.code).emit('chat', { name: player.name, text: message });
    });
    socket.on('leave', () => { leave(socket); socket.emit('left'); });
    socket.on('disconnect', () => leave(socket));
  });
  let previous = performance.now(), accumulator = 0;
  const timer = setInterval(() => {
    const now = performance.now(); accumulator += Math.min((now - previous) / 1000, 0.25); previous = now;
    while (accumulator >= DT) { for (const room of rooms.values()) if (room.phase === 'playing') tick(room, now); accumulator -= DT; }
    for (const room of rooms.values()) if (room.game && room.phase !== 'lobby') snapshot(room, now);
  }, 50);
  const close = async () => { clearInterval(timer); await new Promise(resolve => io.close(resolve)); };
  return { app, server, io, rooms, close };
}
if (require.main === module) {
  const game = createGameServer(); game.server.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log(`Quantum Courier v2 running on port ${process.env.PORT || 3000}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await game.close(); process.exit(0); });
}
module.exports = { createGameServer, solid, route, clearLine, WALLS, HOME, CARGO, HAZARDS };
