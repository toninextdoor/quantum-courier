// Original synthesized UI sounds. No sampled brand audio or external assets.
export function playUISound(kind,context,destination){
 if(!context||context.state!=='running')return ()=>{};
 const voices=[],start=context.currentTime;
 const notes=kind==='entrance'?[[220,0,1.8,.014],[329.63,.11,1.65,.012],[440,.24,1.55,.012],[659.25,.39,1.45,.009],[880,.58,1.5,.006]]:[[620,0,.085,.018],[930,.015,.065,.006]];
 for(const [frequency,delay,duration,volume]of notes){const o=context.createOscillator(),g=context.createGain(),t=start+delay;o.type='sine';o.frequency.setValueAtTime(frequency,t);if(kind==='entrance')o.frequency.exponentialRampToValueAtTime(frequency*1.004,t+duration);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(volume,t+(kind==='entrance'?.12:.005));g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(destination);o.start(t);o.stop(t+duration+.02);o.onended=()=>{o.disconnect();g.disconnect();};voices.push(o);}
 return ()=>{for(const o of voices){try{o.stop(context.currentTime);}catch{}}};
}
