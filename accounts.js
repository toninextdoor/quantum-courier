'use strict';
const {randomBytes,createHash,scrypt,timingSafeEqual}=require('node:crypto');
const {promisify}=require('node:util');
const derive=promisify(scrypt),AVATARS=['amber','mint','violet','rose','blue','silver'];
const publicUser=u=>u?{username:u.username,avatar:u.avatar}:null;
const hashToken=t=>createHash('sha256').update(t).digest('hex');
function tokenFrom(cookie=''){const match=cookie.match(/(?:^|;\s*)room905_session=([a-f0-9]{64})(?:;|$)/);return match?.[1];}
async function passwordHash(password){const salt=randomBytes(16).toString('hex');return salt+':'+(await derive(password,salt,64,{N:32768,maxmem:64*1024*1024})).toString('hex');}
async function verify(password,encoded){const [salt,key]=encoded.split(':');const candidate=await derive(password,salt,64,{N:32768,maxmem:64*1024*1024});const expected=Buffer.from(key,'hex');return expected.length===candidate.length&&timingSafeEqual(expected,candidate);}
function postgresStore(url){
 const {Pool}=require('pg');const pool=new Pool({connectionString:url,max:4,connectionTimeoutMillis:5000,statement_timeout:5000});
 pool.on('error',()=>{});
 let ready;
 const init=()=>ready||(ready=(async()=>{await pool.query(`CREATE TABLE IF NOT EXISTS room905_users(username VARCHAR(18) PRIMARY KEY,password_hash TEXT NOT NULL,avatar VARCHAR(12) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());CREATE TABLE IF NOT EXISTS room905_sessions(token_hash CHAR(64) PRIMARY KEY,username VARCHAR(18) NOT NULL REFERENCES room905_users(username) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL);CREATE INDEX IF NOT EXISTS room905_session_expiry ON room905_sessions(expires_at);CREATE TABLE IF NOT EXISTS room905_friends(a VARCHAR(18) REFERENCES room905_users(username) ON DELETE CASCADE,b VARCHAR(18) REFERENCES room905_users(username) ON DELETE CASCADE,requester VARCHAR(18) NOT NULL,status VARCHAR(10) NOT NULL CHECK(status IN ('pending','accepted')),PRIMARY KEY(a,b),CHECK(a<>b));`);})().catch(e=>{ready=null;throw e;}));
 const query=async(sql,args)=>{await init();return pool.query(sql,args);};
 return {
  async user(name){return (await query('SELECT * FROM room905_users WHERE username=$1',[name])).rows[0];},
  async create(u){try{await query('INSERT INTO room905_users(username,password_hash,avatar) VALUES($1,$2,$3)',[u.username,u.password_hash,u.avatar]);return true;}catch(e){if(e.code==='23505')return false;throw e;}},
  async session(hash){return (await query('SELECT u.* FROM room905_sessions s JOIN room905_users u USING(username) WHERE s.token_hash=$1 AND s.expires_at>NOW()',[hash])).rows[0];},
  async addSession(hash,name,expiry){await query('DELETE FROM room905_sessions WHERE expires_at<NOW()');await query('INSERT INTO room905_sessions(token_hash,username,expires_at) VALUES($1,$2,$3)',[hash,name,new Date(expiry)]);},
  async revoke(hash){await query('DELETE FROM room905_sessions WHERE token_hash=$1',[hash]);},
  async avatar(name,avatar){await query('UPDATE room905_users SET avatar=$2 WHERE username=$1',[name,avatar]);},
  async remove(name){await query('DELETE FROM room905_users WHERE username=$1',[name]);},
  async friendList(name){return (await query(`SELECT f.*,u.username,u.avatar FROM room905_friends f JOIN room905_users u ON u.username=CASE WHEN f.a=$1 THEN f.b ELSE f.a END WHERE f.a=$1 OR f.b=$1 ORDER BY u.username`,[name])).rows;},
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
 const cookie=(res,token,req)=>res.cookie('room905_session',token,{httpOnly:true,sameSite:'strict',secure:req.secure||req.headers['x-forwarded-proto']==='https',path:'/',maxAge:7*86400000});
 app.use('/api/account',require('express').json({limit:'4kb'}));
 app.get('/api/account',async(req,res)=>{try{res.json({enabled:!!store,user:publicUser(await lookup(req.headers.cookie)),avatars:AVATARS});}catch{res.status(503).json({error:'Account storage is unavailable. Guest play still works.'});}});
 app.post('/api/account/:action',async(req,res)=>{
  try{
   if(!store)return res.status(503).json({error:'Accounts need database setup. You can play as a guest.'});
   const expected=`${req.headers['x-forwarded-proto']==='https'?'https':req.protocol}://${req.get('host')}`;
   if(req.get('origin')!==expected)return res.status(403).json({error:'Invalid request origin.'});
   const action=req.params.action,ip=req.ip,now=Date.now();
   if(attempts.size>2000)for(const [k,a]of attempts)if(now-a.start>60000)attempts.delete(k);
   let count=attempts.get(ip);if(!count||now-count.start>60000){count={start:now,n:0};attempts.set(ip,count);}if(++count.n>12)return res.status(429).json({error:'Too many account requests. Wait one minute.'});
   const body=req.body||{};
   if(['register','login'].includes(action)){
    const name=typeof body.username==='string'?body.username.trim().toLowerCase():'';
    if(!/^[a-z0-9_]{3,18}$/.test(name)||typeof body.password!=='string'||body.password.length<12||body.password.length>128)return res.status(400).json({error:'Use a 3–18 character username (letters, numbers, underscores) and a 12–128 character password.'});
    if(busy>=2)return res.status(429).json({error:'Account server is busy. Try again shortly.'});busy++;
    let u;try{
     if(action==='register'){
      if(!AVATARS.includes(body.avatar))return res.status(400).json({error:'Choose an available avatar.'});
      u={username:name,password_hash:await passwordHash(body.password),avatar:body.avatar};
      if(!await store.create(u))return res.status(409).json({error:'That username is taken.'});
     }else{u=await store.user(name);const valid=await verify(body.password,u?.password_hash||await dummy);if(!u||!valid)return res.status(401).json({error:'Incorrect username or password.'});}
    }finally{busy--;}
    const old=tokenFrom(req.headers.cookie);if(old)await store.revoke(hashToken(old));const token=randomBytes(32).toString('hex');await store.addSession(hashToken(token),u.username,now+7*86400000);cookie(res,token,req);return res.json({user:publicUser(u)});
   }
   if(action==='logout'){const t=tokenFrom(req.headers.cookie);if(t)await store.revoke(hashToken(t));res.clearCookie('room905_session',{path:'/'});return res.json({user:null});}
   const u=await lookup(req.headers.cookie);if(!u)return res.status(401).json({error:'Sign in first.'});
   if(action==='avatar'){if(!AVATARS.includes(body.avatar))return res.status(400).json({error:'Choose an available avatar.'});await store.avatar(u.username,body.avatar);return res.json({user:publicUser({...u,avatar:body.avatar})});}
   if(action==='delete'){if(typeof body.password!=='string'||body.password.length>128||busy>=2)return res.status(400).json({error:'Enter your password and try again.'});busy++;let valid;try{valid=await verify(body.password,u.password_hash);}finally{busy--;}if(!valid)return res.status(401).json({error:'Incorrect password.'});await store.remove(u.username);res.clearCookie('room905_session',{path:'/'});return res.json({user:null});}
   res.status(404).json({error:'Unknown account action.'});
  }catch{res.status(503).json({error:'Account storage is unavailable. Guest play still works.'});}
 });
 return {lookup,store,close:()=>store?.close?.(),enabled:!!store};
}
module.exports={installAccounts,AVATARS,passwordHash,verify,tokenFrom};
