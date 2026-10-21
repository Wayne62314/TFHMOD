const test=require('node:test'),assert=require('node:assert/strict');
const {tianSummonAllowed:allowed,createTianSummonGate:gate}=require('../tian-summons.js');
test('Tianhuo summon mode whitelist rejects all unobserved/network modes and P2',()=>{
 for(let mode=0;mode<32;mode++)for(const training of [0,1])assert.equal(allowed(mode,training,'Tianhuo',1),mode===0||(mode===10&&training===1));
 assert.equal(allowed(0,0,'Tianhuo',2),false);assert.equal(allowed(0,0,'Baihe',1),false);assert.equal(allowed(10,0,'Tianhuo',1),false);
});
test('Fred requires a fresh focused press and never repeats on hold',()=>{
 const g=gate(),base={focused:true,enabled:true,idle:true,active:false};
 assert.equal(g.tick({...base,pressed:true}),false);g.tick({...base,pressed:false});assert.equal(g.tick({...base,pressed:true}),true);
 for(let i=0;i<600;i++)assert.equal(g.tick({...base,pressed:true}),false);
});
test('Repeated summon requires cooldown, key release and no live Fred',()=>{
 const g=gate(),b={focused:true,enabled:true,idle:true,active:false};g.tick({...b,pressed:false});assert.equal(g.tick({...b,pressed:true}),true);
 g.ended();g.tick({...b,pressed:false});assert.equal(g.tick({...b,pressed:true}),false);
 for(let i=0;i<60;i++)g.tick({...b,pressed:false});assert.equal(g.tick({...b,pressed:true,active:true}),false);
 g.tick({...b,pressed:false});assert.equal(g.tick({...b,pressed:true}),true);
});
test('Focus, option and idle guards do not queue delayed summoning',()=>{
 for(const changed of [{focused:false},{enabled:false},{idle:false}]){
  const g=gate(),b={focused:true,enabled:true,idle:true,active:false};g.tick({...b,pressed:false});assert.equal(g.tick({...b,pressed:true,...changed}),false);
  assert.equal(g.tick({...b,pressed:true}),false);g.tick({...b,pressed:false});assert.equal(g.tick({...b,pressed:true}),true);
 }
});
