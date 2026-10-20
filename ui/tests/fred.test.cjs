const test=require('node:test'),assert=require('node:assert/strict');
const {createPhase3Controller}=require('../phase3-controller.js');
function harness(){
 const s={identity:'round1:p1',state:'Stand',x:100,y:64,hp:100,opponentHp:100,originalBoss:false};
 let fred=null,missing=false;const calls=[],events=[];
 const api={emit:e=>events.push(e),hasStates:()=>!missing,
  accept:()=>true,boss:()=>{},snap:()=>{},velocity:()=>{},
  state:(s,name)=>{calls.push(name);s.state=name;},
  prepareFred:()=>calls.push('prepare'),fred:()=>fred,
  fredState:(s,name)=>{calls.push(name);return !!fred;},cleanupFred:()=>{calls.push('cleanup');fred=null;}};
 const c=createPhase3Controller(api);c.configure({phase3:true,boss:false});c.arm(s);
 function tick(keys={},focus=true){c.tick(s,keys,focus);}
 function step(n){for(let i=0;i<n;i++)tick();}
 tick({O:true});step(95);
 return {s,c,calls,events,tick,step,setFred:v=>fred=v,missing:()=>missing=true};
}
test('I prepares once then waits for owned Fred to leave Start before returning to flight',()=>{
 const h=harness();h.tick({I:true});assert.equal(h.calls.at(-2),'prepare');assert.equal(h.calls.at(-1),'FinalFred_Summon');
 h.setFred({state:'Start'});h.step(30);assert.equal(h.events.some(e=>e.event==='phase3_fred_ready'),false);
 h.setFred({state:'Idle'});h.step(6);assert.equal(h.calls.at(-1),'Flight_N_BG');
 assert.ok(h.events.some(e=>e.event==='phase3_fred_ready'));
 h.step(25);h.tick({I:true});assert.equal(h.calls.filter(n=>n==='prepare').length,1);
});
test('J/K modifier combinations map to all eight native Fred attacks',()=>{
 for(const key of ['J','K'])for(const shift of [false,true])for(const ctrl of [false,true]){
  const h=harness();h.setFred({state:'Idle'});h.tick({[key]:true,SHIFT:shift,CONTROL:ctrl});
  const name='Attack_'+(ctrl?'AND_':'')+(key==='J'?'Left':'Right')+(shift?'_Strong':'');
  assert.equal(h.calls.at(-1),name);
 }
});
test('absent or busy Fred cannot be ordered to attack',()=>{
 for(const fred of [null,{state:'Start'},{state:'Attack_Left'},{state:'Intro'}]){
  const h=harness();h.setFred(fred);h.calls.length=0;h.tick({J:true});assert.equal(h.calls.length,0);
 }
});
test('vortex allows parallel Fred attacks and a second L releases the charge',()=>{
 const h=harness();h.setFred({state:'Idle'});h.tick({L:true});assert.equal(h.s.state,'DarkVortex');
 h.step(25);h.tick({J:true});assert.equal(h.calls.at(-1),'Attack_Left');
 h.step(25);h.s.state='DarkVortex_Loop3';h.tick({L:true});assert.equal(h.s.state,'DarkVortex_Boom');
 h.step(3);h.s.state='Stand';h.tick();assert.equal(h.s.state,'Flight_N_BG');
});
test('Y has priority over Fred commands and U remains untouched',()=>{
 const h=harness();h.tick({U:true});assert.equal(h.c.status().flying,true);
 h.tick({Y:true,I:true,J:true,L:true});assert.equal(h.c.status().flying,false);assert.equal(h.calls.at(-2),'cleanup');
 assert.equal(h.calls.at(-1),'Stand');
});
test('missing states and unfocused keys never prepare Fred',()=>{
 const h=harness();h.missing();h.tick({I:true});assert.equal(h.calls.includes('prepare'),false);
 const h2=harness();h2.tick({I:true},false);assert.equal(h2.calls.includes('prepare'),false);
});
test('summon timeout cleans up and restores player control',()=>{
 const h=harness();h.tick({I:true});h.step(902);assert.equal(h.c.status().flying,false);
 assert.ok(h.calls.includes('cleanup'));assert.equal(h.calls.at(-1),'Stand');
});
test('round reset cleans owned Fred; invalid identity never calls cleanup on stale objects',()=>{
 const h=harness();h.calls.length=0;h.c.beforeReset(h.s);assert.deepEqual(h.calls,['cleanup']);
 const h2=harness();h2.calls.length=0;h2.c.tick({...h2.s,identity:'round2'}, {Y:true});assert.equal(h2.calls.length,0);
});
