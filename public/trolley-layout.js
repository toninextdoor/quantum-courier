// Each display bundle represents up to one eighth of the extraction quota.
// Recovered item models supply the appearance; this is a value meter, not an inventory.
export function trolleyLayout(score,quota=600){
  if(!Number.isFinite(score)||!Number.isFinite(quota)||quota<=0)return [];
  const count=Math.min(16,Math.ceil(Math.max(0,score)/(quota/8)));
  return Array.from({length:count},(_,i)=>i<8
    ?{x:i%2?.32:-.32,y:.35+Math.floor(i/2)*.42,z:0,overflow:false}
    :{x:1.35+(i-8)%2*.45,y:.05+Math.floor((i-8)/4)*.42,z:Math.floor(((i-8)%4)/2)*.45-.25,overflow:true});
}
