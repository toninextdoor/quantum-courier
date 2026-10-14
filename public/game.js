import { trolleyLayout } from '/trolley-layout.js?v=3.3.2';
import * as THREE from '/vendor/three.module.js';
import { checkBrowser } from '/self-check.js?v=3.3.2';
const $ = id => document.getElementById(id);
const socket = io();
let serverCompatible=true;
const touchDevice = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
let lobby = null, state = null, previous = null, world = null, received = 0, yaw = 0, pitch = 0;
let commandCamera, commandGroup, hologram, commandFocus = false;
let renderer, scene, camera, tacticalCamera, flashlight, lightTarget, staticGroup, actorGroup, itemGroup, enemyGroup, pingGroup, carryGroup;
let trolleyCargoGroup, trolleyKey='';
let items = new Map(), actors = new Map(), currentRound = null;
let lastFrame = performance.now(), lastSound = 0, lastEvent = -1, lastCue = '';
const keys = new Set(), touches = new Map();
let jumpUntil = 0, cargoListKey = '', lastRender = 0;
const qualityNames=['NORMAL','LOW','MINIMAL'],qualityRatios=[1,.65,.45];
let quality=0,qualityAuto=true,recommendedQuality=0,checkRunning=false;
try{const saved=sessionStorage.getItem('room905-quality');if(saved!==null){quality=Math.max(0,Math.min(2,Number(saved)||0));qualityAuto=false;}}catch{}
function applyQuality(value,automatic=false){
  quality=value;qualityAuto=automatic;$('graphics').textContent=`GRAPHICS ${qualityNames[quality]}`;$('graphics').setAttribute('aria-label',`Graphics ${qualityNames[quality]}. Click to change.`);
  if(renderer){renderer.setPixelRatio(Math.min(devicePixelRatio,qualityRatios[quality]));resize();}
}
$('graphics').onclick=()=>{applyQuality((quality+1)%3);try{sessionStorage.setItem('room905-quality',String(quality));}catch{}};
$('useRecommended').onclick=()=>{if($('deviceDialog').open||$('friendsDialog').open||$('disclosureDialog').open)$('deviceDialog').close();$('devicePanel').hidden=true;$('deviceReopen').hidden=false;applyQuality(recommendedQuality,true);try{sessionStorage.removeItem('room905-quality');sessionStorage.setItem('room905-device-collapsed','yes');}catch{}};
async function runBrowserCheck(){
  if(checkRunning)return;if(state?.phase==='playing')return showError('Run the browser check between rounds.');
  checkRunning=true;$('checkAgain').disabled=true;$('deviceStatus').textContent='Checking 3D performance…';
  try{
    const result=await checkBrowser(message=>{$('deviceStatus').textContent=message;$('introCheck').textContent=message;});
    if(!result.supported){$('devicePanel').hidden=false;$('deviceReopen').hidden=false;$('deviceStatus').textContent='3D unavailable on this browser';$('deviceDetails').textContent=result.reason;$('introCheck').textContent='3D unavailable. Open browser readiness for help.';$('create').disabled=$('join').disabled=true;return;}
    recommendedQuality=result.quality;if(qualityAuto)applyQuality(result.quality,true);
    $('create').disabled=$('join').disabled=false;$('useRecommended').hidden=false;
    $('deviceStatus').textContent=`Recommended: ${qualityNames[result.quality]} graphics${result.fps<24?' · performance may be limited':''}`;
    $('deviceDetails').textContent=`Sample scene: about ${Math.round(result.fps)} FPS at ${qualityNames[result.quality]}. ${touchDevice?'Touch controls available.':'Keyboard and mouse controls available.'} ${typeof window.AudioContext==='function'||typeof window.webkitAudioContext==='function'?'Audio supported; click to enable.':'Audio unavailable; visual cues still work.'} This is an estimate, not a guarantee; quality adapts during play unless you choose it manually.`;
    $('introCheck').textContent=`Browser check complete · ${qualityNames[result.quality]} recommended`;
    const pingAt=performance.now();socket.timeout(2000).emit('check:ping',(err)=>{if(!err)$('deviceDetails').textContent+=` Server round trip: ${Math.round(performance.now()-pingAt)} ms (single sample).`;else $('deviceDetails').textContent+=' Server connection slow or unavailable; wait for ONLINE.';});
  }catch(e){$('devicePanel').hidden=false;$('deviceReopen').hidden=false;$('deviceStatus').textContent='Check could not finish';$('deviceDetails').textContent='Try RUN CHECK again. You can try MINIMAL graphics; a successful check does not replace a real multiplayer playtest.';$('introCheck').textContent='Check incomplete · see browser readiness';applyQuality(2,true);}
  finally{checkRunning=false;$('checkAgain').disabled=false;}
}
$('checkAgain').onclick=runBrowserCheck;
$('deviceReopen').onclick=()=>{release();document.exitPointerLock?.();$('deviceSlot').append($('devicePanel'));$('devicePanel').hidden=false;$('deviceDialog').showModal();try{sessionStorage.removeItem('room905-device-collapsed');}catch{}};
$('closeDevice').onclick=()=>$('deviceDialog').close();
$('deviceDialog').addEventListener('close',()=>{$('devicePanel').hidden=true;$('front').prepend($('devicePanel'));try{sessionStorage.setItem('room905-device-collapsed','yes');}catch{}});
try{if(sessionStorage.getItem('room905-device-collapsed')==='yes'){$('devicePanel').hidden=true;$('deviceReopen').hidden=false;}}catch{}
async function dismissIntro(){ document.documentElement.dataset.stage='app';$('introScreen').hidden=true;document.querySelector('header').inert=false;document.querySelector('footer').inert=false;$('game').inert=false;$('front').inert=false;try{sessionStorage.setItem('room905-flipbook','seen');}catch{} await unlockAudio();tone(660,.18,'sine',.04);setTimeout(()=>tone(880,.25,'sine',.035),180); }
$('enterIntro').onclick=$('skipIntro').onclick=dismissIntro;
const briefingPages=[
 {kicker:'01 / THE ASSIGNMENT',title:'Recover the room.<br>Return together.',text:'The hotel has commissioned your crew to recover abandoned property from the sealed Room 905. The suite changes each time you enter.',facts:['2–4 players. Create a crew and share its four-letter code.','Recover $600 of property within 3 minutes.','Return valuables to the green hallway extraction pad.'],chapter:'MISSION BRIEF',art:'door'},
 {kicker:'02 / YOUR CREW',title:'Know your role.<br>Work together.',text:'Player one is Navigator. In crews of 3–4, player two is Guardian; everyone else is Recovery. Two-player crews use Navigator + Recovery.',facts:['Navigator — see signal gaps, the Sentinel and valuables on the hologram. Click the floor to guide your crew.','Guardian — see the Sentinel, but not gaps. F / SIGNAL PULSE pauses it for 3 seconds within 6m and a clear path; recharge takes 12 seconds.','Recovery — follow command, collect valuables and return them to the trolley. WASD / touch arrows move; mouse / swipe turns your view.'],chapter:'CREW ROLES',art:'views'},
 {kicker:'03 / HANDLE WITH CARE',title:'Pick it up.<br>Bring it back.',text:'Press E or GRAB beside a valuable, then carry it to extraction. Delivery is automatic on the green pad.',facts:['Tap E / GRIP at least every 2 seconds to keep hold. Q / DROP releases it. Letting go costs 8% condition.','Walk with property: sprinting into walls costs 12% condition. Less condition means less value.','Optional: Space / JUMP reaches a $450 artifact. Release and press again for each platform jump.'],chapter:'PROPERTY RECOVERY',art:'cargo'},
 {kicker:'04 / KEEP THE LINK',title:'Trust the voice.<br>Watch the signals.',text:'The Sentinel is a signal beacon. Red screen edges and a quicker heartbeat warn when it is near; enable sound to hear the cue.',facts:['The Navigator can track the beacon and signal gaps. Follow their directions.','Signal gaps cost 5 seconds; Sentinel interference costs 10. Property is dropped and sensors reset at the hallway.','After a brief sensor reset, you reconnect at the hallway. Keep recovering until you reach the quota.'],chapter:'SIGNAL AWARENESS',art:'signal'}
];
const bookIllustrations={
 door:'<rect x="70" y="12" width="140" height="200" rx="3" fill="#211b25" stroke="#d6b77d" stroke-width="2"/><rect x="112" y="47" width="56" height="35" rx="3" fill="none" stroke="#d6b77d"/><text x="140" y="71" text-anchor="middle" fill="#e8d5a9" font-family="serif" font-size="22">905</text><path d="M184 122h18" stroke="#d6b77d" stroke-width="4"/><path d="M40 213h200" stroke="#6f5b45"/>',
 views:'<rect x="18" y="32" width="113" height="133" rx="8" fill="#25212b" stroke="#d6b77d"/><path d="M35 51h38v40h40v55H54V112H35z" fill="none" stroke="#79b9b1" stroke-width="2"/><circle cx="78" cy="122" r="5" fill="#d6b77d"/><rect x="152" y="49" width="108" height="133" rx="8" fill="#25212b" stroke="#d6b77d"/><path d="M172 164V87l33-22 33 22v77M196 122h20m-10-10v20" fill="none" stroke="#d6b77d" stroke-width="2"/><path d="M121 198h44m-8-7 8 7-8 7" fill="none" stroke="#79b9b1" stroke-width="2"/>',
 cargo:'<path d="M44 105 92 79l47 26v61l-47 26-48-26zM44 105l48 26 47-26M92 131v61" fill="#29212a" stroke="#d6b77d" stroke-width="2"/><path d="M158 135h36m-8-8 8 8-8 8" fill="none" stroke="#d6b77d" stroke-width="2"/><ellipse cx="230" cy="163" rx="37" ry="14" fill="#79b9b122" stroke="#79b9b1"/><path d="M212 127h36m-18-16v32" stroke="#79b9b1" stroke-width="2"/><text x="140" y="50" text-anchor="middle" fill="#e8d5a9" font-family="serif" font-size="28">$600</text>',
 signal:'<path d="M140 113v83M111 197h58" stroke="#d6b77d" stroke-width="4"/><path d="M140 46 172 78l-32 32-32-32z" fill="#d6b77d22" stroke="#d6b77d" stroke-width="2"/><path d="M93 47q-43 30 0 62M187 47q43 30 0 62M69 31q-62 47 0 94M211 31q62 47 0 94" fill="none" stroke="#79b9b1" stroke-width="2"/>'
};
let bookIndex=0;
function turnBook(index){
 bookIndex=Math.max(0,Math.min(3,index));const p=briefingPages[bookIndex];
 $('bookKicker').textContent=p.kicker;$('bookTitle').innerHTML=p.title;$('bookText').textContent=p.text;$('bookChapter').textContent=p.chapter;$('bookCounter').textContent=`0${bookIndex+1} / 04`;
 $('bookFacts').replaceChildren(...p.facts.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
 $('bookArt').innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 225">${bookIllustrations[p.art]}</svg>`;
 $('bookPrev').disabled=bookIndex===0;$('bookNext').hidden=bookIndex===3;$('enterIntro').hidden=bookIndex!==3;
 $('bookDots').replaceChildren(...briefingPages.map((_,i)=>{const b=document.createElement('button');b.className=i===bookIndex?'bookDot selected':'bookDot';b.setAttribute('aria-label',`Briefing page ${i+1}`);b.setAttribute('aria-current',String(i===bookIndex));b.onclick=()=>turnBook(i);return b;}));
 $('bookPage').classList.remove('pageTurn');void $('bookPage').offsetWidth;$('bookPage').classList.add('pageTurn');
}
$('bookNext').onclick=()=>turnBook(bookIndex+1);$('bookPrev').onclick=()=>turnBook(bookIndex-1);
window.addEventListener('keydown',e=>{if($('introScreen').hidden)return;if(e.key==='Escape'){e.preventDefault();void dismissIntro();}else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();turnBook(bookIndex+(e.key==='ArrowRight'?1:-1));}});
$('replayBriefing').onclick=()=>{document.documentElement.dataset.stage='briefing';release();document.exitPointerLock?.();turnBook(0);$('introScreen').hidden=false;document.querySelector('header').inert=true;document.querySelector('footer').inert=true;$('game').inert=true;$('front').inert=true;$('bookNext').focus();};
turnBook(0);
// Startup always proceeds disclosure -> briefing -> lobby; Skip remains available.
if(!$('introScreen').hidden){document.querySelector('header').inert=true;document.querySelector('footer').inert=true;$('game').inert=true;$('front').inert=true;$('bookNext').focus();}
applyQuality(quality,qualityAuto);
setTimeout(runBrowserCheck,0);
let slowWindows=0,monitorFrames=0,monitorAt=performance.now();
let threatLevel = 0, lastHeartbeat = 0;
let swipe = null, soundOn = true, audio = null, ambience = null, audioTestUntil = 0, master = null, analyser = null, audioPending = false, audioWave = null;
const raycaster = new THREE.Raycaster(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const mint = 0xb9f8bd, cyan = 0x64ddd4, amber = 0xfac875, red = 0xff666e;
function showError(text = '') { $('error').textContent = text; $('error').hidden = !text; }
function send(event, data) {
  if(!serverCompatible)return showError('Client/server versions do not match. Deploy the full update and reload.');
  showError(); if (!socket.connected) return showError('Connection unavailable. Wait for reconnection.');
  socket.timeout(5000).emit(event, data, (err, response) => { if (err) showError('Request timed out. Check your connection.'); else if (response?.error) showError(response.error); });
}
async function unlockAudio() {
  if(!soundOn)return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if(!master){master=audio.createGain();master.gain.value=.8;analyser=audio.createAnalyser();analyser.fftSize=512;audioWave=new Uint8Array(512);master.connect(analyser);analyser.connect(audio.destination);}
    await audio.resume();
    audioPending=audio.state!=='running';
    if(!ambience){
      ambience=audio.createGain();ambience.gain.value=0;ambience.connect(master);
      for(const frequency of [164,221]){const o=audio.createOscillator();o.type='triangle';o.frequency.value=frequency;o.connect(ambience);o.start();}
      const buffer=audio.createBuffer(1,audio.sampleRate*2,audio.sampleRate),samples=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*.4;
      const noise=audio.createBufferSource(),filter=audio.createBiquadFilter();noise.buffer=buffer;noise.loop=true;filter.type='bandpass';filter.frequency.value=650;filter.Q.value=.8;noise.connect(filter);filter.connect(ambience);noise.start();
    }
    updateAmbience();
  } catch { audioPending=true; $('sound').textContent='ENABLE SOUND'; }
}
function updateAmbience() {
  if(!ambience)return;
  const active=soundOn&&!document.hidden&&(state?.phase==='playing'||(devEffect?.until>performance.now()&&['ambience','combined'].includes(devEffect.kind)));
  const preview=devEffect?.until>performance.now()&&['ambience','combined'].includes(devEffect.kind);
  ambience.gain.setTargetAtTime(active?(preview ? .12 : .055+threatLevel*.035):0,audio.currentTime,.3);
}
for(const event of ['pointerdown','keydown'])document.addEventListener(event,e=>{if(e.target.closest?.('#sound'))return;if(soundOn&&audio?.state!=='running')void unlockAudio();},{capture:true});
function tone(frequency, duration = 0.12, type = 'sine', volume = 0.06, end = frequency, hold = false) {
  if (!soundOn || !audio || audio.state !== 'running') return;
  const oscillator = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime;
  oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, now); oscillator.frequency.exponentialRampToValueAtTime(Math.max(10, end), now + duration);
  gain.gain.setValueAtTime(volume, now);if(hold)gain.gain.setValueAtTime(volume,now+duration-.04); gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(gain); gain.connect(master); oscillator.start(now); oscillator.stop(now + duration);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
}
$('sound').onclick = async () => {
  if(!soundOn||audio?.state!=='running'){soundOn=true;await unlockAudio();}else soundOn=false;updateAmbience();
  $('sound').textContent=soundOn?(audio?.state==='running'?'SOUND ON':'ENABLE SOUND'):'SOUND OFF';$('sound').setAttribute('aria-pressed',String(soundOn));tone(480);
};
let devSignedIn=false, soundTapCount=0, soundTapAt=0, devEffect=null;
$('aboutButton').onclick=()=>{release();document.exitPointerLock?.();$('aboutDialog').showModal();};
$('closeAbout').onclick=()=>$('aboutDialog').close();
$('regularSignIn').onclick=()=>{release();document.exitPointerLock?.();$('regularDialog').showModal();loadAccount();};
$('continueGuest').onclick=()=>$('regularDialog').close();
$('sound').addEventListener('click',()=>{
  const now=performance.now();soundTapCount=now-soundTapAt>3000?1:soundTapCount+1;soundTapAt=now;
  if(soundTapCount>=10){soundTapCount=0;release();document.exitPointerLock?.();$('devDialog').showModal();refreshDevTargets();}
});
$('closeDev').onclick=()=>$('devDialog').close();
function refreshDevTargets(){
  const selected=$('devTarget').value;
  $('devTarget').replaceChildren(...[{id:'all',name:'All Scavengers'},...(state?.actors||[])].map(a=>{const o=document.createElement('option');o.value=a.id;o.textContent=a.name;return o;}));
  if([...$('devTarget').options].some(o=>o.value===selected))$('devTarget').value=selected;
}
function devRequest(event,data){
  $('devStatus').textContent='Working…';
  socket.timeout(5000).emit(event,data,(err,result)=>{
    $('devStatus').textContent=err?'Connection timed out.':result?.error||'Done.';
    if(event==='dev:login'&&result?.ok){devSignedIn=true;$('devLogin').hidden=true;$('devPanel').hidden=false;$('devPass').value='';refreshDevTargets();}
    if(result?.error?.includes('session')){devSignedIn=false;$('devLogin').hidden=false;$('devPanel').hidden=true;}
  });
}
$('devLogin').onsubmit=e=>{e.preventDefault();devRequest('dev:login',{username:$('devUser').value,password:$('devPass').value});};
$('devLogout').onclick=()=>{socket.emit('dev:logout');devSignedIn=false;$('devLogin').hidden=false;$('devPanel').hidden=true;$('devStatus').textContent='Signed out.';};
$('devReplay').onclick=()=>devRequest('start',{});
document.querySelectorAll('[data-dev]').forEach(b=>b.onclick=()=>devRequest('dev:action',{action:b.dataset.dev,target:$('devTarget').value}));
function setLocalPreview(kind){devEffect={kind,until:performance.now()+5000};}
document.querySelectorAll('[data-local-audio]').forEach(b=>b.onclick=async()=>{
  soundOn=true;await unlockAudio();$('sound').textContent=audio?.state==='running'?'SOUND ON':'ENABLE SOUND';$('sound').setAttribute('aria-pressed','true');
  if(b.dataset.localAudio==='speaker')tone(520,1.2,'sine',.25,520,true);else setLocalPreview(b.dataset.localAudio);
  $('devStatus').textContent=audio?.state==='running'?'Playing on THIS device.':'Audio blocked. Click ENABLE SOUND on this device.';
});
$('devVolume').oninput=()=>{if(master)master.gain.value=Number($('devVolume').value);};
socket.on('dev:effect',async data=>{
  if(data.kind==='clear'){devEffect=null;audioTestUntil=0;return;}
  setLocalPreview(data.kind);audioPending=['heartbeat','ambience','combined'].includes(data.kind)&&audio?.state!=='running';
  if(['heartbeat','ambience','combined'].includes(data.kind)){soundOn=true;if(audio?.state!=='running')$('sound').textContent='ENABLE SOUND';await unlockAudio();$('sound').textContent=audio?.state==='running'?'SOUND ON':'ENABLE SOUND';$('sound').setAttribute('aria-pressed','true');}
});
$('create').onclick = () => send('enter', { create: true, name: $('name').value });
$('join').onclick = () => send('enter', { name: $('name').value, code: $('code').value });
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') $('join').click(); });
$('start').onclick = $('again').onclick = () => send('start', {});
$('copyCode').onclick = async () => { try { await navigator.clipboard.writeText(lobby.code); $('copyCode').textContent = 'Copied!'; } catch { $('copyCode').textContent = `Code: ${lobby.code}`; } };
$('helpButton').onclick = () => { release(); document.exitPointerLock?.(); $('helpDialog').showModal(); };
$('closeHelp').onclick = () => $('helpDialog').close();
$('chatInput').addEventListener('focus', release);
$('chatForm').onsubmit = e => { e.preventDefault(); if ($('chatInput').value.trim()) { socket.emit('chat', $('chatInput').value); $('chatInput').value = ''; } };
document.querySelectorAll('[data-command]').forEach(b => b.onclick = () => socket.emit('guide', { command: b.dataset.command }));
function reset() {
  release(); $('resetScreen').hidden=true; threatLevel=0; $('threatVignette').style.opacity='0'; document.exitPointerLock?.(); state = previous = lobby = null; currentRound = null;
  $('front').hidden = false; $('entry').hidden = false; $('lobby').hidden = true; $('game').hidden = true; $('result').hidden = true;
  $('footer').hidden = false; document.body.classList.remove('inGame'); $('chatLog').replaceChildren();
  updateAmbience();
  for(const id of ['helpDialog','regularDialog','aboutDialog','deviceDialog'])if($(id).open)$(id).close();
}
document.querySelectorAll('.leave').forEach(b => b.onclick = () => { socket.emit('leave'); reset(); });
socket.on('left', reset);
socket.on('connect', () => { $('connection').textContent = '● ONLINE'; });
socket.on('build',data=>{ $('connection').textContent='● ONLINE';$('devVersion').textContent=`CLIENT 3.3.2 · SERVER ${data.version}`; serverCompatible=data.version==='3.3.2';if(!serverCompatible){ $('create').disabled=$('join').disabled=$('start').disabled=true;showError(`Update required: client 3.3.2, server ${data.version}. Deploy the matching server.js and reload before starting a crew.`);} });
socket.on('disconnect', () => { devSignedIn=false;$('devLogin').hidden=false;$('devPanel').hidden=true;$('devDialog').close();reset(); $('connection').textContent = 'RECONNECTING'; showError('Connection lost. Rejoin with your crew’s code once connected. The active shift returns to the lobby.'); });
socket.on('connect_error', () => { $('connection').textContent = 'OFFLINE'; showError('Unable to reach the game server.'); });
socket.on('lobby', data => {
  lobby = data; $('entry').hidden = true; $('lobby').hidden = data.phase !== 'lobby';
  $('roomCode').textContent = data.code; $('roomTag').textContent = data.code;
  $('count').textContent = `${data.players.length} / 4`;
  $('players').replaceChildren(...data.players.map(p => {
    const li = document.createElement('li'), name = document.createElement('strong'), role = document.createElement('span');
    name.textContent = p.name + (p.id === socket.id ? ' · YOU' : '') + (p.id === data.host ? ' · HOST' : '');
    role.textContent = p.role==='Navigator'?'NAVIGATOR':p.role==='Guardian'?'GUARDIAN':'RECOVERY CREW'; const badge=document.createElement('img');badge.className='rosterAvatar';badge.src=`/assets/avatars/${avatarColors[p.avatar]?p.avatar:'amber'}.svg`;badge.alt=`${p.avatar||'amber'} recovery badge`;li.append(badge,name, role); return li;
  }));
  $('lobbyNotice').textContent = data.notice || (data.players.length < 2 ? 'Share this code with a friend. Two players are needed to launch.' : 'First player is Navigator. With 3–4 players, the second is Guardian; the rest are Recovery crew.');
  $('start').disabled = data.host !== socket.id || data.players.length < 2;
  $('start').textContent = data.host === socket.id ? 'Enter Room 905 →' : 'Waiting for host to launch…';
  if (data.phase === 'lobby') {
    release(); document.exitPointerLock?.(); state = previous = null; updateAmbience();
    $('front').hidden = false; $('game').hidden = true; $('result').hidden = true; $('footer').hidden = false; document.body.classList.remove('inGame');
  }
});
socket.on('chat', data => {
  const line = document.createElement('p'), name = document.createElement('b'); name.textContent = data.name + ': '; line.append(name, document.createTextNode(data.text));
  $('chatLog').append(line); while ($('chatLog').children.length > 50) $('chatLog').firstChild.remove(); $('chatLog').scrollTop = $('chatLog').scrollHeight; tone(700, 0.06, 'sine', 0.025);
});
socket.on('world', data => {
  world = data;
  const nav = lobby?.players.find(p => p.id === socket.id)?.role === 'Navigator';
  try { initGraphics(); buildWorld(nav); $('renderError').hidden = true; }
  catch (e) { console.error(e); $('renderError').hidden = false; showError('3D rendering could not start. Try a browser with WebGL enabled.'); }
});
socket.on('state', data => {
  previous = state; state = data; received = performance.now();
  $('resetScreen').hidden=!data.respawn;
  if(data.respawn){
    if(!previous?.respawn)release();
    $('resetCause').textContent=data.respawn.cause==='sentinel'?'SENTINEL INTERFERENCE':'SIGNAL GAP';
    $('resetPenalty').textContent=`−${data.respawn.penalty} seconds · sensor reset`;
    $('resetCountdown').textContent=`Reconnecting in ${Math.max(.1,data.respawn.remaining).toFixed(1)}s…`;
  }
  const nav = data.role === 'Navigator', me = data.actors.find(a => a.id === socket.id);
  if (currentRound !== data.roundId) {
    currentRound = data.roundId; yaw = me?.yaw || 0; pitch = 0; lastEvent = -1; lastCue = ''; previous = null; release();
    $('result').hidden = true; $('chatLog').replaceChildren();
  }
  $('front').hidden = true; $('game').hidden = false; $('footer').hidden = false; document.body.classList.add('inGame');
  $('sector').textContent = `ROOM 905 / LAYOUT ${data.mapSeed?.toString(16).toUpperCase() || '—'}`;
  $('role').textContent = nav ? 'NAVIGATOR' : data.role==='Guardian'?'GUARDIAN':'RECOVERY CREW'; $('viewLabel').textContent = nav ? 'MISSION COMMAND / ROOM 905' : data.role==='Guardian'?'GUARDIAN / SENTINEL LINK':'BODYCAM / SENSOR BLIND · TRUST COMMAND';
  if(data.role!==previous?.role)$('scavengerInfo').querySelector('p').textContent=data.role==='Guardian'?'Your bodycam can see the Sentinel, but signal gaps stay hidden. Follow the Navigator. F / SIGNAL PULSE pauses the Sentinel for 3 seconds within 6m and a clear path; recharge takes 12 seconds. You can also grab property and keep tapping E / GRIP while carrying.':'Your bodycam cannot locate signal gaps or the Sentinel. Red edges and heartbeat warn when it is close. Follow your Navigator. While carrying, tap E / GRIP every 2 seconds.';
  $('guardianPulse').hidden=data.role!=='Guardian';$('guardianPulse').disabled=data.phase!=='playing'||!!data.respawn||(data.guardian?.cooldown||0)>0;$('guardianPulse').textContent=(data.guardian?.cooldown||0)>0?`PULSE · ${Math.ceil(data.guardian.cooldown)}s`:'[F] SIGNAL PULSE';
  $('score').textContent = `$${data.score}`; $('progress').style.width = `${Math.min(100, data.score / data.quota * 100)}%`;
  const remaining = Math.ceil(data.remaining); $('time').textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  $('time').classList.toggle('urgent', remaining <= 30);
  $('navTools').hidden = $('navLegend').hidden = $('commandView').hidden = !nav; $('scavengerInfo').hidden = nav; $('crosshair').hidden = nav;
  $('touchControls').hidden = nav || !touchDevice || data.phase !== 'playing'; $('viewport').classList.toggle('touchUI', touchDevice && !nav);
  $('clickToLook').hidden = nav || touchDevice || document.pointerLockElement === renderer?.domElement || data.phase !== 'playing';
  $('guideCue').hidden = !data.cue; if (data.cue) { $('guideCue').textContent = `NAVIGATOR: ${data.cue.text}`; $('guideCue').classList.toggle('danger', ['DANGER', 'STOP'].includes(data.cue.text)); }
  if (data.cue && data.cue.until !== lastCue) { lastCue = data.cue.until; tone(880, .1, 'sine', .06, 550); }
  const nextCargoKey = data.roundId + ':' + data.items.map(i => `${i.id}:${i.carrier || ''}:${i.condition}`).join('|');
  if (nav && nextCargoKey !== cargoListKey) {
    cargoListKey = nextCargoKey;
    $('cargoList').replaceChildren(...data.items.map(i => { const row = document.createElement('div'), label = document.createElement('span'), value = document.createElement('span'); label.textContent = i.premium ? `★ ${i.name}` : i.carrier ? `↗ ${i.name}` : i.name; value.textContent = `$${Math.round(i.value * i.condition / 100)}`; row.append(label, value); return row; }));
  }
  const cargo = data.items.find(i => i.carrier === socket.id);
  $('cargoPanel').hidden = !cargo; $('touchGrab').textContent = cargo ? 'GRIP' : 'GRAB';
  $('touchDrop').hidden=!cargo;
  if (cargo) {
    const grip=Math.max(0,Math.min(1,(me?.gripRemaining||0)/2));$('gripFill').style.width=`${grip*100}%`;$('gripTime').textContent=`${(me?.gripRemaining||0).toFixed(1)}s · TAP ${touchDevice?'GRIP':'E'}`;$('cargoPanel').classList.toggle('gripUrgent',grip<.35);
    $('cargoName').textContent = cargo.name; $('cargoValue').textContent = `$${Math.round(cargo.value * cargo.condition / 100)}`;
    $('cargoCondition').textContent = `${cargo.condition}% INTACT`; $('conditionBar').style.width = `${cargo.condition}%`;
    $('conditionBar').style.background = cargo.condition < 60 ? '#ff666e' : '#b9f8bd';
  }
  $('interactPrompt').hidden=touchDevice&&!!cargo;
  const near = me && data.items.filter(i => !i.carrier && Math.hypot(i.x - me.x, i.z - me.z) < 1.8 && Math.abs((me.y||0)-(i.y||0))<.7).sort((a,b)=>Math.hypot(a.x-me.x,a.z-me.z)-Math.hypot(b.x-me.x,b.z-me.z))[0];
  $('interactPrompt').textContent = nav ? '' : cargo ? `${touchDevice ? 'TAP GRIP' : '[E] KEEP GRIP · [Q] DROP'} · return to trolley` : near ? `${touchDevice ? 'GRAB' : '[E] GRAB'} ${near.name} · $${Math.round(near.value * near.condition / 100)}` : '';
  $('event').textContent = data.event;
  if (lastEvent !== data.eventId) {
    if (lastEvent !== -1) {
      if (data.eventKind === 'success') { tone(440,.12,'sine',.07,660); setTimeout(()=>tone(880,.2,'sine',.06),130); }
      else if (['danger','damage'].includes(data.eventKind)) { tone(140,.25,'sawtooth',.035,60); $('viewport').classList.remove('signalFlash'); requestAnimationFrame(()=>$('viewport').classList.add('signalFlash')); }
      else if (data.eventKind === 'pickup') tone(450,.15,'triangle',.07,850);
    }
    lastEvent = data.eventId;
  }
  if (data.phase === 'finished') {
    release(); document.exitPointerLock?.(); $('result').hidden = false;
    $('resultTitle').textContent = data.outcome === 'won' ? 'You made it out.' : 'Room 905 keeps its secrets.';
    $('resultSubtitle').textContent = data.outcome === 'won' ? 'Quota secured. Trust, timing, and a little nerve.' : 'Try the nearby valuables first. Walk with cargo; use the Navigator’s waypoints.';
    $('resultScore').textContent = `$${data.score} / $${data.quota}`; $('resultDeliveries').textContent = data.deliveries;
    $('resultDamage').textContent = `$${data.damage}`; $('resultCatches').textContent = data.catches;
    $('again').hidden = lobby?.host !== socket.id; $('replayHelp').textContent = lobby?.host === socket.id ? 'Same crew. Fresh cargo. Ready when you are.' : 'Waiting for the host to launch another shift.';
  }
  updateAmbience();
  updateEntities(nav);
});
function initGraphics() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio,qualityRatios[quality])); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  $('scene').append(renderer.domElement);
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(72, 1, 0.08, 70);
  commandCamera = new THREE.PerspectiveCamera(55, 1, .05, 80);
  camera.rotation.order = 'YXZ'; tacticalCamera = new THREE.OrthographicCamera(-18, 18, 18, -18, .1, 100);
  scene.add(camera); carryGroup = new THREE.Group(); camera.add(carryGroup);
  flashlight = new THREE.SpotLight(0xe9e1cf, 16, 18, Math.PI / 5, .6, 1.3); lightTarget = new THREE.Object3D(); scene.add(flashlight, lightTarget); flashlight.target = lightTarget;
  renderer.domElement.addEventListener('click', onMapClick);
  renderer.domElement.addEventListener('pointerdown', e => { if (!touchDevice || state?.role === 'Navigator') return; renderer.domElement.setPointerCapture(e.pointerId); swipe = { id: e.pointerId, x: e.clientX, y: e.clientY }; });
  renderer.domElement.addEventListener('pointermove', e => { if (!swipe || swipe.id !== e.pointerId || state?.phase !== 'playing') return; yaw += (e.clientX - swipe.x) * .006; pitch = THREE.MathUtils.clamp(pitch + (e.clientY - swipe.y) * .004, -.8, .8); swipe.x = e.clientX; swipe.y = e.clientY; });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) renderer.domElement.addEventListener(type, e => { if (swipe?.id === e.pointerId) swipe = null; });
  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); release(); $('renderError').hidden = false; showError('Graphics connection lost. Reload to rejoin your crew.'); });
  new ResizeObserver(resize).observe($('viewport'));
}
function material(color, options = {}) { return new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: .25, ...options }); }
function box(parent, w, h, d, x, y, z, mat) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat); mesh.position.set(x,y,z); parent.add(mesh); return mesh; }
function sphere(parent, r, x, y, z, mat) { const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat); mesh.position.set(x,y,z); parent.add(mesh); return mesh; }
function cylinder(parent, top, bottom, height, x, y, z, mat, sides = 12) { const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top,bottom,height,sides), mat); mesh.position.set(x,y,z); parent.add(mesh); return mesh; }
function ring(parent, radius, color, x, z, thickness = .04) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, thickness, 8, 48), new THREE.MeshBasicMaterial({ color })); mesh.rotation.x = -Math.PI / 2; mesh.position.set(x,.035,z); parent.add(mesh); return mesh;
}
function textSprite(text, color = '#b9f8bd', scale = 2.5, depthTest = true) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const cx = c.getContext('2d'); cx.fillStyle = '#08141bd9'; cx.fillRect(0,0,512,96); let size=35;cx.font=`bold ${size}px monospace`;while(cx.measureText(text).width>480&&size>10){size--;cx.font=`bold ${size}px monospace`;} cx.fillStyle = color; cx.textAlign='center'; cx.fillText(text,256,61);
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map:texture, depthTest, transparent:true })); sprite.scale.set(scale,scale*96/512,1); return sprite;
}
function disposeGroup(group) {
  if (!group) return;
  const geometries = new Set(), materials = new Set();
  group.traverse(o => { if(o.isInstancedMesh) o.dispose(); if(o.geometry) geometries.add(o.geometry); if(o.material) (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m)); });
  geometries.forEach(g=>g.dispose()); materials.forEach(m=>{m.map?.dispose();m.dispose();}); group.removeFromParent();
}
// Draw repeated static boxes together instead of issuing a draw call per trim/bar.
function batchStaticBoxes(parent) {
  const groups = new Map();
  for (const mesh of [...parent.children]) {
    if (!mesh.isMesh || mesh.geometry.type !== 'BoxGeometry' || mesh.material.transparent) continue;
    const list = groups.get(mesh.material) || []; list.push(mesh); groups.set(mesh.material, list);
  }
  for (const [mat, meshes] of groups) {
    if (meshes.length < 2) continue;
    const batch = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, meshes.length);
    const matrix = new THREE.Matrix4(), scale = new THREE.Matrix4();
    meshes.forEach((mesh, index) => {
      mesh.updateMatrix(); const p = mesh.geometry.parameters;
      scale.makeScale(p.width, p.height, p.depth); matrix.copy(mesh.matrix).multiply(scale);
      batch.setMatrixAt(index, matrix); parent.remove(mesh); mesh.geometry.dispose();
    });
    batch.computeBoundingSphere(); parent.add(batch);
  }
}
function buildWorld(nav) {
  for(const group of [staticGroup,actorGroup,itemGroup,enemyGroup,pingGroup,commandGroup])disposeGroup(group);
  if(hologram)scene.remove(hologram); hologram = null; commandGroup = null;
  while(carryGroup.children.length){const child=carryGroup.children[0];carryGroup.remove(child);disposeGroup(child);}
  items.clear(); actors.clear();
  staticGroup = new THREE.Group(); actorGroup=new THREE.Group(); itemGroup=new THREE.Group(); scene.add(staticGroup,actorGroup,itemGroup);
  scene.background = new THREE.Color(nav ? 0x0b1821 : 0x080d15); scene.fog = nav ? null : new THREE.FogExp2(0x0c1420, .17);
  staticGroup.add(new THREE.HemisphereLight(nav?0xbcd6d3:0xd9c7a7,0x1f2831,nav?2.1:.9));
  const sun = new THREE.DirectionalLight(nav?0x9cc5d2:0xf3dcb9,nav?2:1.1);sun.position.set(3,12,4);staticGroup.add(sun);
  const floorCanvas=document.createElement('canvas');floorCanvas.width=floorCanvas.height=256;const f=floorCanvas.getContext('2d');f.fillStyle='#242025';f.fillRect(0,0,256,256);f.strokeStyle='#655346';f.lineWidth=2;f.strokeRect(0,0,256,256);f.lineWidth=1;f.strokeStyle='#37303a';f.strokeRect(8,8,240,240);f.strokeStyle='#75614b';for(let y=0;y<256;y+=32){f.beginPath();f.moveTo(0,y);f.lineTo(256,y);f.stroke();}
  for(let i=0;i<70;i++){f.fillStyle=i%2?'#342c31':'#51423b';f.fillRect((i*73)%256,(i*47)%256,2,2);}
  const texture=new THREE.CanvasTexture(floorCanvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(world.width,world.depth);
  box(staticGroup,world.width,.16,world.depth,world.width/2,-.09,world.depth/2,material(0xffffff,{map:texture,roughness:.95}));
  const wallMaterial = nav ? material(0x69b5c4,{transparent:true,opacity:.18,depthWrite:false,metalness:.1}) : material(0x51404d,{metalness:.08,roughness:.9});
  const trimMaterial=material(0x30272a), emissiveMaterial=new THREE.MeshBasicMaterial({color:nav?0x45888f:0xb89664});
  for(const wall of world.walls){
    const mesh=box(staticGroup,wall.w,2.7,wall.d,wall.x+wall.w/2,1.35,wall.z+wall.d/2,wallMaterial);
    if(nav){const edges=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:0x528c96,transparent:true,opacity:.65}));edges.position.copy(mesh.position);staticGroup.add(edges);}
    else{
      box(staticGroup,wall.w+.02,.16,wall.d+.02,wall.x+wall.w/2,.13,wall.z+wall.d/2,trimMaterial);
      box(staticGroup,wall.w+.025,.04,wall.d+.025,wall.x+wall.w/2,2.35,wall.z+wall.d/2,emissiveMaterial);
      // Chair rails and wood wainscot share existing wall footprints.
      box(staticGroup,wall.w+.025,.055,wall.d+.025,wall.x+wall.w/2,.95,wall.z+wall.d/2,emissiveMaterial);
      box(staticGroup,wall.w+.03,.7,wall.d+.03,wall.x+wall.w/2,.48,wall.z+wall.d/2,trimMaterial);
    }
  }
  if(!nav){
    // Plaque, entrance panel and art frame sit against the existing outer wall.
    const brass=material(0xb89a67,{metalness:.6}),wood=material(0x281e26);
    box(staticGroup,1.4,2.35,.04,3.5,1.18,22.97,wood);
    box(staticGroup,1.55,.06,.055,3.5,2.38,22.94,brass);
    const plaque=textSprite('ROOM 905','#e2c38f',1.1);plaque.position.set(3.5,2.1,22.91);staticGroup.add(plaque);
    const loader=new THREE.TextureLoader();const art=loader.load('/assets/hotel-art-placeholder.svg');art.colorSpace=THREE.SRGBColorSpace;
    box(staticGroup,2.2,1.25,.035,7,1.65,22.97,brass);
    box(staticGroup,2.05,1.1,.02,7,1.65,22.94,new THREE.MeshBasicMaterial({map:art}));
  }
  for(const [index,b] of (world.platforms||[]).entries()){
    box(staticGroup,b.w,b.h,b.d,b.x+b.w/2,b.h/2,b.z+b.d/2,material(0x5d4544,{metalness:.08,roughness:.95}));
    box(staticGroup,b.w+.03,.035,b.d+.03,b.x+b.w/2,b.h+.02,b.z+b.d/2,new THREE.MeshBasicMaterial({color:index===3?amber:cyan}));
    const label=textSprite(index===3?'PREMIUM $450':`JUMP ${index+1}`,'#fac875',nav?2:1.2,!nav);label.position.set(b.x+b.w/2,b.h+.75,b.z+b.d/2);staticGroup.add(label);
  }
  const home=world.home;
  const brass=material(0xc4a56e,{metalness:.7}),leather=material(0x253f35,{roughness:.9}),rubber=material(0x171a1c),padGlow=new THREE.MeshBasicMaterial({color:0x8bd5a3});
  box(staticGroup,2.4,.035,2.4,home.x,.012,home.z,leather);
  for(const side of [-1,1]){box(staticGroup,2.4,.025,.045,home.x,.035,home.z+side*1.18,padGlow);box(staticGroup,.045,.025,2.4,home.x+side*1.18,.035,home.z,padGlow);}
  // Luggage trolley at the back of the marked recovery area.
  const tz=home.z+1.35;
  box(staticGroup,1.5,.12,.75,home.x,.28,tz,brass);
  for(const x of [-.65,.65]){cylinder(staticGroup,.045,.045,1.9,home.x+x,1.27,tz,brass);sphere(staticGroup,.085,home.x+x,.13,tz+.28,rubber);sphere(staticGroup,.085,home.x+x,.13,tz-.28,rubber);}
  box(staticGroup,1.4,.06,.06,home.x,2.18,tz,brass);
  trolleyCargoGroup=new THREE.Group();trolleyCargoGroup.name="recovered-property";staticGroup.add(trolleyCargoGroup);trolleyKey="";
  const homeLabel=textSprite('RECOVERY TROLLEY / SAFE','#b9f8bd',nav?3.8:2.3,!nav);homeLabel.position.set(home.x,nav?.8:2.65,home.z);staticGroup.add(homeLabel);
  const homeLight=new THREE.PointLight(mint,8,6,1.5);homeLight.position.set(home.x,2,home.z);staticGroup.add(homeLight);
  for(const h of world.hazards){
    const puddle=new THREE.Mesh(new THREE.CircleGeometry(h.r,32),material(0xb1482e,{emissive:0xe7552b,emissiveIntensity:.65}));puddle.rotation.x=-Math.PI/2;puddle.position.set(h.x,.015,h.z);staticGroup.add(puddle);ring(staticGroup,h.r,0xff9860,h.x,h.z);
    // Emissive breach surfaces keep their glow without a light per breach.
    if(nav){const label=textSprite('SIGNAL GAP','#ff9060',1.8,false);label.position.set(h.x,1,h.z);staticGroup.add(label);}
  }
  if(nav){
    const grid=new THREE.GridHelper(28,28,0x4f8b90,0x304951);grid.position.set(14,.015,12);staticGroup.add(grid);
    for(const [text,x,z] of [['A / FOYER',4,10],['B / LOUNGE',13,12],['C / PRIVATE SUITE',23,10]]){const label=textSprite(text,'#7da4b1',3,true);label.position.set(x,.2,z);staticGroup.add(label);}
    const north=textSprite('↑ NORTH','#64ddd4',3,false);north.position.set(14,.2,-.7);staticGroup.add(north);
  }else{
    // Hotel sconces and framed art stay flush to real walls; routes stay clear.
    const hotelBrass=material(0xc6a76c,{metalness:.6}),shade=new THREE.MeshBasicMaterial({color:0xe5cf9b});
    const artCanvas=document.createElement('canvas');artCanvas.width=256;artCanvas.height=128;const ac=artCanvas.getContext('2d');ac.fillStyle='#302934';ac.fillRect(0,0,256,128);ac.strokeStyle='#c5aa72';ac.lineWidth=5;for(let i=0;i<4;i++){ac.beginPath();ac.arc(82,75,18+i*15,0,Math.PI*1.8);ac.stroke();}ac.fillStyle='#c9bdab';ac.fillRect(165,20,28,85);ac.strokeStyle='#796978';ac.lineWidth=2;ac.strokeRect(12,12,232,104);
    const artTexture=new THREE.CanvasTexture(artCanvas);artTexture.colorSpace=THREE.SRGBColorSpace;const artMat=new THREE.MeshBasicMaterial({map:artTexture});
    for(const w of world.walls){
      if(Math.max(w.w,w.d)<3)continue;
      const alongX=w.w>w.d,x=w.x+w.w/2,z=w.z+w.d/2;
      if(alongX){box(staticGroup,1.1,.8,.06,x,1.65,w.z+w.d+.04,hotelBrass);box(staticGroup,.97,.67,.025,x,1.65,w.z+w.d+.08,artMat);box(staticGroup,.12,.3,.1,x+1,1.95,w.z+w.d+.08,shade);}
      else{box(staticGroup,.06,.8,1.1,w.x+w.w+.04,1.65,z,hotelBrass);box(staticGroup,.025,.67,.97,w.x+w.w+.08,1.65,z,artMat);box(staticGroup,.1,.3,.12,w.x+w.w+.08,1.95,z+1,shade);}
    }
    const signs=[['FOYER →',5,2.2,16.98],['LOUNGE',12,2,9.98],['PRIVATE SUITE',24,2,16.98]];
    for(const [text,x,y,z]of signs){const sign=textSprite(text,'#dce7cc',1.7);sign.position.set(x,y,z);staticGroup.add(sign);}
  }
  enemyGroup=makeEnemy();scene.add(enemyGroup);enemyGroup.visible=false;
  pingGroup=new THREE.Group();ring(pingGroup,.55,cyan,0,0,.055);const beacon=cylinder(pingGroup,.06,.06,2,0,1,0,new THREE.MeshBasicMaterial({color:cyan,transparent:true,opacity:.55}));pingGroup.add(beacon);scene.add(pingGroup);pingGroup.visible=false;
  tacticalCamera.position.set(14,34,31);tacticalCamera.lookAt(14,0,12);flashlight.visible=!nav;
  if(nav)buildCommandTrailer();
  batchStaticBoxes(staticGroup);
  if(commandGroup)batchStaticBoxes(commandGroup);
  resize();
}

