const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','training-hook.js'),'utf8');
function harness({type=0,training=0,name='uni',slot=0,team=1,flags=0x80000003,
  writable=true,nullSprite=false,caller=0x1773b84,badSignature=false}={}) {
 const base=0x10000000,scene=0x20000000,mode=0x30000000,sprite=0x40000000;
 const values=new Map(),bytes=new Map(),strings=new Map(),hooks=new Map(),messages=[],writes=[];
 class P {
  constructor(n){this.n=Number(n);} add(n){return new P(this.n+n);} sub(p){return new P(this.n-p.n);}
  toString(){return '0x'+this.n.toString(16);} isNull(){return this.n===0;}
  equals(p){return this.n===p.n;} compare(p){return Math.sign(this.n-p.n);}
  readU8(){if(!bytes.has(this.n))throw Error('unreadable byte');return bytes.get(this.n);}
  readU32(){if(!values.has(this.n))throw Error('unreadable');return values.get(this.n);}
  readS32(){return this.readU32();} readFloat(){return this.readU32();}
  readU64(){return {toNumber:()=>this.readU32()};} readPointer(){return new P(this.readU32());}
  readUtf8String(n){return strings.get(this.n).slice(0,n);}
  writeU32(v){writes.push([this.n,v]);values.set(this.n,v);}
  writeS32(v){this.writeU32(v);}
 }
 function str(a,s){strings.set(a,s);values.set(a+16,s.length);values.set(a+24,15);}
 function sig(a,arr){arr.forEach((b,i)=>bytes.set(base+a+i,b));}
 sig(0x8fbb0,[0x48,0x89,0x5c,0x24,0x10,0x48,0x89,0x6c,0x24,0x18]);
 sig(0x1772f40,[0x40,0x55,0x56,0x57,0x41,0x54,0x41,0x55,0x41,0x56,0x41,0x57]);
 sig(0x1773720,[0x4c,0x89,0x44,0x24,0x18,0x88,0x54,0x24,0x10]);
 sig(0x1780f40,[0x8b,0xc2,0x4c,0x8b,0xd1,0x99,0x83,0xe2,0x1f]);
 if(badSignature)bytes.set(base+0x1780f40,0);
 values.set(scene+0x2028,mode);bytes.set(mode+0x1e8,training);values.set(scene+0x9e4,type);
 values.set(scene+0xaa8,slot);values.set(scene+0xae0+slot*8,nullSprite?0:sprite);
 values.set(sprite+0x590,flags);values.set(sprite+0x88,team);
 str(scene+0x20d0,name);str(scene+0x2130,'uni');
 const ctx={createNativePhase3:()=>({configure(){},arm(){},invalidate(){},install(){},shutdown(){return {pending:false};}}),rpc:{exports:{}},ptr:x=>new P(x),send:m=>messages.push(m),
  NativeFunction:function(){return (dst,src,n)=>{writes.push([dst.n,strings.get(src.n)]);str(dst.n,strings.get(src.n).slice(0,n));};},
  Memory:{allocUtf8String:s=>{str(0x50000000,s);return new P(0x50000000);}},
  Process:{findRangeByAddress:()=>({base:new P(sprite),size:0x2000,protection:writable?'rw-':'r--'})},
  Interceptor:{attach:(a,h)=>hooks.set(a.n-base,h)}};
 vm.createContext(ctx);
 return {start:()=>{vm.runInContext(source.replace('__BASE__','0x10000000'),ctx);ctx.rpc.exports.configure({bear:true,boss:true});},
  configure:value=>ctx.rpc.exports.configure(value),
  load({nested=true}={}){const outer={threadId:7};if(nested)hooks.get(0x1773720).onEnter.call(outer,[new P(scene)]);
   hooks.get(0x1772f40).onEnter.call({threadId:7,returnAddress:new P(base+caller)},[new P(scene)]);
   if(nested)hooks.get(0x1773720).onLeave.call(outer);},
  get flags(){return values.get(sprite+0x590);},get name(){return strings.get(scene+0x20d0);},
  resetFlags:v=>values.set(sprite+0x590,v),hooks,writes,messages,sprite};
}
for(const [type,training] of [[0,0],[0,1],[10,1]]) test(`offline ${type}/${training}: P1 flag27 only, preserves other bits`,()=>{
 const h=harness({type,training});h.start();h.load();assert.equal(h.flags,0x88000003);
 assert.deepEqual(h.writes,[[h.sprite+0x590,0x88000003]]);assert.equal(h.name,'uni');
 assert.equal(h.messages.at(-1).event,'boss_applied');
});
test('network and nonwhitelisted modes unchanged',()=>{for(let type=1;type<17;type++)for(const training of [0,1]){
 if(type===10&&training===1)continue;const h=harness({type,training});h.start();h.load();assert.equal(h.writes.length,0);
}});
test('wrong caller or missing enclosing reset never writes boss flag',()=>{
 for(const opts of [{caller:123},{}]){const h=harness(opts);h.start();h.load({nested:!!opts.caller});assert.equal(h.writes.length,0);}
});
test('invalid actor slots, null actor, team mismatch and protected memory rejected',()=>{
 for(const opts of [{slot:-1},{slot:3},{nullSprite:true},{team:2},{writable:false}]){
  const h=harness(opts);h.start();h.load();assert.equal(h.writes.length,0);assert.equal(h.messages.at(-1).event,'error');
 }});
