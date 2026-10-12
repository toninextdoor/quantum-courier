'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
const { createGameServer, solid, route, clearLine, HOME, CARGO, WALLS, HAZARDS, PATROL, generateMap, floorCells, resolvePlatformOverlap, platformOverlap } = require('../server');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const request = (socket, event, data) => new Promise((resolve, reject) => socket.timeout(2500).emit(event, data, (err, result) => err ? reject(err) : resolve(result)));
const next = (socket, event) => new Promise((resolve, reject) => { const timer = setTimeout(() => { socket.off(event, handler); reject(Error(`Timed out waiting for ${event}`)); }, 3000); const handler = data => { clearTimeout(timer); resolve(data); }; socket.once(event, handler); });
test('all valuables have navigable paths; solid walls block sight and movement', () => {
  for (const [name,,x,z] of CARGO) { assert.equal(solid(x,z),false,name); const path = route(HOME,{x,z}); assert.ok(path.length,name); for(const p of path) assert.equal(solid(p.x,p.z,.3),false); }
  assert.equal(clearLine({x:7,z:5},{x:10,z:5}),false);
  assert.equal(clearLine({x:7,z:10.5},{x:10,z:10.5}),true);
});
test('multiplayer authority, cargo, guidance, penalties, round result, replay and room cleanup', async () => {
  const game=createGameServer({mapFactory:()=>({seed:1,walls:WALLS,hazards:HAZARDS,patrol:PATROL,platforms:[],items:CARGO.map(([name,value,x,z,kind],id)=>({id,name,value,x,z,y:0,kind,condition:100,carrier:null,delivered:false}))})});await new Promise(resolve=>game.server.listen(0,'127.0.0.1',resolve));
  const clients=[];
  try {
    const url=`http://127.0.0.1:${game.server.address().port}`;
    for(let i=0;i<6;i++){const c=io(url,{transports:['websocket'],reconnection:false});clients.push(c);await next(c,'connect');}
    const [a,b,c,d,e,outsider]=clients;
    const initialLobby=next(a,'lobby'); const roomResponse=await request(a,'enter',{create:true,name:'Guide'}); const code=(await initialLobby).code;
    assert.equal(roomResponse.ok,true);assert.match(code,/^[A-Z]{4}$/);
    assert.match((await request(a,'start',{})).error,/Need/);
    for(const [i,client]of [b,c,d].entries())assert.equal((await request(client,'enter',{name:`Runner${i}`,code:code.toLowerCase()})).ok,true);
    assert.match((await request(e,'enter',{name:'Extra',code})).error,/full/);
    assert.match((await request(b,'start',{})).error,/host/);
    let outsiderStates=0;outsider.on('state',()=>outsiderStates++);
    const worlds=clients.slice(0,4).map(c=>next(c,'world'));
    assert.equal((await request(a,'start',{})).ok,true); const maps=await Promise.all(worlds); assert.equal(maps[0].duration,180);assert.equal(maps[0].hazards.length,3);assert.deepEqual(maps[1].hazards,[]);assert.deepEqual(maps[2].hazards,[]);
    const views=await Promise.all(clients.slice(0,4).map(c=>next(c,'state')));
    assert.deepEqual(views.map(v=>v.role),['Navigator','Scavenger','Scavenger','Scavenger']);assert.equal(views[0].items.length,8);assert.equal(views[1].items.length,0);assert.equal(views[1].enemy,null);
    const room=game.rooms.get(code),g=room.game,actor=g.actors[0];
    const origin=actor.x;a.emit('input',{strafe:1,yaw:0});await delay(80);assert.equal(actor.x,origin);
    b.emit('input',{strafe:1,yaw:0});await delay(100);assert.ok(actor.x>origin&&actor.x<origin+1);
    await delay(450);const stopped=actor.x;await delay(100);assert.equal(actor.x,stopped);
    b.emit('input',{forward:1,yaw:NaN});await delay(60);assert.ok(Number.isFinite(actor.yaw));
    a.emit('guide',{command:'STOP',x:5.5,z:19.5});await delay(65);assert.equal(g.cue.text,'STOP');assert.equal(g.ping.x,5.5);
    b.emit('guide',{command:'DANGER',x:22,z:5});await delay(65);assert.equal(g.cue.text,'STOP');
    const first=g.items[0];Object.assign(actor,{x:first.x,z:first.z,speed:0});room.players[1].input={};
    b.emit('interact');await delay(70);assert.equal(actor.carrying,first.id);assert.equal(first.carrier,b.id);
    await delay(380);b.emit('cargo:drop');await delay(65);assert.equal(actor.carrying,null);assert.equal(first.condition,92);
    await delay(380);b.emit('interact');await delay(65);assert.equal(actor.carrying,first.id);
    Object.assign(actor,{x:HOME.x,z:HOME.z});await delay(70);assert.equal(first.delivered,true);assert.equal(g.score,138);assert.equal(actor.carrying,null);
    const second=g.items[1];Object.assign(actor,{x:second.x,z:second.z});await delay(380);b.emit('interact');await delay(65);assert.equal(actor.carrying,1);
    Object.assign(actor,{x:7.71,z:12.5,yaw:Math.PI/2});b.emit('input',{forward:1,yaw:Math.PI/2,sprint:true});await delay(80);
    assert.ok(actor.x<7.73);assert.equal(second.condition,88);
    room.players[1].input={};room.players[1].inputAt=0;
    const deadline=g.deadline;actor.safeUntil=0;Object.assign(actor,{x:6,z:11});await delay(65);
    assert.equal(actor.x,HOME.x);assert.equal(g.deadline,deadline-5000);assert.equal(actor.carrying,null);assert.equal(second.carrier,null);assert.equal(second.condition,68);
    actor.safeUntil=0;Object.assign(actor,{x:24.5,z:5.5});Object.assign(g.enemy,{x:24.5,z:5.5});const before=g.deadline;const classified=await next(b,'state');assert.equal(classified.enemy,null);await delay(65);
    assert.equal(actor.x,HOME.x);assert.equal(g.catches,1);assert.equal(g.deadline,before-10000);
    g.score=599;const third=g.items[2];third.carrier=actor.id;actor.carrying=third.id;Object.assign(actor,{x:HOME.x,z:HOME.z});
    await delay(70);assert.equal(room.phase,'finished');assert.equal(g.outcome,'won');
    assert.equal((await request(a,'start',{})).ok,true);assert.equal(room.game.score,0);assert.equal(room.game.items.length,8);
    room.game.deadline=0;await delay(65);assert.equal(room.game.outcome,'lost');
    assert.equal((await request(a,'start',{})).ok,true);const returned=next(a,'lobby');d.disconnect();assert.equal((await returned).phase,'lobby');assert.equal(room.game,null);
    assert.equal(outsiderStates,0);
    const threeModule=await fetch(`${url}/vendor/three.module.js`);assert.equal(threeModule.status,200);assert.match(await threeModule.text(),/WebGLRenderer/);
    for(const file of ['/','/style.css','/game.js'])assert.equal((await fetch(url+file)).status,200);
    a.disconnect();b.disconnect();c.disconnect();await delay(65);assert.equal(game.rooms.size,0);
  } finally {clients.forEach(c=>c.disconnect());await game.close();}
});

