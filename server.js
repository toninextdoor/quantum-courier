'use strict';
const express = require('express');
const http = require('node:http');
const path = require('node:path');
const { randomInt, createHash, timingSafeEqual } = require('node:crypto');
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
  ['ANTIQUE CLOCK', 150, 5.5, 19.5, 'relic'], ['DESIGNER CASE', 210, 4.5, 12.5, 'core'],
  ['CRYSTAL VASE', 180, 3.5, 3.5, 'vase'], ['SILVER BOX', 160, 11.5, 5.5, 'core'],
  ['VINTAGE TELEVISION', 250, 14.5, 19.5, 'tv'], ['BRASS SCULPTURE', 240, 23.5, 12.5, 'relic'],
  ['PORCELAIN VASE', 220, 24.5, 3.5, 'vase'], ['RARE RADIO', 280, 24.5, 21.5, 'tv']
];
const PATROL = [{ x: 24.5, z: 3.5 }, { x: 24.5, z: 20.5 }, { x: 12.5, z: 20.5 }, { x: 12.5, z: 3.5 }];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function solid(x, z, radius = RADIUS, walls = WALLS) {
  return walls.some(b => Math.hypot(x - clamp(x, b.x, b.x + b.w), z - clamp(z, b.z, b.z + b.d)) < radius);
}
function clearLine(a, b, walls = WALLS) {
  const steps = Math.ceil(dist(a, b) * 5);
  for (let i = 1; i < steps; i++) if (solid(a.x + (b.x - a.x) * i / steps, a.z + (b.z - a.z) * i / steps, 0.05, walls)) return false;
  return true;
}
// Grid BFS gives the sentinel a real route through doorways rather than wall clipping.
function route(a, b, walls = WALLS) {
  const start = [Math.floor(a.x), Math.floor(a.z)], end = [Math.floor(b.x), Math.floor(b.z)];
  const key = (x, z) => `${x},${z}`;
  const queue = [start], parents = new Map([[key(...start), null]]);
  let found = false;
  for (let i = 0; i < queue.length; i++) {
    const [x, z] = queue[i];
    if (x === end[0] && z === end[1]) { found = true; break; }
    for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx, nz = z + dz, k = key(nx, nz);
      if (nx < 1 || nx >= W - 1 || nz < 1 || nz >= H - 1 || parents.has(k) || solid(nx + 0.5, nz + 0.5, 0.3, walls)) continue;
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
function seeded(seed) {
  let value = seed >>> 0;
  return () => { value += 0x6D2B79F5; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function floorCells(walls, hazards = []) {
  const allowed = (x,z) => !solid(x+.5,z+.5,.35,walls) && !hazards.some(h=>dist({x:x+.5,z:z+.5},h)<h.r+.4);
  const start = [Math.floor(HOME.x),Math.floor(HOME.z)], queue=[start], visited=new Set([start.join(',')]);
  for(let i=0;i<queue.length;i++)for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){
    const x=queue[i][0]+dx,z=queue[i][1]+dz,k=`${x},${z}`;
    if(x<1||x>=W-1||z<1||z>=H-1||visited.has(k)||!allowed(x,z))continue;
    visited.add(k);queue.push([x,z]);
  }
  return queue.map(([x,z])=>({x:x+.5,z:z+.5}));
}
function generateMap(seed = randomInt(0x100000000)) {
  const rng=seeded(seed), pick=arr=>arr[Math.floor(rng()*arr.length)];
  const walls=WALLS.slice(0,4).map(w=>({...w}));
  // Keep the entrance and the optional elevated route free of generated partitions.
  const reserved=b=>(b.x<7&&b.z+b.d>18)||(b.x+b.w>19&&b.z<10);
  for(let attempt=0;attempt<38&&walls.length<23;attempt++){
    const vertical=rng()<.5,length=2+Math.floor(rng()*5);
    const b={x:2+Math.floor(rng()*23),z:2+Math.floor(rng()*19),w:vertical?1:length,d:vertical?length:1};
    if(b.x+b.w>26||b.z+b.d>22||reserved(b)||walls.some(o=>b.x<o.x+o.w&&b.x+b.w>o.x&&b.z<o.z+o.d&&b.z+b.d>o.z))continue;
    const candidate=[...walls,b], connected=floorCells(candidate);
    let free=0;for(let x=1;x<W-1;x++)for(let z=1;z<H-1;z++)if(!solid(x+.5,z+.5,.35,candidate))free++;
    if(connected.length===free)walls.push(b);
  }
  const cells=floorCells(walls), hazards=[];
  for(let i=0;i<3;i++){
    const options=cells.filter(c=>dist(c,HOME)>7&&!(c.x>19&&c.z<10)&&!solid(c.x,c.z,1.1,walls)&&hazards.every(h=>dist(c,h)>3));
    if(options.length)hazards.push({...pick(options),r:.65+rng()*.2});
  }
  const safe=floorCells(walls,hazards), candidates=safe.filter(c=>dist(c,HOME)>3&&!(c.x>19&&c.z<10));
  const positions=[];
  for(let i=0;i<CARGO.length;i++){
    const options=candidates.filter(c=>positions.every(p=>dist(c,p)>2.2)&&(i!==0||dist(c,HOME)<7));
    const pos=pick(options.length?options:candidates.filter(c=>positions.every(p=>dist(c,p)>1)));
    positions.push(pos);
  }
  // Touching steps remove the narrow gaps that could trap a player's collider.
  const vertical=rng()<.5, reverse=rng()<.5, size=1.15+rng()*.3;
  const rise=.38+rng()*.07, across=vertical?20.5+rng()*4:2.2+rng()*5;
  const origin=vertical?2:20;
  const platforms=Array.from({length:4},(_,i)=>{
    const along=origin+(reverse?3-i:i)*size;
    return {x:vertical?across:along,z:vertical?along:across,w:size,d:size,h:Number((rise*(i+1)).toFixed(3))};
  });
  const end=platforms[3];
  const items=CARGO.map(([name,value,,,kind],id)=>({id,name,value,...positions[id],y:0,kind,condition:100,carrier:null,delivered:false}));
  items.push({id:8,name:'PENTHOUSE ARTIFACT',value:450,x:end.x+end.w/2,z:end.z+end.d/2,y:end.h,kind:'relic',premium:true,condition:100,carrier:null,delivered:false});
  const patrol=[];for(let i=0;i<4;i++)patrol.push({...pick(safe.filter(c=>dist(c,HOME)>10&&!(c.x>19&&c.z<10)))});
  return {seed,walls,hazards,platforms,items,patrol};
}
function platformOverlap(a,b) {
  return a.y < b.h-.02 && Math.hypot(a.x-clamp(a.x,b.x,b.x+b.w),a.z-clamp(a.z,b.z,b.z+b.d)) < RADIUS-.001;
}
function resolvePlatformOverlap(a,map) {
  if(!map.platforms.some(b=>platformOverlap(a,b)))return;
  const candidates=[];
  for(const b of map.platforms) {
    candidates.push({x:b.x-RADIUS-.01,z:a.z},{x:b.x+b.w+RADIUS+.01,z:a.z},
      {x:a.x,z:b.z-RADIUS-.01},{x:a.x,z:b.z+b.d+RADIUS+.01});
  }
  candidates.sort((p,q)=>dist(a,p)-dist(a,q));
  const clear=candidates.find(p=>!solid(p.x,p.z,RADIUS,map.walls)&&!map.platforms.some(b=>platformOverlap({...p,y:a.y},b)));
  if(clear){a.x=clear.x;a.z=clear.z;}
}
function freshGame(players, now, map = generateMap()) {
  return {
    map,
    started: now, deadline: now + ROUND, elapsed: 0, score: 0, deliveries: 0, catches: 0, damage: 0,
    actors: players.filter(p => p.role !== 'Navigator').map((p, i) => ({ id: p.id, name: p.name, x: 3 + i * 0.7, z: 20.5, yaw: 0, y: 0, vy: 0, grounded: true, jumpHeld: false, carrying: null, safeUntil: now + 3000, bumpAt: -Infinity, speed: 0, steps: 0 })),
    items: map.items.map(i=>({...i})),
    enemy: { ...map.patrol[0], yaw: 0, mode: 'patrol', target: null, patrol: 0, path: [], recalc: 0 },
    ping: null, cue: null, eventId: 0, event: 'Room 905 is open. Recover authorized property and bring them back to the green hallway extraction pad.', outcome: null
  };
}
function createGameServer({ mapFactory = generateMap, devUsername = process.env.DEV_USERNAME, devPassword = process.env.DEV_PASSWORD } = {}) {
  const loginAttempts=new Map();
  const digest=value=>createHash('sha256').update(value).digest();
  const devEnabled=typeof devUsername==='string'&&typeof devPassword==='string'&&devPassword.length>=12;
  const isDev=socket=>socket.data.devUntil>performance.now();
  const app = express(), server = http.createServer(app);
  const io = new Server(server, { maxHttpBufferSize: 8192 });
  const rooms = new Map();
  app.get('/vendor/three.module.js', (_req, res) => res.sendFile(path.join(__dirname, 'node_modules/three/build/three.module.js')));
  app.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('/health', (_req, res) => res.json({ ok: true, version: '2.7.0' }));
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
      const item = g.items[a.carrying]; item.carrier = null; item.x = a.x; item.z = a.z; item.y = Math.max(0,...g.map.platforms.filter(b=>a.x>=b.x&&a.x<=b.x+b.w&&a.z>=b.z&&a.z<=b.z+b.d&&b.h<=a.y+.03).map(b=>b.h));
      cargoDamage(g, item, cause === 'sentinel' ? 35 : 20); a.carrying = null;
    }
    a.x = HOME.x; a.z = HOME.z; a.y = 0; a.vy = 0; a.grounded = true; a.speed = 0; a.safeUntil = now + 3000; a.respawnUntil = now + 1200; a.resetCause = cause;
    g.deadline -= cause === 'sentinel' ? 10000 : 5000;
    if (cause === 'sentinel') g.catches++;
    event(g, `${a.name}: ${cause === 'sentinel' ? 'signal interrupted by the Sentinel. −10s' : 'crossed a signal gap. −5s'}. Cargo dropped; returned to extraction.`, 'danger');
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
      const p = room.players.find(p => p.id === a.id), input = now >= (a.respawnUntil || 0) && now - p.inputAt < 350 ? p.input : {};
      let forward = (input.forward || 0), strafe = (input.strafe || 0), n = Math.max(1, Math.hypot(forward, strafe));
      forward /= n; strafe /= n;
      const carrying = a.carrying !== null;
      const speed = carrying ? (input.sprint ? 2.8 : 2.05) : (input.sprint ? 4.6 : 3.15);
      a.yaw = Number.isFinite(input.yaw) ? input.yaw : a.yaw;
      const dx = (Math.sin(a.yaw) * forward + Math.cos(a.yaw) * strafe) * speed * DT;
      const dz = (-Math.cos(a.yaw) * forward + Math.sin(a.yaw) * strafe) * speed * DT;
      const old = { x: a.x, z: a.z, y:a.y };
      if(input.jump&&!a.jumpHeld&&a.grounded){a.vy=5.4;a.grounded=false;}
      a.jumpHeld=!!input.jump;
      a.vy-=12*DT;const nextY=a.y+a.vy*DT;
      a.y=Math.max(0,nextY);
      const blocked=(x,z)=>solid(x,z,RADIUS,g.map.walls)||g.map.platforms.some(b=>Math.max(old.y,a.y)<b.h-.02&&Math.hypot(x-clamp(x,b.x,b.x+b.w),z-clamp(z,b.z,b.z+b.d))<RADIUS);

      let bumped = false;
      if (!blocked(a.x + dx, a.z)) a.x += dx; else bumped = true;
      if (!blocked(a.x, a.z + dz)) a.z += dz; else bumped = true;
      let floor=0;
      for(const b of g.map.platforms)if(a.x>=b.x&&a.x<=b.x+b.w&&a.z>=b.z&&a.z<=b.z+b.d&&old.y>=b.h-.03&&nextY<=b.h)floor=Math.max(floor,b.h);
      if(a.vy<=0&&nextY<=floor){a.y=floor;a.vy=0;a.grounded=true;}else a.grounded=false;
      resolvePlatformOverlap(a,g.map);
      a.speed = dist(a, old) / DT; a.steps += a.speed * DT;
      if (carrying && bumped && input.sprint && now - a.bumpAt > 1100) {
        cargoDamage(g, g.items[a.carrying], 12); a.bumpAt = now;
        event(g, `${a.name} bumped the cargo! Slow down near walls.`, 'damage');
      }
      if (a.y < .15 && g.map.hazards.some(h => dist(a, h) < h.r + RADIUS)) resetActor(room, a, now, 'breach');
      if (a.carrying !== null) {
        const item = g.items[a.carrying]; item.x = a.x; item.z = a.z; item.y = a.y;
        if (dist(a, HOME) < HOME.r && a.y < .2) {
          const value = Math.round(item.value * item.condition / 100);
          item.delivered = true; item.carrier = null; a.carrying = null; g.score += value; g.deliveries++;
          event(g, `${a.name} extracted ${item.name}: +$${value}.`, 'success');
          if (g.score >= QUOTA) { finish(room, 'won'); return; }
        }
      }
    }
    const enemy = g.enemy;
    const targets = g.actors.filter(a => now >= a.safeUntil && dist(a, HOME) > HOME.r + 1 && ((dist(a, enemy) < 7.5 && clearLine(enemy, a, g.map.walls)) || (a.speed > 3.5 && dist(a, enemy) < 10)));
    targets.sort((a, b) => dist(a, enemy) - dist(b, enemy));
    const target = targets[0]; enemy.mode = target ? 'tracking' : 'patrol'; enemy.target = target?.id || null;
    const destination = target || g.map.patrol[enemy.patrol];
    if (!target && dist(enemy, destination) < 0.65) { enemy.patrol = (enemy.patrol + 1) % g.map.patrol.length; enemy.recalc = 0; }
    if (now >= enemy.recalc) { enemy.path = route(enemy, target || g.map.patrol[enemy.patrol], g.map.walls); enemy.recalc = now + 450; }
    let waypoint = enemy.path[0];
    if (waypoint && dist(enemy, waypoint) < 0.15) { enemy.path.shift(); waypoint = enemy.path[0]; }
    if (!waypoint && target && clearLine(enemy, target, g.map.walls)) waypoint = target;
    if (waypoint && !g.devFreeze) {
      const distance = dist(enemy, waypoint), stride = Math.min(distance, (target ? 2.15 : 1.3) * DT);
      if (distance > 0.001) {
        const dx = (waypoint.x - enemy.x) / distance * stride, dz = (waypoint.z - enemy.z) / distance * stride;
        enemy.yaw = Math.atan2(dx, -dz);
        if (!solid(enemy.x + dx, enemy.z, 0.3, g.map.walls)) enemy.x += dx;
        if (!solid(enemy.x, enemy.z + dz, 0.3, g.map.walls)) enemy.z += dz;
      }
    }
    for (const a of g.actors) if (a.y < 1.1 && dist(a, enemy) < 0.7) resetActor(room, a, now, 'sentinel');
    if (now >= g.deadline) finish(room, 'lost');
  }
  function snapshot(room, now) {
    const g = room.game;
    for (const p of room.players) {
      const me = g.actors.find(a => a.id === p.id), navigator = p.role === 'Navigator';
      // Scavengers get nearby entities only; the tactical overview belongs to Navigator.
      const visible = object => navigator || (me && dist(me, object) < 1.8 && Math.abs(me.y-(object.y||0))<.7 && clearLine(me, object,g.map.walls));
      io.to(p.id).emit('state', {
        roundId: g.started, mapSeed:g.map.seed, phase: room.phase, role: p.role, remaining: room.phase === 'finished' ? g.finalRemaining : Math.max(0, (g.deadline - now) / 1000),
        respawn: room.phase==='playing'&&me&&now<(me.respawnUntil||0)?{cause:me.resetCause,penalty:me.resetCause==='sentinel'?10:5,remaining:(me.respawnUntil-now)/1000}:null,
        quota: QUOTA, score: g.score, deliveries: g.deliveries, catches: g.catches, damage: g.damage,
        actors: g.actors.map(a => ({ id: a.id, name: a.name, x: a.x, z: a.z, y:a.y, grounded:a.grounded, yaw: a.yaw, carrying: a.carrying, speed: a.speed, safe: now < a.safeUntil })),
        items: g.items.filter(i => !i.delivered && (i.carrier === p.id || visible(i))).map(i => ({ ...i })),
        // Only a coarse warning intensity reaches bodycams, never enemy coordinates.
        threat: !navigator && me && room.phase==='playing' ? Math.round(clamp((9-dist(me,g.enemy))/8,0,1)*10)/10 : 0,
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
    socket.emit('build', {version:'2.7.0'});
    socket.on('check:ping',ack=>{if(typeof ack==='function')ack({ok:true});});
    socket.on('dev:login',(data,ack)=>{
      if(typeof ack!=='function')return;
      const now=performance.now(),key=socket.handshake.address;
      if(loginAttempts.size>2000)for(const [k,v]of loginAttempts)if(now-v.start>60000)loginAttempts.delete(k);
      let attempt=loginAttempts.get(key);if(!attempt||now-attempt.start>60000){attempt={start:now,count:0};loginAttempts.set(key,attempt);}
      if(++attempt.count>6)return ack({error:'Too many attempts. Wait one minute.'});
      if(!devEnabled)return ack({error:'Developer login is disabled. Configure DEV_USERNAME and DEV_PASSWORD on the server.'});
      if(typeof data?.username!=='string'||typeof data?.password!=='string'||data.username.length>100||data.password.length>200)return ack({error:'Invalid credentials.'});
      const userOk=timingSafeEqual(digest(data.username),digest(devUsername));
      const passOk=timingSafeEqual(digest(data.password),digest(devPassword));
      if(!userOk||!passOk)return ack({error:'Invalid credentials.'});
      socket.data.devUntil=now+30*60000;ack({ok:true});
    });
    socket.on('dev:logout',()=>{socket.data.devUntil=0;});
    let lastDev=-Infinity;
    socket.on('dev:action',(data,ack)=>{
      const reply=typeof ack==='function'?ack:()=>{},now=performance.now();
      if(!isDev(socket))return reply({error:'Developer session expired. Sign in again.'});
      if(now-lastDev<200)return reply({error:'Wait a moment.'});lastDev=now;
      const room=rooms.get(socket.data.code);
      if(!room||room.phase!=='playing')return reply({error:'Launch a recovery mission in your room first.'});
      const g=room.game,targets=data?.target==='all'?g.actors:g.actors.filter(a=>a.id===data?.target);
      if(['red','heartbeat','ambience','combined','clear'].includes(data?.action)){
        if(!targets.length)return reply({error:'Select a Scavenger.'});
        for(const a of targets)io.to(a.id).emit('dev:effect',{kind:data.action,seconds:5});
      }else if(data?.action==='freeze'){g.devFreeze=!g.devFreeze;event(g,`DEV TEST: Sentinel ${g.devFreeze?'frozen':'resumed'}.`);}
      else if(data?.action==='time'){g.deadline+=30000;event(g,'DEV TEST: +30 seconds.');}
      else if(data?.action==='finish'){finish(room,'lost');}
      else if(data?.action==='win'){g.score=QUOTA;finish(room,'won');}
      else {
        if(!targets.length)return reply({error:'Select a Scavenger.'});
        if(!['near','far','home','parkour','premium','protect','breach','catch','damage'].includes(data?.action))return reply({error:'Unknown developer action.'});
        if(['near','far'].includes(data.action)&&targets.length!==1)return reply({error:'Select one Scavenger for Sentinel placement.'});
        for(const a of targets){
          if(data.action==='near'||data.action==='far'){
            const candidates=floorCells(g.map.walls).filter(p=>!g.map.platforms.some(b=>platformOverlap({...p,y:0},b)));
            candidates.sort((p,q)=>data.action==='near'?Math.abs(dist(a,p)-2)-Math.abs(dist(a,q)-2):dist(a,q)-dist(a,p));
            const p=candidates[0];if(p)Object.assign(g.enemy,{x:p.x,z:p.z,path:[],recalc:now+5000});g.devFreeze=true;
          }else if(['breach','catch'].includes(data.action)){
            if(dist(a,HOME)<HOME.r){const p=floorCells(g.map.walls).find(p=>dist(p,HOME)>4);if(p){a.x=p.x;a.z=p.z;}}
            a.safeUntil=0;resetActor(room,a,now,data.action==='catch'?'sentinel':'breach');
          }else if(data.action==='damage'){cargoDamage(g,g.items.find(i=>i.id===a.carrying),20);
          }else if(data.action==='protect'){a.safeUntil=now+60000;}
          else if(data.action==='premium'){
            const item=g.items.find(i=>i.premium&&!i.delivered&&!i.carrier);
            if(item&&a.carrying===null){item.carrier=a.id;a.carrying=item.id;}
          }else{
            let p=HOME;
            if(data.action==='parkour'){
              const b=g.map.platforms[0],next=g.map.platforms[1],axis=Math.abs(next.x-b.x)>.1?'x':'z',dir=Math.sign(next[axis]-b[axis]);
              p={x:b.x+b.w/2,z:b.z+b.d/2};p[axis]-=dir*((axis==='x'?b.w:b.d)/2+.65);
            }
            Object.assign(a,{x:p.x,z:p.z,y:0,vy:0,grounded:true,jumpHeld:false,safeUntil:now+60000});
            const player=room.players.find(p=>p.id===a.id);player.input={};player.inputAt=0;
          }
        }
        event(g,`DEV TEST: ${data.action}.`);
      }
      reply({ok:true});snapshot(room,now);
    });
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
      if (!room || room.players[0]?.id !== socket.id && !isDev(socket)) return reply({ error: 'The host launches the shift.' });
      if (room.players.length < 2) return reply({ error: 'Need a Navigator and at least one Scavenger.' });
      if (room.phase === 'playing') return reply({ error: 'Shift already running.' });
      roles(room); room.phase = 'playing'; room.notice = ''; room.game = freshGame(room.players, performance.now(), mapFactory());
      reply({ ok: true }); roster(room);
      for (const p of room.players) io.to(p.id).emit('world', { width: W, depth: H, walls: room.game.map.walls, platforms:room.game.map.platforms, seed:room.game.map.seed, hazards: p.role === 'Navigator' ? room.game.map.hazards : [], home: HOME, quota: QUOTA, duration: ROUND / 1000 });
      snapshot(room, performance.now());
    });
    socket.on('input', data => {
      const room = rooms.get(socket.data.code), player = room?.players.find(p => p.id === socket.id), now = performance.now();
      if (!player || player.role === 'Navigator' || room.phase !== 'playing' || !data || typeof data !== 'object' || now - player.inputAt < 15) return;
      const axis = key => typeof data[key] === 'number' && Number.isFinite(data[key]) ? clamp(data[key], -1, 1) : 0;
      const actor = room.game.actors.find(a => a.id === socket.id);
      player.input = { forward: axis('forward'), strafe: axis('strafe'), yaw: typeof data.yaw === 'number' && Number.isFinite(data.yaw) ? ((data.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) : actor.yaw, jump: data.jump === true, sprint: data.sprint === true };
      player.inputAt = now;
    });
    socket.on('interact', () => {
      const room = rooms.get(socket.data.code), now = performance.now();
      if (!room || room.phase !== 'playing' || now - lastInteract < 350) return;
      lastInteract = now;
      const g = room.game, a = g.actors.find(a => a.id === socket.id);
      if (!a || now < (a.respawnUntil || 0)) return;
      if (a.carrying !== null) {
        const item = g.items[a.carrying]; item.carrier = null; item.x = a.x; item.z = a.z; item.y = Math.max(0,...g.map.platforms.filter(b=>a.x>=b.x&&a.x<=b.x+b.w&&a.z>=b.z&&a.z<=b.z+b.d&&b.h<=a.y+.03).map(b=>b.h)); a.carrying = null;
        cargoDamage(g, item, 8); event(g, `${a.name} dropped ${item.name}. Handle gently.`, 'damage'); return;
      }
      const item = g.items.filter(i => !i.delivered && !i.carrier && dist(a, i) < 1.8 && Math.abs(a.y-(i.y||0))<.7 && clearLine(a, i, g.map.walls)).sort((i, j) => dist(a, i) - dist(a, j))[0];
      if (item) { item.carrier = a.id; a.carrying = item.id; event(g, `${a.name} secured ${item.name}. Return to extraction.`, 'pickup'); }
    });
    socket.on('guide', data => {
      const room = rooms.get(socket.data.code), now = performance.now();
      if (!room || room.phase !== 'playing' || room.players[0]?.id !== socket.id || !data || typeof data !== 'object' || now - lastGuide < 180) return;
      lastGuide = now;
      const commands = ['FORWARD', 'LEFT', 'RIGHT', 'STOP', 'DANGER', 'EXTRACT'];
      if (commands.includes(data.command)) room.game.cue = { text: data.command, until: now + 4500 };
      if (typeof data.x === 'number' && typeof data.z === 'number' && Number.isFinite(data.x) && Number.isFinite(data.z) && data.x > 1 && data.x < W - 1 && data.z > 1 && data.z < H - 1 && !solid(data.x, data.z,RADIUS,room.game.map.walls)) room.game.ping = { x: data.x, z: data.z, until: now + 12000 };
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
  const game = createGameServer(); game.server.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log(`Room 905 v2 running on port ${process.env.PORT || 3000}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await game.close(); process.exit(0); });
}
module.exports = { createGameServer, solid, route, clearLine, WALLS, HOME, CARGO, HAZARDS, PATROL, generateMap, floorCells, resolvePlatformOverlap, platformOverlap };
