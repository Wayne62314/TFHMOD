const test=require('node:test'),assert=require('node:assert/strict');
const {createPhase3Controller}=require('../phase3-controller.js');
function harness(){
 let snapshot={identity:'round1:uni',hp:100,opponentHp:100,state:'Stand',x:1000,y:64,originalBoss:false};
 const calls=[],messages=[];let accept=true,boss=false,missing=false;
 const api={emit:m=>messages.push(m),hasStates:()=>!missing,
  state(s,state){calls.push(['state',state]);snapshot.state=state;},
  snap(s,x,y){calls.push(['snap',x,y]);snapshot.x=x;snapshot.y=y;},
  velocity(s,x,y){calls.push(['velocity',x,y]);},
  accept(s,value){const previous=accept;accept=value;calls.push(['accept',value]);return previous;},
  boss(s,value){boss=value;calls.push(['boss',value]);}};
 const controller=createPhase3Controller(api);
 controller.configure({phase3:true,boss:false});controller.arm({...snapshot});
 return {controller,messages,calls,get accept(){return accept;},get boss(){return boss;},
  get s(){return snapshot;},missing:()=>{missing=true;},
  tick(keys={},foreground=true){controller.tick({...snapshot},keys,foreground);},
  step(n,keys={}){for(let i=0;i<n;i++)this.tick(keys);}};
}
test('arming is read-only; O enters flight and moves through snap API',()=>{
 const h=harness();assert.equal(h.calls.length,0);h.tick({O:true});assert.equal(h.accept,false);assert.equal(h.boss,true);
 assert.ok(h.calls.some(c=>c[0]==='state'&&c[1]==='Flight_Start'));h.step(91,{D:true,W:true});
 assert.ok(h.s.x>1000&&h.s.y>64);assert.ok(h.calls.some(c=>c[1]==='Flight_N_BG'));
});
test('P fires after startup and recovers after projectile state ends',()=>{
 const h=harness();h.tick({O:true});h.step(95);h.tick({P:true});assert.equal(h.s.state,'HomingSparkCast');
 h.s.state='Stand';h.step(3);assert.equal(h.s.state,'Flight_N_BG');
});
test('Y restores original position/control; ordinary boss option is preserved',()=>{
 for(const ordinary of [false,true]){
  const h=harness();h.controller.configure({phase3:true,boss:ordinary});h.tick({O:true});h.step(25,{D:true});
  h.tick({Y:true});assert.equal(h.accept,true);assert.equal(h.boss,ordinary);
  assert.equal(h.s.x,1000);assert.equal(h.s.y,64);assert.equal(h.s.state,'Stand');
 }
});
test('key focus gating prevents unfocused activation and stops movement',()=>{
 const h=harness();h.tick({O:true},false);assert.equal(h.calls.length,0);
 h.tick({O:true});h.step(95);const x=h.s.x;h.tick({D:true},false);assert.equal(h.s.x,x);
});
test('disabling phase3 and shutdown restore on next engine tick',()=>{
 for(const stop of [false,true]){
  const h=harness();h.tick({O:true});
  if(stop)assert.equal(h.controller.shutdown().pending,true);else h.controller.configure({phase3:false,boss:false});
  h.tick();assert.equal(h.accept,true);assert.equal(h.s.state,'Stand');
 }
});
test('stale identity never writes old actor or applies commands to replacement',()=>{
 const h=harness();h.tick({O:true});h.calls.length=0;
 h.controller.tick({...h.s,identity:'round2:uni'},{O:true},true);assert.equal(h.calls.length,0);
});
test('round reset restores accept flag only; no stale queued state',()=>{
 const h=harness();h.tick({O:true});h.calls.length=0;
 h.controller.beforeReset({...h.s});assert.deepEqual(h.calls,[['accept',true]]);
 h.calls.length=0;h.tick({O:true});assert.equal(h.calls.length,0);
});
test('missing required states rejects flight before native writes',()=>{
 const h=harness();h.missing();h.tick({O:true});assert.equal(h.calls.length,0);
 assert.equal(h.messages.at(-1).event,'phase3_error');
});
test('KO cancels flight without queuing a state on dead actor',()=>{
 const h=harness();h.tick({O:true});h.s.hp=0;h.calls.length=0;h.tick();
 assert.equal(h.accept,true);assert.ok(!h.calls.some(c=>c[0]==='state'));
});
test('movement stays within bounded box; press-and-hold O does not toggle repeatedly',()=>{
 const h=harness();h.tick({O:true});h.step(300,{O:true,D:true,W:true});
 assert.equal(h.accept,false);assert.equal(h.s.x,1650);assert.equal(h.s.y,614);
});
