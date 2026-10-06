'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
const { createGameServer, solid, route, clearLine, HOME, CARGO } = require('../server');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const request = (socket, event, data) => new Promise((resolve, reject) => socket.timeout(2500).emit(event, data, (err, result) => err ? reject(err) : resolve(result)));
const next = (socket, event) => new Promise((resolve, reject) => { const timer = setTimeout(() => { socket.off(event, handler); reject(Error(`Timed out waiting for ${event}`)); }, 3000); const handler = data => { clearTimeout(timer); resolve(data); }; socket.once(event, handler); });
test('all valuables have navigable paths; solid walls block sight and movement', () => {
  for (const [name,,x,z] of CARGO) { assert.equal(solid(x,z),false,name); const path = route(HOME,{x,z}); assert.ok(path.length,name); for(const p of path) assert.equal(solid(p.x,p.z,.3),false); }
  assert.equal(clearLine({x:7,z:5},{x:10,z:5}),false);
  assert.equal(clearLine({x:7,z:10.5},{x:10,z:10.5}),true);
});
test('multiplayer authority, cargo, guidance, penalties, round result, replay and room cleanup', async () => {
  const game=createGameServer();await new Promise(resolve=>game.server.listen(0,'127.0.0.1',resolve));
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
    assert.equal((await request(a,'start',{})).ok,true); const maps=await Promise.all(worlds); assert.equal(maps[0].duration,180);
    const views=await Promise.all(clients.slice(0,4).map(c=>next(c,'state')));
    assert.deepEqual(views.map(v=>v.role),['Navigator','Scavenger','Scavenger','Scavenger']);assert.equal(views[0].items.length,8);assert.ok(views[1].items.length<8);assert.equal(views[1].enemy,null);
    const room=game.rooms.get(code),g=room.game,actor=g.actors[0];
    const origin=actor.x;a.emit('input',{strafe:1,yaw:0});await delay(80);assert.equal(actor.x,origin);
    b.emit('input',{strafe:1,yaw:0});await delay(100);assert.ok(actor.x>origin&&actor.x<origin+1);
    await delay(450);const stopped=actor.x;await delay(100);assert.equal(actor.x,stopped);
    b.emit('input',{forward:1,yaw:NaN});await delay(60);assert.ok(Number.isFinite(actor.yaw));
    a.emit('guide',{command:'STOP',x:5.5,z:19.5});await delay(65);assert.equal(g.cue.text,'STOP');assert.equal(g.ping.x,5.5);
    b.emit('guide',{command:'DANGER',x:22,z:5});await delay(65);assert.equal(g.cue.text,'STOP');
    const first=g.items[0];Object.assign(actor,{x:first.x,z:first.z,speed:0});room.players[1].input={};
    b.emit('interact');await delay(70);assert.equal(actor.carrying,first.id);assert.equal(first.carrier,b.id);
    await delay(380);b.emit('interact');await delay(65);assert.equal(actor.carrying,null);assert.equal(first.condition,92);
    await delay(380);b.emit('interact');await delay(65);assert.equal(actor.carrying,first.id);
    Object.assign(actor,{x:HOME.x,z:HOME.z});await delay(70);assert.equal(first.delivered,true);assert.equal(g.score,138);assert.equal(actor.carrying,null);
    const second=g.items[1];Object.assign(actor,{x:second.x,z:second.z});await delay(380);b.emit('interact');await delay(65);assert.equal(actor.carrying,1);
    Object.assign(actor,{x:7.71,z:12.5,yaw:Math.PI/2});b.emit('input',{forward:1,yaw:Math.PI/2,sprint:true});await delay(80);
    assert.ok(actor.x<7.73);assert.equal(second.condition,88);
    room.players[1].input={};room.players[1].inputAt=0;
    const deadline=g.deadline;actor.safeUntil=0;Object.assign(actor,{x:6,z:11});await delay(65);
    assert.equal(actor.x,HOME.x);assert.equal(g.deadline,deadline-5000);assert.equal(actor.carrying,null);assert.equal(second.carrier,null);assert.equal(second.condition,68);
    actor.safeUntil=0;Object.assign(actor,{x:24.5,z:5.5});Object.assign(g.enemy,{x:24.5,z:5.5});const before=g.deadline;await delay(65);
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
