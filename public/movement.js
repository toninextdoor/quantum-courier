// Shared displacement rules used by authoritative rounds and local training.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.Room905Movement=factory();})(globalThis,()=>({
 step({forward=0,strafe=0,yaw=0,sprint=false,carrying=false},dt){const n=Math.max(1,Math.hypot(forward,strafe));forward/=n;strafe/=n;const speed=carrying?(sprint?2.8:2.05):(sprint?4.6:3.15);return {dx:(Math.sin(yaw)*forward+Math.cos(yaw)*strafe)*speed*dt,dz:(-Math.cos(yaw)*forward+Math.sin(yaw)*strafe)*speed*dt,speed};}
}));
