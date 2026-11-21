import initialGateway from '../gateway.json' with { type: 'json' };

export default async function handler(request,response){
  let gateway=initialGateway;
  try{
    const registry=await fetch('https://raw.githubusercontent.com/NSEVEjk0/scoutvault/main/gateway.json',{signal:AbortSignal.timeout(4000),headers:{'Cache-Control':'no-cache'}});
    if(registry.ok){
      const latest=await registry.json();
      if(Date.parse(latest.updatedAt)>=Date.parse(initialGateway.updatedAt))gateway=latest;
    }
  }catch{}
  if(request.query?.demo==='local'&&(initialGateway.localDemo?.enabled===false||gateway.localDemo?.enabled===false)){
    response.setHeader('Cache-Control','no-store');
    response.status(410).json({error:'The local payment demo has ended. Watch the recording or open ScoutVault on devnet.'});
    return;
  }
  try{
    const localDemo=request.query?.demo==='local';
    const origin=new URL(localDemo ? gateway.localDemo?.endpoint : gateway.endpoint);
    if(origin.protocol!=='https:'||!origin.hostname.endsWith('.trycloudflare.com'))throw new Error('Invalid gateway');
    const result=await fetch(`${origin.origin}/api/config`,{signal:AbortSignal.timeout(15000)});
    const config=await result.json();
    if(!result.ok||config.programId!==gateway.programId||config.network!==(localDemo?'localnet':'devnet'))throw new Error('Gateway identity does not match');
    response.setHeader('Cache-Control','no-store');response.status(200).json(config);
  }catch{response.status(503).json({error:'ScoutVault is reconnecting. Please retry shortly.'});}
}
