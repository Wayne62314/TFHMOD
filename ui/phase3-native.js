'use strict';
// One cache per active scene/object generation. No pointer survives scope changes.
function createScopedRangeValidator(query, capacity=64) {
  let scope=null,ranges=[];
  const counters={queries:0,hits:0,invalidations:0};
  return {
    setScope(value){if(scope!==value){scope=value;ranges=[];counters.invalidations++;return true;}return false;},
    clear(){scope=null;ranges=[];counters.invalidations++;},
    check(p,n){
      if(p.isNull()||!Number.isSafeInteger(n)||n<=0)throw Error('Invalid native object size/address');
      const end=p.add(n);
      if(end.compare(p)<=0)throw Error('Native address overflow');
      for(const r of ranges)if(p.compare(r.base)>=0&&end.compare(r.end)<=0){counters.hits++;return p;}
      counters.queries++;
      const r=query(p);
      if(!r||!r.protection.includes('w')||p.compare(r.base)<0||end.compare(r.base.add(r.size))>0)
        throw Error('Invalid native object range');
      if(ranges.length>=capacity)ranges.shift();
      ranges.push({base:r.base,end:r.base.add(r.size)});
      return p;
    },
    stats(){return {...counters,cachedRanges:ranges.length};}
  };
}
function createNativePhase3(base) {
  // Derived from this build's Lua wrappers, guarded before any additional hook.
  const signatures=[
    [0x189b7e0,[0x48,0x8b,0xc4,0x55,0x56,0x57,0x41,0x54,0x41,0x55,0x41,0x56]],
    [0x1795980,[0x4c,0x89,0x4c,0x24,0x20,0x44,0x89,0x44,0x24,0x18,0x55,0x53]],
    [0x3e3170,[0x40,0x57,0x48,0x83,0xec,0x30,0x48,0xc7,0x44,0x24,0x20,0xfe]],
    [0x3c5b20,[0x40,0x57,0x48,0x83,0xec,0x40,0x44,0x0f,0xb6,0x02]],
    [0x1753f80,[0x40,0x53,0x48,0x83,0xec,0x30,0x0f,0xb6,0x81,0x60,0x12]],
    [0x6498b2,[0x41,0x8b,0x97,0x7c,0x0c,0x00,0x00]],
    [0x649eee,[0x49,0x8d,0x87,0x78,0x0c,0x00,0x00]],
    [0x5db5d0,[72,137,76,36,8,87,72,131,236,48,72,199]],
    [0x5e1860,[64,83,86,87,65,84,65,85,65,86,65,87]],
    [0x5e17b0,[64,87,72,131,236,48,72,199,68,36,32,254]],
    [0x18d12f0,[72,137,92,36,8,87,72,131,236,32,72,139]],
    [0x1762da0,[64,83,72,131,236,32,246,129,98,18,0,0]]
  ];
  for(const [rva,bytes]of signatures)for(let i=0;i<bytes.length;i++)
    if(base.add(rva+i).readU8()!==bytes[i])throw Error('Unsupported phase3 native code '+rva.toString(16));
  const makeStateClosure=new NativeFunction(base.add(0x3e3170),'pointer',['pointer']);
  const enqueueState=new NativeFunction(base.add(0x1795980),'void',['pointer','pointer','int','pointer']);
  const inputEntry=new NativeFunction(base.add(0x3c5b20),'pointer',['pointer','pointer']);
  const refreshX=new NativeFunction(base.add(0x1753f80),'void',['pointer']);
  const user32=Process.getModuleByName('user32.dll');
  const getKey=new NativeFunction(user32.getExportByName('GetAsyncKeyState'),'int16',['int']);
  const foregroundWindow=new NativeFunction(user32.getExportByName('GetForegroundWindow'),'pointer',[]);
  const windowProcess=new NativeFunction(user32.getExportByName('GetWindowThreadProcessId'),'uint32',['pointer','pointer']);
  const pidBuffer=Memory.alloc(4),keyBuffer=Memory.alloc(8);
  const names=new Map();
  const ranges=createScopedRangeValidator(p=>Process.findRangeByAddress(p));
  let resourceScope=null,stateCache=null,stateScans=0,frameHook=null;
  let activeScene=null,installed=false,faulted=false,wanted=false;
  let fredSession=null,fredNative=null;
  function clearCaches(){ranges.clear();resourceScope=null;stateCache=null;}
  function stdString(text) {
    const p=Memory.alloc(32);
    p.writeByteArray(new Uint8Array(32));
    if(text.length<16){p.writeUtf8String(text);p.add(24).writeU64(15);}
    else {p.writePointer(Memory.allocUtf8String(text));p.add(24).writeU64(text.length);}
    p.add(16).writeU64(text.length);
    return p;
  }
  function readString(p) {
    const n=p.add(16).readU64().toNumber(),cap=p.add(24).readU64().toNumber();
    if(n>128||cap<n)throw Error('Invalid native string');
    return(cap>=16?p.readPointer():p).readUtf8String(n);
  }
  function safe(p,n) {
    return ranges.check(p,n);
  }
  function states(actor) {
    const data=actor.add(0xc50).readPointer();
    safe(data,0xd98);
    const begin=data.add(0xd88).readPointer(),end=data.add(0xd90).readPointer();
    const count=end.sub(begin).toInt32()/8;
    if(!Number.isInteger(count)||count<1||count>4096)throw Error('Invalid state list');
    const key=data.toString()+':'+begin.toString()+':'+end.toString();
    if(stateCache&&stateCache.key===key)return stateCache.value;
    stateScans++;
    const result=new Map();
    for(let i=0;i<count;i++){
      const state=begin.add(i*8).readPointer();
      if(!state.isNull())result.set(readString(state.add(0x10)),state);
    }
    stateCache={key,value:result};return result;
  }
  function modeAllowed(scene) {
    const mode=scene.add(0x2028).readPointer(),type=scene.add(0x9e4).readU32();
    return !mode.isNull()&&(type===0||(type===10&&mode.add(0x1e8).readU8()===1));
  }
  function snapshot(scene) {
    if(!scene||scene.isNull())return null;
    if(!base.add(0x2b0d1e8).readPointer().equals(scene))return null;
    if(!modeAllowed(scene)||readString(scene.add(0x20d0))!=='uni')return null;
    const slot=scene.add(0xaa8).readS32();if(slot<0||slot>2)return null;
    const actor=scene.add(0xae0+slot*8).readPointer();
    const opponentSlot=scene.add(0xab4).readS32();if(opponentSlot<3||opponentSlot>5)return null;
    const opponent=scene.add(0xae0+opponentSlot*8).readPointer();
    const manager=scene.add(0x2f8).readPointer();
    if(actor.isNull()||opponent.isNull()||manager.isNull())return null;
    // Still re-read scene, whitelist, slots and object identities on EVERY frame.
    // Expensive region queries occur on generation changes/cache misses only.
    if(ranges.setScope(scene.toString()+':'+actor.toString()+':'+opponent.toString()+':'+manager.toString())){
      resourceScope=null;stateCache=null;
    }
    safe(actor,0x14a0);
    if(actor.add(0x88).readFloat()!==1)return null;
    const data=actor.add(0xc50).readPointer();
    if(data.isNull())return null;
    if(resourceScope!==null&&!data.equals(resourceScope)){
      clearCaches();ranges.setScope(scene.toString()+':'+actor.toString()+':'+opponent.toString()+':'+manager.toString());
      safe(actor,0x14a0);
    }
    resourceScope=data;
    safe(opponent,0x14a0);safe(manager,0x658);safe(data,0xd98);
    if(readString(data.add(0xb40))!=='Uni')return null;
    const state=actor.add(0xc58).readPointer();if(state.isNull())return null;safe(state,0x30);
    return {identity:scene.toString()+':'+actor.toString(),scene,actor,manager,
      state:readString(state.add(0x10)),hp:actor.add(0x120).readFloat(),opponentHp:opponent.add(0x120).readFloat(),
      x:actor.add(0xc78).readS32(),y:actor.add(0xc7c).readS32(),
      originalBoss:(actor.add(0x590).readU32()&0x08000000)!==0};
  }
  // Exact writes from setXPos/setYPos wrappers: integer physical position,
  // floating synchronized position, public slots; refreshX synchronizes previous/render state.
  function position(actor,x,y) {
    safe(actor,0x14a0);x=Math.round(x);y=Math.round(y);
    const oldY=actor.add(0xc7c).readS32();
    actor.add(0xc78).writeS32(x);actor.add(0xc7c).writeS32(oldY);
    actor.add(0xc70).writeFloat(x);actor.add(0xc74).writeFloat(oldY);
    actor.add(0x330).writeFloat(x);actor.add(0x334).writeFloat(oldY);
    refreshX(actor);
    actor.add(0xc7c).writeS32(y);actor.add(0xc74).writeFloat(y);actor.add(0x334).writeFloat(y);
  }
  function pool(s){
    const begin=s.scene.add(0xa68).readPointer(),end=s.scene.add(0xa70).readPointer();
    const count=end.sub(begin).toInt32()/0x14a0;
    if(!Number.isInteger(count)||count<0||count>4096)throw Error('Invalid sprite pool');
    const list=[];
    for(let i=0;i<count;i++){
      const actor=begin.add(i*0x14a0);
      if((actor.add(0x1262).readU8()&0x40)===0)list.push(actor);
    }
    return list;
  }
  function owned(s,actor,list){
    // Follow only live pool members; never follow an arbitrary stale parent.
    for(let depth=0;depth<16;depth++){
      const parent=actor.add(0xb30).readPointer();
      if(parent.equals(s.actor))return true;
      if(parent.equals(actor)||!list.some(p=>p.equals(parent)))return false;
      actor=parent;
    }
    return false;
  }
  function fred(s){
    const list=pool(s),found=[];
    for(const actor of list){
      if(actor.equals(s.actor)||!owned(s,actor,list))continue;
      const data=actor.add(0xc50).readPointer();
      if(data.isNull()||readString(data.add(0xb40))!=='FredBoss')continue;
      safe(actor,0x14a0);
      found.push({actor,manager:s.manager,scene:s.scene,
        state:readString(actor.add(0xc58).readPointer().add(0x10))});
    }
    if(found.length>1)throw Error('Ambiguous P1 Fred ownership; refusing command');
    return found[0]||null;
  }
  function queueState(s,name){
    if(!states(s.actor).has(name))throw Error('State not present: '+name);
    if(!names.has(name))names.set(name,stdString(name));
    const closure=makeStateClosure(names.get(name));
    if(closure.isNull())throw Error('Native state closure allocation failed');
    const fn=Memory.alloc(0x40);fn.writeByteArray(new Uint8Array(0x40));fn.add(0x38).writePointer(closure);
    enqueueState(s.manager,s.actor,0,fn);
  }
  function captureEffects(s){
    return {identity:s.identity,data:s.actor.add(0xc50).readPointer(),
      flags:s.actor.add(0x590).readU32(),slot10:s.actor.add(0x40c).readFloat()};
  }
  function restoreEffects(s,saved,options){
    const current=snapshot(s.scene);
    if(!current||current.identity!==saved.identity||!s.actor.add(0xc50).readPointer().equals(saved.data))
      throw Error('Effect generation changed; no stale recovery writes');
    // Restore ONLY experimentally observed vortex bits 26/28. Preserve flag27,
    // damage flags and all unrelated bits. Summon latch13/timer only on full cleanup.
    const mask=0x14000000|(options.fred?0x2000:0),field=s.actor.add(0x590),now=field.readU32();
    field.writeU32(((now&~mask)|(saved.flags&mask))>>>0);
    if(options.fred)s.actor.add(0x40c).writeFloat(saved.slot10);
  }
  function resetSummon(s){
    // Original story explicitly resets slot10 and flag13 between Fred phases.
    // Only used for this P1 when no live owned Fred exists; never touch P2.
    s.actor.add(0x40c).writeFloat(0);
    const f=s.actor.add(0x590);f.writeU32((f.readU32()&~0x2000)>>>0);
    fredSession.cleaned=false;
  }
  function prepareFred(s){
    if(fred(s))throw Error('Cannot reset summon latch while owned Fred is alive');
    const collision=s.scene.add(0x1b18).readPointer();safe(collision,0x70);
    const vector=collision.add(0x58),begin=vector.readPointer(),end=vector.add(8).readPointer();
    const count=end.sub(begin).toInt32()/0x190;
    if(!Number.isInteger(count)||count<1||count>2048)throw Error('Unsupported ordinary stage barrier list');
    if(fredSession&&fredSession.identity===s.identity&&fredSession.collision.equals(collision)&&count>=fredSession.end){resetSummon(s);return;}
    if(!fredNative)fredNative={
      init:new NativeFunction(base.add(0x5db5d0),'pointer',['pointer']),
      grow:new NativeFunction(base.add(0x5e1860),'pointer',['pointer','pointer','pointer']),
      move:new NativeFunction(base.add(0x5e17b0),'pointer',['pointer','pointer','pointer']),
      destroy:new NativeFunction(base.add(0x18d12f0),'void',['pointer']),
      remove:new NativeFunction(base.add(0x1762da0),'void',['pointer'])
    };
    // Mirror declareReservedSemiSolidBarriers, but APPEND to the existing world.
    // Use engine move/allocator/destructor, never hand Frida-owned storage to a native free.
    fredSession={identity:s.identity,collision,start:count,end:count};
    for(let i=0;i<10;i++){
      const temp=Memory.alloc(0x190);temp.writeByteArray(new Uint8Array(0x190));
      temp.add(0x10).writeU32(2);temp.add(0x14).writeU8(0);temp.add(0x15).writeU8(1);
      temp.add(0x30).writeU64(15);fredNative.init(temp.add(0x58));
      try{
        // Native barriers use zero-based +0x48 indices and expose 1-based IDs.
        temp.add(0x48).writeU32(count+i);
        const at=vector.add(8).readPointer(),cap=vector.add(16).readPointer();
        if(at.compare(cap)>0)throw Error('Invalid barrier capacity');
        if(at.equals(cap))fredNative.grow(vector,at,temp);
        else{fredNative.move(ptr(0),at,temp);vector.add(8).writePointer(at.add(0x190));}
        fredSession.end++;
      }finally{fredNative.destroy(temp);}
    }
    send({event:'phase3_fred_prepared',added:10,originalBarriers:count});
    resetSummon(s);
  }
  function cleanupFred(s){
    if(!fredSession||fredSession.identity!==s.identity||fredSession.cleaned)return;
    const f=fred(s),list=pool(s);
    if(f){
      // Child-first snapshot; re-check liveness because native remove runs exit handlers.
      const children=list.filter(p=>!p.equals(f.actor)&&owned({actor:f.actor},p,list));
      for(const p of children.reverse())if((p.add(0x1262).readU8()&0x40)===0)fredNative.remove(p);
      if((f.actor.add(0x1262).readU8()&0x40)===0)fredNative.remove(f.actor);
    }
    const collision=s.scene.add(0x1b18).readPointer();
    if(!collision.equals(fredSession.collision))return;
    const begin=collision.add(0x58).readPointer(),end=collision.add(0x60).readPointer();
    const count=end.sub(begin).toInt32()/0x190;
    if(!Number.isInteger(count)||count<fredSession.end)return;
    for(let i=fredSession.start;i<fredSession.end;i++){
      const id=i+1;
      // Do not disable a slot now claimed by a different live object.
      if(pool(s).some(p=>p.add(0x1244).readU32()===id))continue;
      begin.add(i*0x190+0x14).writeU8(0);
    }
    fredSession.cleaned=true;send({event:'phase3_fred_cleaned'});
  }
  const controller=createPhase3Controller({
    emit:send,
    prepareFred,fred,cleanupFred,captureEffects,restoreEffects,
    fredState(s,name){const f=fred(s);if(!f)return false;queueState(f,name);return true;},
    hasStates(s,list){const found=states(s.actor);return list.every(x=>found.has(x));},
    state(s,name) {
      queueState(s,name);
    },
    accept(s,value){
      keyBuffer.writePointer(s.actor);
      const entry=inputEntry(s.manager.add(0x188),keyBuffer);
      const old=entry.add(0x28).readU8()!==0;
      entry.add(0x28).writeU8(value?1:0);return old;
    },
    boss(s,value){const f=s.actor.add(0x590),old=f.readU32();f.writeU32(value?(old|0x08000000)>>>0:(old&~0x08000000)>>>0);},
    velocity(s,x,y){s.actor.add(0x324).writeFloat(x);s.actor.add(0x328).writeFloat(y);},
    snap(s,x,y) {
      position(s.actor,x,y);
      const begin=s.scene.add(0xa68).readPointer(),end=s.scene.add(0xa70).readPointer();
      const count=end.sub(begin).toInt32()/0x14a0;
      if(!Number.isInteger(count)||count<0||count>4096)throw Error('Invalid sprite pool');
      const facing=s.actor.add(0xfc).readFloat();if(facing!==1&&facing!==-1)throw Error('Invalid facing direction');
      for(let i=0;i<count;i++){
        const child=begin.add(i*0x14a0);
        if((child.add(0x1262).readU8()&0x40)!==0||child.equals(s.actor)||!child.add(0xb30).readPointer().equals(s.actor))continue;
        const data=child.add(0xc50).readPointer();if(data.isNull())continue;
        if(readString(data.add(0xb40))==='Book')position(child,x+facing*150,y+50);
      }
      // Do not install the story cinematic camera or alter ordinary match stage/barriers.
    }
  });
  function deactivate(){activeScene=null;controller.invalidate();clearCaches();}
  function detachFrameHook(){if(frameHook){frameHook.detach();frameHook=null;}}
  function installFrameHook(){
    if(!installed||frameHook||!wanted)return;
    frameHook=Interceptor.attach(base.add(0x189b7e0),{
      onEnter(args){
        this.step=!!activeScene&&(args[1].toInt32()&255)===1;
        if(this.step)this.scene=args[0];
      },
      onLeave(){
        if(!activeScene||!this.step||!this.scene.equals(activeScene))return;
        try {
          const s=snapshot(activeScene);
          let focused=false;
          const window=foregroundWindow();
          if(!window.isNull()){windowProcess(window,pidBuffer);focused=pidBuffer.readU32()===Process.id;}
          const keys={};if(focused){
            for(const k of ['O','P','Y','W','A','S','D','I','J','K','L'])keys[k]=(getKey(k.charCodeAt(0))&0x8000)!==0;
            keys.SHIFT=(getKey(0x10)&0x8000)!==0;keys.CONTROL=(getKey(0x11)&0x8000)!==0;
          }
          controller.tick(s,keys,focused);
          if(!s||(!wanted&&!controller.status().flying))deactivate();
          if(!wanted&&!controller.status().flying)detachFrameHook();
        }catch(error){
          if(!faulted)send({event:'phase3_error',message:String(error)});
          faulted=true;wanted=false;controller.shutdown();
          // One recovery attempt only. Exceptions never create an endless frame loop.
          try{controller.tick(snapshot(activeScene),{},false);}
          catch(recoveryError){controller.failClosed();send({event:'phase3_cleanup_warning',message:'Recovery failed; restart game: '+String(recoveryError)});}
          deactivate();detachFrameHook();
        }
      }
    });
  }
  return {
    configure(value){
      if(faulted&&value.phase3)throw Error('Native adapter faulted; restart game and reconnect');
      wanted=value.phase3===true;controller.configure(value);
      if(wanted)installFrameHook();
      else if(!controller.status().flying){deactivate();detachFrameHook();}
    },
    arm(scene){clearCaches();activeScene=scene;const s=snapshot(scene);controller.arm(s);faulted=false;},
    invalidate(){
      try{if(activeScene)controller.beforeReset(snapshot(activeScene));}
      catch(error){controller.failClosed();faulted=true;wanted=false;detachFrameHook();send({event:'phase3_cleanup_warning',message:'Round cleanup unavailable; restart game: '+String(error)});}
      finally{deactivate();}
    },
    inspect(scene){const s=snapshot(scene);return s?{identity:s.identity,state:s.state,hp:s.hp,opponentHp:s.opponentHp,
      requiredStates:['Flight_Start','Flight_N_BG','HomingSparkCast','Stand'].map(n=>({name:n,present:states(s.actor).has(n)}))}:null;},
    diagnostics(){return {...ranges.stats(),stateScans,active:!!activeScene,frameHook:!!frameHook};},
    shutdown(){wanted=false;const result=controller.shutdown();if(!result.pending){deactivate();detachFrameHook();}return result;},
    install(){
      if(installed)return;installed=true;installFrameHook();
    }
  };
}
if(typeof module!=='undefined')module.exports={createScopedRangeValidator,createNativePhase3};
