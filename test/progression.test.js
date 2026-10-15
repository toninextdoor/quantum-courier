'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {progression,rewardXP}=require('../progression');
test('XP boundaries and fair team rewards',()=>{assert.equal(progression({xp:249}).level,1);assert.equal(progression({xp:250}).level,2);assert.equal(progression({xp:4750}).level,20);assert.equal(progression({xp:-20}).xp,0);assert.equal(rewardXP({elapsed:29,score:600,outcome:'won'}),0);assert.equal(rewardXP({elapsed:30,score:600,outcome:'won'}),210);assert.equal(rewardXP({elapsed:60,score:600,outcome:'lost'}),110);});

test('OG crowns are exclusive and founder styling belongs only to the creator',()=>{
 const {heritage}=require('../progression');assert.equal(heritage('toninextdoor').kind,'founder');assert.equal(heritage('angelnextdoor').kind,'og');assert.equal(heritage('steve1234').kind,'og');assert.equal(heritage('regularplayer'),null);assert.equal(progression({username:'guest',xp:4750}).heritage,null,'max level never grants the crown');
});
