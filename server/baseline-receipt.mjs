import { createHmac,timingSafeEqual } from 'node:crypto';
import { canonicalJson } from '../shared/canonical.ts';

function sourceFields(baseline){
  const {url,sourceHash,capturedAt,title,description,address,price}=baseline;
  return {url,sourceHash,capturedAt,title,description,address,price,sourceClaims:baseline.checklist.map(({id,sourceClaim})=>({id,sourceClaim}))};
}
export function baselineReceipt(baseline,secret){return createHmac('sha256',secret).update('ScoutVault baseline v1\n'+canonicalJson(sourceFields(baseline))).digest('base64url');}
export function verifyBaselineReceipt(baseline,secret){
  if(typeof baseline.sourceReceipt!=='string')return false;
  const expected=Buffer.from(baselineReceipt(baseline,secret));const received=Buffer.from(baseline.sourceReceipt);
  return expected.length===received.length&&timingSafeEqual(expected,received);
}
