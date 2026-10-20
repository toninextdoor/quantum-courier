'use strict';
const{test}=require('node:test');
const assert=require('node:assert/strict');
const{createGameServer}=require('../server');
test('trailer streams byte ranges, caches its versioned URL, and serves captions and poster',async()=>{
 const game=createGameServer();await new Promise(r=>game.server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${game.server.address().port}`;
 try{
  const r=await fetch(base+'/media/room-905-trailer-v4.3.1.mp4',{headers:{Range:'bytes=0-1023'}});
  assert.equal(r.status,206);assert.match(r.headers.get('content-type'),/video\/mp4/);assert.match(r.headers.get('content-range'),/^bytes 0-1023\/\d+$/);assert.equal((await r.arrayBuffer()).byteLength,1024);assert.match(r.headers.get('cache-control'),/immutable/);
  const captions=await fetch(base+'/media/room-905-trailer-v4.3.1.vtt');assert.match(captions.headers.get('content-type'),/text\/vtt/);assert.match(await captions.text(),/^WEBVTT/);
  const poster=await fetch(base+'/media/room-905-trailer-v4.3.1.jpg');assert.equal(poster.status,200);assert.match(poster.headers.get('content-type'),/image\/jpeg/);await poster.arrayBuffer();
  assert.equal((await(await fetch(base+'/health')).json()).version,'4.4.1');
 }finally{await game.close();}
});
