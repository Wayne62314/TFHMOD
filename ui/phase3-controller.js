'use strict';
function createPhase3Controller(api) {
  let armed=null,flight=null,pending=null,frame=0,cooldown=0,lastKeys={};
  let enabled=false,ordinary=false,stopped=false,cleanupFailed=false,request=null;
  const emit=(event,extra={})=>api.emit({event,...extra});
  const same=s=>armed&&s&&s.identity===armed.identity;
  const blocked=s=>!s||/Intro|Win|Lose|Death|Dead|KO|Exit/i.test(s.state);
  function attempt(errors,name,fn){try{fn();}catch(e){errors.push(name+': '+String(e));}}
  function clean(s,f,errors){
    if(api.cleanupFred)attempt(errors,'Fred cleanup',()=>api.cleanupFred(s));
    if(f.effects&&api.restoreEffects&&(f.fredTouched||f.vortexTouched))
      attempt(errors,'effect recovery',()=>api.restoreEffects(s,f.effects,{fred:f.fredTouched}));
  }
  function report(errors,reason){
    if(errors.length){cleanupFailed=true;emit('phase3_cleanup_warning',{reason,errors,message:'Cleanup incomplete; restart game before continuing'});}
    return errors.length===0;
  }
  function restore(s,reason){
    if(!flight){request=null;return;}
    // Consume restoration BEFORE native calls: an exception cannot retry forever.
    const f=flight;flight=null;pending=null;request=null;lastKeys={};
    const errors=[];
    if(same(s)){
      attempt(errors,'input recovery',()=>api.accept(s,f.previousAccept));
      clean(s,f,errors);
      attempt(errors,'position recovery',()=>api.snap(s,f.homeX,f.floor));
      attempt(errors,'velocity recovery',()=>api.velocity(s,0,0));
      if(s.hp>0&&!blocked(s))attempt(errors,'stand recovery',()=>api.state(s,'Stand'));
      attempt(errors,'boss recovery',()=>api.boss(s,ordinary||armed.originalBoss));
    }else errors.push('Object generation changed; no stale writes attempted');
    emit('phase3_restored',{reason,complete:report(errors,reason)});
  }
  function finishVortex(s){
    if(pending.effects&&api.restoreEffects)api.restoreEffects(s,pending.effects,{fred:false});
    pending=null;api.state(s,'Flight_N_BG');emit('phase3_vortex_finished');
  }
  return {
    configure(value){enabled=value.phase3;ordinary=value.boss;},
    arm(s){armed=enabled&&!cleanupFailed?s:null;flight=null;pending=null;request=null;lastKeys={};cooldown=0;
      if(armed)emit('phase3_armed',{scope:'P1 offline; queued summon; bounded vortex recovery'});},
    invalidate(){armed=null;flight=null;pending=null;request=null;lastKeys={};},
    beforeReset(s){
      const f=flight,errors=[];
      if(f&&same(s)){
        attempt(errors,'input recovery',()=>api.accept(s,f.previousAccept));clean(s,f,errors);
      }else if(f)errors.push('Round objects already unavailable; stale writes skipped');
      report(errors,'round-reset');this.invalidate();
    },
    shutdown(){stopped=true;enabled=false;request=null;return {pending:!!flight||cleanupFailed};},
    failClosed(){if(flight)cleanupFailed=true;this.invalidate();stopped=true;enabled=false;},
    status(){return {armed:!!armed,flying:!!flight,enabled,stopped,cleanupFailed,queuedSummon:!!request,pending:pending&&pending.kind};},
    tick(s,keys={},foreground=true){
      frame++;
      if(!same(s)){if(flight){cleanupFailed=true;emit('phase3_cleanup_warning',{message:'Scene changed; stale writes skipped. Restart game.'});}this.invalidate();return;}
      if(!enabled||stopped){restore(s,stopped?'shutdown':'disabled');return;}
      if(s.hp<=0||s.opponentHp<=0||blocked(s)){restore(s,'round-end');lastKeys={};return;}
      const current=foreground?keys:{},pressed=k=>!!current[k]&&!lastKeys[k];
      const reset=pressed('Y'),toggle=pressed('O');
      // Capture I regardless of cooldown/startup. One expiring request, never autorepeat.
      if(pressed('I')){
        if(!flight)emit('phase3_notice',{message:'Press O to enter flight before summoning'});
        else if(!request&&(!pending||pending.kind!=='summon')){
          request={expires:frame+300};emit('phase3_summon_queued');
        }else emit('phase3_notice',{message:'A summon request is already pending'});
      }
      if(!foreground&&request){request=null;emit('phase3_notice',{message:'Summon request cancelled because focus left the game'});}
      const action=pressed('J')?'fred:Attack_'+(current.CONTROL?'AND_':'')+'Left'+(current.SHIFT?'_Strong':''):
        pressed('K')?'fred:Attack_'+(current.CONTROL?'AND_':'')+'Right'+(current.SHIFT?'_Strong':''):
        pressed('L')?'vortex':pressed('P')?'spark':null;
      lastKeys={...current};
      if(reset||(toggle&&flight)){restore(s,'user');return;}
      if(toggle&&!flight&&!cleanupFailed){
        if(!api.hasStates(s,['Flight_Start','Flight_N_BG','HomingSparkCast','Stand'])){emit('phase3_error',{message:'Required flight states missing'});return;}
        const effects=api.captureEffects?api.captureEffects(s):null;
        const previousAccept=api.accept(s,false);
        flight={homeX:s.x,floor:s.y,x:s.x,y:s.y+320,start:frame,previousAccept,ready:false,effects,fredTouched:false,vortexTouched:false};
        try{api.boss(s,true);api.state(s,'Flight_Start');}
        catch(e){restore(s,'flight-start-failed');throw e;}
        cooldown=frame+20;emit('phase3_flight',{message:'O/Y restore; I queues summon; U remains pause'});
      }
      if(!flight)return;
      let transitioning=false;
      // Startup state is queued first and receives a full engine tick before any summon.
      if(!flight.ready&&frame-flight.start>=90){flight.ready=true;api.state(s,'Flight_N_BG');transitioning=true;}
      if(pending){
        const age=frame-pending.start;
        if(pending.kind==='summon'&&frame%6===0){
          const f=api.fred(s);
          if(f&&!/Start|Intro/.test(f.state)){pending=null;api.state(s,'Flight_N_BG');transitioning=true;emit('phase3_fred_ready');}
        }else if(pending.kind==='spark'&&age>1&&s.state!=='HomingSparkCast'){
          pending=null;api.state(s,'Flight_N_BG');transitioning=true;
        }else if(pending.kind==='vortex'){
          if(s.state==='DarkVortex_BoomEnd'){
            if(pending.terminalAt===null)pending.terminalAt=frame;
            if(frame-pending.terminalAt>=30){finishVortex(s);transitioning=true;}
          }else if(age>1&&!s.state.startsWith('DarkVortex')){finishVortex(s);transitioning=true;}
        }
        if(pending&&frame-pending.start>(pending.kind==='summon'?600:900)){restore(s,'fred-action-timeout');return;}
      }
      if(request&&frame>request.expires){request=null;emit('phase3_notice',{message:'Summon request expired; press I again when ready'});}
      if(request&&foreground&&flight.ready&&!pending&&!transitioning&&frame>=cooldown&&s.state.startsWith('Flight_')){
        request=null;cooldown=frame+20;
        if(!api.hasStates(s,['FinalFred_Summon']))emit('phase3_notice',{message:'Fred summon state missing'});
        else if(api.fred(s))emit('phase3_notice',{message:'Fred already exists; use J/K'});
        else{
          flight.fredTouched=true;
          // Prepare reinitializes only the confirmed summon latch/timer, with no live Fred.
          api.prepareFred(s);api.state(s,'FinalFred_Summon');pending={kind:'summon',start:frame};emit('phase3_fred_summon');
        }
      }else if(action&&frame>=cooldown&&flight.ready&&!transitioning){
        cooldown=frame+20;
        if(action.startsWith('fred:')&&(!pending||pending.kind==='vortex')){
          const f=api.fred(s),name=action.slice(5);
          if(!f||/Start|Intro|Attack|Exit|End/.test(f.state))emit('phase3_notice',{message:'Fred absent or busy; wait for idle'});
          else if(api.fredState(s,name))emit('phase3_fred_attack',{state:name});
        }else if(action==='vortex'&&!pending){
          const f=api.fred(s);
          if(!f||/Start|Intro/.test(f.state))emit('phase3_notice',{message:'Summon Fred and wait for idle first'});
          else if(api.hasStates(s,['DarkVortex','DarkVortex_Boom','Flight_N_BG'])){
            const effects=api.captureEffects?api.captureEffects(s):null;flight.vortexTouched=true;
            api.state(s,'DarkVortex');pending={kind:'vortex',start:frame,effects,terminalAt:null,released:false};emit('phase3_vortex');
          }
        }else if(action==='vortex'&&pending&&pending.kind==='vortex'&&!pending.released&&frame-pending.start>=30&&/^DarkVortex(?:_Loop\d)?$/.test(s.state)){
          api.state(s,'DarkVortex_Boom');pending.released=true;emit('phase3_vortex_release');
        }else if(action==='spark'&&!pending){
          if(!s.state.startsWith('Flight_'))emit('phase3_notice',{message:'Wait for flight idle before firing'});
          else{api.state(s,'HomingSparkCast');pending={kind:'spark',start:frame};emit('phase3_spark');}
        }else if(pending)emit('phase3_notice',{message:'Wait for the current action to finish; Y cancels safely'});
      }
      if(!flight)return;
      const dx=(current.D?7:0)-(current.A?7:0),dy=(current.W?7:0)-(current.S?7:0);
      flight.x=Math.max(flight.homeX-350,Math.min(flight.homeX+650,flight.x+dx));
      flight.y=Math.max(flight.floor+120,Math.min(flight.floor+550,flight.y+dy));
      api.snap(s,flight.x,flight.y);api.velocity(s,0,0);
    }
  };
}
if(typeof module!=='undefined')module.exports={createPhase3Controller};
