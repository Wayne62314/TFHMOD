'use strict';
const base = ptr('__BASE__');
function shouldReplace(fightType, training, name, callerRva) {
  // 0: local versus/CPU; 10 with training=1: observed native training flow.
  const offline = fightType === 0 || (fightType === 10 && training === 1);
  return offline && name === 'cow' && callerRva === '0x1773b84';
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
Interceptor.attach(base.add(0x1772f40), {
  onEnter(args) {
    try {
      const scene = args[0];
      const mode = scene.add(0x2028).readPointer();
      const training = mode.add(0x1e8).readU8();
      const fightType = scene.add(0x9e4).readU32();
      const p1 = scene.add(0x20d0);
      const before = readString(p1);
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
send({event:'ready', version:'2.1.0', scope:'local training / human / CPU matches; P1 cow -> bscout; memory only'});
