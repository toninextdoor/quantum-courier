'use strict';
const express = require('express');
const {installAccounts}=require('./accounts');
const {rewardXP}=require('./progression');
const {installFriends}=require('./friends');
const {moderateChat,filterText}=require('./moderation');
const http = require('node:http');
const path = require('node:path');
const { randomUUID, randomInt, createHash, timingSafeEqual } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { Server } = require('socket.io');
const W = 28, H = 24, DT = 0.05, ROUND = 180000, QUOTA = 600, RADIUS = 0.28;
const DIFFICULTIES={easy:{label:'Easy',seconds:240,speed:.75,gap:3,sentinel:7},normal:{label:'Normal',seconds:180,speed:1,gap:5,sentinel:10},hard:{label:'Hard',seconds:150,speed:1.25,gap:7,sentinel:12}};
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
function freshGame(players, now, map = generateMap(),difficulty='normal') {
  return {
    map, awardId:randomUUID(),
    difficulty, settings:DIFFICULTIES[difficulty],
    started: now, deadline: now + DIFFICULTIES[difficulty].seconds*1000, elapsed: 0, score: 0, deliveries: 0, catches: 0, damage: 0,
    actors: players.filter(p => p.role !== 'Navigator').map((p, i) => ({ id: p.id, name: p.name, role:p.role, heritage:p.progression?.heritage||null, stunReady:0, health:100, avatar:p.avatar||'amber', x: 3 + i * 0.7, z: 20.5, yaw: 0, y: 0, vy: 0, grounded: true, jumpHeld: false, carrying: null, safeUntil: now + 3000, bumpAt: -Infinity, speed: 0, steps: 0 })),
    items: map.items.map(i=>({...i})),
    enemy: { ...map.patrol[0], yaw: 0, mode: 'patrol', target: null, patrol: 0, path: [], recalc: 0 },
    ping: null, cue: null, eventId: 0, event: 'Room 905 is open. Recover authorized property and bring them back to the green hallway extraction pad.', outcome: null
  };
}
function createGameServer({ mapFactory = generateMap, devUsername = process.env.DEV_USERNAME, devPassword = process.env.DEV_PASSWORD, accountStore, databaseUrl, disconnectGraceMs = 15000 } = {}) {
  const loginAttempts=new Map();
  const digest=value=>createHash('sha256').update(value).digest();
  const devEnabled=typeof devUsername==='string'&&typeof devPassword==='string'&&devPassword.length>=12;
  const isDev=socket=>socket.data.devUntil>performance.now();
  const app = express(), server = http.createServer(app);
  app.set('trust proxy',1); // Render HTTPS ingress; rate limits use the nearest forwarded client address.
  const io = new Server(server, { maxHttpBufferSize: 8192, connectionStateRecovery:{maxDisconnectionDuration:disconnectGraceMs,skipMiddlewares:false} });
  const rooms = new Map(), pendingDisconnects=new Map();
  let closing=false;
  app.get('/vendor/three.module.js', (_req, res) => res.sendFile(path.join(__dirname, 'node_modules/three/build/three.module.js')));
  app.use('/media',express.static(path.join(__dirname,'public/media'),{maxAge:'7d',immutable:true}));
  app.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  const accounts=installAccounts(app,{store:accountStore,databaseUrl});
  installFriends(app,accounts,(names)=>{for(const s of io.sockets.sockets.values())if(names.includes(s.data.friendUser))s.emit('friends:changed');},async(names)=>{
    const wanted=new Set(names),online=new Set();
    await Promise.all([...io.sockets.sockets.values()].filter(s=>wanted.has(s.data.friendUser)).map(async s=>{try{const u=await accounts.lookup(s.handshake.headers.cookie);if(s.connected&&u&&wanted.has(u.username))online.add(u.username);}catch{}}));
    return online;
  });
  const invitations=new Map();
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('/health', (_req, res) => res.json({ ok: true, version: '4.3.1', build:'room905-4.3.1-trailer' }));
  const ROLE_LIMITS={Navigator:1,Guardian:1,Scavenger:2};
  const roleAvailable=(room,role,except)=>Object.hasOwn(ROLE_LIMITS,role)&&room.players.filter(p=>p.id!==except&&p.role===role).length<ROLE_LIMITS[role];
  function roles(room){for(const p of room.players){p.input={};p.inputAt=0;}}
  function roster(room) {
    io.to(room.code).emit('lobby', { code: room.code, host: room.players[0]?.id, difficulty:room.difficulty||'normal', phase: room.phase, notice: room.notice || '', players: room.players.map(({ id, name, role, avatar,portrait,bio,progression }) => ({ id, name, role, avatar,portrait,bio,progression })) });
  }
  function event(g, text, kind = 'info') { g.eventId++; g.event = text; g.eventKind = kind; }
  function cargoDamage(g, item, amount) {
    if (!item) return;
    const before = item.condition; item.condition = Math.max(10, item.condition - amount);
    g.damage += Math.round(item.value * (before - item.condition) / 100);
  }
  function restorePremium(g,item){const origin=g.map.items.find(i=>i.id===item.id);if(origin){item.x=origin.x;item.z=origin.z;item.y=origin.y||0;}item.carrier=null;}
  function failParkour(g,a,item,damage){cargoDamage(g,item,damage);restorePremium(g,item);a.carrying=null;a.gripUntil=null;a.cargoSupport=0;event(g,`${item.name} returned to its platform, damaged. Try the route again.`,'damage');}
  function dropCargo(g,a,reason='dropped'){
    if(a.carrying===null)return;
    const item=g.items[a.carrying];if(item.premium&&(a.y>.65||(a.cargoSupport||0)>.65)){failParkour(g,a,item,8);return;}a.cargoSupport=0;item.carrier=null;item.x=a.x;item.z=a.z;
    item.y=Math.max(0,...g.map.platforms.filter(b=>a.x>=b.x&&a.x<=b.x+b.w&&a.z>=b.z&&a.z<=b.z+b.d&&b.h<=a.y+.03).map(b=>b.h));
    a.carrying=null;a.gripUntil=null;cargoDamage(g,item,8);
    event(g,`${a.name} ${reason} ${item.name}. −8% condition.`, 'damage');
  }
  function resetActor(room, a, now, cause) {
    const g = room.game;
    if (now < a.safeUntil || now < (a.respawnUntil||0) || dist(a, HOME) < HOME.r) return;
    a.health = Math.max(0,(a.health??100)-(cause==='sentinel'?100:50));
    if(a.health>0){a.safeUntil=now+1800;event(g,`${a.name}: EM hit · 50% suit integrity. Clear the Flux Fault before protection ends.`,'damage');return;}
    if (a.carrying !== null) {
      const item = g.items[a.carrying]; item.carrier = null; item.x = a.x; item.z = a.z; item.y = Math.max(0,...g.map.platforms.filter(b=>a.x>=b.x&&a.x<=b.x+b.w&&a.z>=b.z&&a.z<=b.z+b.d&&b.h<=a.y+.03).map(b=>b.h));
      cargoDamage(g, item, cause === 'sentinel' ? 35 : 20);if(item.premium)restorePremium(g,item);a.cargoSupport=0; a.carrying = null; a.gripUntil=null;
    }
    a.x = HOME.x; a.z = HOME.z; a.y = 0; a.vy = 0; a.grounded = true; a.speed = 0; a.safeUntil = now + 6500; a.respawnUntil = now + 3500; a.resetCause = cause;
    g.deadline -= (cause === 'sentinel' ? g.settings.sentinel : g.settings.gap)*1000;
    if (cause === 'sentinel') g.catches++;
    event(g, `${a.name}: ${cause === 'sentinel' ? 'Sentinel interference' : 'EM Flux Fault'} · suit integrity depleted. −${cause==='sentinel'?g.settings.sentinel:g.settings.gap}s. Cargo dropped; returning to extraction.`, 'danger');
  }
  function finish(room, outcome) {
    if(room.phase==='finished')return;
    room.phase = 'finished'; room.game.outcome = outcome; room.game.finalRemaining = Math.max(0, (room.game.deadline - performance.now()) / 1000);
    event(room.game, outcome === 'won' ? 'QUOTA SECURED. Extraction complete.' : 'SHIFT CLOSED. Quota missed.', outcome === 'won' ? 'success' : 'danger');
    const g=room.game,amount=g.devUsed?0:rewardXP(g);g.xpAward=amount;
    if(amount&&accounts.store?.award)for(const name of new Set(room.players.map(p=>p.accountUsername).filter(Boolean))){
      accounts.store.award(name,g.awardId,amount).then(user=>{for(const p of room.players.filter(p=>p.accountUsername===name)){if(user)p.progression=accounts.publicUser(user).progression;io.to(p.id).emit('progression:update',{user:user?accounts.publicUser(user):null,earned:amount});}}).catch(()=>{for(const p of room.players.filter(p=>p.accountUsername===name))io.to(p.id).emit('progression:update',{earned:0,error:'XP could not be saved. Account storage is unavailable.'});});
    }

  }
  function tick(room, now) {
    const g = room.game;
    if(room.pauseAt!=null)return;
    if (now >= g.deadline) { finish(room, 'lost'); return; }
    g.elapsed += DT;
    for (const a of g.actors) {
      if(a.health===0&&now>=(a.respawnUntil||0))a.health=100;
      const p = room.players.find(p => p.id === a.id), input = now >= (a.respawnUntil || 0) && now - p.inputAt < 350 ? p.input : {};
      let forward = (input.forward || 0), strafe = (input.strafe || 0), n = Math.max(1, Math.hypot(forward, strafe));
      forward /= n; strafe /= n;
      if(a.carrying!==null){if(!Number.isFinite(a.gripUntil))a.gripUntil=now+2000;if(now>=a.gripUntil)dropCargo(g,a,'lost grip on');}
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
      if(a.carrying!==null&&g.items[a.carrying]?.premium){if(a.grounded&&a.y<.15&&(a.cargoSupport||0)>.65)failParkour(g,a,g.items[a.carrying],15);else if(a.grounded)a.cargoSupport=a.y;}
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
          item.recoveredValue=value; item.delivered = true; item.carrier = null; a.carrying = null; a.gripUntil=null; g.score += value; g.deliveries++;
          event(g, `${a.name} extracted ${item.name}: +$${value}.`, 'success');
          if (g.score >= QUOTA) { finish(room, 'won'); return; }
        }
      }
    }
    const enemy = g.enemy;applyFluxFault(g,now);
    const targets = g.actors.filter(a => now >= a.safeUntil && dist(a, HOME) > HOME.r + 1 && ((dist(a, enemy) < 7.5 && clearLine(enemy, a, g.map.walls)) || (a.speed > 3.5 && dist(a, enemy) < 10)));
    targets.sort((a, b) => dist(a, enemy) - dist(b, enemy));
    const target = targets[0]; enemy.mode = target ? 'tracking' : 'patrol'; enemy.target = target?.id || null;
    const destination = target || g.map.patrol[enemy.patrol];
    if (!target && dist(enemy, destination) < 0.65) { enemy.patrol = (enemy.patrol + 1) % g.map.patrol.length; enemy.recalc = 0; }
    if (now >= enemy.recalc) { enemy.path = route(enemy, target || g.map.patrol[enemy.patrol], g.map.walls); enemy.recalc = now + 450; }
    let waypoint = enemy.path[0];
    if (waypoint && dist(enemy, waypoint) < 0.15) { enemy.path.shift(); waypoint = enemy.path[0]; }
    if (!waypoint && target && clearLine(enemy, target, g.map.walls)) waypoint = target;
    if (now<(enemy.stunnedUntil||0))enemy.mode=now<(enemy.faultUntil||0)?'flux-reboot':'stunned';
    if (waypoint && !g.devFreeze && now>=(enemy.stunnedUntil||0)) {
      const distance = dist(enemy, waypoint), stride = Math.min(distance, (target ? 2.15 : 1.3) * g.settings.speed * DT);
      if (distance > 0.001) {
        const dx = (waypoint.x - enemy.x) / distance * stride, dz = (waypoint.z - enemy.z) / distance * stride;
        enemy.yaw = Math.atan2(dx, -dz);
        if (!solid(enemy.x + dx, enemy.z, 0.3, g.map.walls)) enemy.x += dx;
        if (!solid(enemy.x, enemy.z + dz, 0.3, g.map.walls)) enemy.z += dz;
      }
    }
    applyFluxFault(g,now);
    for (const a of g.actors) if (now>=(enemy.stunnedUntil||0)&&a.y < 1.1 && dist(a, enemy) < 0.7) resetActor(room, a, now, 'sentinel');
    if (now >= g.deadline) finish(room, 'lost');
  }
  function applyFluxFault(g,now){
    const enemy=g.enemy,index=g.map.hazards.findIndex(h=>dist(enemy,h)<h.r+.3);
    if(index>=0&&enemy.faultZone!==index){
      enemy.faultUntil=now+4000;enemy.stunnedUntil=Math.max(enemy.stunnedUntil||0,enemy.faultUntil);enemy.recalc=enemy.stunnedUntil;
      enemy.mode='flux-reboot';enemy.target=null;
      event(g,`EM Flux Fault ${index+1}: Sentinel rebooting for 4 seconds.`,'success');
    }
    enemy.faultZone=index;
  }
  function snapshot(room, now) {
    if(room.pauseAt!=null)now=room.pauseAt;
    const g = room.game;
    for (const p of room.players) {
      const me = g.actors.find(a => a.id === p.id), navigator = p.role === 'Navigator';
      // Scavengers get nearby entities only; the tactical overview belongs to Navigator.
      const visible = object => navigator || (me && dist(me, object) < 1.8 && Math.abs(me.y-(object.y||0))<.7 && clearLine(me, object,g.map.walls));
      io.to(p.id).emit('state', {
        paused:room.pauseAt!=null, roundId: g.started, mapSeed:g.map.seed, phase: room.phase, role: p.role, remaining: room.phase === 'finished' ? g.finalRemaining : Math.max(0, (g.deadline - now) / 1000),
        respawn: room.phase==='playing'&&me&&now<(me.respawnUntil||0)?{cause:me.resetCause,penalty:me.resetCause==='sentinel'?g.settings.sentinel:g.settings.gap,remaining:(me.respawnUntil-now)/1000}:null,
        recovered: g.items.filter(i=>i.delivered).map(i=>({id:i.id,kind:i.kind,name:i.name,value:i.recoveredValue})),
        difficulty:g.difficulty,difficultyLabel:g.settings.label, duration:g.settings.seconds,
        xpAward:g.xpAward||0, quota: QUOTA, score: g.score, deliveries: g.deliveries, catches: g.catches, damage: g.damage,
        actors: g.actors.map(a => ({ id: a.id, name: a.name, role:a.role, avatar:a.avatar, heritage:a.heritage, x: a.x, z: a.z, y:a.y, grounded:a.grounded, yaw: a.yaw, carrying: a.carrying, health:a.health, speed: a.speed, safe: now < a.safeUntil, gripRemaining:a.carrying!==null?Math.max(0,((a.gripUntil||now)-now)/1000):0 })),
        items: g.items.filter(i => !i.delivered && (i.carrier === p.id || visible(i))).map(i => ({ ...i })),
        // Only a coarse warning intensity reaches bodycams, never enemy coordinates.
        threat: !navigator && me && room.phase==='playing' ? Math.round(clamp((9-dist(me,g.enemy))/8,0,1)*10)/10 : 0,
        guardian: p.role==='Guardian'?{cooldown:Math.max(0,((me?.stunReady||0)-now)/1000),range:6}:null,
        enemy: navigator||p.role==='Guardian' ? { x: g.enemy.x, z: g.enemy.z, yaw: g.enemy.yaw, stunned:Math.max(0,((g.enemy.stunnedUntil||0)-now)/1000), mode: g.enemy.mode, target: g.enemy.target } : null,
        ping: g.ping && now < g.ping.until ? g.ping : null, cue: g.cue && now < g.cue.until ? g.cue : null,
        eventId: g.eventId, event: g.event, eventKind: g.eventKind || 'info', outcome: g.outcome,
        elapsed: g.elapsed
      });
    }
  }
  function resumeClock(room){
    if(room.pauseAt==null||room.players.some(p=>pendingDisconnects.has(p.id)))return;
    const delta=performance.now()-room.pauseAt,g=room.game;room.pauseAt=null;
    if(!g)return;
    for(const [object,fields]of [[g,['deadline']],[g.enemy,['recalc','stunnedUntil','faultUntil']],...g.actors.map(a=>[a,['safeUntil','respawnUntil','gripUntil','stunReady','bumpAt']]),[g.ping,['until']],[g.cue,['until']]])
      if(object)for(const field of fields)if(Number.isFinite(object[field])&&object[field]>0)object[field]+=delta;
    roles(room);
  }
  function leave(socket) {
    const room = rooms.get(socket.data.code);
    clearTimeout(pendingDisconnects.get(socket.id));pendingDisconnects.delete(socket.id);
    socket.leave(socket.data.code || ''); socket.data.code = null;
    if (!room) return;
    room.players = room.players.filter(p => p.id !== socket.id);
    if (!room.players.length) { rooms.delete(room.code); return; }
    if (room.phase === 'playing') { room.phase = 'lobby'; room.game = null; room.notice = 'A teammate disconnected. Roles preserved; fill any missing role before relaunch.'; }
    resumeClock(room);roles(room); roster(room);
  }
  io.use(async(socket,next)=>{
    if(!socket.recovered)return next();
    socket.data.devUntil=0;socket.data.friendUser=null;
    const room=rooms.get(socket.data.code),p=room?.players.find(p=>p.id===socket.id);
    if(!p||!pendingDisconnects.has(socket.id))return next(new Error("Crew session expired. Reload and rejoin."));
    try{if(p.accountUsername&&(await accounts.lookup(socket.handshake.headers.cookie))?.username!==p.accountUsername)return next(new Error("Sign in again before rejoining."));next();}catch{next(new Error("Account verification unavailable. Retry shortly."));}
  });
  io.on('connection', socket => {
    if(socket.recovered){
      clearTimeout(pendingDisconnects.get(socket.id));pendingDisconnects.delete(socket.id);
      const room=rooms.get(socket.data.code);resumeClock(room);roster(room);
      if(room.game)snapshot(room,performance.now());
    }
    socket.emit('build', {version:'4.3.1'});
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
    socket.on('dev:photos',async(_data,ack)=>{if(typeof ack!=='function')return;if(!isDev(socket))return ack({error:'Developer session expired. Sign in again.'});try{const rows=await accounts.store?.photoQueue();ack({photos:(rows||[]).map(u=>({username:u.username,image:u.photo_pending,revision:digest(u.photo_pending).toString('hex')}))});}catch{ack({error:'Photo queue unavailable.'});}});
    socket.on('dev:photo-review',async(data,ack)=>{if(typeof ack!=='function')return;if(!isDev(socket))return ack({error:'Developer session expired. Sign in again.'});if(!['approve','reject'].includes(data?.action))return ack({error:'Choose approve or reject.'});try{const rows=await accounts.store.photoQueue(),u=rows.find(u=>u.username===data.username&&digest(u.photo_pending).toString('hex')===data.revision);if(!u)return ack({error:'This photo changed. Refresh the queue.'});ack({ok:await accounts.store.reviewPhoto(u.username,u.photo_pending,data.action==='approve')});}catch{ack({error:'Photo review unavailable.'});}});
    socket.on('dev:logout',()=>{socket.data.devUntil=0;});
    let lastDev=-Infinity;
    socket.on('dev:action',(data,ack)=>{
      const reply=typeof ack==='function'?ack:()=>{},now=performance.now();
      if(!isDev(socket))return reply({error:'Developer session expired. Sign in again.'});
      if(now-lastDev<200)return reply({error:'Wait a moment.'});lastDev=now;
      const room=rooms.get(socket.data.code);
      if(!room||room.phase!=='playing'||room.pauseAt!=null)return reply({error:'Launch a recovery mission in your room first.'});
      const g=room.game,targets=data?.target==='all'?g.actors:g.actors.filter(a=>a.id===data?.target);g.devUsed=true;
      if(['red','heartbeat','ambience','combined','clear'].includes(data?.action)){
        if(!targets.length)return reply({error:'Select a Scavenger.'});
        for(const a of targets)io.to(a.id).emit('dev:effect',{kind:data.action,seconds:5});
      }else if(data?.action==='freeze'){g.devFreeze=!g.devFreeze;event(g,`DEV TEST: Sentinel ${g.devFreeze?'frozen':'resumed'}.`);}
      else if(data?.action==='time'){g.deadline+=30000;event(g,'DEV TEST: +30 seconds.');}
      else if(data?.action==='finish'){g.devUsed=true;finish(room,'lost');}
      else if(data?.action==='win'){g.devUsed=true;g.score=QUOTA;finish(room,'won');}
      else {
        if(!targets.length)return reply({error:'Select a Scavenger.'});
        if(!['near','far','home','parkour','premium','protect','breach','catch','damage','grip','expire-grip'].includes(data?.action))return reply({error:'Unknown developer action.'});
        if(['near','far'].includes(data.action)&&targets.length!==1)return reply({error:'Select one Scavenger for Sentinel placement.'});
        if(['grip','expire-grip'].includes(data.action)&&!targets.some(a=>a.carrying!==null))return reply({error:'No selected crew member is holding property.'});
        for(const a of targets){
          if(['grip','expire-grip'].includes(data.action)){if(a.carrying!==null)a.gripUntil=data.action==='grip'?now+2000:now-1;}
          else if(data.action==='near'||data.action==='far'){
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
            if(item&&a.carrying===null){item.carrier=a.id;a.carrying=item.id;a.gripUntil=now+2000;}
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
        g.devUsed=true;event(g,`DEV TEST: ${data.action}.`);
      }
      reply({ok:true});snapshot(room,now);
    });
    let lastEnter = -Infinity, lastChat = -Infinity, lastInteract = -Infinity, lastGuide = -Infinity;
    const enterRoom=async (data, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {}, now = performance.now();
      if (now - lastEnter < 400) return reply({ error: 'Wait a moment before trying again.' });
      lastEnter = now;
      if (!data || typeof data !== 'object') return reply({ error: 'Invalid room request.' });
      if (socket.data.code) return reply({ error: 'Leave your room first.' });
      let account=null;try{account=await accounts.lookup(socket.handshake.headers.cookie);}catch{return reply({error:'Account service unavailable. Sign out or try again.'});}
      if(!socket.connected||socket.data.code)return reply({error:'Room request no longer available.'});
      const name = account?account.username:typeof data.name === 'string' ? data.name.trim().slice(0, 18) : '';
      if (!name) return reply({ error: 'Enter your callsign first.' });
      if(!account&&filterText(name,18,{strict:true}).error)return reply({error:'Please choose an appropriate callsign without links or contact details.'});
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
        if(room.players.some(p=>pendingDisconnects.has(p.id)))return reply({error:'Wait for your teammate to reconnect or leave the crew.'});
      if (room.phase === 'playing') return reply({ error: 'Shift in progress. Join when it ends.' });
        if (room.players.length === 4) return reply({ error: 'Room full (4/4).' });
      }
      const chosen=typeof data.role==='string'?data.role:!room.players.some(p=>p.role==='Navigator')?'Navigator':roleAvailable(room,'Scavenger')?'Scavenger':'Guardian';
      if(!Object.hasOwn(ROLE_LIMITS,chosen)){if(!room.players.length)rooms.delete(room.code);return reply({error:'Choose Navigator, Guardian or Recovery.'});}
      if(!roleAvailable(room,chosen)){if(!room.players.length)rooms.delete(room.code);return reply({error:`${chosen==='Scavenger'?'Recovery':chosen} role is not available. Please choose another role.`});}
      room.players.push({ id: socket.id, role:chosen, name, accountUsername:account?.username||null, avatar:account?.avatar||'amber', portrait:account?accounts.publicUser(account).portrait:null, bio:account?.bio||'', progression:account?accounts.publicUser(account).progression:null, input: {}, inputAt: 0 }); roles(room);
      socket.data.code = room.code; socket.join(room.code); reply({ ok: true }); roster(room);
    };
    socket.on('enter',enterRoom);
    socket.on('friends:subscribe',async(_data,ack)=>{try{const u=await accounts.lookup(socket.handshake.headers.cookie);socket.data.friendUser=u?.username||null;if(typeof ack==='function')ack({ok:!!u});}catch{if(typeof ack==='function')ack({error:'Account service unavailable.'});}});
    let lastInvite=-Infinity;
    socket.on('friend:invite',async(data,ack)=>{
      const reply=typeof ack==='function'?ack:()=>{},now=Date.now();
      if(now-lastInvite<2000)return reply({error:'Wait before sending another invitation.'});lastInvite=now;
      try{
       const u=await accounts.lookup(socket.handshake.headers.cookie),room=rooms.get(socket.data.code);
       if(!u)return reply({error:'Sign in to invite friends.'});
       if(!room||room.phase!=='lobby'||!room.players.some(p=>p.id===socket.id&&p.accountUsername===u.username))return reply({error:'Create or join a lobby first.'});
       if(room.players.length>=4)return reply({error:'Your lobby is full.'});
       const other=typeof data?.username==='string'?data.username.trim().toLowerCase():'';
       if(!await accounts.store.areFriends(u.username,other))return reply({error:'Only accepted friends can be invited.'});
       const targets=[];for(const s of io.sockets.sockets.values())if(s.data.friendUser===other){const recipient=await accounts.lookup(s.handshake.headers.cookie);if(recipient?.username===other)targets.push(s);}
       if(!targets.length)return reply({error:'Your friend must have the game open and be signed in.'});
       for(const [id,v]of invitations)if(v.expires<now)invitations.delete(id);
       if(invitations.size>=2000)return reply({error:'Invite queue is full. Try later.'});
       const id=require('node:crypto').randomUUID(),invite={id,from:u.username,to:other,code:room.code,room,expires:now+120000};invitations.set(id,invite);
       for(const s of targets)s.emit('friend:invitation',{id,from:invite.from,code:invite.code,expires:invite.expires});reply({ok:true});
      }catch{reply({error:'Friends service unavailable.'});}
    });
    socket.on('friend:join',async(data,ack)=>{
      const reply=typeof ack==='function'?ack:()=>{};
      try{const u=await accounts.lookup(socket.handshake.headers.cookie),invite=invitations.get(data?.id);
       if(!u||!invite||invite.to!==u.username||invite.expires<Date.now())return reply({error:'Invitation expired or unavailable.'});
       if(rooms.get(invite.code)!==invite.room)return reply({error:'This lobby is no longer available.'});
       if(!await accounts.store.areFriends(u.username,invite.from))return reply({error:'This friendship is no longer active.'});
       await enterRoom({code:invite.code,name:u.username,role:data.role},r=>{if(r.ok)invitations.delete(invite.id);reply(r);});
      }catch{reply({error:'Could not join this invitation.'});}
    });
    socket.on('lobby:role',(data,ack)=>{
      const reply=typeof ack==='function'?ack:()=>{},room=rooms.get(socket.data.code),player=room?.players.find(p=>p.id===socket.id);
      if(!player||room.phase!=='lobby')return reply({error:'Roles can be changed in the lobby before launch.'});
      if(!roleAvailable(room,data?.role,player.id))return reply({error:'That role is not available. Please choose another role.'});
      player.role=data.role;roles(room);roster(room);reply({ok:true});
    });
    socket.on('lobby:difficulty',(data,ack)=>{
      const reply=typeof ack==='function'?ack:()=>{},room=rooms.get(socket.data.code);
      if(!room||room.players[0]?.id!==socket.id)return reply({error:'Only the lobby creator can change difficulty.'});
      if(room.phase!=='lobby')return reply({error:'Difficulty is locked during a shift.'});
      if(!Object.hasOwn(DIFFICULTIES,data?.difficulty))return reply({error:'Choose Easy, Normal or Hard.'});
      room.difficulty=data.difficulty;roster(room);reply({ok:true});
    });
    socket.on('start', (_data, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {}, room = rooms.get(socket.data.code);
      if (!room || room.players[0]?.id !== socket.id && !isDev(socket)) return reply({ error: 'The host launches the shift.' });
      if(room.players.length<2||!room.players.some(p=>p.role==='Navigator')||!room.players.some(p=>p.role==='Scavenger'))return reply({error:'Need one Navigator and at least one Recovery crew member. Choose roles before launch.'});
      if(room.players.some(p=>pendingDisconnects.has(p.id)))return reply({error:'Wait for your teammate to reconnect or leave the crew.'});
      if (room.phase === 'playing') return reply({ error: 'Shift already running.' });
      roles(room); room.phase = 'playing'; room.notice = ''; room.game = freshGame(room.players, performance.now(), mapFactory(),room.difficulty||'normal');
      reply({ ok: true }); roster(room);
      for (const p of room.players) io.to(p.id).emit('world', { width: W, depth: H, walls: room.game.map.walls, platforms:room.game.map.platforms, seed:room.game.map.seed, hazards: p.role === 'Navigator' ? room.game.map.hazards : [], home: HOME, quota: QUOTA, duration: room.game.settings.seconds,difficulty:room.game.difficulty });
      snapshot(room, performance.now());
    });
    socket.on('input', data => {
      const room = rooms.get(socket.data.code), player = room?.players.find(p => p.id === socket.id), now = performance.now();
      if (!player || player.role === 'Navigator' || room.phase !== 'playing' || room.pauseAt!=null || !data || typeof data !== 'object' || now - player.inputAt < 15) return;
      const axis = key => typeof data[key] === 'number' && Number.isFinite(data[key]) ? clamp(data[key], -1, 1) : 0;
      const actor = room.game.actors.find(a => a.id === socket.id);
      player.input = { forward: axis('forward'), strafe: axis('strafe'), yaw: typeof data.yaw === 'number' && Number.isFinite(data.yaw) ? ((data.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) : actor.yaw, jump: data.jump === true, sprint: data.sprint === true };
      player.inputAt = now;
    });
    socket.on('guardian:stun',(_data,ack)=>{
      const reply=typeof ack==='function'?ack:()=>{},now=performance.now(),room=rooms.get(socket.data.code);
      if(!room||room.phase!=='playing'||room.pauseAt!=null)return reply({error:'Launch a shift first.'});
      const g=room.game,a=g.actors.find(a=>a.id===socket.id);
      if(a?.role!=='Guardian')return reply({error:'Only the Guardian can pulse the Sentinel.'});
      if(now<(a.respawnUntil||0))return reply({error:'Wait for your sensor link.'});
      if(now<a.stunReady)return reply({error:'Pulse is recharging.'});
      if(dist(a,g.enemy)>6||Math.abs(a.y)>1.5||!clearLine(a,g.enemy,g.map.walls))return reply({error:'Sentinel must be within 6m with a clear signal path.'});
      a.stunReady=now+12000;g.enemy.stunnedUntil=Math.max(g.enemy.stunnedUntil||0,now+3000);g.enemy.mode='stunned';g.enemy.recalc=now+3000;
      event(g,`${a.name} paused the Sentinel signal for 3 seconds.`,'success');reply({ok:true});snapshot(room,now);
    });
    socket.on('interact', () => {
      const room = rooms.get(socket.data.code), now = performance.now();
      if (!room || room.phase !== 'playing' || room.pauseAt!=null || now - lastInteract < 350) return;
      lastInteract = now;
      const g = room.game, a = g.actors.find(a => a.id === socket.id);
      if (!a || now < (a.respawnUntil || 0)) return;
      if(a.carrying!==null){a.gripUntil=now+2000;return;}
      const item = g.items.filter(i => !i.delivered && !i.carrier && dist(a, i) < 1.8 && Math.abs(a.y-(i.y||0))<.7 && clearLine(a, i, g.map.walls)).sort((i, j) => dist(a, i) - dist(a, j))[0];
      if (item) { item.carrier = a.id; a.carrying = item.id; a.gripUntil=now+2000;a.cargoSupport=item.premium?a.y:0; event(g, `${a.name} secured ${item.name}. Return to extraction.`, 'pickup'); }
    });
    socket.on('cargo:drop',()=>{
      const room=rooms.get(socket.data.code),now=performance.now();if(!room||room.phase!=='playing'||room.pauseAt!=null||now-lastInteract<350)return;
      const a=room.game.actors.find(a=>a.id===socket.id);if(!a||now<(a.respawnUntil||0))return;
      lastInteract=now;dropCargo(room.game,a);
    });
    socket.on('guide', data => {
      const room = rooms.get(socket.data.code), now = performance.now();
      if (!room || room.phase !== 'playing' || room.pauseAt!=null || room.players.find(p=>p.id===socket.id)?.role !== 'Navigator' || !data || typeof data !== 'object' || now - lastGuide < 180) return;
      lastGuide = now;
      const commands = ['FORWARD', 'LEFT', 'RIGHT', 'STOP', 'DANGER', 'EXTRACT'];
      if (commands.includes(data.command)) room.game.cue = { text: data.command, until: now + 4500 };
      if (typeof data.x === 'number' && typeof data.z === 'number' && Number.isFinite(data.x) && Number.isFinite(data.z) && data.x > 1 && data.x < W - 1 && data.z > 1 && data.z < H - 1 && !solid(data.x, data.z,RADIUS,room.game.map.walls)) room.game.ping = { x: data.x, z: data.z, until: now + 12000 };
    });
    socket.on('chat', (text,ack) => {
      const reply=typeof ack==='function'?ack:()=>{};
      const room = rooms.get(socket.data.code), now = performance.now();
      if(!room)return reply({error:'Join a crew first.'});
      const player=room.players.find(p=>p.id===socket.id);if(!player)return;
      if(now<(player.chatMutedUntil||0))return reply({error:'Chat is temporarily muted.'});
      const result=moderateChat(text,player,now);if(result.error)return reply(result);
      if(now-lastChat<650)return reply({error:'Wait a moment between messages.'});lastChat=now;
      io.to(room.code).emit('chat',{id:player.id,name:player.name,text:result.text});reply({ok:true});
    });
    socket.on('chat:mute',(data,ack)=>{
      const reply=typeof ack==='function'?ack:()=>{},room=rooms.get(socket.data.code);
      if(!room||room.players[0]?.id!==socket.id)return reply({error:'Only the host can moderate crew chat.'});
      const player=room.players.find(p=>p.id===data?.id);if(!player||player.id===socket.id)return reply({error:'Choose another crew member.'});
      player.chatMutedUntil=performance.now()+60000;reply({ok:true});
    });
    socket.on('leave', () => { leave(socket); socket.emit('left'); });
    socket.on('disconnect', reason => {
      const room=rooms.get(socket.data.code);
      if(closing||!room||!['transport close','transport error','ping timeout'].includes(reason))return leave(socket);
      roles(room);socket.data.devUntil=0;
      if(room.phase==='playing'&&room.pauseAt==null)room.pauseAt=performance.now();
      const expiry=setTimeout(()=>leave(socket),disconnectGraceMs);expiry.unref();pendingDisconnects.set(socket.id,expiry);
      if(room.game)snapshot(room,performance.now());
    });
  });
  let previous = performance.now(), accumulator = 0;
  const timer = setInterval(() => {
    const now = performance.now(); accumulator += Math.min((now - previous) / 1000, 0.25); previous = now;
    while (accumulator >= DT) { for (const room of rooms.values()) if (room.phase === 'playing') tick(room, now); accumulator -= DT; }
    for (const room of rooms.values()) if (room.game && room.phase !== 'lobby') snapshot(room, now);
  }, 50);
  const close = async () => { closing=true;for(const t of pendingDisconnects.values())clearTimeout(t);pendingDisconnects.clear();clearInterval(timer); await new Promise(resolve => io.close(resolve)); await accounts.close(); };
  return { app, server, io, rooms, close };
}
if (require.main === module) {
  const game = createGameServer(); game.server.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log(`Room 905 v4.3.1 running on port ${process.env.PORT || 3000}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await game.close(); process.exit(0); });
}
module.exports = { createGameServer, solid, route, clearLine, WALLS, HOME, CARGO, HAZARDS, PATROL, generateMap, floorCells, resolvePlatformOverlap, platformOverlap };