$('commandView').onclick=()=>{commandFocus=!commandFocus;$('commandView').textContent=commandFocus?'WIDE TRAILER VIEW':'FOCUS HOLOGRAM';positionCommandCamera();};
function positionCommandCamera(){
  if(!commandCamera)return;
  const mobileFactor=Math.max(1,1.35/commandCamera.aspect);
  commandCamera.position.set(commandFocus?0:1.1,commandFocus?4.8:3.5, (commandFocus?3.5:5.5)*mobileFactor);
  commandCamera.lookAt(0,1.1,commandFocus?-.1:0);
}
function buildCommandTrailer(){
  commandFocus=false;$('commandView').textContent='FOCUS HOLOGRAM';
  hologram=new THREE.Group();hologram.scale.setScalar(.14);hologram.position.set(-1.96,1.13,-1.68);
  for(const g of [staticGroup,actorGroup,itemGroup,enemyGroup,pingGroup])hologram.add(g);
  scene.add(hologram);commandGroup=new THREE.Group();scene.add(commandGroup);
  const steel=material(0x18232c,{metalness:.65}),dark=material(0x080f16),trim=material(0x334853),glow=new THREE.MeshBasicMaterial({color:cyan});
  box(commandGroup,10,.2,10,0,-.1,0,steel);
  box(commandGroup,10,4,.15,0,2,-4.4,steel);box(commandGroup,.15,4,9,-4.5,2,0,steel);box(commandGroup,.15,4,9,4.5,2,0,steel);
  for(let x=-4;x<=4;x+=1){box(commandGroup,.06,3.8,.12,x,1.9,-4.27,trim);}
  box(commandGroup,4.4,.18,3.9,0,1.02,0,dark);box(commandGroup,4.5,.06,4,0,.92,0,trim);
  for(const x of [-1.8,1.8])for(const z of [-1.4,1.4])box(commandGroup,.2,.9,.2,x,.45,z,steel);
  for(const z of [-1.96,1.96])box(commandGroup,4.5,.04,.045,0,1.13,z,glow);
  for(const x of [-2.23,2.23])box(commandGroup,.045,.04,4,x,1.13,0,glow);
  const header=textSprite('MISSION COMMAND / ROOM 905','#b9f8bd',4.8);header.position.set(0,3.3,-4.15);commandGroup.add(header);
  for(const [text,x]of [['SPECTRAL LINK',-2.8],['CREW BODYCAM',0],['THREAT ANALYSIS',2.8]]){
    box(commandGroup,2.3,1.25,.12,x,2.15,-4.1,dark);
    const screen=textSprite(text,'#64ddd4',2.1);screen.position.set(x,2.15,-3.98);commandGroup.add(screen);
    for(let i=0;i<6;i++)box(commandGroup,1.3-i*.12,.025,.02,x,1.8+i*.09,-3.99,new THREE.MeshBasicMaterial({color:i%2?0x285858:0x5d9a8c}));
  }
  box(commandGroup,8,.15,1,0,.95,-3.5,steel);
  for(const x of [-3,3]){
    box(commandGroup,1.3,1.8,.7,x,.9,-2.8,dark);
    for(let i=0;i<9;i++){box(commandGroup,1.1,.08,.02,x,.3+i*.16,-2.43,trim);sphere(commandGroup,.025,x+.4,.3+i*.16,-2.4,new THREE.MeshBasicMaterial({color:i%3===0?red:mint}));}
  }
  const chair=new THREE.Group();box(chair,.85,.12,.8,0,.52,0,dark);box(chair,.85,.85,.12,0,1,.35,steel);cylinder(chair,.05,.05,.5,0,.25,0,trim);chair.position.set(-3.1,0,1.3);chair.rotation.y=.5;commandGroup.add(chair);
  const lamp=new THREE.PointLight(0x7caeae,22,13,2);lamp.position.set(0,3,1);commandGroup.add(lamp);
  commandGroup.add(new THREE.HemisphereLight(0x8ea9b7,0x192b27,1.5));

  scene.background=new THREE.Color(0x050b12);positionCommandCamera();
}

