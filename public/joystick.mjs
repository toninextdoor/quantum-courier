// One captured pointer owns movement; look and action fingers remain independent.
export function bindJoystick(base,knob,{enabled,change,radius=54}){
 let pointer=null,center={x:0,y:0};
 const publish=(x,z)=>{knob.style.transform=`translate(${x*radius}px,${-z*radius}px)`;base.classList.toggle('active',!!(x||z));change(x,z);};
 function release(){const old=pointer;pointer=null;publish(0,0);if(old!==null&&base.hasPointerCapture?.(old))base.releasePointerCapture(old);}
 function move(e){if(pointer!==e.pointerId)return;if(!enabled()){release();return;}e.preventDefault();let x=(e.clientX-center.x)/radius,z=(center.y-e.clientY)/radius,n=Math.hypot(x,z);if(n<.12){x=z=0;}else{const gain=(Math.min(1,n)-.12)/.88;x=x/n*gain;z=z/n*gain;}publish(x,z);}
 base.addEventListener('pointerdown',e=>{e.preventDefault();if(pointer!==null||!enabled())return;const rect=base.getBoundingClientRect();center={x:rect.left+rect.width/2,y:rect.top+rect.height/2};pointer=e.pointerId;base.setPointerCapture(pointer);move(e);},{passive:false});
 base.addEventListener('pointermove',move,{passive:false});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])base.addEventListener(type,e=>{if(e.pointerId===pointer)release();});
 for(const type of ['pointerup','pointercancel'])window.addEventListener(type,e=>{if(e.pointerId===pointer)release();},{capture:true});
 window.addEventListener('blur',release);document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
 return {release};
}
