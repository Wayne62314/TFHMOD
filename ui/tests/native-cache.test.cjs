const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function harness(){
 const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'phase3-native.js'),'utf8');
 const code=fs.readFileSync(path.join(root,'phase3-controller.js'),'utf8')+'\n'+source;
 const base=0x10000000,scene=0x20000000,manager=0x21000000,actor=0x300014a0,opponent=0x30000000,book=0x30002940,data=0x31000000;
 const stateList=0x33000000,values=new Map(),bytes=new Map(),strings=new Map(),hooks=new Map(),keys={},events=[];
 let allocations=0x50000000,queryCount=0,refreshCount=0,barrierAppends=0,barrierDestructs=0;
 class P{
  constructor(n){this.n=typeof n==='string'?Number(n):n;}
  add(n){return new P(this.n+Number(n));}sub(p){return new P(this.n-p.n);}
  isNull(){return this.n===0;}equals(p){return this.n===p.n;}compare(p){return Math.sign(this.n-p.n);}
  toString(){return '0x'+this.n.toString(16);}toInt32(){return this.n|0;}
  readU8(){return bytes.get(this.n)||0;}writeU8(n){bytes.set(this.n,n);}
  readU32(){if(!values.has(this.n))throw Error('Unmapped '+this.toString());return values.get(this.n);}
  readS32(){return this.readU32();}readFloat(){return this.readU32();}
  writeU32(n){values.set(this.n,n);}writeS32(n){values.set(this.n,n);}writeFloat(n){values.set(this.n,n);}
  readU64(){return{toNumber:()=>this.readU32()};}writeU64(n){values.set(this.n,Number(n));}
  readPointer(){return new P(this.readU32());}writePointer(p){values.set(this.n,p.n);}
  readUtf8String(n){if(!strings.has(this.n))throw Error('Unmapped string');return strings.get(this.n).slice(0,n);}
  writeUtf8String(s){strings.set(this.n,s);}writeByteArray(){}
 }
 function str(a,s){const p=s.length<16?a:a+0x70000000;strings.set(p,s);if(p!==a)values.set(a,p);values.set(a+16,s.length);values.set(a+24,Math.max(15,s.length));}
 function allocate(){const p=new P(allocations);allocations+=0x1000;return p;}
 const signatures=vm.runInNewContext(source.match(/const signatures=(\[[\s\S]*?\]);/)[1]);
 for(const [rva,arr]of signatures)arr.forEach((x,i)=>bytes.set(base+rva+i,x));
 values.set(base+0x2b0d1e8,scene);values.set(scene+0x2028,0x22000000);bytes.set(0x22000000+0x1e8,1);
 values.set(scene+0x9e4,10);str(scene+0x20d0,'uni');values.set(scene+0xaa8,0);values.set(scene+0xab4,3);
 values.set(scene+0xae0,actor);values.set(scene+0xae0+24,opponent);values.set(scene+0x2f8,manager);
 values.set(scene+0xa68,opponent);values.set(scene+0xa70,book+0x14a0);
 values.set(actor+0x88,1);values.set(actor+0xc50,data);values.set(actor+0xc58,0x32000000);
 values.set(actor+0x120,100);values.set(opponent+0x120,100);values.set(actor+0x590,0);
 values.set(actor+0x40c,0);
 values.set(actor+0xc78,1000);values.set(actor+0xc7c,64);values.set(actor+0xfc,1);
 str(data+0xb40,'Uni');str(0x31010000+0xb40,'Book');
 values.set(actor+0xb30,actor);values.set(opponent+0xb30,opponent);values.set(book+0xb30,actor);values.set(book+0xc50,0x31010000);
 values.set(book+0xc78,1150);values.set(book+0xc7c,114);
 for(const p of [actor,opponent,book])values.set(p+0x1244,0);
 const collision=0x35000000,barriers=0x36000000;
 values.set(scene+0x1b18,collision);values.set(collision+0x58,barriers);values.set(collision+0x60,barriers+0x190);values.set(collision+0x68,barriers+0x190);
 bytes.set(barriers+0x14,1);bytes.set(barriers+0x15,0);
 const states=new Map();['Stand','Flight_Start','Flight_N_BG','HomingSparkCast','FinalFred_Summon','DarkVortex','DarkVortex_Boom','DarkVortex_BoomEnd'].forEach((name,i)=>{
  const p=0x32000000+i*0x100;str(p+0x10,name);states.set(name,p);values.set(stateList+i*8,p);
 });
 values.set(data+0xd88,stateList);values.set(data+0xd90,stateList+states.size*8);
 const fredActor=book+0x14a0,fredData=0x37000000,fredStates=new Map();
 ['Start','Idle','Attack_Left','Attack_Right','Attack_Left_Strong','Attack_AND_Left_Strong','Attack_AND_Right'].forEach((name,i)=>{
  const p=0x38000000+i*0x100;str(p+0x10,name);fredStates.set(name,p);values.set(0x39000000+i*8,p);
 });
 str(fredData+0xb40,'FredBoss');values.set(fredData+0xd88,0x39000000);values.set(fredData+0xd90,0x39000000+fredStates.size*8);
 bytes.set(0x40000000+0x28,1);
 const closures=new Map();
 const context={ptr:n=>new P(n),send:x=>events.push(x),Uint8Array,
  Memory:{alloc:allocate,allocUtf8String:s=>{const p=allocate();p.writeUtf8String(s);return p;}},
  NativeFunction:function(address){
   if(address==='key')return k=>keys[k===0x10?'SHIFT':k===0x11?'CONTROL':String.fromCharCode(k)]?0x8000:0;
   if(address==='foreground')return()=>new P(123);
   if(address==='windowPid')return(w,p)=>{p.writeU32(321);return 123;};
   const rva=address.n-base;
   if(rva===0x3e3170)return text=>{const p=allocate(),buf=text.add(24).readU64().toNumber()>=16?text.readPointer():text;closures.set(p.n,buf.readUtf8String(text.add(16).readU64().toNumber()));return p;};
   if(rva===0x1795980)return(m,a,n,fn)=>{const name=closures.get(fn.add(0x38).readPointer().n);values.set(a.n+0xc58,(a.n===actor?states:fredStates).get(name));};
   if(rva===0x3c5b20)return()=>new P(0x40000000);
   if(rva===0x1753f80)return()=>{refreshCount++;};
   if(rva===0x5db5d0)return p=>p;
   if(rva===0x18d12f0)return()=>{barrierDestructs++;};
   if(rva===0x1762da0)return p=>bytes.set(p.n+0x1262,(bytes.get(p.n+0x1262)||0)|0x40);
   const moveBarrier=(unused,dst,src)=>{for(const off of [0x14,0x15])bytes.set(dst.n+off,bytes.get(src.n+off));values.set(dst.n+0x48,values.get(src.n+0x48));barrierAppends++;return dst;};
   if(rva===0x5e17b0)return moveBarrier;
   if(rva===0x5e1860)return(v,at,src)=>{moveBarrier(null,at,src);values.set(v.n+8,at.n+0x190);values.set(v.n+16,at.n+0x190*16);return at;};
   throw Error('Unknown native function');
  },
  Process:{id:321,findRangeByAddress:p=>{queryCount++;return{base:new P(Math.floor(p.n/0x10000)*0x10000),size:0x10000,protection:'rw-'};},
   getModuleByName:()=>({getExportByName:n=>({GetAsyncKeyState:'key',GetForegroundWindow:'foreground',GetWindowThreadProcessId:'windowPid'})[n]})},
  Interceptor:{attach:(p,callbacks)=>{hooks.set(p.n,callbacks);return{detach:()=>hooks.delete(p.n)};}}
 };
 vm.createContext(context);vm.runInContext(code+'\nglobalThis.runtime=createNativePhase3(ptr('+base+'));',context);
 const runtime=context.runtime;
 return {runtime,events,keys,values,actor,opponent,data,scene,str,collision,barriers,bytes,fredActor,
  setState(name){values.set(actor+0xc58,states.get(name));},
  addFred(parent=actor){values.set(scene+0xa70,fredActor+0x14a0);values.set(fredActor+0xb30,parent);values.set(fredActor+0xc50,fredData);values.set(fredActor+0xc58,fredStates.get('Idle'));values.set(fredActor+0x1244,0);bytes.set(fredActor+0x1262,0);},
  get barrierAppends(){return barrierAppends;},get barrierDestructs(){return barrierDestructs;},
  tick(){const h=hooks.get(base+0x189b7e0);if(!h)return;const call={};h.onEnter.call(call,[new P(scene),new P(1)]);h.onLeave.call(call);},
  enable(){runtime.configure({bear:false,boss:false,phase3:true});runtime.install();runtime.arm(new P(scene));},
  get queries(){return queryCount;},get refreshes(){return refreshCount;},get hookCount(){return hooks.size;},P};
}
test('native snapshot and flight warm path perform no repeating region queries',()=>{
 const h=harness();h.enable();h.tick();const idle=h.queries;
 for(let i=0;i<500;i++)h.tick();assert.equal(h.queries,idle);
 h.keys.O=true;h.tick();h.keys.O=false;for(let i=0;i<100;i++)h.tick();const flight=h.queries;
 h.keys.D=true;for(let i=0;i<300;i++)h.tick();assert.equal(h.queries,flight);
 assert.ok(h.refreshes>0);assert.equal(h.values.get(h.actor+0xc78),1650);
 assert.equal(h.values.get(0x30002940+0xc78),1800);
});
test('state list is scanned only once per resource generation',()=>{
 const h=harness();h.enable();h.runtime.inspect(new h.P(h.scene));
 h.runtime.inspect(new h.P(h.scene));assert.equal(h.runtime.diagnostics().stateScans,1);
 h.values.set(h.data+0xd90,0x33000000+24);h.runtime.inspect(new h.P(h.scene));
 assert.equal(h.runtime.diagnostics().stateScans,2);
});
test('disabled feature has no update hook and disabling an idle scene removes it',()=>{
 const h=harness();h.runtime.configure({phase3:false,boss:false});h.runtime.install();assert.equal(h.hookCount,0);
 h.enable();h.runtime.configure({phase3:false,boss:true});assert.equal(h.hookCount,0);
 const count=h.queries;for(let i=0;i<100;i++)h.tick();assert.equal(h.queries,count);
});
test('disabling flight restores on engine thread then detaches and clears caches',()=>{
 const h=harness();h.enable();h.keys.O=true;h.tick();h.keys.O=false;h.tick();
 h.runtime.configure({phase3:false,boss:true});assert.equal(h.hookCount,1);h.tick();
 assert.equal(h.hookCount,0);assert.equal(h.runtime.diagnostics().cachedRanges,0);
 assert.equal(h.values.get(h.actor+0xc78),1000);assert.equal(h.values.get(h.actor+0xc7c),64);
});
test('round invalidation forces fresh validation; network transition performs no movement',()=>{
 const h=harness();h.enable();const before=h.queries;h.runtime.invalidate();h.runtime.arm(new h.P(h.scene));
 assert.ok(h.queries>before);h.values.set(h.scene+0x9e4,1);h.keys.O=true;
 const oldX=h.values.get(h.actor+0xc78);h.tick();assert.equal(h.values.get(h.actor+0xc78),oldX);
 assert.equal(h.runtime.diagnostics().active,false);
});
test('manager and actor resource changes invalidate cached ranges without explicit reset',()=>{
 const h=harness();h.enable();const first=h.queries;
 h.values.set(h.scene+0x2f8,0x21010000);h.tick();assert.ok(h.queries>first);
 const second=h.queries,newData=0x31020000;
 // Copy the original resource metadata into a new allocation in this mock.
 for(const offset of [0xd88,0xd90])h.values.set(newData+offset,h.values.get(h.data+offset));
 h.str(newData+0xb40,'Uni');
 h.values.set(h.actor+0xc50,newData);h.tick();
 assert.ok(h.queries>second);
 assert.equal(h.runtime.diagnostics().active,true);
 assert.equal(h.events.some(e=>e.event==='phase3_error'),false);
 assert.equal(h.values.get(h.actor+0xc78),1000);
});

