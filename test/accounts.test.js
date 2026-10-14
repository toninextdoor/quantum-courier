'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {io}=require('socket.io-client');const {createGameServer}=require('../server');
function memoryStore(){const users=new Map(),sessions=new Map(),friends=new Map();return {users,sessions,async friendList(n){return [...friends.values()].filter(f=>f.a===n||f.b===n).map(f=>({...f,...users.get(f.a===n?f.b:f.a)}));},async friendRequest(n,o){const [a,b]=[n,o].sort(),key=a+":"+b;if(friends.has(key))return false;friends.set(key,{a,b,requester:n,status:"pending"});return true;},async friendAction(n,o,action){const key=[n,o].sort().join(":"),f=friends.get(key);if(!f)return false;if(action==="accept"){if(f.status!=="pending"||f.requester!==o)return false;f.status="accepted";}else friends.delete(key);return true;},async areFriends(n,o){return friends.get([n,o].sort().join(":"))?.status==="accepted";},async user(n){return users.get(n);},async create(u){if(users.has(u.username))return false;users.set(u.username,{...u});return true;},async session(h){const s=sessions.get(h);return s&&s.expiry>Date.now()?users.get(s.name):null;},async addSession(h,name,expiry){sessions.set(h,{name,expiry});},async revoke(h){sessions.delete(h);},async avatar(n,a){users.get(n).avatar=a;},async remove(n){users.delete(n);for(const [h,s]of sessions)if(s.name===n)sessions.delete(h);}};}
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

 test('mutual friend requests authorize private lobby invites and joining; removing revokes access',async()=>{
 const store=memoryStore(),{game,url,post}=await boot(store),sockets=[];
 const action=async(cookie,kind,username,origin=url)=>{const r=await fetch(url+'/api/friends/'+kind,{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username})});return {status:r.status,data:await r.json()};};
 const rpc=(s,event,data={})=>new Promise((resolve,reject)=>s.timeout(3000).emit(event,data,(e,r)=>e?reject(e):resolve(r)));
 const once=(s,event)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Missing '+event)),3000);s.once(event,v=>{clearTimeout(timer);resolve(v);});});
 try{
 const cookies=[];for(const username of ['host_user','friend_user','third_user']){const r=await post('register',{username,password:'long-test-password-123',avatar:'mint'});cookies.push(r.cookie.split(';')[0]);const s=io(url,{extraHeaders:{Cookie:cookies.at(-1)},transports:['websocket']});sockets.push(s);await connect(s);assert.equal((await rpc(s,'friends:subscribe')).ok,true);}
 const [host,friend,third]=sockets;
 assert.equal((await action(cookies[0],'request','host_user')).status,400);
 assert.equal((await action(cookies[0],'request','friend_user','https://evil.test')).status,403);
 assert.equal((await action(cookies[0],'request','friend_user')).status,200);
 assert.equal((await action(cookies[0],'accept','friend_user')).status,400,'sender cannot accept their own request');
 const list=await fetch(url+'/api/friends',{headers:{Cookie:cookies[1]}}).then(r=>r.json());assert.equal(list.incoming[0].username,'host_user');assert.equal(list.incoming[0].password_hash,undefined);
 assert.equal((await action(cookies[1],'accept','host_user')).status,200);
 assert.equal((await rpc(host,'friend:invite',{username:'friend_user'})).error,'Create or join a lobby first.');
 assert.equal((await join(host,{create:true,name:'ignored'})).ok,true);const code=[...game.rooms.keys()][0];
 await new Promise(r=>setTimeout(r,2100));const received=once(friend,'friend:invitation');assert.equal((await rpc(host,'friend:invite',{username:'friend_user'})).ok,true);const invite=await received;assert.equal(invite.code,code);
 assert.match((await rpc(third,'friend:join',{id:invite.id})).error,/expired|unavailable/);
 assert.equal((await rpc(friend,'friend:join',{id:invite.id})).ok,true);assert.equal(game.rooms.get(code).players.length,2);
 assert.match((await rpc(friend,'friend:join',{id:invite.id})).error,/expired|unavailable/);
 assert.equal((await action(cookies[1],'remove','host_user')).status,200);assert.equal(await store.areFriends('host_user','friend_user'),false);
 await new Promise(r=>setTimeout(r,2100));assert.match((await rpc(host,'friend:invite',{username:'friend_user'})).error,/accepted friends/);
 }finally{sockets.forEach(s=>s.disconnect());await game.close();}
 });
