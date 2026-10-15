'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
test('joystick analog clamp, pointer ownership and release/cancel cleanup',async()=>{
 const {bindJoystick}=await import('../public/joystick.mjs');const handlers={},globalHandlers={};const prevW=global.window,prevD=global.document;let captures=new Set(),axis,enabled=true;
 global.window={addEventListener:(t,f)=>(globalHandlers[t]??=[]).push(f)};global.document={hidden:false,addEventListener:(t,f)=>(globalHandlers[t]??=[]).push(f)};
 const base={style:{},classList:{toggle(){}},getBoundingClientRect:()=>({left:0,top:0,width:142,height:142}),addEventListener:(t,f)=>handlers[t]=f,setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id)};
 const ev=(id,x,y)=>({pointerId:id,clientX:x,clientY:y,preventDefault(){}});
 try{const stick=bindJoystick(base,{style:{}},{enabled:()=>enabled,change:(x,z)=>axis={x,z}});handlers.pointerdown(ev(1,71,71));assert.deepEqual(axis,{x:0,z:0});handlers.pointermove(ev(1,200,-100));assert.ok(Math.hypot(axis.x,axis.z)<=1.00001);assert.ok(axis.x>0&&axis.z>0);const before={...axis};handlers.pointerdown(ev(2,1,1));handlers.pointerup(ev(2,1,1));assert.deepEqual(axis,before,'another finger cannot cancel movement');handlers.pointercancel(ev(1,200,-100));assert.deepEqual(axis,{x:0,z:0});
 handlers.pointerdown(ev(3,100,71));globalHandlers.pointerup[0](ev(3,100,71));assert.deepEqual(axis,{x:0,z:0},'outside release stops movement');handlers.pointerdown(ev(4,100,71));handlers.lostpointercapture(ev(4,100,71));assert.deepEqual(axis,{x:0,z:0});handlers.pointerdown(ev(5,100,71));globalHandlers.blur[0]();assert.deepEqual(axis,{x:0,z:0});enabled=false;handlers.pointerdown(ev(6,100,71));assert.deepEqual(axis,{x:0,z:0});stick.release();
 }finally{global.window=prevW;global.document=prevD;}
});
