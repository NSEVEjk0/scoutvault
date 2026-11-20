import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePublicUrl,validatePublicUrl,isPublicAddress } from '../../server/url-security.mjs';
import { baselineReceipt,verifyBaselineReceipt } from '../../server/baseline-receipt.mjs';
import { canonicalJson } from '../../shared/canonical.ts';

test('private, metadata, loopback, credential and non-web destinations are rejected',async()=>{
  for(const value of ['http://127.0.0.1','http://2130706433','http://169.254.169.254/latest/meta-data','http://10.1.2.3','http://[::1]','http://[::ffff:127.0.0.1]','https://example.com:8443','file:///etc/passwd','https://user:password@example.com'])assert.throws(()=>normalizePublicUrl(value));
  for(const address of ['100.64.0.1','192.168.1.1','172.20.0.1','198.18.0.1','2001:db8::1'])assert.equal(isPublicAddress(address),false);
  await assert.rejects(validatePublicUrl('https://public.example',async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]));
  const good=await validatePublicUrl('https://example.com/path',async()=>[{address:'93.184.216.34',family:4}]);assert.equal(good.url.toString(),'https://example.com/path');
});
test('a digital baseline receipt accepts edited questions but rejects altered source claims',()=>{
  const value={url:'https://example.com',title:'Studio',description:'A studio.',address:'12 Sample Lane',price:'1000',sourceHash:'a'.repeat(64),capturedAt:new Date().toISOString(),checklist:[{id:'water',sourceClaim:'Water tank behind the house',question:'Is the tank present?'}]};
  const baseline={...value,sourceReceipt:baselineReceipt(value,'test-receipt-secret')};assert.equal(verifyBaselineReceipt(baseline,'test-receipt-secret'),true);
  assert.equal(verifyBaselineReceipt({...baseline,checklist:[{...baseline.checklist[0],question:'Can you see the tank?'}]},'test-receipt-secret'),true);
  assert.equal(verifyBaselineReceipt({...baseline,price:'999999'},'test-receipt-secret'),false);
  assert.equal(verifyBaselineReceipt({...baseline,sourceHash:'b'.repeat(64)},'test-receipt-secret'),false);
});
test('signed report canonical encoding is stable across object key order',()=>{
  assert.equal(canonicalJson({note:'yes',answers:{water:'yes',address:'no'}}),canonicalJson({answers:{address:'no',water:'yes'},note:'yes'}));
  assert.notEqual(canonicalJson({photoHash:'a'}),canonicalJson({photoHash:'b'}));
});
