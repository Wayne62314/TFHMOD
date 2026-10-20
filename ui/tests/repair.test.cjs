const test=require('node:test'),assert=require('node:assert/strict');
const {createPhase3Controller}=require('../phase3-controller.js');
function harness(){
 const s={identity:'scene:p1',state:'Stand',hp:100,opponentHp:100,x:1000,y:64,originalBoss:false};
 let queued=[],fred=null,accept=true,flags=0x400,slot10=0,failCleanup=false;
 const calls=[],events=[];
 const api={emit:e=>events.push(e),hasStates:()=>true,
  accept:(s,v)=>{const old=accept;accept=v;return old;},boss:(s,v)=>flags=v?flags|0x8000000:flags&~0x8000000,
  snap:()=>{},velocity:()=>{},state:(s,n)=>{calls.push(n);queued.push(n);},
  captureEffects:()=>({flags,slot10}),restoreEffects:(s,saved,opts)=>{
   const mask=0x14000000|(opts.fred?0x2000:0);flags=((flags&~mask)|(saved.flags&mask))>>>0;if(opts.fred)slot10=saved.slot10;
  },
  prepareFred:()=>{calls.push('prepare');slot10=0;flags&=~0x2000;},fred:()=>fred,
  cleanupFred:()=>{calls.push('cleanup');if(failCleanup)throw Error('mock cleanup failure');fred=null;},fredState:()=>true};
 const c=createPhase3Controller(api);c.configure({phase3:true,boss:false});c.arm(s);
 function tick(keys={},focus=true){if(queued.length){s.state=queued.at(-1);queued=[];}c.tick(s,keys,focus);}
 function step(n,keys={}){for(let i=0;i<n;i++)tick(keys);}
 return {s,c,calls,events,tick,step,setFred:v=>fred=v,
  get accept(){return accept;},get flags(){return flags;},get slot10(){return slot10;},
  dirty(){flags|=0x14002000;slot10=-1;},failCleanup(){failCleanup=true;}};
}
test('early held I survives cooldown/startup and summons once after a real idle engine tick',()=>{
 for(const age of [5,80,90,95]){
  const h=harness();h.tick({O:true});h.step(age-1);h.tick({I:true});h.step(130-age,{I:true});
  assert.equal(h.calls.filter(n=>n==='prepare').length,1);
  const i=h.calls.indexOf('FinalFred_Summon');assert.ok(i>h.calls.indexOf('Flight_N_BG'));
  assert.equal(h.calls.slice(i+1).includes('Flight_N_BG'),false);
 }
});
test('Y and focus loss cancel queued summon, and a busy request expires without repeated spawning',()=>{
 for(const cancel of ['Y','focus']){
  const h=harness();h.tick({O:true});h.tick({I:true});
  if(cancel==='Y')h.tick({Y:true});else h.tick({},false);
  h.step(400);assert.equal(h.calls.includes('prepare'),false);
 }
 const h=harness();h.tick({O:true});h.step(95);h.s.state='OtherBusyState';h.tick({I:true});h.step(301);
 assert.equal(h.calls.includes('prepare'),false);assert.equal(h.c.status().queuedSummon,false);
});
test('BoomEnd completes in bounded time, restores only scoped bits, and enables spark again',()=>{
 const h=harness();h.tick({O:true});h.step(95);h.setFred({state:'Idle'});h.tick({L:true});h.tick();h.dirty();
 h.s.state='DarkVortex_BoomEnd';h.step(32);h.tick();
 assert.equal(h.s.state,'Flight_N_BG');assert.equal(h.flags&0x14000000,0);
 assert.equal(h.flags&0x8000000,0x8000000);assert.equal(h.flags&0x2000,0x2000);
 assert.equal(h.slot10,-1); // Vortex recovery must not reset a live Fred timer/latch.
 h.tick({P:true});assert.equal(h.calls.at(-1),'HomingSparkCast');
 assert.ok(h.events.some(e=>e.event==='phase3_vortex_finished'));
});
test('summon/vortex/Y/new flight can summon again with clean effects and timer',()=>{
 const h=harness();h.tick({O:true});h.step(95);h.tick({I:true});h.setFred({state:'Idle'});h.step(30);
 h.tick({L:true});h.tick();h.dirty();h.tick({Y:true});h.tick();
 assert.equal(h.flags,0x400);assert.equal(h.slot10,0);assert.equal(h.accept,true);
 h.tick({O:true});h.step(95);h.tick({I:true});assert.equal(h.calls.filter(n=>n==='prepare').length,2);
});
test('cleanup failure cannot block input recovery, retry forever, or report complete restoration',()=>{
 const h=harness();h.tick({O:true});h.step(95);h.tick({I:true});h.failCleanup();h.tick({Y:true});h.step(200);
 assert.equal(h.accept,true);assert.equal(h.calls.filter(n=>n==='cleanup').length,1);
 assert.equal(h.c.status().flying,false);assert.equal(h.c.status().cleanupFailed,true);
 assert.equal(h.events.find(e=>e.event==='phase3_restored').complete,false);
 assert.equal(h.c.shutdown().pending,true);
});
test('missing old-round objects skip stale writes and do not repeatedly clean',()=>{
 const h=harness();h.tick({O:true});h.calls.length=0;h.c.beforeReset(null);h.step(100);
 assert.equal(h.calls.length,0);assert.equal(h.c.status().flying,false);
});
