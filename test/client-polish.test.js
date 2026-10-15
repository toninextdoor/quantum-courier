'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('photo crop covers the square through rotation, zoom and maximum pan',async()=>{
 const {cropGeometry,drawCrop}=await import('../public/photo-crop.mjs');
 for(const [w,h]of [[1200,800],[800,1200],[500,500]])for(const quarter of [0,1,2,3,-1])for(const zoom of [1,2,3])for(const x of [-1,0,1]){const g=cropGeometry(w,h,{quarter,zoom,x,y:-x});const rw=g.quarter%2?h:w,rh=g.quarter%2?w:h;assert.ok(rw*g.scale>=256);assert.ok(rh*g.scale>=256);assert.ok(Math.abs(g.x)<=g.overflowX);assert.ok(Math.abs(g.y)<=g.overflowY);}
 const operations=[];const ctx=new Proxy({},{get:(o,key)=>o[key]??((...args)=>operations.push([key,...args]))});drawCrop({width:256,getContext:()=>ctx},{naturalWidth:800,naturalHeight:1200},{quarter:1,zoom:1,flip:true});assert.ok(operations.some(o=>o[0]==='rotate'&&o[1]===Math.PI/2));assert.ok(operations.some(o=>o[0]==='scale'&&o[1]<0));
});
test('home click sound never fires during gameplay or with sound off',async()=>{
 const source=fs.readFileSync(require.resolve('../public/game.js'),'utf8'),start=source.indexOf('let menuSoundStops=');const handlers={},played=[];let inGame=false,stopped=0,now=100;
 const document={hidden:false,body:{classList:{contains:()=>inGame}},documentElement:{dataset:{stage:'app'}},addEventListener:(type,fn)=>handlers[type]=fn};
 const context={document,state:null,soundOn:true,audio:{state:'running'},master:{},performance:{now:()=>now},unlockAudio:async()=>{},playUISound:kind=>{played.push(kind);return ()=>stopped++;}};vm.runInNewContext(source.slice(start),context);
 const button={id:'create',disabled:false,closest:()=>null},event={target:{closest:()=>button}};await handlers.click(event);assert.deepEqual(played,['click']);
 now+=100;context.state={phase:'playing'};await handlers.click(event);assert.equal(played.length,1);context.state=null;inGame=true;await handlers.click(event);assert.equal(played.length,1);inGame=false;context.soundOn=false;await handlers.click(event);assert.equal(played.length,1);
 context.soundOn=true;document.hidden=true;handlers.visibilitychange();assert.equal(stopped,1);await handlers.click(event);assert.equal(played.length,1);
});
test('original UI synthesizer uses separate click and entrance voices and can stop them',async()=>{
 const {playUISound}=await import('../public/menu-audio.mjs');let voices=0,stopped=0;const param={setValueAtTime(){},exponentialRampToValueAtTime(){}};const audio={state:'running',currentTime:10,createGain:()=>({gain:param,connect(){},disconnect(){}}),createOscillator:()=>{voices++;return {frequency:param,connect(){},disconnect(){},start(){},stop(){stopped++;}};}};
 const stop=playUISound('entrance',audio,{});assert.equal(voices,5);stop();assert.equal(stopped,10);playUISound('click',audio,{});assert.equal(voices,7);audio.state='suspended';playUISound('click',audio,{});assert.equal(voices,7);
});

test('entrance chime is consumed once and does not replay with How to Play',async()=>{
 const source=fs.readFileSync(require.resolve('../public/game.js'),'utf8'),snippet=source.slice(source.indexOf('let entranceConsumed=false;'),source.indexOf("$('enterIntro').onclick="));const intro={hidden:false},played=[];const context=vm.createContext({$:id=>id==='introScreen'?intro:{inert:true},document:{documentElement:{dataset:{}},querySelector:()=>({inert:true})},sessionStorage:{setItem(){}},unlockAudio:async()=>{},homeAudioAllowed:()=>true,playMenuSound:k=>played.push(k),updateLobbyAmbience(){}});vm.runInContext(snippet,context);
 await vm.runInContext('dismissIntro()',context);assert.deepEqual(played,['entrance']);intro.hidden=false;await vm.runInContext('dismissIntro()',context);assert.deepEqual(played,['entrance']);
});
test('lobby ambience lifecycle never stacks and stops for mute, briefing, hidden tab or round',()=>{
 const source=fs.readFileSync(require.resolve('../public/game.js'),'utf8'),snippet=source.slice(source.indexOf('function updateLobbyAmbience(){'),source.indexOf('let menuSoundStops='));let starts=0,stops=0,allowed=true;const document={documentElement:{dataset:{stage:'app'}}},intro={hidden:true};const context=vm.createContext({document,$:()=>intro,lobby:{phase:'lobby'},audio:{state:'running'},master:{},lobbyBedStop:null,homeAudioAllowed:()=>allowed,startLobbyAmbience:()=>{starts++;return ()=>stops++;}});vm.runInContext(snippet,context);const update=()=>vm.runInContext('updateLobbyAmbience()',context);
 update();update();assert.equal(starts,1);document.documentElement.dataset.stage='briefing';update();assert.equal(stops,1);document.documentElement.dataset.stage='app';update();assert.equal(starts,2);context.lobby.phase='playing';update();assert.equal(stops,2);context.lobby.phase='lobby';allowed=false;update();assert.equal(starts,2);
});
test('lobby chord scheduler cleans up its timer and voices on stop',async()=>{
 const {startLobbyAmbience}=await import('../public/menu-audio.mjs');let tick,cancelled=0,voices=0,stops=0;const param={setValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){}};const audio={state:'running',currentTime:0,createGain:()=>({gain:param,connect(){},disconnect(){}}),createOscillator:()=>{voices++;return {frequency:param,connect(){},disconnect(){},start(){},stop(){stops++;}};}};
 const stop=startLobbyAmbience(audio,{}, {schedule:fn=>{tick=fn;return 7;},cancel:id=>{assert.equal(id,7);cancelled++;}});assert.equal(voices,3);tick();assert.equal(voices,6);stop();stop();assert.equal(cancelled,1);tick();assert.equal(voices,6);assert.equal(stops,12);
});
