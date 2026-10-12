'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {io}=require('socket.io-client');const {createGameServer}=require('../server');
function memoryStore(){const users=new Map(),sessions=new Map();return {users,sessions,async user(n){return users.get(n);},async create(u){if(users.has(u.username))return false;users.set(u.username,{...u});return true;},async session(h){const s=sessions.get(h);return s&&s.expiry>Date.now()?users.get(s.name):null;},async addSession(h,name,expiry){sessions.set(h,{name,expiry});},async revoke(h){sessions.delete(h);},async avatar(n,a){users.get(n).avatar=a;},async remove(n){users.delete(n);for(const [h,s]of sessions)if(s.name===n)sessions.delete(h);}};}
async function boot(store){const game=createGameServer({accountStore:store,databaseUrl:''});await new Promise(r=>game.server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+game.server.address().port;return {game,url,async post(action,body={},cookie='',origin=url){const response=await fetch(url+'/api/account/'+action,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie},body:JSON.stringify(body)});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')};}};}
const join=(s,data)=>new Promise((resolve,reject)=>s.timeout(3000).emit('enter',data,(e,r)=>e?reject(e):resolve(r)));
const connect=s=>new Promise(r=>s.once('connect',r));
test('accounts hash passwords, enforce sessions, bind avatars to server identity and revoke logout',async()=>{
 const store=memoryStore(),{game,url,post}=await boot(store);const sockets=[];
 try{
  assert.equal((await post('register',{username:'testcrew',password:'secret-long-password',avatar:'mint'},'','https://evil.test')).status,403);
  const r=await post('register',{username:'TestCrew',password:'secret-long-password',avatar:'mint'});assert.equal(r.status,200);assert.deepEqual(r.data.user,{username:'testcrew',avatar:'mint'});assert.match(r.cookie,/HttpOnly/);assert.match(r.cookie,/SameSite=Strict/);const cookie=r.cookie.split(';')[0];assert.ok(!store.users.get('testcrew').password_hash.includes('secret-long-password'));assert.equal(store.sessions.size,1);assert.ok(!store.sessions.has(cookie.split('=')[1]));
  assert.equal((await post('register',{username:'testcrew',password:'secret-long-password',avatar:'mint'})).status,409);
  assert.equal((await post('login',{username:'testcrew',password:'incorrect-password'})).status,401);
  assert.equal((await post('avatar',{avatar:'../../evil'},cookie)).status,400);
  assert.equal((await post('avatar',{avatar:'violet'},cookie)).status,200);
  const secure=await post('login',{username:'testcrew',password:'secret-long-password'});assert.equal(secure.status,200);const hash=[...store.sessions.keys()][1];store.sessions.get(hash).expiry=Date.now()-1;const expired=await fetch(url+'/api/account',{headers:{Cookie:secure.cookie.split(';')[0]}}).then(r=>r.json());assert.equal(expired.user,null);
  const s=io(url,{extraHeaders:{Cookie:cookie},transports:['websocket']});sockets.push(s);await connect(s);const entered=await join(s,{create:true,name:'Spoof',avatar:'rose'});assert.equal(entered.ok,true);const player=[...game.rooms.values()][0].players[0];assert.equal(player.name,'testcrew');assert.equal(player.avatar,'violet');assert.equal(s.data?.devUntil,undefined);
  const d=await new Promise(r=>s.emit('dev:action',{action:'time'},r));assert.match(d.error,/session/);
  assert.equal((await post('logout',{},cookie)).status,200);const profile=await fetch(url+'/api/account',{headers:{Cookie:cookie}}).then(r=>r.json());assert.equal(profile.user,null);
  const guest=io(url,{extraHeaders:{Cookie:cookie},transports:['websocket']});sockets.push(guest);await connect(guest);await join(guest,{create:true,name:'Guest',avatar:'rose'});assert.equal([...game.rooms.values()][1].players[0].avatar,'amber');
 }finally{sockets.forEach(s=>s.disconnect());await game.close();}
});
test('account deletion verifies password, removes sessions and requests are rate limited',async()=>{
 const store=memoryStore(),{game,post}=await boot(store);try{
 const r=await post('register',{username:'remove_me',password:'secret-long-password',avatar:'blue'}),cookie=r.cookie.split(';')[0];
 assert.equal((await post('delete',{password:'wrong-password'},cookie)).status,401);assert.equal(store.users.size,1);
 assert.equal((await post('delete',{password:'secret-long-password'},cookie)).status,200);assert.equal(store.users.size,0);assert.equal(store.sessions.size,0);
 let last;for(let i=0;i<13;i++)last=await post('login',{username:'x',password:'x'});assert.equal(last.status,429);
 }finally{await game.close();}
});
test('accounts unavailable without a database while guest room creation remains available',async()=>{
 const {game,url,post}=await boot();let socket;try{assert.equal((await fetch(url+'/api/account').then(r=>r.json())).enabled,false);assert.equal((await post('register',{})).status,503);socket=io(url);await connect(socket);assert.equal((await join(socket,{create:true,name:'Guest'})).ok,true);}finally{socket?.disconnect();await game.close();}
});
