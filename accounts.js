'use strict';
const {randomUUID,randomBytes,createHash,scrypt,timingSafeEqual}=require('node:crypto');
const {promisify}=require('node:util');
const derive=promisify(scrypt),AVATARS=['amber','mint','violet','rose','blue','silver'];
const {progression,REWARDS,TEST_USERS,MAX_XP}=require('./progression');
const {filterText}=require('./moderation');
const {normalizePhoto}=require('./photo');
const publicUser=u=>u?{username:u.username,avatar:u.avatar,tutorial:Array.isArray(u.tutorial)?u.tutorial.filter(r=>['Recovery','Navigator','Guardian'].includes(r)):[],bio:u.bio||'',portrait:u.photo_id?`/api/portraits/${u.photo_id}`:null,photoStatus:u.photo_pending?'pending':u.photo_status==='rejected'?'rejected':u.photo_id?'approved':'none',progression:progression(u)}:null;
const SESSION_MS=30*86400000;
const hashToken=t=>createHash('sha256').update(t).digest('hex');
function tokenFrom(cookie=''){const match=cookie.match(/(?:^|;\s*)room905_session=([a-f0-9]{64})(?:;|$)/);return match?.[1];}
async function passwordHash(password){const salt=randomBytes(16).toString('hex');return salt+':'+(await derive(password,salt,64,{N:32768,maxmem:64*1024*1024})).toString('hex');}
async function verify(password,encoded){const [salt,key]=encoded.split(':');const candidate=await derive(password,salt,64,{N:32768,maxmem:64*1024*1024});const expected=Buffer.from(key,'hex');return expected.length===candidate.length&&timingSafeEqual(expected,candidate);}
function postgresStore(url){
 const {Pool}=require('pg');const pool=new Pool({connectionString:url,max:4,connectionTimeoutMillis:5000,statement_timeout:5000});
 pool.on('error',()=>{});
 let ready;
 const init=()=>ready||(ready=(async()=>{await pool.query(`CREATE TABLE IF NOT EXISTS room905_users(username VARCHAR(18) PRIMARY KEY,password_hash TEXT NOT NULL,avatar VARCHAR(12) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());ALTER TABLE room905_users ADD COLUMN IF NOT EXISTS recovery_hash TEXT;ALTER TABLE room905_users ADD COLUMN IF NOT EXISTS tutorial TEXT[] NOT NULL DEFAULT '{}';ALTER TABLE room905_users ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '';ALTER TABLE room905_users ADD COLUMN IF NOT EXISTS photo_approved TEXT;ALTER TABLE room905_users ADD COLUMN IF NOT EXISTS photo_pending TEXT;ALTER TABLE room905_users ADD COLUMN IF NOT EXISTS photo_id TEXT;ALTER TABLE room905_users ADD COLUMN IF NOT EXISTS photo_status TEXT NOT NULL DEFAULT 'none';ALTER TABLE room905_users ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0;ALTER TABLE room905_users ADD COLUMN IF NOT EXISTS frame TEXT NOT NULL DEFAULT 'standard';ALTER TABLE room905_users ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'rookie';UPDATE room905_users SET xp=4750 WHERE username IN ('toninextdoor','angelnextdoor','steve1234');CREATE TABLE IF NOT EXISTS room905_xp_awards(round_id TEXT NOT NULL,username VARCHAR(18) NOT NULL REFERENCES room905_users(username) ON DELETE CASCADE,PRIMARY KEY(round_id,username));CREATE TABLE IF NOT EXISTS room905_sessions(token_hash CHAR(64) PRIMARY KEY,username VARCHAR(18) NOT NULL REFERENCES room905_users(username) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL);CREATE INDEX IF NOT EXISTS room905_session_expiry ON room905_sessions(expires_at);CREATE TABLE IF NOT EXISTS room905_friends(a VARCHAR(18) REFERENCES room905_users(username) ON DELETE CASCADE,b VARCHAR(18) REFERENCES room905_users(username) ON DELETE CASCADE,requester VARCHAR(18) NOT NULL,status VARCHAR(10) NOT NULL CHECK(status IN ('pending','accepted')),PRIMARY KEY(a,b),CHECK(a<>b));`);})().catch(e=>{ready=null;throw e;}));
 const query=async(sql,args)=>{await init();return pool.query(sql,args);};
 return {
  async user(name){return (await query('SELECT * FROM room905_users WHERE username=$1',[name])).rows[0];},
  async create(u){try{await query('INSERT INTO room905_users(username,password_hash,avatar,recovery_hash,xp) VALUES($1,$2,$3,$4,$5)',[u.username,u.password_hash,u.avatar,u.recovery_hash||null,u.xp||0]);return true;}catch(e){if(e.code==='23505')return false;throw e;}},
  async session(hash){return (await query('SELECT u.* FROM room905_sessions s JOIN room905_users u USING(username) WHERE s.token_hash=$1 AND s.expires_at>NOW()',[hash])).rows[0];},
  async addSession(hash,name,expiry){await query('DELETE FROM room905_sessions WHERE expires_at<NOW()');await query('INSERT INTO room905_sessions(token_hash,username,expires_at) VALUES($1,$2,$3)',[hash,name,new Date(expiry)]);},
  async tutorial(name,role){await query('UPDATE room905_users SET tutorial=array_append(tutorial,$2) WHERE username=$1 AND NOT ($2=ANY(tutorial))',[name,role]);},
  async profile(name,bio){await query('UPDATE room905_users SET bio=$2 WHERE username=$1',[name,bio]);},
  async photo(name,data){await query("UPDATE room905_users SET photo_pending=$2,photo_status='pending' WHERE username=$1",[name,data]);},
  async removePhoto(name){await query("UPDATE room905_users SET photo_pending=NULL,photo_approved=NULL,photo_id=NULL,photo_status='none' WHERE username=$1",[name]);},
  async portrait(id){return (await query('SELECT photo_approved FROM room905_users WHERE photo_id=$1',[id])).rows[0]?.photo_approved;},
  async photoQueue(){return (await query('SELECT username,photo_pending FROM room905_users WHERE photo_pending IS NOT NULL ORDER BY username LIMIT 25')).rows;},
  async reviewPhoto(name,data,approve){return (await query(approve?"UPDATE room905_users SET photo_approved=photo_pending,photo_pending=NULL,photo_id=$3,photo_status='approved' WHERE username=$1 AND photo_pending=$2 RETURNING username":"UPDATE room905_users SET photo_pending=NULL,photo_status='rejected' WHERE username=$1 AND photo_pending=$2 RETURNING username",approve?[name,data,randomUUID()]:[name,data])).rowCount>0;},
  async touchSession(hash,expiry){await query('UPDATE room905_sessions SET expires_at=$2 WHERE token_hash=$1 AND expires_at>NOW()',[hash,new Date(expiry)]);},
  async equip(name,kind,id){await query(kind==='frame'?'UPDATE room905_users SET frame=$2 WHERE username=$1':'UPDATE room905_users SET title=$2 WHERE username=$1',[name,id]);},
  async award(name,round,amount){return (await query('WITH earned AS (INSERT INTO room905_xp_awards(round_id,username) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING username) UPDATE room905_users SET xp=LEAST(4750,xp+$3) WHERE username IN (SELECT username FROM earned) RETURNING *',[round,name,amount])).rows[0];},
  async revoke(hash){await query('DELETE FROM room905_sessions WHERE token_hash=$1',[hash]);},
  async avatar(name,avatar){await query('UPDATE room905_users SET avatar=$2 WHERE username=$1',[name,avatar]);},
  async remove(name){await query('DELETE FROM room905_users WHERE username=$1',[name]);},
  async setRecovery(name,hash,password){return (await query('UPDATE room905_users SET recovery_hash=$2 WHERE username=$1 AND password_hash=$3 RETURNING username',[name,hash,password])).rowCount>0;},
  async resetRecovery(name,hash,password){return (await query('WITH changed AS (UPDATE room905_users SET password_hash=$3,recovery_hash=NULL WHERE username=$1 AND recovery_hash=$2 RETURNING username),removed AS (DELETE FROM room905_sessions USING changed WHERE room905_sessions.username=changed.username RETURNING room905_sessions.username) SELECT username FROM changed',[name,hash,password])).rowCount>0;},
  async friendList(name){return (await query(`SELECT f.*,u.username,u.avatar,u.photo_id,u.bio FROM room905_friends f JOIN room905_users u ON u.username=CASE WHEN f.a=$1 THEN f.b ELSE f.a END WHERE f.a=$1 OR f.b=$1 ORDER BY u.username`,[name])).rows;},
  async friendRequest(name,other){const [a,b]=[name,other].sort();return (await query("INSERT INTO room905_friends(a,b,requester,status) VALUES($1,$2,$3,'pending') ON CONFLICT DO NOTHING RETURNING a",[a,b,name])).rowCount>0;},
  async friendAction(name,other,action){const [a,b]=[name,other].sort();if(action==='accept')return (await query("UPDATE room905_friends SET status='accepted' WHERE a=$1 AND b=$2 AND status='pending' AND requester=$3 RETURNING a",[a,b,other])).rowCount>0;return (await query('DELETE FROM room905_friends WHERE a=$1 AND b=$2 RETURNING a',[a,b])).rowCount>0;},
  async areFriends(name,other){const [a,b]=[name,other].sort();return (await query("SELECT a FROM room905_friends WHERE a=$1 AND b=$2 AND status='accepted'",[a,b])).rowCount>0;},
  close:()=>pool.end()
 };
}
function installAccounts(app,{store,databaseUrl=process.env.DATABASE_URL}={}){
 store=store||(databaseUrl?postgresStore(databaseUrl):null);
 const attempts=new Map();let busy=0;const dummy=passwordHash(randomBytes(32).toString('hex'));
 const lookup=async(cookie)=>{const token=tokenFrom(cookie);return store&&token?store.session(hashToken(token)):null;};
 const cookie=(res,token,req)=>res.cookie('room905_session',token,{httpOnly:true,sameSite:'lax',secure:req.secure||req.headers['x-forwarded-proto']==='https',path:'/',maxAge:SESSION_MS});
 app.use('/api/account',(req,res,next)=>require('express').json({limit:req.path==='/photo'?'230kb':'4kb'})(req,res,next));
 app.get('/api/portraits/:id',async(req,res)=>{if(!/^[a-f0-9-]{36}$/.test(req.params.id))return res.sendStatus(404);try{const data=await store?.portrait(req.params.id);if(!data)return res.sendStatus(404);res.set({'Content-Type':'image/jpeg','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}).send(Buffer.from(data.split(',')[1],'base64'));}catch{res.sendStatus(404);}});
 app.get('/api/account/photo-preview',async(req,res)=>{try{const u=await lookup(req.headers.cookie);if(!u?.photo_pending)return res.sendStatus(404);res.set({'Content-Type':'image/jpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).send(Buffer.from(u.photo_pending.split(',')[1],'base64'));}catch{res.sendStatus(404);}});
 app.get('/api/account',async(req,res)=>{try{const user=await lookup(req.headers.cookie),token=tokenFrom(req.headers.cookie);if(user&&store.touchSession){await store.touchSession(hashToken(token),Date.now()+SESSION_MS);cookie(res,token,req);}res.set('Cache-Control','no-store');res.json({enabled:!!store,user:publicUser(user),avatars:AVATARS});}catch{res.status(503).json({error:'Account storage is unavailable. Guest play still works.'});}});
 app.post('/api/account/:action',async(req,res)=>{
  try{
   if(!store)return res.status(503).json({error:'Accounts need database setup. You can play as a guest.'});
   const expected=`${req.headers['x-forwarded-proto']==='https'?'https':req.protocol}://${req.get('host')}`;
   if(req.get('origin')!==expected)return res.status(403).json({error:'Invalid request origin.'});
   const action=req.params.action,ip=req.ip,now=Date.now();
   if(attempts.size>2000)for(const [k,a]of attempts)if(now-a.start>60000)attempts.delete(k);
   let count=attempts.get(ip);if(!count||now-count.start>60000){count={start:now,n:0};attempts.set(ip,count);}if(++count.n>12)return res.status(429).json({error:'Too many account requests. Wait one minute.'});
   const body=req.body||{};
   if(action==='reset'){
    const name=typeof body.username==='string'?body.username.trim().toLowerCase():'';
    if(!/^[a-z0-9_]{3,18}$/.test(name)||typeof body.code!=='string'||!/^[a-f0-9]{48}$/i.test(body.code.trim())||typeof body.password!=='string'||body.password.length<12||body.password.length>128||body.password!==body.confirm)return res.status(400).json({error:'Enter username, saved recovery code and matching passwords of 12–128 characters.'});
    if(busy>=2)return res.status(429).json({error:'Try again shortly.'});busy++;let ok;
    try{ok=await store.resetRecovery(name,hashToken(body.code.trim().toLowerCase()),await passwordHash(body.password));}finally{busy--;}
    if(!ok)return res.status(401).json({error:'Invalid username or recovery code.'});
    res.clearCookie('room905_session',{path:'/'});return res.json({user:null,reset:true});
   }
   if(['register','login'].includes(action)){
    const name=typeof body.username==='string'?body.username.trim().toLowerCase():'';
    if(!/^[a-z0-9_]{3,18}$/.test(name)||typeof body.password!=='string'||body.password.length<12||body.password.length>128)return res.status(400).json({error:'Use a 3–18 character username (letters, numbers, underscores) and a 12–128 character password.'});
    if(busy>=2)return res.status(429).json({error:'Account server is busy. Try again shortly.'});busy++;
    let u,recoveryCode;try{
     if(action==='register'){
      if(!filterText(name.replace(/_/g,' '),18,{strict:true}).text)return res.status(400).json({error:'Please choose an appropriate username.'});
      if(!AVATARS.includes(body.avatar))return res.status(400).json({error:'Choose an available avatar.'});
      recoveryCode=randomBytes(24).toString('hex');u={username:name,password_hash:await passwordHash(body.password),avatar:body.avatar,recovery_hash:hashToken(recoveryCode),xp:TEST_USERS.has(name)?MAX_XP:0};
      if(!await store.create(u))return res.status(409).json({error:'That username is taken.'});
     }else{u=await store.user(name);const valid=await verify(body.password,u?.password_hash||await dummy);if(!u||!valid)return res.status(401).json({error:'Incorrect username or password.'});}
    }finally{busy--;}
    const old=tokenFrom(req.headers.cookie);if(old)await store.revoke(hashToken(old));const token=randomBytes(32).toString('hex');await store.addSession(hashToken(token),u.username,now+SESSION_MS);cookie(res,token,req);return res.json({user:publicUser(u),...(recoveryCode?{recoveryCode}:{})});
   }
   if(action==='logout'){const t=tokenFrom(req.headers.cookie);if(t)await store.revoke(hashToken(t));res.clearCookie('room905_session',{path:'/'});return res.json({user:null});}
   const u=await lookup(req.headers.cookie);if(!u)return res.status(401).json({error:'Sign in first.'});
   if(action==='tutorial'){if(!['Recovery','Navigator','Guardian'].includes(body.role))return res.status(400).json({error:'Choose an available practice role.'});if(!store.tutorial)return res.status(503).json({error:'Practice storage unavailable.'});await store.tutorial(u.username,body.role);const updated=await store.user(u.username);return res.json({user:publicUser(updated)});}
   if(action==='recovery'){
    if(typeof body.password!=='string'||body.password.length>128||busy>=2)return res.status(400).json({error:'Enter your current password and try again.'});busy++;let valid;try{valid=await verify(body.password,u.password_hash);}finally{busy--;}
    if(!valid)return res.status(401).json({error:'Incorrect password.'});const code=randomBytes(24).toString('hex');
    if(!await store.setRecovery(u.username,hashToken(code),u.password_hash))return res.status(409).json({error:'Account changed. Sign in again.'});
    return res.json({user:publicUser(u),recoveryCode:code});
   }
   if(action==='profile'){const result=body.bio===''?{text:''}:filterText(body.bio,160,{strict:true});if(result.error)return res.status(400).json({error:result.error});await store.profile(u.username,result.text);return res.json({user:publicUser({...u,bio:result.text})});}
   if(action==='photo'){let photo;try{photo=await normalizePhoto(body.image);}catch(e){return res.status(400).json({error:e.message});}await store.photo(u.username,photo);return res.json({user:publicUser({...u,photo_pending:photo}),message:'Photo submitted for review. Your preset or previous approved photo stays public.'});}
   if(action==='photo-remove'){await store.removePhoto(u.username);return res.json({user:publicUser({...u,photo_pending:null,photo_approved:null,photo_id:null,photo_status:'none'})});}
   if(action==='equip'){const reward=REWARDS.find(r=>r.id===body.id&&r.kind===body.kind);if(!reward||progression(u).level<reward.level)return res.status(400).json({error:'That cosmetic is not unlocked.'});await store.equip(u.username,reward.kind,reward.id);return res.json({user:publicUser({...u,[reward.kind]:reward.id})});}
   if(action==='avatar'){if(!AVATARS.includes(body.avatar))return res.status(400).json({error:'Choose an available avatar.'});await store.avatar(u.username,body.avatar);return res.json({user:publicUser({...u,avatar:body.avatar})});}
   if(action==='delete'){if(typeof body.password!=='string'||body.password.length>128||busy>=2)return res.status(400).json({error:'Enter your password and try again.'});busy++;let valid;try{valid=await verify(body.password,u.password_hash);}finally{busy--;}if(!valid)return res.status(401).json({error:'Incorrect password.'});await store.remove(u.username);res.clearCookie('room905_session',{path:'/'});return res.json({user:null});}
   res.status(404).json({error:'Unknown account action.'});
  }catch{res.status(503).json({error:'Account storage is unavailable. Guest play still works.'});}
 });
 app.use('/api/account',(err,req,res,next)=>{if(err?.type==='entity.too.large')return res.status(413).json({error:'Upload is too large. Choose a smaller photo.'});if(err instanceof SyntaxError)return res.status(400).json({error:'Invalid account request.'});next(err);});
 return {lookup,publicUser,store,close:()=>store?.close?.(),enabled:!!store};
}
module.exports={installAccounts,AVATARS,passwordHash,verify,tokenFrom};