test('Fred preparation appends ten reserved slots without replacing the original floor; Y cleans and reuses',()=>{
 const h=harness();h.enable();h.keys.O=true;h.tick();h.keys.O=false;
 for(let i=0;i<95;i++)h.tick();h.keys.I=true;h.tick();h.keys.I=false;
 assert.equal(h.barrierAppends,10);assert.equal(h.barrierDestructs,10);
 assert.equal(h.values.get(h.collision+0x58),h.barriers);
 assert.equal(h.values.get(h.collision+0x60),h.barriers+11*0x190);
 assert.equal(h.bytes.get(h.barriers+0x14),1);assert.equal(h.bytes.get(h.barriers+0x15),0);
 for(let i=1;i<11;i++){assert.equal(h.bytes.get(h.barriers+i*0x190+0x15),1);assert.equal(h.values.get(h.barriers+i*0x190+0x48),i);}
 h.addFred();for(let i=0;i<30;i++)h.tick();
 assert.ok(h.events.some(e=>e.event==='phase3_fred_ready'));
 h.keys.J=true;h.keys.SHIFT=true;h.keys.CONTROL=true;h.tick();
 assert.ok(h.events.some(e=>e.event==='phase3_fred_attack'&&e.state==='Attack_AND_Left_Strong'));
 for(const k of ['J','SHIFT','CONTROL'])delete h.keys[k];
 h.keys.Y=true;h.tick();
 assert.equal(h.bytes.get(h.fredActor+0x1262)&0x40,0x40);
 assert.equal(h.bytes.get(h.barriers+0x14),1);
 for(let i=1;i<11;i++)assert.equal(h.bytes.get(h.barriers+i*0x190+0x14),0);
});