function makeCargo(item) {
  const group=new THREE.Group(), gold=material(amber,{metalness:.7,roughness:.25}), black=material(0x182831), glow=material(cyan,{emissive:cyan,emissiveIntensity:1.1}), glass=material(0x72c7b8,{metalness:.4,roughness:.15});
  if(item.kind==='core'){
    box(group,.62,.46,.32,0,.3,0,black);
    for(const x of [-.18,.18])box(group,.025,.47,.34,x,.3,0,gold);
    box(group,.3,.055,.05,0,.61,0,gold);for(const x of [-.12,.12])box(group,.04,.1,.05,x,.55,0,gold);
    box(group,.1,.06,.025,0,.36,-.175,gold);
  }else if(item.kind==='vase'){
    cylinder(group,.12,.22,.45,0,.35,0,glass);sphere(group,.27,0,.23,0,glass);cylinder(group,.18,.12,.12,0,.64,0,gold);cylinder(group,.25,.25,.07,0,.03,0,gold);
  }else if(item.kind==='tv'){
    box(group,.8,.6,.43,0,.36,0,black);box(group,.58,.4,.015,-.055,.38,-.225,glow);sphere(group,.035,.32,.35,-.23,gold);box(group,.07,.22,.06,-.27,.04,0,black);box(group,.07,.22,.06,.27,.04,0,black);
    const antenna=cylinder(group,.015,.015,.35,.2,.82,0,gold);antenna.rotation.z=-.4;
  }else{
    cylinder(group,.3,.34,.12,0,.07,0,black);cylinder(group,.08,.13,.26,0,.24,0,gold);
    const relic=new THREE.Mesh(new THREE.OctahedronGeometry(.28),gold);relic.position.y=.5;group.add(relic);sphere(group,.08,0,.5,-.2,glow);
  }
  const ringMesh=ring(group,.5,amber,0,0,.025);group.userData.ring=ringMesh;return group;
}
function updateTrolley(){
  if(!trolleyCargoGroup||!world)return;
  const recovered=state.recovered||[],key=`${state.roundId}:${state.score}:${recovered.length}`;
  if(key===trolleyKey)return;trolleyKey=key;
  while(trolleyCargoGroup.children.length){const c=trolleyCargoGroup.children[0];trolleyCargoGroup.remove(c);disposeGroup(c);}
  const slots=trolleyLayout(state.score,state.quota);
  for(const [index,slot] of slots.entries()){
    const item=recovered[index%Math.max(1,recovered.length)]||{kind:'core'};
    const cargo=makeCargo(item);cargo.userData.ring.visible=false;cargo.scale.setScalar(.57);
    cargo.position.set(world.home.x+slot.x,slot.y,world.home.z+1.35+slot.z);
    cargo.rotation.y=index%2?.12:-.12;trolleyCargoGroup.add(cargo);
  }
  trolleyCargoGroup.userData.fill=Math.min(1,state.score/state.quota);
}
const avatarColors={amber:0xe3b775,mint:0x78c6aa,violet:0xa493d2,rose:0xd18d9b,blue:0x80afd1,silver:0xc2c6cd};
function makeActor(name, nav,avatar='amber') {
  const g=new THREE.Group(), suit=material(avatarColors[avatar]||avatarColors.amber,{metalness:.25}), dark=material(0x21323d), visor=material(cyan,{emissive:cyan,emissiveIntensity:.8});
  cylinder(g,.25,.3,.48,0,.65,0,suit);sphere(g,.32,0,1.07,0,suit);box(g,.42,.14,.1,0,1.1,-.28,visor);
  for(const x of [-.2,.2]){box(g,.14,.35,.16,x,.23,0,dark);sphere(g,.1,x*1.8,.65,0,dark);}
  box(g,.23,.35,.2,0,.65,.3,dark);cylinder(g,.02,.02,.3,.17,1.45,0,dark);sphere(g,.045,.17,1.61,0,visor);
  const label=textSprite(name,'#64ddd4',nav?3:1.25,!nav);label.position.set(0,1.9,0);g.add(label);
  if(nav){ring(g,.48,cyan,0,0,.04);const arrow=new THREE.Mesh(new THREE.ConeGeometry(.16,.45,3),new THREE.MeshBasicMaterial({color:cyan}));arrow.rotation.x=-Math.PI/2;arrow.position.set(0,.03,-.7);g.add(arrow);}
  return g;
}
function makeEnemy() {
  // Abstract signal beacon: no creature, weapon or injury depiction.
  const g=new THREE.Group(),metal=material(0x475362,{metalness:.6}),glow=new THREE.MeshBasicMaterial({color:0xfac875,transparent:true,opacity:.7});
  cylinder(g,.22,.35,.25,0,.15,0,metal);cylinder(g,.055,.055,1.4,0,.9,0,metal);
  const beacon=new THREE.Mesh(new THREE.OctahedronGeometry(.3),glow);beacon.position.y=1.6;g.add(beacon);
  ring(g,.65,cyan,0,0,.035);
  const label=textSprite('SENTINEL / SIGNAL','#fac875',2,false);label.position.y=2.25;g.add(label);g.userData.label=label;return g;
}
function updateEntities(nav) {
  if(!scene || !actorGroup || !state)return;
  updateTrolley();
  const itemIds=new Set(state.items.map(i=>i.id));
  for(const [id,mesh]of items)if(!itemIds.has(id)){itemGroup.remove(mesh);disposeGroup(mesh);items.delete(id);}
  for(const item of state.items){
    let mesh=items.get(item.id);
    if(!mesh){mesh=makeCargo(item);if(nav){const label=textSprite(`$${Math.round(item.value*item.condition/100)}`,'#fac875',2.6,false);label.position.y=1.25;mesh.add(label);mesh.userData.valueLabel=label;mesh.userData.labelValue=Math.round(item.value*item.condition/100);}items.set(item.id,mesh);itemGroup.add(mesh);}
    mesh.visible=item.carrier!==socket.id;mesh.position.set(item.x,(item.y||0)+(item.carrier?.6:0),item.z);
    mesh.userData.ring.visible=!item.carrier;mesh.userData.carrier=item.carrier;
    const value=Math.round(item.value*item.condition/100);
    if(nav&&value!==mesh.userData.labelValue){mesh.remove(mesh.userData.valueLabel);disposeGroup(mesh.userData.valueLabel);const label=textSprite(`$${value}`,'#fac875',2.6,false);label.position.y=1.25;mesh.add(label);mesh.userData.valueLabel=label;mesh.userData.labelValue=value;}
  }
  for(const a of state.actors){if(!actors.has(a.id)){const mesh=makeActor(a.name,nav,a.avatar);actors.set(a.id,mesh);actorGroup.add(mesh);}actors.get(a.id).visible=nav||a.id!==socket.id;}
  const cargo=state.items.find(i=>i.carrier===socket.id);
  if(carryGroup.userData.id!==cargo?.id){
    while(carryGroup.children.length){const child=carryGroup.children[0];carryGroup.remove(child);disposeGroup(child);}
    carryGroup.userData.id=cargo?.id;
    if(cargo){const mesh=makeCargo(cargo);mesh.userData.ring.visible=false;mesh.position.set(.32,-.65,-1.05);mesh.scale.setScalar(.65);carryGroup.add(mesh);}
  }
  enemyGroup.visible=!!state.enemy;enemyGroup.userData.label.visible=nav;
  pingGroup.visible=!!state.ping;
}
function resize() {
  if(!renderer)return;const width=$('viewport').clientWidth,height=$('viewport').clientHeight;if(!width||!height)return;
  renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();commandCamera.aspect=width/height;commandCamera.updateProjectionMatrix();positionCommandCamera();
  const viewHeight=Math.max(30,33/camera.aspect),viewWidth=viewHeight*camera.aspect;
  Object.assign(tacticalCamera,{left:-viewWidth/2,right:viewWidth/2,top:viewHeight/2,bottom:-viewHeight/2});tacticalCamera.updateProjectionMatrix();
}
function onMapClick(e) {
  if(state?.role!=='Navigator'||state.phase!=='playing'||!renderer)return;
  const rect=renderer.domElement.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),commandCamera);
  const point=new THREE.Vector3();const tablePlane=new THREE.Plane(new THREE.Vector3(0,1,0),-1.13);if(raycaster.ray.intersectPlane(tablePlane,point)&&hologram){hologram.updateMatrixWorld(true);hologram.worldToLocal(point);socket.emit('guide',{x:point.x,z:point.z});}
}
const mapping={' ':'jump',w:'forward',ArrowUp:'forward',s:'back',ArrowDown:'back',a:'left',d:'right',Shift:'sprint'};
function input() {
  if(!state||state.role==='Navigator'||!$('introScreen').hidden||state.respawn||state.phase!=='playing'||!socket.connected)return;
  const held=new Set([...keys].map(k=>mapping[k]).concat([...touches.values()]));
  socket.emit('input',{forward:Number(held.has('forward'))-Number(held.has('back')),strafe:Number(held.has('right'))-Number(held.has('left')),yaw,jump:held.has('jump')||performance.now()<jumpUntil,sprint:held.has('sprint')});
  document.querySelectorAll('[data-move]').forEach(b=>b.classList.toggle('active',held.has(b.dataset.move)));
}
function release(){jumpUntil=0;keys.clear();touches.clear();swipe=null;input();document.querySelectorAll('[data-move]').forEach(b=>b.classList.remove('active'));}
window.addEventListener('keydown',e=>{
  const key=e.key.length===1?e.key.toLowerCase():e.key;
  if(['INPUT','TEXTAREA'].includes(e.target.tagName)||($('helpDialog').open||$('devDialog').open||$('regularDialog').open||$('aboutDialog').open||$('deviceDialog').open||$('friendsDialog').open||$('disclosureDialog').open)||state?.phase!=='playing'||state.role==='Navigator'||!$('introScreen').hidden||state.respawn)return;
  if(mapping[key]||['ArrowLeft','ArrowRight','e','q'].includes(key)){
    e.preventDefault();if(key===' '&&!e.repeat)jumpUntil=performance.now()+150;keys.add(key);if(key==='e'&&!e.repeat)socket.emit('interact');if(key==='q'&&!e.repeat)socket.emit('cargo:drop');input();
  }
});
window.addEventListener('keyup',e=>{keys.delete(e.key.length===1?e.key.toLowerCase():e.key);input();});
window.addEventListener('blur',release);document.addEventListener('visibilitychange',()=>{if(document.hidden)release();updateAmbience();});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement===renderer?.domElement&&state?.phase==='playing'){yaw+=e.movementX*.0025;pitch=THREE.MathUtils.clamp(pitch+e.movementY*.002,-.8,.8);}});
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement)release();$('clickToLook').hidden=state?.role==='Navigator'||touchDevice||!!document.pointerLockElement||state?.phase!=='playing';});
$('lockMouse').onclick=()=>{try{const result=renderer?.domElement.requestPointerLock();result?.catch(()=>showError('Mouse capture unavailable. Use ← → to look, or swipe on mobile.'));}catch{showError('Use ← → to turn your view.');}};
$('touchDrop').onclick=()=>{if(!state?.respawn)socket.emit('cargo:drop');};
$('touchGrab').onclick=()=>{if(!state?.respawn)socket.emit('interact');};
document.querySelectorAll('[data-move]').forEach(b=>{
  b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);touches.set(e.pointerId,b.dataset.move);if(b.dataset.move==='jump')jumpUntil=performance.now()+150;input();});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,e=>{touches.delete(e.pointerId);input();});
});
setInterval(input,50);
function interpolate(now,current,old) {
  if(!old||Math.hypot(current.x-old.x,current.z-old.z)>2)return current;
  const t=Math.min(1,(now-received)/50);return{y:THREE.MathUtils.lerp(old.y||0,current.y||0,t),x:THREE.MathUtils.lerp(old.x,current.x,t),z:THREE.MathUtils.lerp(old.z,current.z,t)};
}
function frame(now) {
  requestAnimationFrame(frame);let dt=Math.min((now-lastFrame)/1000,.05);
  if(!renderer||!state||!world||$('game').hidden||document.hidden)return;
  // Limit high-refresh screens to 60 renders/sec; networking stays at 20 Hz.
  if(now-lastRender < 1000/(quality===2?30:60)-1 || (state.phase==='finished' && now-lastRender<250))return;
  lastRender=now; lastFrame=now;
  if(state.phase==='playing'&&qualityAuto&&!checkRunning){
    monitorFrames++;if(now-monitorAt>=2500){const fps=monitorFrames*1000/(now-monitorAt);slowWindows=fps<24?slowWindows+1:0;monitorAt=now;monitorFrames=0;if(slowWindows>=2&&quality<2){applyQuality(quality+1,true);slowWindows=0;$('deviceStatus').textContent=`Adjusted to ${qualityNames[quality]} for smoother play`;}}
  }else{monitorAt=now;monitorFrames=0;slowWindows=0;}
  const nav=state.role==='Navigator';
  const devActive=devEffect?.until>now;
  const threatTarget=devActive&&['red','combined'].includes(devEffect.kind) ? 1 : !nav&&state.phase==='playing' ? (state.threat||0) : 0;
  updateAmbience();
  threatLevel += (threatTarget-threatLevel)*Math.min(1,dt*5);
  $('threatVignette').style.opacity=String(threatLevel*.8);
  const heartbeatLevel=devActive&&['heartbeat','combined'].includes(devEffect.kind)?1:devActive&&devEffect.kind==='red'?0:threatLevel;
  if(heartbeatLevel>.03 && now-lastHeartbeat>1400-heartbeatLevel*1050){
    tone(185,.2,'triangle',.09+heartbeatLevel*.15,120);
    setTimeout(()=>tone(155,.16,'triangle',.06+heartbeatLevel*.12,105),160);
    lastHeartbeat=now;
  }
  if(!nav&&state.phase==='playing'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)&&!($('helpDialog').open||$('devDialog').open||$('regularDialog').open||$('aboutDialog').open||$('deviceDialog').open||$('friendsDialog').open||$('disclosureDialog').open)){yaw+=(Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft')))*dt*1.8;}
  yaw=((yaw%(Math.PI*2))+Math.PI*2)%(Math.PI*2);
  const me=state.actors.find(a=>a.id===socket.id);
  for(const a of state.actors){const mesh=actors.get(a.id);if(!mesh)continue;const old=previous?.actors.find(p=>p.id===a.id),pos=interpolate(now,a,old);mesh.position.set(pos.x,pos.y||0,pos.z);mesh.rotation.y=-a.yaw;mesh.scale.y=1+(a.speed>.1?Math.sin(now*.014)*.025:0);}
  for(const [id,mesh]of items){if(!mesh.userData.carrier)mesh.rotation.y=now*.0004+id;else{const a=state.actors.find(a=>a.id===mesh.userData.carrier);if(a){mesh.position.set(a.x+Math.sin(a.yaw)*.45,(a.y||0)+.5,a.z-Math.cos(a.yaw)*.45);mesh.rotation.y=-a.yaw;}}}
  if(state.enemy&&enemyGroup){const pos=interpolate(now,state.enemy,previous?.enemy);enemyGroup.position.set(pos.x,.035*Math.sin(now*.004),pos.z);enemyGroup.rotation.y=-state.enemy.yaw;}
  if(state.ping){pingGroup.position.set(state.ping.x,.015,state.ping.z);pingGroup.scale.setScalar(1+.1*Math.sin(now*.006));}
  if(!nav&&me){
    const pos=interpolate(now,me,previous?.actors.find(a=>a.id===socket.id));
    camera.position.set(pos.x,(pos.y||0)+1.38+(me.speed>.1?Math.sin(now*.011)*.025:0),pos.z);camera.rotation.set(-pitch,-yaw,0,'YXZ');
    flashlight.position.copy(camera.position);const direction=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);lightTarget.position.copy(camera.position).addScaledVector(direction,8);
    carryGroup.rotation.z=me.speed>.1?Math.sin(now*.008)*.025:0;
    const directions=['N','NE','E','SE','S','SW','W','NW'];$('compass').textContent=`${directions[Math.round(yaw/(Math.PI/4))%8]} · ${Math.round(yaw*180/Math.PI)}°`;
    $('waypoint').hidden=!state.ping;
    if(state.ping){const dx=state.ping.x-me.x,dz=state.ping.z-me.z;let angle=Math.atan2(dx,-dz)-yaw;angle=Math.atan2(Math.sin(angle),Math.cos(angle));const arrow=Math.abs(angle)<.35?'↑':Math.abs(angle)>2.5?'↓':angle>0?'→':'←';$('waypoint').textContent=`${arrow} NAV WAYPOINT · ${Math.hypot(dx,dz).toFixed(1)}m`;}
    const distance=threatLevel>.05 ? 9-threatLevel*8 : Infinity; // Warning only; no direction or exact location.
    $('dangerOverlay').hidden=distance>7.5;
    if(now-lastSound>(distance<7?650:me.speed>.1?480:1500)){
      if(me.speed>.1)tone(95,.045,'triangle',.025,45);
      lastSound=now;
    }
  }else{$('compass').textContent='↑ N / SPECTRAL';$('waypoint').hidden=true;$('dangerOverlay').hidden=true;}
  const wave=$('devDialog').open?audioWave:null;if(wave)analyser.getByteTimeDomainData(wave);const rms=wave?Math.sqrt(wave.reduce((sum,v)=>sum+((v-128)/128)**2,0)/wave.length):0;
  if($('devDialog').open&&devSignedIn)$('devDiagnostics').textContent=`Room ${lobby?.code||'—'} · ${state.role} · Server threat ${state.threat||0} · Audio ${audio?.state||'not started'} · Output ${rms.toFixed(3)} · Draw calls ${renderer.info.render.calls}`;
  renderer.render(scene,nav?commandCamera:camera);
}
requestAnimationFrame(frame);