test('200 seeded warehouses vary and retain safe access to ordinary cargo and parkour entry',()=>{
  const layouts=new Set(), courses=new Set();
  for(let seed=1;seed<=200;seed++){
    const map=generateMap(seed);layouts.add(JSON.stringify(map.walls));courses.add(JSON.stringify(map.platforms));
    assert.deepEqual(map,generateMap(seed),'seed must be reproducible');
    const safe=floorCells(map.walls,map.hazards), reachable=new Set(safe.map(c=>`${c.x},${c.z}`));
    for(const item of map.items.filter(i=>!i.premium))assert.ok(reachable.has(`${item.x},${item.z}`),'cargo must have a breach-free route');
    assert.ok(map.items.filter(i=>!i.premium).reduce((n,i)=>n+i.value,0)>=600);
    assert.ok(map.hazards.every(h=>Math.hypot(h.x-HOME.x,h.z-HOME.z)>7));
    for(const p of map.platforms)assert.equal(solid(p.x+p.w/2,p.z+p.d/2,.3,map.walls),false);
    assert.equal(map.items[8].value,450);assert.equal(map.items[8].y,map.platforms[3].h);
    for(const patrol of map.patrol)assert.ok(route(HOME,patrol,map.walls).length);
  }
  assert.equal(layouts.size,200);assert.equal(courses.size,200);
});
test('randomized replay, jump authority, platform landing, premium pickup and extraction',async()=>{
  const game=createGameServer();await new Promise(r=>game.server.listen(0,'127.0.0.1',r));const clients=[];
  try{
    const url=`http://127.0.0.1:${game.server.address().port}`;
    for(let i=0;i<2;i++){const c=io(url,{transports:['websocket'],reconnection:false});clients.push(c);await next(c,'connect');}
    const [nav,runner]=clients,initial=next(nav,'lobby');await request(nav,'enter',{create:true,name:'Nav'});const code=(await initial).code;
    await request(runner,'enter',{code,name:'Runner'});await request(nav,'start',{});const room=game.rooms.get(code),g=room.game,a=g.actors[0],map=g.map;
    runner.emit('input',{jump:true,yaw:0});await delay(150);assert.ok(a.y>.4);const peak=a.y;
    runner.emit('input',{jump:true,y:999,grounded:true});await delay(150);assert.ok(a.y<1.5,'clients cannot teleport vertically');assert.ok(a.y>=peak);
    await delay(850);assert.equal(a.y,0);assert.equal(a.grounded,true);
    const axis=Math.abs(map.platforms[1].x-map.platforms[0].x)>.1?'x':'z',other=axis==='x'?'z':'x';
    const size=axis==='x'?'w':'d',otherSize=axis==='x'?'d':'w';
    const direction=Math.sign(map.platforms[1][axis]-map.platforms[0][axis]),firstStep=map.platforms[0];
    Object.assign(a,{[axis]:firstStep[axis]+firstStep[size]/2-direction*1.3,[other]:firstStep[other]+firstStep[otherSize]/2,y:0,vy:0,grounded:true,safeUntil:Infinity,jumpHeld:false});
    room.players[1].input={};
    for(const step of map.platforms){
      const goal=step[axis]+step[size]/2,heading=axis==='x'?(direction>0?Math.PI/2:Math.PI*1.5):(direction>0?Math.PI:0);
      let guard=0;
      while(Math.abs(a[axis]-goal)>.18&&guard++<40){runner.emit('input',{forward:1,yaw:heading,jump:true});await delay(50);}
      runner.emit('input',{forward:0,yaw:heading,jump:false});await delay(750);
      assert.ok(Math.abs(a[axis]-goal)<.2,'jump must reach next platform using real movement');assert.equal(a.y,step.h,'jump must land on ascending platform');
    }
    const platform=map.platforms[3],premium=g.items[8];Object.assign(a,{x:premium.x,z:premium.z,y:0,vy:0,grounded:true});
    runner.emit('interact');await delay(80);assert.equal(a.carrying,null,'cannot grab high cargo from floor');
    Object.assign(a,{x:premium.x,z:premium.z,y:platform.h,vy:0,grounded:true});await delay(380);runner.emit('interact');await delay(70);assert.equal(a.carrying,8);assert.equal(a.y,platform.h,'standing on platform remains stable');
    // Step down onto the adjacent lower platform and ensure its floor catches a fall.
    const lower=map.platforms[2];Object.assign(a,{x:lower.x+lower.w/2,z:lower.z+lower.d/2});await delay(450);assert.equal(a.y,lower.h);
    Object.assign(a,{x:HOME.x,z:HOME.z,y:0,vy:0,grounded:true});await delay(80);assert.equal(g.score,450);
    g.deadline=0;await delay(80);const oldLayout=JSON.stringify(map.walls);const world=next(nav,'world');await request(nav,'start',{});const newWorld=await world;
    assert.notEqual(newWorld.seed,map.seed);assert.notEqual(JSON.stringify(newWorld.walls),oldLayout);
    assert.equal(room.game.items.length,9);assert.equal(room.game.score,0);
  }finally{clients.forEach(c=>c.disconnect());await game.close();}
});

