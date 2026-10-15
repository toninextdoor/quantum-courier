'use strict';
function filterText(value,max=160,{strict=false}={}){
 if(typeof value!=='string')return {error:'Enter text.'};
 const text=value.normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,'').trim();
 if(!text||text.length>max)return {error:`Use 1–${max} characters.`};
 if(/(?:https?:\/\/|www\.|discord\.gg\/|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:[a-z0-9-]+\.)+(?:com|net|org|gg|io)\b|(?:\+?\d[ ().-]*){10,})/i.test(text))return {error:'Links, email addresses and phone numbers are not allowed.'};
 const plain=text.toLowerCase().replace(/[013457@$!]/g,c=>({'0':'o','1':'i','3':'e','4':'a','5':'s','7':'t','@':'a','$':'s','!':'i'}[c]));
 const compact=plain.replace(/[^a-z]/g,'');
 if(/\b(?:kill yourself|kill you|send nudes|white power|heil hitler)\b/i.test(plain)||/\b(?:nigg(?:er|a)s?|fagg?ots?)\b/i.test(plain))return {error:'That content is not allowed.'};
 const profanity=/\b(fuck(?:ing|er|ed|s)?|shit(?:ty|s)?|bitch(?:es)?|asshole(?:s)?)\b/gi;
 const evasive=/^(?:f+u+c+k+|s+h+i+t+|b+i+t+c+h+)$/.test(compact);
 const masked=plain.replace(profanity,m=>'•'.repeat(m.length));
 if(strict&&(masked!==plain||evasive))return {error:'Please use appropriate language.'};
 if(evasive)return {text:'•'.repeat(Math.min(text.length,24))};
 const characters=text.split('');for(const match of plain.matchAll(profanity)){for(let i=match.index;i<match.index+match[0].length;i++)characters[i]='•';}
 return {text:characters.join('')};
}
function moderateChat(value,player,now){
 const filtered=filterText(value);if(filtered.error)return filtered;const text=filtered.text;
 player.chatTimes=(player.chatTimes||[]).filter(t=>now-t<10000);
 if(player.chatTimes.length>=5){player.chatMutedUntil=now+30000;return {error:'Chat paused for 30 seconds: message burst limit.'};}
 const key=text.toLowerCase().replace(/\s+/g,' ');
 player.chatRecent=(player.chatRecent||[]).filter(m=>now-m.at<20000);
 if(player.chatRecent.some(m=>m.key===key))return {error:'Avoid repeating the same message.'};
 player.chatTimes.push(now);player.chatRecent.push({key,at:now});
 return {text:text.replace(/\b(fuck(?:ing|er|ed|s)?|shit(?:ty|s)?|bitch(?:es)?|asshole(?:s)?)\b/gi,m=>'•'.repeat(m.length))};
}
module.exports={moderateChat,filterText};
