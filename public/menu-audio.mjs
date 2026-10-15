// Original synthesized UI sounds. No sampled brand audio or external assets.
export function playUISound(kind,context,destination){
 if(!context||context.state!=='running')return ()=>{};
 const voices=[],start=context.currentTime;
 const notes=kind==='entrance'?[[220,0,1.8,.014],[329.63,.11,1.65,.012],[440,.24,1.55,.012],[659.25,.39,1.45,.009],[880,.58,1.5,.006]]:[[620,0,.085,.029],[930,.015,.065,.0096]];
 for(const [frequency,delay,duration,volume]of notes){const o=context.createOscillator(),g=context.createGain(),t=start+delay;o.type='sine';o.frequency.setValueAtTime(frequency,t);if(kind==='entrance')o.frequency.exponentialRampToValueAtTime(frequency*1.004,t+duration);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(volume,t+(kind==='entrance'?.12:.005));g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(destination);o.start(t);o.stop(t+duration+.02);o.onended=()=>{o.disconnect();g.disconnect();};voices.push(o);}
 return ()=>{for(const o of voices){try{o.stop(context.currentTime);}catch{}}};
}

// Sparse, slowly fading sine chords: a quiet lobby bed without sampled brand audio.
export function startLobbyAmbience(context,destination,{schedule=setInterval,cancel=clearInterval}={}){
 if(!context||context.state!=='running')return ()=>{};
 const voices=new Set(),chords=[[196,293.66,440],[174.61,261.63,392],[164.81,246.94,369.99],[174.61,261.63,440]];let index=0,stopped=false;
 function chord(){if(stopped||context.state!=='running')return;const start=context.currentTime;for(const [i,frequency]of chords[index++%chords.length].entries()){const o=context.createOscillator(),g=context.createGain(),t=start+i*.22;o.type='sine';o.frequency.setValueAtTime(frequency,t);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(i===2?.002:.0035,t+1.6);g.gain.exponentialRampToValueAtTime(.0001,t+7);o.connect(g);g.connect(destination);o.start(t);o.stop(t+7.05);const voice={o,g};voices.add(voice);o.onended=()=>{o.disconnect();g.disconnect();voices.delete(voice);};}}
 chord();const timer=schedule(chord,6200);
 return ()=>{if(stopped)return;stopped=true;cancel(timer);for(const {o,g}of voices){try{g.gain.cancelScheduledValues(context.currentTime);g.gain.setValueAtTime(.0001,context.currentTime);o.stop(context.currentTime+.02);}catch{}}voices.clear();};
}