test('embedded and edge-falling players escape platforms without entering walls',()=>{
  for(let seed=1;seed<=40;seed++){
    const map=generateMap(seed);
    for(const b of map.platforms){
      for(const y of [0,b.h-.05]){
        const a={x:b.x+b.w/2,z:b.z+b.d/2,y};
        resolvePlatformOverlap(a,map);
        assert.ok(!map.platforms.some(p=>platformOverlap(a,p)),`embedded player freed in seed ${seed}`);
        assert.equal(solid(a.x,a.z,.28,map.walls),false);
      }
    }
  }
});
test('proximity warnings increase nearby without exposing enemy coordinates',async()=>{
  const game=createGameServer({mapFactory:()=>generateMap(42)});await new Promise(r=>game.server.listen(0,'127.0.0.1',r));const clients=[];
  try{
    for(let i=0;i<2;i++){const c=io(`http://127.0.0.1:${game.server.address().port}`,{transports:['websocket']});clients.push(c);await next(c,'connect');}
    const [nav,runner]=clients,lobby=next(nav,'lobby');await request(nav,'enter',{create:true,name:'Nav'});const code=(await lobby).code;
    await request(runner,'enter',{code,name:'Runner'});await request(nav,'start',{});
    const g=game.rooms.get(code).game,a=g.actors[0];Object.assign(a,{x:22,z:8,safeUntil:0});
    g.enemy.path=[];g.enemy.recalc=Infinity;Object.assign(g.enemy,{x:22,z:6});
    await delay(80);const near=await next(runner,'state');assert.ok(near.threat>=.8);assert.equal(near.enemy,null);
    Object.assign(g.enemy,{x:10,z:8});await delay(80);const far=await next(runner,'state');assert.equal(far.threat,0);
    a.safeUntil=Infinity;Object.assign(g.enemy,{x:22,z:6});await delay(80);assert.ok((await next(runner,'state')).threat>=.8,'protection does not hide a nearby monster');
  }finally{clients.forEach(c=>c.disconnect());await game.close();}
});

