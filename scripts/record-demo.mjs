import { chromium,expect as baseExpect } from '@playwright/test';
import { mkdir,readFile,writeFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const expect=baseExpect.configure({timeout:30000});
const appUrl=process.env.SCOUTVAULT_DEMO_URL??'https://scoutvault-checks.vercel.app/';
const sourceUrl=new URL('/listings/akoka-studio.html',appUrl).href;
const network=new URL(appUrl).searchParams.get('demo')==='local'?'localnet':'devnet';
const storagePrefix=network==='localnet'?'scoutvault-local':'scoutvault';
const suffix=process.env.SCOUTVAULT_DEMO_TITLE_SUFFIX;
const title=suffix?`Check the Akoka studio ${suffix}`:'Check the Akoka studio';
const directory=new URL('.local/demo-recording/',root);
await mkdir(directory,{recursive:true,mode:0o700});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH}:{})});
const context=await browser.newContext({viewport:{width:1280,height:800},recordVideo:{dir:directory.pathname,size:{width:1280,height:800}}});
try{
  const saved=JSON.parse(await readFile(new URL(`sessions-${network}.json`,directory),'utf8'));
  await context.addInitScript(({demoId,origin,prefix})=>{if(location.origin===origin&&!sessionStorage.getItem(`${prefix}-demo-id`))sessionStorage.setItem(`${prefix}-demo-id`,demoId);}, {demoId:saved.demoId,origin:new URL(appUrl).origin,prefix:storagePrefix});
}catch(error){if(error.code!=='ENOENT')throw error;}
await context.addInitScript(()=>{
  document.addEventListener('DOMContentLoaded',()=>{
    const cursor=document.createElement('div');
    cursor.style.cssText='position:fixed;top:0;left:0;width:14px;height:14px;border:2px solid #164f40;background:#eaf0dc;border-radius:50%;pointer-events:none;z-index:2147483647;opacity:0;';
    document.body.append(cursor);
    document.addEventListener('mousemove',event=>{cursor.style.opacity='.85';cursor.style.transform=`translate(${event.clientX-7}px,${event.clientY-7}px)`;});
  });
});
const page=await context.newPage();
page.setDefaultTimeout(25000);
let receipt;
let scoutAccount;
let scoutBalanceBefore;
page.on('response',async response=>{
  if(new URL(response.url()).pathname==='/api/demo/session'&&response.ok()){
    const demo=await response.json();
    await writeFile(new URL(`sessions-${network}.json`,directory),JSON.stringify({demoId:demo.demoId}),{mode:0o600});
    scoutAccount=demo.scout;
  }
  if(new URL(response.url()).pathname.match(/\/bounties\/[^/]+\/confirm$/)&&response.ok()){
    const value=await response.json();
    if(value.payoutSignature)receipt={bountyId:value.id,network,token:value.tokenSymbol,amount:value.reward,
      fundingSignature:value.fundingSignature,claimSignature:value.claimSignature,reportSignature:value.reportSignature,payoutSignature:value.payoutSignature};
  }
});
const recordingStarted=Date.now();
await page.goto(appUrl,{waitUntil:'domcontentloaded'});
await expect(page.getByRole('heading',{name:'Check the place before you pay.'})).toBeVisible();
await expect(page.getByText(network==='localnet'?'Local Solana demo · test tokens · sample reports':'Devnet',{exact:true})).toBeVisible();
const started=Date.now();
const scenes=[];
const mark=name=>{const time=(Date.now()-started)/1000;scenes.push({name,start:time});console.log(`Recording: ${name}`);};
const until=async seconds=>{const remaining=seconds*1000-(Date.now()-started);if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));};
try{
  mark('Open the app');await until(15);
  mark('Read the sample listing');await page.goto(sourceUrl);await until(25);
  mark('Capture a listing baseline');await page.goto(appUrl);
  await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
  const demoResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/demo/session'&&response.ok());
  await page.getByRole('button',{name:'Try with test funds',exact:false}).click();
  const sessionResponse=await demoResponse;
  scoutAccount=(await sessionResponse.json()).scout;
  const apiOrigin=new URL(sessionResponse.url()).origin;
  const readScoutBalance=async()=>{
    const response=await fetch(`${apiOrigin}/api/wallet/balance`,{headers:{Authorization:`Bearer ${scoutAccount.token}`}});
    if(!response.ok)throw new Error(`The scout balance check returned HTTP ${response.status}.`);
    return (await response.json()).tokens;
  };
  scoutBalanceBefore=await readScoutBalance();
  await expect(page.getByText('Demo wallet · test tokens only')).toBeVisible();
  await page.locator('.hero-row').getByRole('button',{name:'Create a check',exact:true}).click();
  await page.getByLabel('Listing URL',{exact:true}).fill(sourceUrl);
  await page.getByRole('button',{name:'Read listing',exact:true}).click();
  await expect(page.getByText('Listing read with Firecrawl')).toBeVisible({timeout:70000});
  await page.getByLabel('Check title',{exact:true}).fill(title);
  await page.getByLabel('Entrance address',{exact:true}).fill('12 Sample Lane, Akoka');
  await page.locator('.edit-checks').scrollIntoViewIfNeeded();await until(45);
  mark('Fund the bounty');
  await page.getByRole('button',{name:'Review funding',exact:true}).click();
  await page.waitForTimeout(2500);
  await page.getByRole('button',{name:'Fund 2 TEST USDC',exact:true}).click();
  await expect(page.getByRole('dialog').locator('.detail-meta').getByText('Open for a scout')).toBeVisible();
  const bountyId=new URL(page.url()).searchParams.get('bounty');await until(65);
  mark('Claim as the scout');
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await page.getByRole('button',{name:'Scout',exact:true}).click();
  await page.getByRole('link',{name:'Scout map',exact:true}).click();
  await page.getByRole('button',{name:title,exact:true}).first().click();
  await page.getByRole('button',{name:'Claim this check',exact:true}).click();
  await expect(page.getByRole('button',{name:'Capture field report',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Play brief',exact:true}).hover();await until(85);
  mark('Prepare the sample report');
  await page.getByRole('button',{name:'Capture field report',exact:true}).click();
  const checks=page.locator('.report-check');
  await checks.nth(0).getByText('Yes',{exact:true}).click();
  await page.waitForTimeout(800);await checks.nth(1).getByText('Yes',{exact:true}).click();
  await page.waitForTimeout(800);await checks.nth(2).getByText('Could not confirm',{exact:true}).click();
  await page.getByLabel('What else should the buyer know?',{exact:true}).fill('Sample illustration for the demo. The third claim could not be confirmed. No site visit is claimed.');
  await page.getByRole('button',{name:'Use sample illustration',exact:true}).click();
  await expect(page.getByAltText('Your field report photo')).toBeVisible();await until(108);
  mark('Sign, review, and approve');
  await page.getByRole('button',{name:'Sign and submit report',exact:true}).click();
  await expect(page.getByText('Photo hash and wallet signature match')).toBeVisible();
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await page.getByRole('button',{name:'Buyer',exact:true}).click();
  await page.getByRole('button',{name:title,exact:true}).first().click();
  await expect(page.getByText('Photo hash and wallet signature match')).toBeVisible();
  await page.locator('.report-results').scrollIntoViewIfNeeded();await page.waitForTimeout(4500);
  await page.getByRole('button',{name:'Review and pay scout',exact:true}).click();await page.waitForTimeout(2000);
  await page.getByRole('button',{name:'Approve and pay scout',exact:true}).click();
  await expect(page.getByText('2 TEST USDC paid',{exact:true})).toBeVisible({timeout:30000});await until(133);
  await expect.poll(readScoutBalance).toBe(scoutBalanceBefore+2);
  mark('Open the actual payout receipt');
  const explorer=await page.getByRole('link',{name:'View payout on Solana Explorer',exact:false}).getAttribute('href');
  if(!explorer||new URL(explorer).searchParams.get('cluster')!==(network==='localnet'?'custom':'devnet'))throw new Error('The Explorer receipt must select the network used by the payout.');
  await page.goto(explorer,{waitUntil:'domcontentloaded'});
  if(network==='localnet')await page.getByRole('button',{name:'Connect',exact:true}).click();
  await expect(page.getByText('Success',{exact:true}).first()).toBeVisible({timeout:45000});
  await page.screenshot({path:new URL(`reports/explorer-${network==='localnet'?'local':'devnet'}.png`,root).pathname});
  await until(145);
  mark('Show the paid check and remaining checks');
  const resultUrl=new URL(appUrl);resultUrl.searchParams.set('view','requests');resultUrl.searchParams.set('bounty',bountyId);
  await page.goto(resultUrl.href);
  await expect(page.getByText('2 TEST USDC paid',{exact:true})).toBeVisible({timeout:30000});
  await until(Math.max(150,(Date.now()-started)/1000+5));
  if(!receipt)throw new Error('A verified payout receipt was not recorded.');
  const duration=(Date.now()-started)/1000;
  const video=page.video();await context.close();
  const path=await video.path();
  const rows=(await readFile(new URL('docs/demo-storyboard.md',root),'utf8')).split('\n').filter(line=>/^\| [012]:/.test(line)).map(line=>line.split('|')[2].trim());
  if(network==='localnet'){
    rows[1]=rows[1].replace('Solana devnet','a local Solana validator');
    rows[7]=rows[7].replace('the devnet payout','the payout on the local validator');
  }
  if(rows.length!==scenes.length)throw new Error('The captions must match all recorded scenes.');
  await writeFile(new URL('metadata.json',directory),JSON.stringify({path,trimStart:(started-recordingStarted)/1000,duration,
    scenes:scenes.map((scene,index)=>({...scene,text:rows[index],end:scenes[index+1]?.start??duration})),receipt,explorer,
    scoutBalance:{wallet:scoutAccount.wallet,before:scoutBalanceBefore,after:scoutBalanceBefore+2}},null,2));
  console.log(`The working walkthrough and the ${network} payout are recorded.`);
}finally{await browser.close();}