test('repeated reset re-applies cleared flag and avoids redundant writes',()=>{
 const h=harness();h.start();h.load();h.load();assert.equal(h.writes.length,1);
 h.resetFlags(3);h.load();assert.equal(h.flags,0x08000003);assert.equal(h.writes.length,2);
});
test('Arizona still becomes Huggles, other characters and P2 untouched',()=>{
 for(const name of ['cow','velvet','bscout']){const h=harness({name});h.start();h.load();
  assert.equal(h.name,name==='cow'?'bscout':name);assert.equal(h.flags,0x80000003);
  assert.equal(h.writes.length,name==='cow'?2:0);}
});
test('all guards pass before any hook is attached',()=>{
 const h=harness({badSignature:true});assert.throws(()=>h.start(),/Unsupported flag/);assert.equal(h.hooks.size,0);
});
test('four independent switch combinations gate only their feature',()=>{
 for(const bear of [false,true])for(const boss of [false,true])for(const name of ['cow','uni']){
  const h=harness({name});h.start();h.configure({bear,boss});h.load();
  assert.equal(h.name,name==='cow'&&bear?'bscout':name);
  assert.equal(h.flags,name==='uni'&&boss?0x88000003:0x80000003);
 }
});
test('runtime switching stops future writes, does not undo a live actor',()=>{
 const h=harness();h.start();h.load();h.configure({bear:false,boss:false});h.load();
 assert.equal(h.flags,0x88000003);assert.equal(h.writes.length,1);
 h.resetFlags(3);h.load();assert.equal(h.flags,3);
 h.configure({bear:false,boss:true});h.load();assert.equal(h.flags,0x08000003);
});
test('invalid option types rejected without mutating prior options',()=>{
 const h=harness();h.start();assert.throws(()=>h.configure({bear:'yes',boss:true}),/boolean/);
 h.load();assert.equal(h.flags,0x88000003);
});
test('phase3 includes ordinary boss flag on each allowed offline flow',()=>{
 for(const [type,training]of [[0,0],[0,1],[10,1]]){
  const h=harness({type,training});h.start();h.configure({bear:false,boss:false,phase3:true});h.load();
  assert.equal(h.flags,0x88000003);assert.equal(h.name,'uni');
 }
});
test('phase3 request does not bypass mode whitelist or P1 character check',()=>{
 for(const opts of [{type:1},{type:11,training:1},{type:10,training:0},{name:'cow'},{name:'velvet'}]){
  const h=harness(opts);h.start();h.configure({bear:false,boss:false,phase3:true});h.load();
  assert.equal(h.writes.length,0);
 }
});
