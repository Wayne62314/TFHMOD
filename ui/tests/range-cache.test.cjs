const test=require('node:test'),assert=require('node:assert/strict');
const {createScopedRangeValidator}=require('../phase3-native.js');
class P{constructor(n){this.n=n;}isNull(){return this.n===0;}add(n){return new P(this.n+n);}compare(p){return Math.sign(this.n-p.n);}}
test('steady-state checks query once per region, including child addresses',()=>{
 let calls=0;const c=createScopedRangeValidator(()=>{calls++;return{base:new P(0x1000),size:0x1000,protection:'rw-'};});
 c.setScope('scene1:actor1');
 for(let i=0;i<10000;i++){c.check(new P(0x1100),32);c.check(new P(0x1200),64);}
 assert.equal(calls,1);assert.equal(c.stats().hits,19999);
});
test('scope changes and explicit resets cannot reuse a stale validation',()=>{
 let calls=0,write=true;const c=createScopedRangeValidator(()=>{calls++;return{base:new P(0x1000),size:4096,protection:write?'rw-':'r--'};});
 c.setScope('actor1');c.check(new P(0x1100),32);
 write=false;c.setScope('actor2');assert.throws(()=>c.check(new P(0x1100),32),/range/);
 write=true;c.check(new P(0x1100),32);c.clear();c.setScope('actor2');c.check(new P(0x1100),32);
 assert.equal(calls,4);
});
test('null, overflow, invalid sizes, missing ranges, protection and bounds rejected',()=>{
 const c=createScopedRangeValidator(()=>({base:new P(4096),size:4096,protection:'r--'}));
 for(const [p,n]of [[0,4],[4096,0],[4096,-1],[4096,1.5]])assert.throws(()=>c.check(new P(p),n));
 assert.throws(()=>c.check(new P(4096),4),/range/);
 const writable=createScopedRangeValidator(()=>({base:new P(4096),size:4096,protection:'rw-'}));
 assert.throws(()=>writable.check(new P(8190),4),/range/);
 const missing=createScopedRangeValidator(()=>null);assert.throws(()=>missing.check(new P(4096),4),/range/);
 const wrap={isNull:()=>false,add:()=>({compare:()=>-1})};assert.throws(()=>writable.check(wrap,4),/overflow/);
});
test('cache is bounded; an evicted region must be revalidated',()=>{
 let calls=0;const c=createScopedRangeValidator(p=>{calls++;return{base:p,size:16,protection:'rw-'};},2);
 for(const n of [4096,8192,12288,4096])c.check(new P(n),4);
 assert.equal(calls,4);assert.equal(c.stats().cachedRanges,2);
});
