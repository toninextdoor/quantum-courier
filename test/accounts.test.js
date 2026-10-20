'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {io}=require('socket.io-client');const {createGameServer}=require('../server');
function memoryStore(){const users=new Map(),sessions=new Map(),friends=new Map();return {users,sessions,async tutorial(n,r){const u=users.get(n);u.tutorial=[...new Set([...(u.tutorial||[]),r])];},async profile(n,bio){users.get(n).bio=bio;},async photo(n,data){Object.assign(users.get(n),{photo_pending:data,photo_status:'pending'});},async removePhoto(n){Object.assign(users.get(n),{photo_pending:null,photo_approved:null,photo_id:null,photo_status:'none'});},async portrait(id){return [...users.values()].find(u=>u.photo_id===id)?.photo_approved;},async photoQueue(){return [...users.values()].filter(u=>u.photo_pending).map(u=>({username:u.username,photo_pending:u.photo_pending}));},async reviewPhoto(n,data,approve){const u=users.get(n);if(u?.photo_pending!==data)return false;if(approve)Object.assign(u,{photo_approved:data,photo_id:require('node:crypto').randomUUID(),photo_status:'approved'});else u.photo_status='rejected';u.photo_pending=null;return true;},async setRecovery(n,h,p){const u=users.get(n);if(!u||u.password_hash!==p)return false;u.recovery_hash=h;return true;},async resetRecovery(n,h,p){const u=users.get(n);if(!u||u.recovery_hash!==h)return false;u.password_hash=p;u.recovery_hash=null;for(const [key,s]of sessions)if(s.name===n)sessions.delete(key);return true;},async friendList(n){return [...friends.values()].filter(f=>f.a===n||f.b===n).map(f=>({...f,...users.get(f.a===n?f.b:f.a)}));},async friendRequest(n,o){const [a,b]=[n,o].sort(),key=a+":"+b;if(friends.has(key))return false;friends.set(key,{a,b,requester:n,status:"pending"});return true;},async friendAction(n,o,action){const key=[n,o].sort().join(":"),f=friends.get(key);if(!f)return false;if(action==="accept"){if(f.status!=="pending"||f.requester!==o)return false;f.status="accepted";}else friends.delete(key);return true;},async areFriends(n,o){return friends.get([n,o].sort().join(":"))?.status==="accepted";},async user(n){return users.get(n);},async create(u){if(users.has(u.username))return false;users.set(u.username,{...u});return true;},async session(h){const s=sessions.get(h);return s&&s.expiry>Date.now()?users.get(s.name):null;},async addSession(h,name,expiry){sessions.set(h,{name,expiry});},async touchSession(h,expiry){const s=sessions.get(h);if(s&&s.expiry>Date.now())s.expiry=expiry;},async equip(n,kind,id){users.get(n)[kind]=id;},async award(n,round,amount){const u=users.get(n);u.awards??=new Set();if(u.awards.has(round))return;u.awards.add(round);u.xp=Math.min(4750,(u.xp||0)+amount);return u;},async revoke(h){sessions.delete(h);},async avatar(n,a){users.get(n).avatar=a;},async remove(n){users.delete(n);for(const [h,s]of sessions)if(s.name===n)sessions.delete(h);}};}
async function boot(store,options={}){const game=createGameServer({accountStore:store,databaseUrl:'',...options});await new Promise(r=>game.server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+game.server.address().port;return {game,url,async post(action,body={},cookie='',origin=url){const response=await fetch(url+'/api/account/'+action,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie},body:JSON.stringify(body)});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')};}};}
const join=(s,data)=>new Promise((resolve,reject)=>s.timeout(3000).emit('enter',data,(e,r)=>e?reject(e):resolve(r)));
const connect=s=>new Promise(r=>s.once('connect',r));
test('accounts hash passwords, enforce sessions, bind avatars to server identity and revoke logout',async()=>{
 const store=memoryStore(),{game,url,post}=await boot(store);const sockets=[];
 try{
  assert.equal((await post('register',{username:'testcrew',password:'secret-long-password',avatar:'mint'},'','https://evil.test')).status,403);
  const r=await post('register',{username:'TestCrew',password:'secret-long-password',avatar:'mint'});assert.equal(r.status,200);assert.equal(r.data.user.username,'testcrew');assert.equal(r.data.user.avatar,'mint');assert.equal(r.data.user.progression.level,1);assert.match(r.cookie,/HttpOnly/);assert.match(r.cookie,/SameSite=Lax/);const cookie=r.cookie.split(';')[0];assert.ok(!store.users.get('testcrew').password_hash.includes('secret-long-password'));assert.equal(store.sessions.size,1);assert.ok(!store.sessions.has(cookie.split('=')[1]));
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
 const presence=await fetch(url+'/api/friends',{headers:{Cookie:cookies[0]}}).then(r=>r.json());assert.equal(presence.friends[0].online,true);friend.disconnect();await new Promise(r=>setTimeout(r,100));const offline=await fetch(url+'/api/friends',{headers:{Cookie:cookies[0]}}).then(r=>r.json());assert.equal(offline.friends[0].online,false);
 assert.equal((await action(cookies[1],'remove','host_user')).status,200);assert.equal(await store.areFriends('host_user','friend_user'),false);
 await new Promise(r=>setTimeout(r,2100));assert.match((await rpc(host,'friend:invite',{username:'friend_user'})).error,/accepted friends/);
 }finally{sockets.forEach(s=>s.disconnect());await game.close();}
 });

 test('saved recovery codes reset passwords once, revoke sessions and require password to rotate',async()=>{
 const store=memoryStore(),{game,url,post}=await boot(store);
 try{const r=await post('register',{username:'recovery_user',password:'initial-password-123',avatar:'mint'});assert.match(r.data.recoveryCode,/^[a-f0-9]{48}$/);const cookie=r.cookie.split(';')[0],code=r.data.recoveryCode;assert.notEqual(store.users.get('recovery_user').recovery_hash,code);
 const profile=await fetch(url+'/api/account',{headers:{Cookie:cookie}}).then(r=>r.json());assert.equal(profile.user.recoveryCode,undefined);
 const body={username:'recovery_user',code,password:'replacement-password-123',confirm:'replacement-password-123'};
 assert.equal((await post('reset',{...body,code:'0'.repeat(48)})).status,401);assert.equal((await post('reset',body)).status,200);assert.equal(store.sessions.size,0);assert.equal((await post('reset',body)).status,401);
 assert.equal((await post('login',{username:'recovery_user',password:'initial-password-123'})).status,401);const login=await post('login',{username:'recovery_user',password:'replacement-password-123'});assert.equal(login.status,200);const fresh=login.cookie.split(';')[0];
 assert.equal((await post('recovery',{password:'incorrect'},fresh)).status,401);const rotated=await post('recovery',{password:'replacement-password-123'},fresh);assert.equal(rotated.status,200);assert.notEqual(rotated.data.recoveryCode,code);assert.equal((await post('reset',{...body,code:rotated.data.recoveryCode})).status,200);
 }finally{await game.close();}
 });

test('persistent sessions renew, unlocks are gated, and named test accounts have cosmetics only',async()=>{
 const store=memoryStore(),{game,url,post}=await boot(store);
 try{
 const reg=await post('register',{username:'freshplayer',password:'secret-long-password',avatar:'mint'}),cookie=reg.cookie.split(';')[0];assert.match(reg.cookie,/Max-Age=2592000/);assert.match(reg.cookie,/SameSite=Lax/);assert.match(reg.cookie,/HttpOnly/);assert.equal(reg.data.user.progression.level,1);
 const session=[...store.sessions.values()][0];session.expiry=Date.now()+10000;const get=await fetch(url+'/api/account',{headers:{Cookie:cookie}}),profile=await get.json();assert.equal(profile.user.username,'freshplayer');assert.ok(session.expiry>Date.now()+29*86400000);assert.match(get.headers.get('set-cookie'),/Max-Age=2592000/);
 assert.equal((await post('equip',{kind:'frame',id:'gold'},cookie)).status,400);assert.equal((await post('equip',{kind:'title',id:'rookie'},cookie)).status,200);
 for(const name of ['toninextdoor','angelnextdoor','steve1234']){const r=await post('register',{username:name,password:'secret-long-password',avatar:'blue'});assert.equal(r.data.user.progression.level,20);assert.equal(r.data.user.progression.heritage.kind,name==='toninextdoor'?'founder':'og');assert.ok(r.data.user.progression.rewards.every(x=>x.unlocked));const c=r.cookie.split(';')[0];const equipped=await post('equip',{kind:'frame',id:'gold'},c);assert.equal(equipped.data.user.progression.frame,'gold');assert.equal(equipped.data.user.dev,undefined);assert.equal((await post('login',{username:name,password:'wrong-password-long'})).status,401);}
 const guest=io(url,{transports:['websocket']});try{await connect(guest);assert.equal((await join(guest,{create:true,name:'toninextdoor'})).ok,true);assert.equal([...game.rooms.values()][0].players[0].progression,null,'guest callsigns cannot grant account crowns');}finally{guest.disconnect();}
 }finally{await game.close();}
});

test('a completed team shift saves XP once per account, across server restarts',async()=>{
 const store=memoryStore();let first=await boot(store),sockets=[];
 const wait=(s,event)=>new Promise(r=>s.once(event,r));const req=(s,event,data={})=>new Promise(r=>s.emit(event,data,r));
 try{
 const a=await first.post('register',{username:'crewlead',password:'secret-long-password',avatar:'mint'}),b=await first.post('register',{username:'crewfield',password:'secret-long-password',avatar:'blue'});
 for(const r of [a,b]){const s=io(first.url,{transports:['websocket'],extraHeaders:{Cookie:r.cookie.split(';')[0]}});sockets.push(s);await connect(s);}
 let lp=wait(sockets[0],'lobby');await req(sockets[0],'enter',{create:true,name:'Lead'});const code=(await lp).code;await req(sockets[1],'enter',{code,name:'Field'});await req(sockets[0],'start');
 const g=first.game.rooms.get(code).game;g.elapsed=40;g.score=600;g.deadline=0;const updates=sockets.map(s=>wait(s,'progression:update'));const result=await Promise.all(updates);assert.equal(result[0].earned,110);assert.equal(result[1].earned,110);assert.equal(store.users.get('crewlead').xp,110);await store.award('crewlead',g.awardId,110);assert.equal(store.users.get('crewlead').xp,110,'duplicate award is ignored');
 sockets.forEach(s=>s.disconnect());await first.game.close();first=null;
 const again=await boot(store);try{const data=await fetch(again.url+'/api/account',{headers:{Cookie:a.cookie.split(';')[0]}}).then(r=>r.json());assert.equal(data.user.progression.xp,110,'account and XP survive app restart');}finally{await again.game.close();}
 }finally{sockets.forEach(s=>s.disconnect());if(first)await first.game.close();}
});

test('profile photos stay private until authorized review; bios and revisions are validated',async()=>{
 const sharp=require('sharp'),store=memoryStore(),{game,url,post}=await boot(store,{devUsername:'reviewer',devPassword:'review-password-12345'});const sockets=[];
 const req=(s,event,data={})=>new Promise(r=>s.emit(event,data,r));
 try{
 const reg=await post('register',{username:'photoowner',password:'secret-long-password',avatar:'mint'}),cookie=reg.cookie.split(';')[0];
 assert.equal((await post('profile',{bio:'I guide the crew.'},cookie)).data.user.bio,'I guide the crew.');assert.equal((await post('profile',{bio:'https://example.com'},cookie)).status,400);
 assert.equal((await post('photo',{image:'data:image/svg+xml;base64,PHN2Zz4='},cookie)).status,400);
 const image='data:image/png;base64,'+(await sharp({create:{width:8,height:8,channels:3,background:'#336699'}}).png().toBuffer()).toString('base64');const submitted=await post('photo',{image},cookie);assert.equal(submitted.status,200);assert.equal(submitted.data.user.photoStatus,'pending');assert.equal(submitted.data.user.portrait,null);assert.equal(submitted.data.user.photo_pending,undefined);
 assert.equal((await fetch(url+'/api/account/photo-preview')).status,404);assert.equal((await fetch(url+'/api/account/photo-preview',{headers:{Cookie:cookie}})).status,200);
 for(let i=0;i<2;i++){const s=io(url,{transports:['websocket']});sockets.push(s);await connect(s);}const [dev,outsider]=sockets;
 assert.match((await req(outsider,'dev:photos')).error,/session/);assert.equal((await req(dev,'dev:login',{username:'reviewer',password:'review-password-12345'})).ok,true);
 let queue=await req(dev,'dev:photos');assert.equal(queue.photos.length,1);const row=queue.photos[0];assert.match(row.image,/^data:image\/jpeg;base64,/);const meta=await sharp(Buffer.from(row.image.split(',')[1],'base64')).metadata();assert.equal(meta.width,256);assert.equal(meta.exif,undefined);
 assert.match((await req(outsider,'dev:photo-review',{username:row.username,revision:row.revision,action:'approve'})).error,/session/);
 const replacement='data:image/png;base64,'+(await sharp({create:{width:8,height:8,channels:3,background:'#996633'}}).png().toBuffer()).toString('base64');await post('photo',{image:replacement},cookie);assert.match((await req(dev,'dev:photo-review',{username:row.username,revision:row.revision,action:'approve'})).error,/changed/);
 queue=await req(dev,'dev:photos');const fresh=queue.photos[0];assert.equal((await req(dev,'dev:photo-review',{username:fresh.username,revision:fresh.revision,action:'approve'})).ok,true);
 const account=await fetch(url+'/api/account',{headers:{Cookie:cookie}}).then(r=>r.json());assert.equal(account.user.photoStatus,'approved');const publicPhoto=await fetch(url+account.user.portrait);assert.equal(publicPhoto.status,200);assert.equal(publicPhoto.headers.get('content-type'),'image/jpeg');
 await post('photo-remove',{},cookie);assert.equal((await fetch(url+account.user.portrait)).status,404,'removed photo URLs stop serving');
 }finally{sockets.forEach(s=>s.disconnect());await game.close();}
});

test('practice progress requires authentication, validates roles and persists per account',async()=>{
 const store=memoryStore(),{game,url,post}=await boot(store);try{
 assert.equal((await post('tutorial',{role:'Recovery'})).status,401);
 const reg=await post('register',{username:'practicecrew',password:'secret-long-password',avatar:'mint'}),cookie=reg.cookie.split(';')[0];
 assert.deepEqual(reg.data.user.tutorial,[]);
 assert.equal((await post('tutorial',{role:'Admin'},cookie)).status,400);
 for(const role of ['Recovery','Navigator','Guardian','Recovery'])assert.equal((await post('tutorial',{role},cookie)).status,200);
 const restored=await fetch(url+'/api/account',{headers:{Cookie:cookie}}).then(r=>r.json());
 assert.deepEqual(restored.user.tutorial,['Recovery','Navigator','Guardian']);
 assert.equal(restored.user.progression.level,1);
 assert.equal((await post('tutorial',{role:'Recovery'},cookie,'https://evil.test')).status,403);
 }finally{await game.close();}
});
