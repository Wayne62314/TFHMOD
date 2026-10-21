const test=require('node:test'),assert=require('node:assert/strict');
const {bossExtrasAllowed:allowed,bossExtrasAction:action}=require('../boss-extras.js');
test('Bosses allow local CPU/local versus and free training with matching P1 resource',()=>{
 for(let kind=0;kind<32;kind++)for(const training of [0,1])assert.equal(allowed(kind,training,'velvet','Velvet',1),kind===0||(kind===10&&training===1));
 for(const [selected,actual,team]of [['paca','Velvet',1],['uni','Uni',1],['velvet','Velvet',2]])assert.equal(allowed(10,1,selected,actual,team),false);
 assert.equal(allowed(10,1,'paca','Paca',1),true);
});
test('Paprika only toggles flag from idle and Velvet never uses a guessed flag',()=>{
 assert.equal(action('paca','Stand','F6'),'toggle27');assert.equal(action('paca','Stand_Flourish','F6'),'toggle27');
 for(const state of ['Hit','Teleport_Slide','Boss_Wind_Idle'])assert.equal(action('paca',state,'F6'),null);
 assert.equal(action('velvet','Stand','F6'),'Boss_Install');assert.equal(action('velvet','Hit','F6'),null);
});
test('Velvet ice keys require tornado idle and never interrupt attacks',()=>{
 for(const[key,state]of [['F7','Boss_IceL'],['F8','Boss_IceM'],['F9','Boss_IceH']]){
  assert.equal(action('velvet','Boss_Wind_Idle',key),state);assert.equal(action('velvet','Stand',key),null);assert.equal(action('velvet','Boss_IceL',key),null);
 }
});
