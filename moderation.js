'use strict';
function moderateChat(value,player,now){
 if(typeof value!=='string')return {error:'Enter a message.'};
 const text=value.normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,'').trim();
 if(!text||text.length>160)return {error:'Use 1–160 characters.'};
 if(/(?:https?:\/\/|www\.|discord\.gg\/|[\w.+-]+@[\w.-]+\.[a-z]{2,})/i.test(text))return {error:'Links and email addresses are not allowed in crew chat.'};
 player.chatTimes=(player.chatTimes||[]).filter(t=>now-t<10000);
 if(player.chatTimes.length>=5){player.chatMutedUntil=now+30000;return {error:'Chat paused for 30 seconds: message burst limit.'};}
 const key=text.toLowerCase().replace(/\s+/g,' ');
 player.chatRecent=(player.chatRecent||[]).filter(m=>now-m.at<20000);
 if(player.chatRecent.some(m=>m.key===key))return {error:'Avoid repeating the same message.'};
 player.chatTimes.push(now);player.chatRecent.push({key,at:now});
 return {text:text.replace(/\b(fuck(?:ing|er|ed|s)?|shit(?:ty|s)?|bitch(?:es)?|asshole(?:s)?)\b/gi,m=>'•'.repeat(m.length))};
}
module.exports={moderateChat};