test('Fred owned by the opponent is never controlled and a missing collision world rejects summon',()=>{
 const h=harness();h.enable();h.keys.O=true;h.tick();h.keys.O=false;for(let i=0;i<95;i++)h.tick();
 h.addFred(h.opponent);h.keys.J=true;h.tick();h.keys.J=false;for(let i=0;i<21;i++)h.tick();
 assert.equal(h.events.some(e=>e.event==='phase3_fred_attack'),false);
 h.values.set(h.scene+0x1b18,0);h.keys.I=true;h.tick();
 assert.equal(h.barrierAppends,0);assert.ok(h.events.some(e=>e.event==='phase3_error'));
});

test('native effect recovery preserves unrelated flags/P2 and supports a second summon without new barriers',()=>{
 const h=harness(),otherBefore=[...h.values].filter(([p])=>p>=h.opponent&&p<h.actor);
 h.values.set(h.actor+0x590,0x400);h.enable();h.keys.O=true;h.tick();h.keys.O=false;
 for(let i=0;i<95;i++)h.tick();h.keys.I=true;h.tick();h.keys.I=false;
 h.addFred();for(let i=0;i<30;i++)h.tick();h.keys.L=true;h.tick();h.keys.L=false;
 h.values.set(h.actor+0x590,0x1c002c00);h.values.set(h.actor+0x40c,-1);h.setState('DarkVortex_BoomEnd');
 for(let i=0;i<33;i++)h.tick();
 assert.equal(h.values.get(h.actor+0x590),0x08002c00); // keep latch13, boss27 and unrelated bit11
 assert.equal(h.values.get(h.actor+0x40c),-1);
 h.keys.Y=true;h.tick();h.keys.Y=false;
 assert.equal(h.values.get(h.actor+0x590),0xc00);assert.equal(h.values.get(h.actor+0x40c),0);
 h.keys.O=true;h.tick();h.keys.O=false;for(let i=0;i<95;i++)h.tick();
 h.values.set(h.actor+0x40c,-1);h.values.set(h.actor+0x590,0x08002c00);
 h.keys.I=true;h.tick();h.keys.I=false;
 assert.equal(h.values.get(h.actor+0x40c),0);assert.equal(h.values.get(h.actor+0x590)&0x2000,0);
 assert.equal(h.barrierAppends,10);
 assert.deepEqual([...h.values].filter(([p])=>p>=h.opponent&&p<h.actor),otherBefore);
});

test('a native frame exception triggers bounded recovery and detaches instead of looping',()=>{
 const h=harness();h.enable();h.values.set(h.actor+0xfc,0);h.keys.O=true;h.tick();
 assert.equal(h.hookCount,0);const events=h.events.length;for(let i=0;i<100;i++)h.tick();
 assert.equal(h.events.length,events);assert.equal(h.events.filter(e=>e.event==='phase3_error').length,1);
 assert.equal(h.runtime.shutdown().pending,true);
});

test('round reset with null player pointers cannot throw from the hook or write stale actors',()=>{
 const h=harness();h.enable();h.keys.O=true;h.tick();
 h.values.set(h.scene+0xae0,0);assert.doesNotThrow(()=>h.runtime.invalidate());
 assert.equal(h.runtime.diagnostics().active,false);
 assert.ok(h.events.some(e=>e.event==='phase3_cleanup_warning'));
});
