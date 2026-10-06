'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
const { createGameServer } = require('../server');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const request = (socket, event, data) => new Promise((resolve, reject) => socket.timeout(2000).emit(event, data, (err, result) => err ? reject(err) : resolve(result)));
const next = (socket, event) => new Promise(resolve => socket.once(event, resolve));
test('room lifecycle, authority, asymmetric views, deliveries and collision penalty', async () => {
  const game = createGameServer();
  await new Promise(resolve => game.server.listen(0, '127.0.0.1', resolve));
  const clients = [];
  try {
    for (let i = 0; i < 6; i++) {
      const c = io(`http://127.0.0.1:${game.server.address().port}`, { transports: ['websocket'], reconnection: false });
      clients.push(c); await next(c, 'connect');
    }
    const [a, b, c, d, e, outsider] = clients;
    const created = await request(a, 'enter', { create: true, name: 'A' });
    assert.match(created.code, /^[A-Z]{4}$/);
    assert.match((await request(a, 'start', {})).error, /two/);
    for (const [i, client] of [b, c, d].entries()) assert.equal((await request(client, 'enter', { code: created.code.toLowerCase(), name: String(i) })).ok, true);
    assert.match((await request(e, 'enter', { code: created.code, name: 'E' })).error, /full/);
    assert.match((await request(b, 'start', {})).error, /host/);
    let outsiderStates = 0; outsider.on('state', () => outsiderStates++);
    assert.equal((await request(a, 'start', {})).ok, true);
    const views = await Promise.all([a, b, c, d].map(client => next(client, 'state')));
    assert.deepEqual(views.map(v => v.role), ['Navigator', 'Spotter', 'Driver', 'Pilot']);
    assert.equal(views[0].hazards.length, 3); assert.equal(views[0].barriers.length, 0); assert.equal(views[0].pickup, null);
    assert.equal(views[1].hazards.length, 0); assert.equal(views[1].barriers.length, 3); assert.ok(views[1].pickup);
    assert.equal(views[2].pickup, null); assert.equal(views[2].canDrive, true);
    const room = game.rooms.get(created.code), g = room.game;
    a.emit('input', { right: true }); await delay(110); assert.equal(g.cart.x, 65);
    c.emit('input', { right: true, x: 900 }); await delay(110); assert.ok(g.cart.x > 65 && g.cart.x < 100);
    await delay(650); const speed = Math.abs(g.cart.vx); await delay(250); assert.ok(Math.abs(g.cart.vx) < speed * 0.7);
    Object.assign(g.cart, { x: 340, y: 300, vx: 0, vy: 0 }); await delay(65); assert.equal(g.carrying, true);
    Object.assign(g.cart, { x: 885, y: 100, vx: 0, vy: 0 }); await delay(65); assert.equal(g.score, 1); assert.equal(g.carrying, false);
    const deadline = g.deadline; g.safeUntil = 0;
    Object.assign(g.cart, { x: 250, y: 100, vx: 0, vy: 0 }); await delay(65);
    assert.equal(g.cart.x, 65); assert.equal(g.deadline, deadline - 5000);
    g.deadline = 0; const end = await next(a, 'state'); assert.equal(end.phase, 'finished'); assert.equal(end.remaining, 0);
    assert.equal((await request(a, 'start', {})).ok, true);
    const returned = next(a, 'lobby'); d.disconnect(); assert.equal((await returned).phase, 'lobby');
    assert.equal(room.players.length, 3); assert.equal(room.game, null);
    assert.equal(outsiderStates, 0);
    c.disconnect(); await delay(60);
    assert.equal((await request(a, 'start', {})).ok, true);
    const duo = await next(b, 'state'); assert.equal(duo.role, 'Spotter'); assert.equal(duo.canDrive, true);
    a.disconnect(); b.disconnect(); await delay(60); assert.equal(game.rooms.size, 0);
  } finally { clients.forEach(client => client.disconnect()); await game.close(); }
});
