'use strict';
function installFriends(app,accounts,notify=()=>{}){
 const limits=new Map();
 app.use('/api/friends',require('express').json({limit:'2kb'}));
 app.get('/api/friends',async(req,res)=>{try{const u=await accounts.lookup(req.headers.cookie);if(!u)return res.status(401).json({error:'Sign in to use Friends.'});const rows=await accounts.store.friendList(u.username);const safe=r=>({username:r.username,avatar:r.avatar});res.json({friends:rows.filter(r=>r.status==='accepted').map(safe),incoming:rows.filter(r=>r.status==='pending'&&r.requester!==u.username).map(safe),outgoing:rows.filter(r=>r.status==='pending'&&r.requester===u.username).map(safe)});}catch{res.status(503).json({error:'Friends service unavailable.'});}});
 app.post('/api/friends/:action',async(req,res)=>{try{
 if(req.get('origin')!==`${req.protocol}://${req.get('host')}`)return res.status(403).json({error:'Invalid request origin.'});
 const u=await accounts.lookup(req.headers.cookie);if(!u)return res.status(401).json({error:'Sign in first.'});
 const now=Date.now();if(limits.size>2000)for(const [k,v]of limits)if(now-v.start>60000)limits.delete(k);
 let rate=limits.get(u.username);if(!rate||now-rate.start>60000){rate={start:now,n:0};limits.set(u.username,rate);}if(++rate.n>30)return res.status(429).json({error:'Too many friend actions. Wait one minute.'});
 const other=typeof req.body?.username==='string'?req.body.username.trim().toLowerCase():'';
 if(!/^[a-z0-9_]{3,18}$/.test(other)||other===u.username)return res.status(400).json({error:'Enter another player’s exact username.'});
 const action=req.params.action;
 if(action==='request'){
  if(!await accounts.store.user(other))return res.status(404).json({error:'Username not found.'});
  const rows=await accounts.store.friendList(u.username);if(rows.length>=100)return res.status(400).json({error:'Friend list limit reached.'});
  if(!await accounts.store.friendRequest(u.username,other))return res.status(409).json({error:'Already friends or a request is pending.'});
 }else if(['accept','remove','decline'].includes(action)){
  if(!await accounts.store.friendAction(u.username,other,action))return res.status(400).json({error:'Request or friendship no longer available.'});
 }else return res.status(404).json({error:'Unknown friend action.'});
 notify([u.username,other]);res.json({ok:true});
 }catch{res.status(503).json({error:'Friends service unavailable.'});}});
}
module.exports={installFriends};