test('developer authorization, room scope, effect broadcasts, logout and disabled access',async()=>{
 const game=createGameServer({devUsername:'tester',devPassword:'test-only-password-12345',mapFactory:()=>generateMap(42)});await new Promise(r=>game.server.listen(0,'127.0.0.1',r));const cs=[];
 try{
  for(let i=0;i<4;i++){const s=io(`http://127.0.0.1:${game.server.address().port}`,{transports:['websocket']});cs.push(s);await next(s,'connect');}
  const [nav,a,b,outsider]=cs,lobby=next(nav,'lobby');await request(nav,'enter',{create:true,name:'Nav'});const code=(await lobby).code;
  await request(a,'enter',{code,name:'A'});await request(b,'enter',{code,name:'B'});await request(outsider,'enter',{create:true,name:'Other'});await request(nav,'start',{});
  assert.match((await request(b,'dev:action',{action:'time'})).error,/session/);
  assert.match((await request(b,'dev:login',{username:'tester',password:'wrong'})).error,/credentials/);
  assert.equal((await request(b,'dev:login',{username:'tester',password:'test-only-password-12345'})).ok,true);
  let leaked=0;outsider.on('dev:effect',()=>leaked++);
  const effects=[next(a,'dev:effect'),next(b,'dev:effect')];await request(b,'dev:action',{action:'combined',target:'all'});
  assert.deepEqual((await Promise.all(effects)).map(e=>e.kind),['combined','combined']);assert.equal(leaked,0);
  await delay(210);assert.match((await request(b,'dev:action',{action:'home',target:outsider.id})).error,/Select/);
  await delay(210);await request(b,'dev:action',{action:'freeze'});const room=game.rooms.get(code);assert.equal(room.game.devFreeze,true);
  await delay(210);await request(b,'dev:action',{action:'parkour',target:a.id});assert.ok(room.game.actors[0].x>19);
  await delay(210);await request(b,'dev:action',{action:'premium',target:a.id});assert.equal(room.game.actors[0].carrying,8);
  await delay(210);await request(b,'dev:action',{action:'home',target:a.id});await delay(80);assert.equal(room.game.score,450);
  await delay(210);await request(b,'dev:action',{action:'finish'});assert.equal(room.phase,'finished');await request(b,'start',{});assert.equal(room.phase,'playing');
  await delay(210);const deadline=room.game.deadline;await request(b,'dev:action',{action:'breach',target:a.id});assert.equal(room.game.deadline,deadline-5000);assert.equal(room.game.actors[0].x,HOME.x);
  await delay(210);const deadline2=room.game.deadline;await request(b,'dev:action',{action:'catch',target:a.id});assert.equal(room.game.deadline,deadline2-10000);assert.equal(room.game.catches,1);
  await delay(210);await request(b,'dev:action',{action:'parkour',target:a.id});await delay(210);await request(b,'dev:action',{action:'premium',target:a.id});await delay(210);await request(b,'dev:action',{action:'damage',target:a.id});assert.equal(room.game.items[8].condition,80);await delay(210);await request(b,'dev:action',{action:'expire-grip',target:a.id});await delay(80);assert.equal(room.game.actors[0].carrying,null);assert.equal(room.game.items[8].condition,72);
  await delay(210);await request(b,'dev:action',{action:'win'});assert.equal(room.game.outcome,'won');
  b.emit('dev:logout');await delay(210);assert.match((await request(b,'dev:action',{action:'time'})).error,/session/);
 }finally{cs.forEach(s=>s.disconnect());await game.close();}
 const disabled=createGameServer({devUsername:'',devPassword:''});await new Promise(r=>disabled.server.listen(0,'127.0.0.1',r));const s=io(`http://127.0.0.1:${disabled.server.address().port}`);try{await next(s,'connect');assert.match((await request(s,'dev:login',{username:'tester',password:'test-only-password-12345'})).error,/disabled/);}finally{s.disconnect();await disabled.close();}
});

