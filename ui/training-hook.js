'use strict';
const base = ptr('__BASE__');
let options = {bear:true, boss:false, phase3:false};
rpc.exports = {
  configure(value) {
    if (!value || typeof value.bear !== 'boolean' || typeof value.boss !== 'boolean')
      throw new Error('Expected boolean bear and boss options');
    if(value.phase3!==undefined && typeof value.phase3!=='boolean')throw new Error('Expected boolean phase3');
    for(const name of ['tianFred','tianNova','papBoss','velvetBoss'])if(value[name]!==undefined&&typeof value[name]!=='boolean')throw Error('Expected boolean '+name);
    if(value.tianNova)throw Error('Supernova is pending validation and cannot be enabled');
    options = {bear:value.bear, boss:value.boss, phase3:value.phase3===true,tianFred:value.tianFred===true,tianNova:false,papBoss:value.papBoss===true,velvetBoss:value.velvetBoss===true};
    phase3.configure(options);
    tianSummons.configure(options);
    bossExtras.configure(options);
    send({event:'configured', ...options});
    return {...options};
  },
  shutdown(){const a=phase3.shutdown(),b=tianSummons.shutdown(),c=bossExtras.shutdown();return{pending:a.pending||b.pending||c.pending,pendingModules:[...(a.pending?['phase3']:[]),...(b.pending?['tian']:[]),...(c.pending?['bossExtras']:[])]};},
  diagnostics(){return{...phase3.diagnostics(),tianSummons:tianSummons.diagnostics()};}
};
function shouldReplace(fightType, training, name, callerRva) {
  // 0: local versus/CPU; 10 with training=1: observed native training flow.
  const offline = fightType === 0 || (fightType === 10 && training === 1);
  return options.bear && offline && name === 'cow' && callerRva === '0x1773b84';
}
function readString(p) {
  const length = p.add(16).readU64().toNumber();
  const capacity = p.add(24).readU64().toNumber();
  if (length > 128 || capacity < length) throw new Error('Invalid string layout');
  return (capacity >= 16 ? p.readPointer() : p).readUtf8String(length);
}
const assign = new NativeFunction(base.add(0x8fbb0), 'pointer', ['pointer', 'pointer', 'uint64']);
const bear = Memory.allocUtf8String('bscout');
const assignSignature = [0x48, 0x89, 0x5c, 0x24, 0x10, 0x48, 0x89, 0x6c, 0x24, 0x18];
assignSignature.forEach((b,i) => { if (base.add(0x8fbb0+i).readU8() !== b)
  throw new Error('Unsupported string function; no hook installed'); });
const expected = [0x40, 0x55, 0x56, 0x57, 0x41, 0x54, 0x41, 0x55, 0x41, 0x56, 0x41, 0x57];
// Match this build's function prologue before installing any hook.
// Actual signature below comes from the saved, normally loaded game image.
expected.forEach((b,i) => { if (base.add(0x1772f40+i).readU8() !== b)
  throw new Error('Unsupported game code; no hook installed'); });
// Saved normally-loaded image: outer reset completes all actor initialization.
const resetSignature = [0x4c,0x89,0x44,0x24,0x18,0x88,0x54,0x24,0x10];
resetSignature.forEach((b,i) => { if (base.add(0x1773720+i).readU8() !== b)
  throw new Error('Unsupported reset function; no hook installed'); });
// Native Lua flag getter reads [sprite + 0x590 + 4*(index/32)].
// Native setter 0x1780f40 uses the same layout. Check its implementation too.
const flagSignature = [0x8b,0xc2,0x4c,0x8b,0xd1,0x99,0x83,0xe2,0x1f];
flagSignature.forEach((b,i) => { if (base.add(0x1780f40+i).readU8() !== b)
  throw new Error('Unsupported flag function; no hook installed'); });
