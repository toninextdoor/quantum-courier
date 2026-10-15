const {test}=require('node:test'),assert=require('node:assert/strict');const {moderateChat}=require('../moderation');
test('crew moderation masks common profanity without breaking innocent words, blocks links and repetition',()=>{
 const p={};assert.equal(moderateChat('Head left past the passage',p,1000).text,'Head left past the passage');assert.equal(moderateChat('shit, wrong turn',p,2000).text,'••••, wrong turn');assert.ok(moderateChat('https://example.com',p,3000).error);assert.ok(moderateChat('email me at user@example.com',p,3000).error);assert.ok(moderateChat('Head left past the passage',p,3000).error);assert.ok(moderateChat('x'.repeat(161),p,3000).error);
});
test('burst limit applies a temporary mute',()=>{const p={};for(let i=0;i<5;i++)assert.ok(moderateChat('Message '+i,p,i*800).text);assert.ok(moderateChat('Message 6',p,5000).error);assert.equal(p.chatMutedUntil,35000);});
