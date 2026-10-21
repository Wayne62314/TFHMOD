'use strict';
function tianSummonAllowed(type,training,name,team){return(type===0||(type===10&&training===1))&&name==='Tianhuo'&&team===1;}
function createTianSummonGate(){
 let down=false,released=false,cooldown=0;
 return {
  tick({focused,pressed,enabled,idle,active}){
   if(cooldown>0)cooldown--;
   if(!focused||!enabled){down=false;released=false;return false;}
   if(!pressed)released=true;const edge=pressed&&!down&&released;down=pressed;
   return edge&&idle&&!active&&cooldown===0;
  },
  ended(){cooldown=60;released=false;down=false;},
  reset(){down=false;released=false;cooldown=0;}
 };
}
function createTianhuoSummons(base){
 const signatures=[
  [0x189b7e0,[0x48,0x8b,0xc4,0x55,0x56,0x57,0x41,0x54,0x41,0x55,0x41,0x56]],
  [0x17577b0,[0x48,0x8b,0xc4,0x4c,0x89,0x48,0x20,0x4c,0x89,0x40,0x18]],
  [0x1762da0,[0x40,0x53,0x48,0x83,0xec,0x20,0xf6,0x81,0x62,0x12,0,0]]
 ];
 for(const[rva,bytes]of signatures)for(let i=0;i<bytes.length;i++)if(base.add(rva+i).readU8()!==bytes[i])throw Error('Unsupported Tianhuo summon code '+rva.toString(16));
 const create=new NativeFunction(base.add(0x17577b0),'pointer',['pointer','uint16','pointer','pointer','uint8','pointer','pointer']);
 const remove=new NativeFunction(base.add(0x1762da0),'void',['pointer']);
 const user=Process.getModuleByName('user32.dll');
 const key=new NativeFunction(user.getExportByName('GetAsyncKeyState'),'int16',['int']);
 const foreground=new NativeFunction(user.getExportByName('GetForegroundWindow'),'pointer',[]);
 const windowPid=new NativeFunction(user.getExportByName('GetWindowThreadProcessId'),'uint32',['pointer','pointer']);
 const pid=Memory.alloc(4),position=Memory.alloc(8),empty=Memory.alloc(24);empty.writeByteArray(new Uint8Array(24));
 const gate=createTianSummonGate();let wanted=false,hook=null,pending=false,faulted=false,scope=null,lease=null,active=null,frame=0,announced=null;
 function str(p){const n=p.add(16).readU64().toNumber(),c=p.add(24).readU64().toNumber();if(n>128||c<n)throw Error('Bad string');return(c>=16?p.readPointer():p).readUtf8String(n);}
 function snapshot(scene){
  if(!scene||scene.isNull()||!base.add(0x2b0d1e8).readPointer().equals(scene))return null;
  const mode=scene.add(0x2028).readPointer();if(mode.isNull())return null;
  const type=scene.add(0x9e4).readU32(),training=mode.add(0x1e8).readU8();
  if(!(type===0||(type===10&&training===1))||str(scene.add(0x20d0))!=='tianhuo')return null;
  const slot=scene.add(0xaa8).readS32();if(slot<0||slot>2)return null;
  const actor=scene.add(0xae0+slot*8).readPointer();if(actor.isNull())return null;
  const data=actor.add(0xc50).readPointer();if(data.isNull()||!tianSummonAllowed(type,training,str(data.add(0xb40)),actor.add(0x88).readFloat()))return null;
  const state=actor.add(0xc58).readPointer();if(state.isNull())return null;
  const manager=scene.add(0x19e8).readPointer();if(manager.isNull())return null;
  return {scene,actor,data,manager,state:str(state.add(0x10)),pool:scene.add(0xa68).readPointer(),identity:scene.toString()+':'+actor.toString()+':'+data.toString()+':'+actor.add(0x1270).readU64().toString()};
 }
 function actors(s){
  const b=s.scene.add(0xa68).readPointer(),e=s.scene.add(0xa70).readPointer(),n=e.sub(b).toInt32()/0x14a0;
  if(!b.equals(s.pool)||!Number.isInteger(n)||n<0||n>4096)throw Error('Actor pool changed');
  const out=[];for(let i=0;i<n;i++)out.push(b.add(i*0x14a0));return out;
 }
 function live(p){return(p.add(0x1262).readU8()&0x40)===0;}
 function tokenValid(s){return active&&s&&active.identity===s.identity&&active.pool.equals(s.pool)&&active.actor.add(0x1270).readU64().toString()===active.id&&active.actor.add(0xc50).readPointer().equals(active.data);}
 function clean(s){
  if(!active)return;
  if(!tokenValid(s)){active=null;send({event:'tian_warning',message:'Summon generation changed; no stale cleanup. Restart game for a clean baseline.'});return;}
  const all=actors(s),root=active.actor;
  function owned(p){for(let depth=0;depth<16;depth++){const parent=p.add(0xb30).readPointer();if(parent.equals(root))return true;if(parent.equals(p)||!all.some(x=>x.equals(parent)))return false;p=parent;}return false;}
  const children=all.filter(p=>live(p)&&!p.equals(root)&&owned(p));
  for(const p of children.reverse())if(live(p))remove(p);
  if(live(root))remove(root);active=null;gate.ended();send({event:'tian_fred_cleaned'});
 }
 function releaseAsset(){lease=null;} // Borrowed cache entry only; no acquired shared_ptr.
 function reset(s){try{clean(s);}finally{releaseAsset();scope=null;announced=null;gate.reset();}}
 function asset(s){
  if(lease&&lease.manager.equals(s.manager))return lease;
  releaseAsset();
  // No native mid-match resource loader: that path failed validation. Only borrow
  // the asset manager's existing, scene-owned cache entry (P2 ordinary Oleander).
  const map=s.manager.add(0xb0),head=map.add(8).readPointer(),size=map.add(0x10).readU64().toNumber();
  if(size<0||size>512)throw Error('Invalid resource cache');
  let node=head.readPointer(),data=null;
  for(let i=0;i<size&&!node.equals(head);i++,node=node.readPointer())if(str(node.add(0x10))==='uni'){data=node.add(0x30).readPointer();break;}
  if(!data||data.isNull()){send({event:'tian_notice',message:'Normal Oleander resources are not loaded. Set P2 to ordinary Oleander and re-enter the stage.'});return null;}
  if(str(data.add(0xb40))!=='Uni')throw Error('Oleander cache resource mismatch');
  const root=data.add(0xb80).readPointer();if(root.isNull())throw Error('Missing Oleander library');
  const vector=root.add(0xc88).readPointer(),b=vector.readPointer(),e=vector.add(8).readPointer(),n=e.sub(b).toInt32()/8;
  if(!Number.isInteger(n)||n<1||n>1024)throw Error('Bad Oleander library');
  let index=-1,fredData=null;for(let i=0;i<n;i++){const p=b.add(i*8).readPointer();if(!p.isNull()&&str(p.add(0xb40))==='Fred'){if(index!==-1)throw Error('Ambiguous Fred');index=i;fredData=p;}}
  if(index<0||fredData.add(0x104).readFloat()!==0)throw Error('Unsupported ordinary Fred defaults');
  lease={manager:s.manager,data,index,fredData};send({event:'tian_resource_ready',resource:'Uni/Fred',opponentRequired:true});return lease;
 }
 function spawn(s){
  if(actors(s).some(p=>{if(!live(p))return false;const d=p.add(0xc50).readPointer();return !d.isNull()&&['Fred','FredBoss'].includes(str(d.add(0xb40)));})){send({event:'tian_notice',message:'An existing Fred is active; duplicate summon refused.'});return;}
  const end=s.scene.add(0xa70).readPointer(),cap=s.scene.add(0xa78).readPointer();if(cap.sub(end).toInt32()<32*0x14a0)throw Error('Insufficient pool headroom for safe summon');
  const a=asset(s);if(!a)return;position.writeS32(0);position.add(4).writeS32(0);let child;
  try{s.actor.add(0xc50).writePointer(a.data);child=create(s.actor,a.index,ptr(0),position,1,empty,ptr(0));}
  finally{s.actor.add(0xc50).writePointer(s.data);}
  if(child.isNull())throw Error('Fred creation returned null');
  active={actor:child,id:child.add(0x1270).readU64().toString(),data:a.fredData,pool:s.pool,identity:s.identity,start:frame,last:null};
  if(!child.add(0xb30).readPointer().equals(s.actor)||child.add(0x88).readFloat()!==1)throw Error('Fred ownership mismatch');
  send({event:'tian_fred_spawned',resource:str(s.actor.add(0xc50).readPointer().add(0xb40)),team:1,parentIsTianhuo:true});
 }
 function detach(){if(hook){hook.detach();hook=null;}}
 function stopOnThread(s){let complete=true;try{reset(s);}catch(e){complete=false;send({event:'tian_warning',message:'Cleanup incomplete; restart game: '+String(e)});}pending=false;detach();send({event:'tian_summons_restored',complete});}
 function install(){if(hook)return;hook=Interceptor.attach(base.add(0x189b7e0),{
  onEnter(args){this.step=(args[1].toInt32()&255)===1;this.scene=args[0];},
  onLeave(){if(!this.step)return;try{
   const s=snapshot(this.scene);frame++;
   if(pending||!wanted){stopOnThread(s);return;}
   if(!s){if(scope)reset(null);return;}
   if(scope!==s.identity){reset(null);scope=s.identity;}
   if(announced!==s.identity){announced=s.identity;send({event:'tian_summons_ready',key:'F9',cleanup:'Y',ordinaryFred:true});}
   const w=foreground();let focused=false;if(!w.isNull()){windowPid(w,pid);focused=pid.readU32()===Process.id;}
   if(active){
    if(!tokenValid(s))throw Error('Fred actor moved/reused; restart game');
    if(frame-active.start>=600||(focused&&(key(0x59)&0x8000)!==0))clean(s);
    else if(!live(active.actor)){clean(s);}
    else{const st=active.actor.add(0xc58).readPointer();const n=st.isNull()?null:str(st.add(0x10));if(n!==active.last){active.last=n;send({event:'tian_fred_state',state:n});}}
   }
   const pressed=focused&&(key(0x78)&0x8000)!==0;
   if(gate.tick({focused,pressed,enabled:wanted,idle:['Stand','Stand_Flourish'].includes(s.state)&&s.actor.add(0x120).readFloat()>0,active:!!active}))spawn(s);
  }catch(e){faulted=true;wanted=false;pending=true;send({event:'tian_error',message:String(e)});let recovery=null;try{recovery=snapshot(this.scene);}catch(ignored){}stopOnThread(recovery);}}
 });}
 return {
  configure(value){if(value.tianNova)throw Error('Supernova is not validated; this option is disabled');if(faulted&&value.tianFred)throw Error('Tianhuo summon adapter faulted; restart game');wanted=value.tianFred===true;if(wanted){pending=false;install();}else if(hook)pending=true;},
  beforeReset(scene){if(!hook)return;try{reset(snapshot(scene));}catch(e){faulted=true;wanted=false;pending=true;send({event:'tian_warning',message:String(e)});}},
  shutdown(){wanted=false;if(hook){pending=true;return {pending:true};}return{pending:false};},
  diagnostics(){return{active:!!active,pending,frameHook:!!hook,faulted};}
 };
}
if(typeof module!=='undefined')module.exports={tianSummonAllowed,createTianSummonGate};
