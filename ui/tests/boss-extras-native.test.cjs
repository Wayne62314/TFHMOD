const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function fixture(character='paca'){
 const cells=new Map(),events=[],writes=[],hooks=[],pressed=new Set();let alloc=0x50000000,focused=true;
 class P{
  constructor(n){this.n=n;}add(n){return new P(this.n+n);}sub(p){return new P(this.n-p.n);}toInt32(){return this.n|0;}isNull(){return this.n===0;}equals(p){return !!p&&this.n===p.n;}compare(p){return Math.sign(this.n-p.n);}toString(){return '0x'+this.n.toString(16);}
  readPointer(){return new P(cells.get(this.n)||0);}readU8(){return cells.get(this.n)||0;}readU32(){return cells.get(this.n)||0;}readS32(){return this.readU32();}readFloat(){return cells.get(this.n)||0;}
  readU64(){const n=cells.get(this.n)||0;return{toNumber:()=>n,toString:()=>String(n)};}readUtf8String(){return cells.get(this.n)||'';}
  writeU32(n){cells.set(this.n,n);writes.push([this.n,n]);}writeU64(n){cells.set(this.n,n);}writePointer(p){cells.set(this.n,p.n);}writeUtf8String(s){cells.set(this.n,s);}writeByteArray(){}
 }
 const base=new P(0x10000000),scene=new P(0x20000000),mode=new P(0x21000000),actor=new P(0x22000000),data=new P(0x23000000),manager=new P(0x24000000),state=new P(0x25000000);
 const put=(p,off,value)=>cells.set(p.n+off,value instanceof P?value.n:value);
 function string(p,text){if(text.length>15){alloc+=0x100;const heap=new P(alloc);put(heap,0,text);put(p,0,heap);put(p,24,text.length);}else{put(p,0,text);put(p,24,15);}put(p,16,text.length);}
 put(base,0x2b0d1e8,scene);put(scene,0x2028,mode);put(scene,0x9e4,10);put(mode,0x1e8,1);string(scene.add(0x20d0),character);put(scene,0xaa8,0);put(scene,0xae0,actor);put(scene,0x2f8,manager);
 put(actor,0xc50,data);put(actor,0xc58,state);put(actor,0x88,1);put(actor,0x120,100);put(actor,0x1270,1001);put(actor,0x590,0x24);string(data.add(0xb40),character==='paca'?'Paca':'Velvet');string(state.add(0x10),'Stand');
 const names=['Boss_Install','Boss_Wind_Idle','Boss_IceL','Boss_IceM','Boss_IceH','Teleport_Slide','FG_Attack_Leap_Start','FG_Attack_Teleport_Start'],table=new P(0x26000000);
 put(data,0xd88,table);put(data,0xd90,table.add(names.length*8));names.forEach((n,i)=>{const p=new P(0x27000000+i*0x100);put(table,i*8,p);string(p.add(0x10),n);});
 for(const[rva,bytes]of [[0x189b7e0,[0x48,0x8b,0xc4,0x55,0x56,0x57,0x41,0x54,0x41,0x55,0x41,0x56]],[0x1795980,[0x4c,0x89,0x4c,0x24,0x20,0x44,0x89,0x44,0x24,0x18,0x55,0x53]],[0x3e3170,[0x40,0x57,0x48,0x83,0xec,0x30,0x48,0xc7,0x44,0x24,0x20,0xfe]]])bytes.forEach((b,i)=>put(base,rva+i,b));
 const exports={GetAsyncKeyState:1,GetForegroundWindow:2,GetWindowThreadProcessId:3};
 function NativeFunction(p){
  if(p.n===1)return vk=>pressed.has(vk)?-32768:0;
  if(p.n===2)return()=>new P(focused?5:0);
  if(p.n===3)return(w,pid)=>{pid.writeU32(77);return 0;};
  if(p.n===base.n+0x3e3170)return()=>new P(123);
  if(p.n===base.n+0x1795980)return()=>events.push({event:'native_enqueue'});
  throw Error('Unknown native '+p);
 }
 const context={NativeFunction,Process:{id:77,getModuleByName:()=>({getExportByName:n=>new P(exports[n])}),findRangeByAddress:()=>({base:actor,size:0x2000,protection:'rw-'})},Memory:{alloc:()=>{alloc+=0x100;return new P(alloc);}},Interceptor:{attach:(p,callback)=>{const h={callback,detached:false,detach(){this.detached=true;}};hooks.push(h);return h;}},send:e=>events.push(e)};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../boss-extras.js'),'utf8')+'\nglobalThis.create=createBossExtras;',context);
 const api=context.create(base);
 function tick(){for(const h of [...hooks])if(!h.detached){const frame={};h.callback.onEnter.call(frame,[scene,new P(1)]);h.callback.onLeave.call(frame);}}
 function key(vk){pressed.clear();tick();pressed.add(vk);tick();pressed.clear();}
 return{api,tick,key,events,writes,actor,state,scene,mode,put,string,hooks,setFocused:v=>focused=v};
}
test('Boss adapter off has no update hook; Pap toggle preserves unrelated bits and restores on shutdown',()=>{
 const f=fixture();assert.equal(f.hooks.length,0);f.api.configure({papBoss:true});f.tick();f.key(0x75);
 assert.equal(f.actor.add(0x590).readU32(),0x08000024,JSON.stringify(f.events));
 f.actor.add(0x590).writeU32(0x08000064);f.api.shutdown();f.tick();
 assert.equal(f.actor.add(0x590).readU32(),0x64);assert.equal(f.hooks[0].detached,true);assert.equal(f.events.find(e=>e.event==='boss_extras_restored').complete,true);
});
test('Network/wrong team, lost focus, busy states and changed generation never toggle stale flags',()=>{
 for(const change of [f=>f.put(f.scene,0x9e4,0),f=>f.put(f.actor,0x88,2),f=>f.setFocused(false),f=>f.string(f.state.add(0x10),'Hit')]){
  const f=fixture();f.api.configure({papBoss:true});change(f);f.key(0x75);assert.equal(f.actor.add(0x590).readU32(),0x24);
 }
 const f=fixture();f.api.configure({papBoss:true});f.key(0x75);const flagWrites=()=>f.writes.filter(([address])=>address===f.actor.n+0x590).length,before=flagWrites();f.put(f.actor,0x1270,1002);f.api.shutdown();f.tick();assert.equal(flagWrites(),before);assert.equal(f.events.find(e=>e.event==='boss_extras_restored').complete,false);
});
test('Velvet only dispatches at allowed states and never claims tornado restored after Y',()=>{
 const f=fixture('velvet');f.api.configure({velvetBoss:true});f.key(0x76);assert.equal(f.events.filter(e=>e.event==='native_enqueue').length,0);
 f.key(0x75);assert.equal(f.events.filter(e=>e.event==='native_enqueue').length,1);
 f.string(f.state.add(0x10),'Boss_Wind_Idle');f.key(0x76);assert.equal(f.events.filter(e=>e.event==='native_enqueue').length,2);
 f.key(0x59);assert.equal(f.events.find(e=>e.event==='boss_extras_restored').complete,false);assert.equal(f.events.some(e=>e.event==='boss_extras_warning'),true);
});
