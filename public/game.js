'use strict';
const $ = id => document.getElementById(id);
const socket = io();
const canvas = $('canvas'), ctx = canvas.getContext('2d');
let lobby = null, state = null, previous = null, received = 0;
const keys = new Set(), pointers = new Map();
const mapping = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
function error(text = '') { $('error').textContent = text; $('error').hidden = !text; }
function send(event, data) {
  error();
  if (!socket.connected) return error('Connection unavailable. Please wait for reconnection.');
  socket.timeout(4000).emit(event, data, (err, reply) => { if (err) error('Request timed out. Check your connection.'); else if (reply?.error) error(reply.error); });
}
function reset() {
  lobby = state = previous = null; keys.clear(); pointers.clear();
  $('entry').hidden = false; $('lobby').hidden = true; $('game').hidden = true; $('how').hidden = false;
}
$('create').onclick = () => send('enter', { create: true, name: $('name').value });
$('join').onclick = () => send('enter', { code: $('code').value, name: $('name').value });
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') $('join').click(); });
$('start').onclick = $('again').onclick = () => send('start', {});
document.querySelectorAll('.leave').forEach(button => button.onclick = () => { socket.emit('leave'); reset(); });
socket.on('connect', () => { $('connection').textContent = 'ONLINE · 20 Hz'; });
socket.on('disconnect', () => { reset(); $('connection').textContent = 'RECONNECTING'; error('Connection lost. Rejoin your room when connected; the crew returns to the lobby.'); });
socket.on('connect_error', () => { $('connection').textContent = 'OFFLINE'; error('Unable to reach the server.'); });
socket.on('left', reset);
socket.on('lobby', data => {
  lobby = data; $('entry').hidden = true;
  $('lobby').hidden = data.phase !== 'lobby'; $('how').hidden = data.phase !== 'lobby';
  if (data.phase === 'lobby') { state = previous = null; $('game').hidden = true; keys.clear(); pointers.clear(); }
  $('roomCode').textContent = data.code; $('count').textContent = `${data.players.length}/4 couriers aboard`;
  $('players').replaceChildren(...data.players.map(p => {
    const li = document.createElement('li'), name = document.createElement('strong'), role = document.createElement('span');
    name.textContent = p.name + (p.id === data.host ? ' · HOST' : '') + (p.id === socket.id ? ' · YOU' : '');
    role.textContent = p.role + (data.players.length === 2 && p.role === 'Spotter' ? ' + Driver' : ''); li.append(name, role); return li;
  }));
  $('lobbyNotice').textContent = data.notice || (data.players.length < 2 ? 'Waiting for at least one more courier.' : 'Roles follow join order. Host can launch when ready.');
  $('start').disabled = data.host !== socket.id || data.players.length < 2;
});
socket.on('state', data => {
  previous = state; state = data; received = performance.now();
  $('lobby').hidden = $('entry').hidden = $('how').hidden = true; $('game').hidden = false;
  $('role').textContent = data.role + (data.role === 'Spotter' && data.canDrive ? ' / Driver' : '');
  $('time').textContent = data.remaining.toFixed(1); $('time').classList.toggle('urgent', data.remaining <= 10);
  $('score').textContent = data.score; $('cargo').textContent = data.carrying ? 'LOADED' : 'EMPTY';
  $('message').textContent = data.message; $('coordinates').textContent = `X ${Math.round(data.cart.x)} / Y ${Math.round(data.cart.y)}`;
  $('roleHelp').textContent = data.role === 'Navigator' ? 'Guide the cart around red terrain and moving drones. Ask the Spotter for parcel coordinates.' : data.role === 'Spotter' ? 'Call out purple barriers, cyan pickup and green drop-off coordinates.' : 'You control the shared cart. Your crew sees the map; listen to their directions.';
  $('map').hidden = data.role === 'Driver' || data.role === 'Pilot'; $('controls').hidden = !data.canDrive;
  $('result').hidden = data.phase !== 'finished';
  $('resultText').textContent = `${data.score} ${data.score === 1 ? 'parcel' : 'parcels'} delivered. Rally your crew for another shift.`;
  $('again').hidden = lobby?.host !== socket.id;
  $('replayHelp').textContent = lobby?.host === socket.id ? 'Your crew stays in this room.' : 'Waiting for the host to launch the next round.';
  if (data.phase === 'finished') release();
});
function input() {
  const held = new Set([...keys].map(k => mapping[k]).concat([...pointers.values()]));
  const result = Object.fromEntries(['up', 'down', 'left', 'right'].map(d => [d, held.has(d)]));
  document.querySelectorAll('[data-dir]').forEach(b => b.classList.toggle('active', result[b.dataset.dir]));
  if (state?.canDrive && state.phase === 'playing' && socket.connected) socket.emit('input', result);
}
function release() { keys.clear(); pointers.clear(); input(); }
window.addEventListener('keydown', e => { const key = e.key.length === 1 ? e.key.toLowerCase() : e.key; if (mapping[key] && state?.canDrive && state.phase === 'playing' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) { e.preventDefault(); keys.add(key); input(); } });
window.addEventListener('keyup', e => { keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key); input(); });
window.addEventListener('blur', release);
document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
document.querySelectorAll('[data-dir]').forEach(b => {
  b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); pointers.set(e.pointerId, b.dataset.dir); input(); });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(event, e => { pointers.delete(e.pointerId); input(); });
});
setInterval(input, 100);
function circle(x, y, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function zone(z, color, label, r) {
  if (!z) return; ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(z.x, z.y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = color; ctx.font = '12px monospace'; ctx.textAlign = 'center'; ctx.fillText(label, z.x, z.y - r - 10); ctx.fillText(`${z.x}, ${z.y}`, z.x, z.y + r + 18);
}
function render(now) {
  requestAnimationFrame(render);
  if (!state || $('map').hidden) return;
  // Interpolate one tick behind authoritative snapshots; never predict collisions.
  const t = Math.min(1, (now - received) / 50);
  let x = state.cart.x, y = state.cart.y;
  if (previous && previous.phase === state.phase && Math.hypot(x - previous.cart.x, y - previous.cart.y) < 80) { x = previous.cart.x + (x - previous.cart.x) * t; y = previous.cart.y + (y - previous.cart.y) * t; }
  ctx.clearRect(0, 0, 960, 600); ctx.strokeStyle = '#203047'; ctx.lineWidth = 1;
  ctx.font = '10px monospace'; ctx.textAlign = 'left'; ctx.fillStyle = '#6a809c';
  for (let i = 0; i <= 960; i += 60) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 600); ctx.stroke(); if (i) ctx.fillText(i, i + 3, 12); }
  for (let i = 0; i <= 600; i += 60) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(960, i); ctx.stroke(); if (i) ctx.fillText(i, 3, i - 4); }
  zone({ x: 65, y: 300 }, '#647d9b', 'SPAWN', 23);
  for (const h of state.hazards) { ctx.fillStyle = '#b3445666'; ctx.fillRect(h.x, h.y, h.w, h.h); ctx.strokeStyle = '#ff7485'; ctx.strokeRect(h.x, h.y, h.w, h.h); }
  for (const o of state.obstacles) { circle(o.x, o.y, o.r, '#ff7485'); ctx.fillStyle = '#301423'; ctx.textAlign = 'center'; ctx.fillText('×', o.x, o.y + 4); }
  for (const b of state.barriers) { ctx.fillStyle = '#b48bfa99'; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeStyle = '#c4a2ff'; ctx.strokeRect(b.x, b.y, b.w, b.h); }
  if (!state.carrying) zone(state.pickup, '#66e5ef', 'PICKUP', 23);
  zone(state.target, '#9beeab', 'DROP-OFF', 32);
  ctx.globalAlpha = state.invulnerable ? 0.55 + Math.sin(now / 90) * 0.25 : 1;
  circle(x, y, 18, '#ffffff22'); circle(x, y, 13, '#e8f1ff');
  if (state.carrying) { ctx.fillStyle = '#66e5ef'; ctx.fillRect(x - 5, y - 5, 10, 10); }
  ctx.globalAlpha = 1; ctx.fillStyle = '#e8f1ff'; ctx.textAlign = 'center'; ctx.font = '11px monospace'; ctx.fillText('CART', x, y - 24);
}
requestAnimationFrame(render);
