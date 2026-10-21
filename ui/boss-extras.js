'use strict';
function bossExtrasAllowed(kind,training,selected,actual,team){return kind===10&&training===1&&['paca','velvet'].includes(selected)&&actual.toLowerCase()===selected&&team===1;}
function bossExtrasAction(character,state,key){
 if(character==='paca'&&key==='F6'&&['Stand','Stand_Flourish'].includes(state))return 'toggle27';
 if(character==='velvet'){
  if(key==='F6'&&['Stand','Stand_Flourish'].includes(state))return 'Boss_Install';
  if(state==='Boss_Wind_Idle')return {F7:'Boss_IceL',F8:'Boss_IceM',F9:'Boss_IceH'}[key]||null;
 }
 return null;
}
function createBossExtras(base){
 let options={papBoss:false,velvetBoss:false},hook=null,scope=null,papOriginal=null,velvetTouched=false,pending=false,faulted=false,restartRequired=false;
 function str(p){const n=p.add(16).readU64().toNumber(),c=p.add(24).readU64().toNumber();if(n>128||c<n)throw Error('Invalid string');return(c>=16?p.readPointer():p).readUtf8String(n);}
 function snap(){
  const scene=base.add(0x2b0d1e8).readPointer();if(scene.isNull())return null;
  const mode=scene.add(0x2028).readPointer();if(mode.isNull())return null;
  const kind=scene.add(0x9e4).readU32(),training=mode.add(0x1e8).readU8();if(kind!==10||training!==1)return null;
  const selected=str(scene.add(0x20d0));if(!['paca','velvet'].includes(selected))return null;
  const slot=scene.add(0xaa8).readS32();if(slot<0||slot>2)return null;
  const actor=scene.add(0xae0+slot*8).readPointer();if(actor.isNull())return null;
  const data=actor.add(0xc50).readPointer(),manager=scene.add(0x2f8).readPointer();if(data.isNull()||manager.isNull())return null;
  if(!bossExtrasAllowed(kind,training,selected,str(data.add(0xb40)),actor.add(0x88).readFloat()))return null;
  const current=actor.add(0xc58).readPointer();if(current.isNull())return null;
  return {scene,selected,actor,data,manager,id:actor.add(0x1270).readU64().toString(),state:str(current.add(0x10)),hp:actor.add(0x120).readFloat()};
 }
 function same(s){return scope&&s&&s.scene.equals(scope.scene)&&s.actor.equals(scope.actor)&&s.data.equals(scope.data)&&s.manager.equals(scope.manager)&&s.id===scope.id;}
 function release(s){
  if(papOriginal!==null&&same(s)){
   const p=s.actor.add(0x590),v=p.readU32();p.writeU32(((v&~0x08000000)|papOriginal)>>>0);
  }
  if(velvetTouched)send({event:'boss_extras_warning',message:'Velvet tornado cleanup is not implemented. Restart the game before continuing.'});
  const complete=!restartRequired&&!(papOriginal!==null&&!same(s));
  scope=null;papOriginal=null;velvetTouched=false;return complete;
 }
 const keys=[['F6',0x75],['F7',0x76],['F8',0x77],['F9',0x78],['Y',0x59]].map(([name,vk])=>({name,vk,down:false,released:false}));
 function resetKeys(){for(const k of keys){k.down=false;k.released=false;}}
 let native=null;
 function prepare(){
  if(native)return;
  for(const[rva,bytes]of [
   [0x189b7e0,[0x48,0x8b,0xc4,0x55,0x56,0x57,0x41,0x54,0x41,0x55,0x41,0x56]],
   [0x1795980,[0x4c,0x89,0x4c,0x24,0x20,0x44,0x89,0x44,0x24,0x18,0x55,0x53]],
   [0x3e3170,[0x40,0x57,0x48,0x83,0xec,0x30,0x48,0xc7,0x44,0x24,0x20,0xfe]]
  ])for(let i=0;i<bytes.length;i++)if(base.add(rva+i).readU8()!==bytes[i])throw Error('Unsupported/occupied Boss extras hook '+rva.toString(16));
  const user=Process.getModuleByName('user32.dll');
  native={make:new NativeFunction(base.add(0x3e3170),'pointer',['pointer']),enqueue:new NativeFunction(base.add(0x1795980),'void',['pointer','pointer','int','pointer']),
   key:new NativeFunction(user.getExportByName('GetAsyncKeyState'),'int16',['int']),fg:new NativeFunction(user.getExportByName('GetForegroundWindow'),'pointer',[]),
   wp:new NativeFunction(user.getExportByName('GetWindowThreadProcessId'),'uint32',['pointer','pointer']),pid:Memory.alloc(4),commands:new Map()};
  for(const name of ['Boss_Install','Boss_IceL','Boss_IceM','Boss_IceH']){
   const text=Memory.alloc(32);text.writeByteArray(new Uint8Array(32));text.writeUtf8String(name);text.add(16).writeU64(name.length);text.add(24).writeU64(15);
   native.commands.set(name,{text,fn:Memory.alloc(0x40)});
  }
 }
 function validate(s){
  const b=s.data.add(0xd88).readPointer(),e=s.data.add(0xd90).readPointer(),n=e.sub(b).toInt32()/8;
  if(!Number.isInteger(n)||n<1||n>4096)throw Error('Invalid Boss state table');
  const names=new Set();for(let i=0;i<n;i++){const p=b.add(i*8).readPointer();if(!p.isNull())names.add(str(p.add(0x10)));}
  const required=s.selected==='velvet'?['Boss_Install','Boss_Wind_Idle','Boss_IceL','Boss_IceM','Boss_IceH']:['Teleport_Slide','FG_Attack_Leap_Start','FG_Attack_Teleport_Start'];
  if(required.some(name=>!names.has(name)))throw Error('Required Boss states missing');
 }
 function detach(){if(hook){hook.detach();hook=null;}}
 function stop(s){const complete=release(s);pending=false;resetKeys();detach();send({event:'boss_extras_restored',complete});}
 function install(){if(hook)return;prepare();hook=Interceptor.attach(base.add(0x189b7e0),{
  onEnter(args){this.step=(args[1].toInt32()&255)===1;this.scene=args[0];},
  onLeave(){if(!this.step)return;let s=null;try{
   if(!base.add(0x2b0d1e8).readPointer().equals(this.scene))return;
   s=snap();if(pending){stop(s);return;}
   const enabled=s&&(s.selected==='paca'?options.papBoss:options.velvetBoss);
   if(!enabled){if(scope)release(s);resetKeys();return;}
   if(!same(s)){release(s);validate(s);scope=s;resetKeys();send({event:'boss_extras_ready',character:s.selected,trainingOnly:true});}
   const window=native.fg();let focused=false;if(!window.isNull()){native.wp(window,native.pid);focused=native.pid.readU32()===Process.id;}
   if(!focused){resetKeys();return;}
   const edges=[];for(const k of keys){const pressed=(native.key(k.vk)&0x8000)!==0;if(!pressed)k.released=true;if(pressed&&!k.down&&k.released)edges.push(k.name);k.down=pressed;}
   if(edges.includes('Y')){options={papBoss:false,velvetBoss:false};stop(s);send({event:'boss_extras_stopped'});return;}
   if(edges.length!==1||s.hp<=0)return;
   const action=bossExtrasAction(s.selected,s.state,edges[0]);if(!action){send({event:'boss_extras_refused',state:s.state,key:edges[0]});return;}
   if(action==='toggle27'){
    const p=s.actor.add(0x590),r=Process.findRangeByAddress(p);if(!r||!r.protection.includes('w')||p.add(4).compare(r.base.add(r.size))>0)throw Error('Flag not writable');
    const v=p.readU32();if(papOriginal===null)papOriginal=v&0x08000000;const after=(v^0x08000000)>>>0;p.writeU32(after);if(p.readU32()!==after)throw Error('Flag readback failed');
    send({event:'paprika_flag27',enabled:!!(after&0x08000000)});
   }else{
    const c=native.commands.get(action),closure=native.make(c.text);if(closure.isNull())throw Error('No state closure');
    c.fn.writeByteArray(new Uint8Array(0x40));c.fn.add(0x38).writePointer(closure);velvetTouched=true;restartRequired=true;native.enqueue(s.manager,s.actor,0,c.fn);
    send({event:'velvet_dispatch',state:action});
   }
  }catch(error){faulted=true;options={papBoss:false,velvetBoss:false};send({event:'boss_extras_warning',message:String(error)+'; restart game.'});try{stop(s);}catch(ignored){detach();}}}
 });}
 prepare(); // Validate before other feature modules install their frame hooks.
 return {
  configure(value){const next={papBoss:value.papBoss===true,velvetBoss:value.velvetBoss===true};if(faulted&&(next.papBoss||next.velvetBoss))throw Error('Boss extras faulted; restart game/tool');
   if(next.papBoss||next.velvetBoss){install();pending=false;}else if(hook)pending=true;options=next;},
  beforeReset(scene){if(scope&&scope.scene.equals(scene)){try{release(snap());resetKeys();}catch(error){faulted=true;pending=true;send({event:'boss_extras_warning',message:String(error)});}}},
  shutdown(){if(hook){pending=true;return{pending:true};}return{pending:false};},
  diagnostics(){return{frameHook:!!hook,pending,faulted,velvetTouched};}
 };
}
if(typeof module!=='undefined')module.exports={bossExtrasAllowed,bossExtrasAction};