test('grip refresh, automatic release, manual drop and extraction remain authoritative',async()=>{
 const game=createGameServer({mapFactory:()=>generateMap(42)});await new Promise(r=>game.server.listen(0,'127.0.0.1',r));const cs=[];
 try{
  for(let i=0;i<2;i++){const s=io(`http://127.0.0.1:${game.server.address().port}`,{transports:['websocket']});cs.push(s);await next(s,'connect');}
  const [nav,p]=cs,lobby=next(nav,'lobby');await request(nav,'enter',{create:true,name:'Nav'});const code=(await lobby).code;await request(p,'enter',{code,name:'Crew'});await request(nav,'start',{});
  const g=game.rooms.get(code).game,a=g.actors[0],item=g.items[0];Object.assign(a,{x:item.x,z:item.z,safeUntil:Infinity});
  p.emit('interact');await delay(80);assert.equal(a.carrying,0);const initial=a.gripUntil;
  await delay(1100);p.emit('interact');await delay(80);assert.ok(a.gripUntil>initial+900);assert.equal(a.carrying,0);assert.equal(item.condition,100);
  await delay(1100);assert.equal(a.carrying,0,'refresh keeps it held beyond the original deadline');await delay(1100);assert.equal(a.carrying,null);assert.equal(item.carrier,null);assert.equal(item.condition,92);
  p.emit('interact');await delay(80);assert.equal(a.carrying,0);await delay(380);p.emit('cargo:drop');await delay(80);assert.equal(item.condition,84);
  await delay(380);p.emit('interact');await delay(80);Object.assign(a,{x:HOME.x,z:HOME.z});await delay(80);assert.equal(g.score,126);assert.equal(a.carrying,null);assert.equal(a.gripUntil,null);
 }finally{cs.forEach(s=>s.disconnect());await game.close();}
});