// Account cookies are HttpOnly; the browser never stores a session token in JavaScript.
let accountUser=null,accountEnabled=false,chosenAvatar='amber',accountBusy=false;
const avatarIds=['amber','mint','violet','rose','blue','silver'];
function drawAvatars(){
 $('avatarPicker').replaceChildren(...avatarIds.map(id=>{const button=document.createElement('button');button.type='button';button.className='avatarOption';button.setAttribute('aria-label',`${id} avatar`);button.setAttribute('aria-pressed',String(chosenAvatar===id));const img=document.createElement('img');img.src=`/assets/avatars/${id}.svg`;img.alt='';button.append(img);button.onclick=()=>{chosenAvatar=id;drawAvatars();};return button;}));
}
function showAccount(user){
 accountUser=user;refreshHeaderIdentity(user);if(user&&socket.connected)socket.emit('friends:subscribe',{});$('accountForm').hidden=!!user;$('accountProfile').hidden=!user;
 $('regularSignIn').textContent=user?'PROFILE':'SIGN IN';
 $('profileName').textContent=user?`Signed in as ${user.username}`:'';
 $('name').readOnly=!!user;if(user){$('name').value=user.username;chosenAvatar=user.avatar;}
 drawAvatars();
}
async function loadAccount(){
 try{const response=await fetch('/api/account',{credentials:'same-origin'}),data=await response.json();if(!response.ok)throw Error(data.error);accountEnabled=data.enabled;showAccount(data.user);$('accountStatus').textContent=data.enabled?(data.user?'Avatar changes apply the next time you join a crew.':'Sign in or choose a badge and create an account.'):'Accounts are awaiting database setup. Guest play is ready.';$('accountLogin').disabled=$('accountRegister').disabled=!data.enabled;}
 catch(e){$('accountStatus').textContent=e.message;}
}
async function accountAction(action,body={}){
 if(accountBusy)return;if(lobby){$('accountStatus').textContent='Leave your crew before changing your account or avatar.';return;}accountBusy=true;$('accountStatus').textContent='Saving…';
 try{const response=await fetch('/api/account/'+action,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await response.json();if(!response.ok)throw Error(data.error);showAccount(data.user);$('accountPass').value='';$('deletePass').value='';$('accountStatus').textContent=data.user?'Profile saved. You are ready for your next shift.':'Signed out. Guest play is ready.';socket.disconnect();socket.connect();}
 catch(e){$('accountStatus').textContent=e.message;}finally{accountBusy=false;}
}
$('closeAccount').onclick=()=>$('regularDialog').close();
$('accountForm').onsubmit=e=>{e.preventDefault();accountAction('login',{username:$('accountUser').value,password:$('accountPass').value});};
$('accountRegister').onclick=()=>{if($('accountForm').reportValidity())accountAction('register',{username:$('accountUser').value,password:$('accountPass').value,avatar:chosenAvatar});};
$('saveAvatar').onclick=()=>accountAction('avatar',{avatar:chosenAvatar});
$('accountLogout').onclick=()=>accountAction('logout');
$('deleteAccount').onclick=()=>accountAction('delete',{password:$('deletePass').value});
loadAccount();

function refreshHeaderIdentity(user=accountUser){
 $('headerUsername').textContent=user?.username||$('name').value.trim()||'Guest';
 $('guestFace').hidden=!!user;$('headerAvatar').hidden=!user;
 if(user)$('headerAvatar').src=`/assets/avatars/${avatarIds.includes(user.avatar)?user.avatar:'amber'}.svg`;
}
$('name').addEventListener('input',()=>refreshHeaderIdentity());
function applyTheme(value){
 const light=value==='light';document.documentElement.dataset.theme=light?'light':'dark';
 $('themeToggle').textContent=light?'DARK MODE':'LIGHT MODE';$('themeToggle').setAttribute('aria-label',`Switch to ${light?'dark':'light'} mode`);
 document.querySelector('meta[name="theme-color"]').content=light?'#f5f1e9':'#0d0b10';
 try{localStorage.setItem('room905-theme',light?'light':'dark');}catch{}
}
$('themeToggle').onclick=()=>applyTheme(document.documentElement.dataset.theme==='light'?'dark':'light');
applyTheme(document.documentElement.dataset.theme); 

const optionsMenu=$('optionsMenu');
document.addEventListener('click',e=>{if(!optionsMenu.contains(e.target))optionsMenu.open=false;});
optionsMenu.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();optionsMenu.open=false;optionsMenu.querySelector('summary').focus();}});
for(const id of ['replayBriefing','aboutButton','regularSignIn','deviceReopen','friendsButton','disclosureInfo'])$(id).addEventListener('click',()=>{optionsMenu.open=false;});
optionsMenu.addEventListener('toggle',()=>{if(optionsMenu.open){release();document.exitPointerLock?.();}});