const resets = new Map();
const phase3=createNativePhase3(base);
const tianSummons=typeof createTianhuoSummons==='function'?createTianhuoSummons(base):{
 configure(value){if(value.tianFred)throw Error('Tianhuo summon adapter missing');},beforeReset(){},shutdown(){return{pending:false};},diagnostics(){return{};}
};
const bossExtras=typeof createBossExtras==='function'?createBossExtras(base):{
 configure(value){if(value.papBoss||value.velvetBoss)throw Error('Boss extras module missing');},beforeReset(){},shutdown(){return{pending:false};}
};
phase3.configure(options);
tianSummons.configure(options);
bossExtras.configure(options);
function offlineMode(scene) {
  const mode = scene.add(0x2028).readPointer();
  if (mode.isNull()) return false;
  const type = scene.add(0x9e4).readU32();
  return type === 0 || (type === 10 && mode.add(0x1e8).readU8() === 1);
}
function applyBoss(scene) {
  if (!(options.boss||options.phase3) || !offlineMode(scene) || readString(scene.add(0x20d0)) !== 'uni') return;
  const slot = scene.add(0xaa8).readS32();
  if (slot < 0 || slot > 2) throw new Error('P1 slot outside team: '+slot);
  const sprite = scene.add(0xae0+slot*8).readPointer();
  if (sprite.isNull()) throw new Error('P1 sprite not ready');
  const field = sprite.add(0x590);
  const range = Process.findRangeByAddress(field);
  if (!range || !range.protection.includes('w') ||
      field.add(4).compare(range.base.add(range.size)) > 0)
    throw new Error('P1 flag memory not writable');
  // Native reset assigns team 1 to P1. Reject a mismatched actor.
  if (sprite.add(0x88).readFloat() !== 1) throw new Error('P1 actor team mismatch');
  const before = field.readU32();
  const after = (before | 0x08000000) >>> 0;
  if (before !== after) field.writeU32(after);
  if (field.readU32() !== after) throw new Error('flag27 readback failed');
  send({event:'boss_applied', player:1, character:'uni', flag:27,
        before, after, slot, sprite:sprite.toString(), experimental:true});
}
Interceptor.attach(base.add(0x1773720), {
  onEnter(args) {
    tianSummons.beforeReset(args[0]);
    bossExtras.beforeReset(args[0]);
    phase3.invalidate();
    this.bossFrame = {scene:args[0], armed:false};
    this.previous = resets.get(this.threadId);
    resets.set(this.threadId, this.bossFrame);
  },
  onLeave() {
    try { if (this.bossFrame.armed) {
      if(options.phase3)phase3.arm(this.bossFrame.scene);
      applyBoss(this.bossFrame.scene);
    } }
    catch (e) { send({event:'error', message:'Boss skipped: '+String(e)}); }
    finally {
      if (this.previous) resets.set(this.threadId,this.previous);
      else resets.delete(this.threadId);
    }
  }
});
Interceptor.attach(base.add(0x1772f40), {
  onEnter(args) {
    try {
      const scene = args[0];
      const mode = scene.add(0x2028).readPointer();
      const training = mode.add(0x1e8).readU8();
      const fightType = scene.add(0x9e4).readU32();
      const p1 = scene.add(0x20d0);
      const before = readString(p1);
      const frame = resets.get(this.threadId);
      if ((options.boss||options.phase3) && frame && frame.scene.equals(scene) && before === 'uni' && offlineMode(scene) &&
          this.returnAddress.sub(base).toString() === '0x1773b84') frame.armed = true;
      const opponent = readString(scene.add(0x2130));
      send({event:'loading', fightType, training, player1:before, player2:opponent,
            caller:this.returnAddress.sub(base).toString()});
      if (!shouldReplace(fightType, training, before, this.returnAddress.sub(base).toString())) return;
      assign(p1, bear, 6);
      // Only palette 0 is known to exist for this boss.
      scene.add(0x2368).writeS32(0);
      send({event:'replaced', fightType, training, player1:readString(p1), player2:opponent});
    } catch (e) { send({event:'error', message:String(e)}); }
  }
});
phase3.install();
send({event:'ready', version:'2.5.1-experimental', scope:'OFFLINE P1; Velvet/Paprika local CPU, local versus and free training; Tianhuo Fred requires P2 Oleander; Supernova disabled; U untouched'});
