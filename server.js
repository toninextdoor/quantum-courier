'use strict';
const express = require('express');
const http = require('node:http');
const path = require('node:path');
const { randomInt } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { Server } = require('socket.io');
const WIDTH = 960, HEIGHT = 600, RADIUS = 13, STEP = 0.05;
const SPAWN = { x: 65, y: 300 };
const ROLES = ['Navigator', 'Spotter', 'Driver', 'Pilot'];
const hazards = [{ x: 225, y: 70, w: 65, h: 165 }, { x: 225, y: 365, w: 65, h: 165 }, { x: 625, y: 210, w: 65, h: 180 }];
const barriers = [{ x: 405, y: 100, w: 26, h: 155 }, { x: 405, y: 345, w: 26, h: 155 }, { x: 785, y: 270, w: 80, h: 25 }];
const pickups = [{ x: 340, y: 300 }, { x: 530, y: 80 }, { x: 535, y: 515 }];
const targets = [{ x: 885, y: 100 }, { x: 875, y: 490 }, { x: 740, y: 100 }];
function intersects(c, b) {
  const x = Math.max(b.x, Math.min(c.x, b.x + b.w));
  const y = Math.max(b.y, Math.min(c.y, b.y + b.h));
  return Math.hypot(c.x - x, c.y - y) < RADIUS;
}
function moving(elapsed) {
  return [{ x: 525, y: 300 + Math.sin(elapsed * 1.5) * 135, r: 22 }];
}
function canDrive(room, player) { return player.role === 'Driver' || player.role === 'Pilot' || (room.players.length === 2 && player.role === 'Spotter'); }
function createGameServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { maxHttpBufferSize: 4096 });
  const rooms = new Map();
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('/health', (_req, res) => res.json({ ok: true }));
  function lobby(room) {
    io.to(room.code).emit('lobby', { code: room.code, phase: room.phase, host: room.players[0]?.id, players: room.players.map(({ id, name, role }) => ({ id, name, role })), notice: room.notice || '' });
  }
  function assign(room) { room.players.forEach((p, i) => { p.role = ROLES[i]; p.input = {}; }); }
  function snapshot(room, now) {
    const g = room.game;
    if (!g) return;
    for (const p of room.players) {
      // Omit private map layers, rather than merely hiding them in the UI.
      io.to(p.id).emit('state', {
        phase: room.phase, role: p.role, canDrive: canDrive(room, p),
        width: WIDTH, height: HEIGHT, cart: g.cart, carrying: g.carrying,
        score: g.score, remaining: Math.max(0, (g.deadline - now) / 1000),
        invulnerable: now < g.safeUntil, message: g.message,
        hazards: p.role === 'Navigator' ? hazards : [],
        obstacles: p.role === 'Navigator' ? moving(g.elapsed) : [],
        barriers: p.role === 'Spotter' ? barriers : [],
        pickup: p.role === 'Spotter' ? pickups[g.route % pickups.length] : null,
        target: p.role === 'Spotter' ? targets[g.route % targets.length] : null
      });
    }
  }
  function leave(socket) {
    const room = rooms.get(socket.data.code);
    socket.leave(socket.data.code || '');
    socket.data.code = null;
    if (!room) return;
    room.players = room.players.filter(p => p.id !== socket.id);
    if (!room.players.length) { rooms.delete(room.code); return; }
    if (room.phase === 'playing') {
      room.phase = 'lobby'; room.game = null;
      room.notice = 'A courier left. Roles reassigned; start a new round.';
    }
    assign(room); lobby(room);
  }
  io.on('connection', socket => {
    let lastRoomAction = -Infinity;
    socket.on('enter', (data, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (performance.now() - lastRoomAction < 400) return reply({ error: 'Please wait a moment.' });
      lastRoomAction = performance.now();
      if (!data || typeof data !== 'object') return reply({ error: 'Invalid request.' });
      if (socket.data.code) return reply({ error: 'Leave your current room first.' });
      const name = typeof data.name === 'string' ? data.name.trim().slice(0, 20) : '';
      if (!name) return reply({ error: 'Enter a callsign.' });
      let room;
      if (data.create === true) {
        if (rooms.size >= 500) return reply({ error: 'Server is full. Try later.' });
        let code;
        do { code = Array.from({ length: 4 }, () => String.fromCharCode(65 + randomInt(26))).join(''); } while (rooms.has(code));
        room = { code, players: [], phase: 'lobby', game: null };
        rooms.set(code, room);
      } else {
        const code = typeof data.code === 'string' ? data.code.trim().toUpperCase() : '';
        if (!/^[A-Z]{4}$/.test(code)) return reply({ error: 'Use a four-letter room code.' });
        room = rooms.get(code);
        if (!room) return reply({ error: 'Room not found.' });
        if (room.phase === 'playing') return reply({ error: 'Round in progress. Join after it ends.' });
        if (room.players.length >= 4) return reply({ error: 'Room is full (4/4).' });
      }
      room.players.push({ id: socket.id, name, input: {}, lastInput: 0 });
      assign(room); socket.data.code = room.code; socket.join(room.code);
      reply({ ok: true, code: room.code }); lobby(room);
    });
    socket.on('start', (_data, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const room = rooms.get(socket.data.code);
      if (!room || room.players[0]?.id !== socket.id) return reply({ error: 'Only the host can start.' });
      if (room.players.length < 2) return reply({ error: 'At least two couriers are required.' });
      if (room.phase === 'playing') return reply({ error: 'Round already running.' });
      assign(room); room.phase = 'playing'; room.notice = '';
      const now = performance.now();
      room.game = { cart: { ...SPAWN, vx: 0, vy: 0 }, deadline: now + 60000, safeUntil: now + 1000, score: 0, route: 0, carrying: false, elapsed: 0, message: 'Find the first parcel.' };
      reply({ ok: true }); lobby(room); snapshot(room, now);
    });
    socket.on('input', input => {
      const room = rooms.get(socket.data.code);
      const player = room?.players.find(p => p.id === socket.id);
      if (!player || room.phase !== 'playing' || !canDrive(room, player) || !input || typeof input !== 'object') return;
      const now = performance.now();
      if (now - player.lastInput < 15) return;
      player.input = Object.fromEntries(['up', 'down', 'left', 'right'].map(k => [k, input[k] === true]));
      player.lastInput = now;
    });
    socket.on('leave', () => { leave(socket); socket.emit('left'); });
    socket.on('disconnect', () => leave(socket));
  });
  function physics(room, now) {
    const g = room.game, c = g.cart;
    if (now >= g.deadline) { room.phase = 'finished'; g.message = 'Round complete!'; return; }
    g.elapsed += STEP;
    let x = 0, y = 0;
    for (const p of room.players) {
      if (!canDrive(room, p) || now - p.lastInput > 350) continue;
      x += Number(!!p.input.right) - Number(!!p.input.left);
      y += Number(!!p.input.down) - Number(!!p.input.up);
    }
    const length = Math.hypot(x, y);
    if (length) { x /= length; y /= length; }
    c.vx = Math.max(-185, Math.min(185, (c.vx + x * 650 * STEP) * 0.87));
    c.vy = Math.max(-185, Math.min(185, (c.vy + y * 650 * STEP) * 0.87));
    // Resolve solid barriers per axis so drivers can slide along their edges.
    const oldX = c.x, oldY = c.y;
    c.x = Math.max(RADIUS, Math.min(WIDTH - RADIUS, c.x + c.vx * STEP));
    if (barriers.some(b => intersects(c, b))) { c.x = oldX; c.vx = 0; }
    c.y = Math.max(RADIUS, Math.min(HEIGHT - RADIUS, c.y + c.vy * STEP));
    if (barriers.some(b => intersects(c, b))) { c.y = oldY; c.vy = 0; }
    if (now >= g.safeUntil && (hazards.some(b => intersects(c, b)) || moving(g.elapsed).some(o => Math.hypot(c.x - o.x, c.y - o.y) < RADIUS + o.r))) {
      Object.assign(c, SPAWN, { vx: 0, vy: 0 }); g.carrying = false;
      g.deadline -= 5000; g.safeUntil = now + 1200; g.message = 'Collision! −5 seconds. Parcel returned.';
    }
    const pickup = pickups[g.route % pickups.length], target = targets[g.route % targets.length];
    if (!g.carrying && Math.hypot(c.x - pickup.x, c.y - pickup.y) < 30) { g.carrying = true; g.message = 'Parcel secured. Find the drop-off.'; }
    if (g.carrying && Math.hypot(c.x - target.x, c.y - target.y) < 38) { g.score++; g.route++; g.carrying = false; g.message = 'Delivery complete! Find the next parcel.'; }
    if (now >= g.deadline) { room.phase = 'finished'; g.message = 'Round complete!'; }
  }
  let previous = performance.now(), accumulator = 0;
  const timer = setInterval(() => {
    const now = performance.now(); accumulator += Math.min((now - previous) / 1000, 0.25); previous = now;
    while (accumulator >= STEP) {
      for (const room of rooms.values()) if (room.phase === 'playing') physics(room, now);
      accumulator -= STEP;
    }
    for (const room of rooms.values()) if (room.game) snapshot(room, now);
  }, 50);
  const close = async () => { clearInterval(timer); await new Promise(resolve => io.close(resolve)); };
  return { app, server, io, rooms, close };
}
if (require.main === module) {
  const game = createGameServer();
  game.server.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log(`Quantum Courier: http://localhost:${process.env.PORT || 3000}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await game.close(); process.exit(0); });
}
module.exports = { createGameServer, intersects, canDrive };