$('guardianPulse').onclick=()=>send('guardian:stun',{});
window.addEventListener('keydown',e=>{
 if(e.key.toLowerCase()!=='f'||e.repeat||state?.role!=='Guardian'||state.phase!=='playing'||!$('introScreen').hidden||document.querySelector('dialog[open]')||['INPUT','TEXTAREA'].includes(e.target.tagName))return;
 e.preventDefault();send('guardian:stun',{});
});

const disclosureDialog=$('disclosureDialog');
let restoreBriefing=false;
function dismissDisclosure(){
 try{sessionStorage.setItem('room905-disclosure-v1','seen');}catch{}
 document.documentElement.dataset.stage=restoreBriefing?'briefing':'app';$('introScreen').hidden=!restoreBriefing;disclosureDialog.close();
 if(restoreBriefing){$('bookNext').focus();}else{document.querySelector('header').inert=false;document.querySelector('footer').inert=false;$('front').inert=false;$('game').inert=false;document.querySelector('#optionsMenu summary').focus();}
}
$('continueDisclosure').onclick=dismissDisclosure;
disclosureDialog.addEventListener('cancel',e=>{e.preventDefault();dismissDisclosure();});
let disclosureSeen=false; // Show on every page load; also available from Options.
if(!disclosureSeen){restoreBriefing=true;document.documentElement.dataset.stage='disclosure';$('introScreen').hidden=true;document.querySelector('header').inert=true;document.querySelector('footer').inert=true;$('front').inert=true;$('game').inert=true;disclosureDialog.showModal();$('continueDisclosure').focus();}

