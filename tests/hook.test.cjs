const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'training-hook.js'), 'utf8');

function harness({fightType=0, training=0, p1='cow', p2='velvet', caller='0x1773b84', badSignature=false}={}) {
  const base=0x10000000n, scene=0x20000000n, mode=0x30000000n;
  const bytes=new Map(), values=new Map(), strings=new Map(), messages=[], writes=[];
  let hook;
  class Pointer {
    constructor(value) { this.value=BigInt(value); }
    add(offset) { return new Pointer(this.value+BigInt(offset)); }
    sub(other) { return new Pointer(this.value-other.value); }
    toString() { return '0x'+this.value.toString(16); }
    readU8() { if(!bytes.has(this.value)) throw new Error('Unreadable byte'); return bytes.get(this.value); }
    readU32() { return values.get(this.value); }
    readU64() { return {toNumber:()=>values.get(this.value)}; }
    readPointer() { return new Pointer(values.get(this.value)); }
    readUtf8String(length) { return strings.get(this.value).slice(0,length); }
    writeS32(value) { writes.push({address:this.value,value});values.set(this.value,value); }
  }
  function setString(address,text) {
    strings.set(address,text);values.set(address+16n,text.length);values.set(address+24n,15);
  }
  function signature(rva,arr) { arr.forEach((v,i)=>bytes.set(base+BigInt(rva+i),v)); }
  signature(0x8fbb0,[0x48,0x89,0x5c,0x24,0x10,0x48,0x89,0x6c,0x24,0x18]);
  signature(0x1772f40,[0x40,0x55,0x56,0x57,0x41,0x54,0x41,0x55,0x41,0x56,0x41,0x57]);
  if(badSignature) bytes.set(base+0x1772f40n,0);
  values.set(scene+0x2028n,mode);bytes.set(mode+0x1e8n,training);
  values.set(scene+0x9e4n,fightType);values.set(scene+0x2368n,7);
  setString(scene+0x20d0n,p1);setString(scene+0x2130n,p2);
  const context={
    ptr:value=>new Pointer(value),
    NativeFunction:function(address,returnType,args) {
      assert.equal(address.value,base+0x8fbb0n);
      return (destination,src,length)=>{
        writes.push({address:destination.value,value:strings.get(src.value)});
        setString(destination.value,strings.get(src.value).slice(0,length));
      };
    },
    Memory:{allocUtf8String(text) { const p=new Pointer(0x40000000n);strings.set(p.value,text);return p; }},
    Interceptor:{attach(address,callbacks) { assert.equal(address.value,base+0x1772f40n);hook=callbacks; }},
    send:message=>messages.push(message),
  };
  vm.createContext(context);
  return {
    start() { vm.runInContext(source.replace('__BASE__','0x10000000'),context); },
    load() { hook.onEnter.call({returnAddress:new Pointer(base+BigInt(caller))},[new Pointer(scene)]); },
    get p1(){return strings.get(scene+0x20d0n);},get p2(){return strings.get(scene+0x2130n);},
    get palette(){return values.get(scene+0x2368n);},get attached(){return !!hook;},messages,writes,
  };
}

for(const training of [0,1]) test(`local match replaces only P1 (training=${training})`,()=>{
  const h=harness({training});h.start();h.load();
  assert.equal(h.p1,'bscout');assert.equal(h.p2,'velvet');assert.equal(h.palette,0);
  assert.equal(h.writes.length,2);assert.equal(h.messages.at(-1).event,'replaced');
});
test('all nonlocal types are skipped, including network 1/11 even with training flag',()=>{
  for(let fightType=1;fightType<=16;fightType++) for(const training of [0,1]){
    const h=harness({fightType,training});h.start();h.load();
    assert.equal(h.p1,'cow');assert.equal(h.p2,'velvet');assert.equal(h.writes.length,0);
  }
});
test('other P1 characters and unrecognized callers are untouched',()=>{
  for(const p1 of ['velvet','bscout','Cow','']){
    const h=harness({p1});h.start();h.load();assert.equal(h.p1,p1);assert.equal(h.writes.length,0);
  }
  const h=harness({caller:'0x172d290'});h.start();h.load();assert.equal(h.writes.length,0);
});
test('P2 Arizona is not converted',()=>{
  const h=harness({p1:'velvet',p2:'cow'});h.start();h.load();assert.equal(h.p2,'cow');assert.equal(h.writes.length,0);
});
test('mismatched function bytes refuse attachment',()=>{
  const h=harness({badSignature:true});assert.throws(()=>h.start(),/Unsupported game code/);assert.equal(h.attached,false);
});
test('repeated loading does not rewrite an already converted bear',()=>{
  const h=harness();h.start();h.load();h.load();assert.equal(h.writes.length,2);assert.equal(h.p1,'bscout');
});