const pendingInvites=new Map();
function openFriends(){release();document.exitPointerLock?.();$('friendsDialog').showModal();loadFriends();}
$('friendsButton').onclick=$('viewInvites').onclick=openFriends;
$('closeFriends').onclick=()=>$('friendsDialog').close();
$('dismissInvite').onclick=()=>{$('friendInviteBanner').hidden=true;};
$('disclosureInfo').onclick=()=>{release();document.exitPointerLock?.();restoreBriefing=false;disclosureDialog.showModal();$('continueDisclosure').focus();};
socket.on('connect',()=>{if(accountUser)socket.emit('friends:subscribe',{});});
socket.on('friends:changed',()=>{if($('friendsDialog').open)loadFriends();});
socket.on('friend:invitation',invite=>{
 if(!invite||typeof invite.id!=='string')return;
 if(pendingInvites.size>=5)pendingInvites.delete(pendingInvites.keys().next().value);
 pendingInvites.set(invite.id,invite);$('inviteNotice').textContent=`${invite.from} invited you to lobby ${invite.code}.`;$('friendInviteBanner').hidden=false;
 if($('friendsDialog').open)loadFriends();
});
function friendRow(user,actions){const row=document.createElement('div');row.className='friendRow';const image=document.createElement('img');image.src=`/assets/avatars/${avatarIds.includes(user.avatar)?user.avatar:'amber'}.svg`;image.alt='';const name=document.createElement('strong');name.textContent=user.username;row.append(image,name);for(const [label,fn]of actions){const b=document.createElement('button');b.className='secondary';b.textContent=label;b.onclick=fn;row.append(b);}return row;}
async function friendAction(action,username){try{const r=await fetch('/api/friends/'+action,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({username})}),d=await r.json();if(!r.ok)throw Error(d.error);$('friendsStatus').textContent=action==='request'?'Friend request sent.':'Friends updated.';await loadFriends(true);}catch(e){$('friendsStatus').textContent=e.message;}}
function inviteFriend(username){socket.timeout(5000).emit('friend:invite',{username},(err,r)=>{$('friendsStatus').textContent=err?'Invite timed out.':r.error||'Lobby invitation sent.';});}
function joinInvitation(id){if(lobby){$('friendsStatus').textContent='Leave your current crew before joining this invitation.';return;}socket.timeout(5000).emit('friend:join',{id},(err,r)=>{if(err||r.error){$('friendsStatus').textContent=err?'Join timed out.':r.error;return;}pendingInvites.delete(id);$('friendInviteBanner').hidden=true;$('friendsDialog').close();});}
async function loadFriends(keepStatus=false){
 $('friendForm').hidden=!accountUser;
 if(!accountUser){$('friendsStatus').textContent='Sign in from Options to add friends and receive invitations.';for(const id of ['friendList','friendIncoming','friendOutgoing','friendInvites'])$(id).replaceChildren();return;}
 try{const r=await fetch('/api/friends',{credentials:'same-origin'}),d=await r.json();if(!r.ok)throw Error(d.error);if(!keepStatus)$('friendsStatus').textContent=`${d.friends.length} friends`;
 const lists=[['friendList',d.friends,u=>[['Invite',()=>inviteFriend(u.username)],['Remove',()=>friendAction('remove',u.username)]]],['friendIncoming',d.incoming,u=>[['Accept',()=>friendAction('accept',u.username)],['Decline',()=>friendAction('decline',u.username)]]],['friendOutgoing',d.outgoing,u=>[['Cancel',()=>friendAction('remove',u.username)]]]];
 for(const [id,users,actions]of lists){$(id).replaceChildren(...users.map(u=>friendRow(u,actions(u))));if(!users.length)$(id).textContent='None yet.';}
 for(const [id,v]of pendingInvites)if(v.expires<Date.now())pendingInvites.delete(id);
 $('friendInvites').replaceChildren(...[...pendingInvites.values()].map(v=>friendRow({username:`${v.from} · ${v.code}`,avatar:'amber'},[['Join',()=>joinInvitation(v.id)],['Decline',()=>{pendingInvites.delete(v.id);loadFriends(true);}]])));if(!pendingInvites.size)$('friendInvites').textContent='No active invitations.';
 }catch(e){$('friendsStatus').textContent=e.message;}
}
$('friendForm').onsubmit=e=>{e.preventDefault();friendAction('request',$('friendUsername').value);};
setInterval(()=>{if($('friendsDialog').open&&!document.hidden)loadFriends(true);},8000);
