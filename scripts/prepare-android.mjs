import { createRequire } from 'node:module';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const require=createRequire(new URL('../server/package.json',import.meta.url));const module=require('sharp');const sharp=module.default??module;
await mkdir('mobile/assets',{recursive:true});const logo=await readFile('public/scoutvault.svg');
await sharp(logo).resize(1024,1024).png().toFile('mobile/assets/icon.png');
let app=JSON.parse(await readFile('mobile/app.json','utf8'));app.expo.icon='./assets/icon.png';app.expo.android.adaptiveIcon={foregroundImage:'./assets/icon.png',backgroundColor:'#164f40'};
await writeFile('mobile/app.json',JSON.stringify(app,null,2)+'\n');
for(const [folder,size]of Object.entries({'mipmap-mdpi':48,'mipmap-hdpi':72,'mipmap-xhdpi':96,'mipmap-xxhdpi':144,'mipmap-xxxhdpi':192})){
  const path=resolve('mobile/android/app/src/main/res',folder);await mkdir(path,{recursive:true});
  for(const name of ['ic_launcher.webp','ic_launcher_round.webp'])await sharp(logo).resize(size,size).webp().toFile(resolve(path,name));
  const splash=resolve('mobile/android/app/src/main/res',folder.replace('mipmap','drawable'),'splashscreen_logo.png');
  try{
    const metadata=await sharp(await readFile(splash)).metadata();
    const width=metadata.width,height=metadata.height;
    const mark=await sharp(logo).resize(Math.round(width*0.65),Math.round(height*0.65)).png().toBuffer();
    await sharp({create:{width,height,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:mark,gravity:'center'}]).png().toFile(splash);
  }catch(error){if(error.code!=='ENOENT')throw error;}
}
const colorsPath='mobile/android/app/src/main/res/values/colors.xml';
let colors=await readFile(colorsPath,'utf8');colors=colors.replace(/(<color name="splashscreen_background">)[^<]+/,'$1#f7f8f4').replace(/(<color name="colorPrimary">)[^<]+/,'$1#164f40');
await writeFile(colorsPath,colors);
const gradlePath='mobile/android/app/build.gradle';
let gradle=await readFile(gradlePath,'utf8');
if(!gradle.includes('SCOUTVAULT_STORE_FILE')){
  gradle=gradle.replace('    signingConfigs {',`    signingConfigs {
        release {
            def signingPath = System.getenv('SCOUTVAULT_STORE_FILE')
            if (signingPath) {
                storeFile file(signingPath)
                storePassword System.getenv('SCOUTVAULT_STORE_PASSWORD')
                keyAlias 'scoutvault'
                keyPassword System.getenv('SCOUTVAULT_KEY_PASSWORD')
            }
        }`);
  gradle=gradle.replace(/(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs.debug/,'$1signingConfig signingConfigs.release');
  await writeFile(gradlePath,gradle);
}
await mkdir('.local/android-signing',{recursive:true,mode:0o700});
let passwords;
try{passwords=JSON.parse(await readFile('.local/android-signing/passwords.json','utf8'));}
catch(error){if(error.code!=='ENOENT')throw error;passwords={store:randomBytes(24).toString('hex'),key:randomBytes(24).toString('hex')};await writeFile('.local/android-signing/passwords.json',JSON.stringify(passwords),{mode:0o600});}
const keystore=resolve('.local/android-signing/scoutvault-release.keystore');
try{await readFile(keystore);}catch{
 const result=spawnSync('.local/java21/jdk-21.0.13.1+2/bin/keytool',['-genkeypair','-keystore',keystore,'-alias','scoutvault','-storepass:env','SCOUTVAULT_STORE_PASSWORD','-keypass:env','SCOUTVAULT_KEY_PASSWORD','-keyalg','RSA','-keysize','4096','-validity','3650','-dname','CN=ScoutVault, OU=Development, O=ScoutVault, C=NG'],{env:{...process.env,SCOUTVAULT_STORE_PASSWORD:passwords.store,SCOUTVAULT_KEY_PASSWORD:passwords.key},encoding:'utf8'});
 if(result.status!==0)throw new Error('Could not create the private APK signing key.');
}
const result=spawnSync('.local/java21/jdk-21.0.13.1+2/bin/keytool',['-list','-v','-keystore',keystore,'-alias','scoutvault','-storepass:env','SCOUTVAULT_STORE_PASSWORD'],{env:{...process.env,SCOUTVAULT_STORE_PASSWORD:passwords.store},encoding:'utf8'});
const fingerprint=result.stdout.match(/SHA256:\s*([A-F0-9:]+)/)?.[1];if(!fingerprint)throw new Error('Could not read the APK certificate fingerprint.');
await mkdir('public/.well-known',{recursive:true});await writeFile('public/.well-known/assetlinks.json',JSON.stringify([{relation:['delegate_permission/common.handle_all_urls'],target:{namespace:'android_app',package_name:'com.scoutvault.app',sha256_cert_fingerprints:[fingerprint]}}],null,2)+'\n');
await writeFile('.local/android-signing/build.env',`SCOUTVAULT_STORE_FILE=${keystore}\nSCOUTVAULT_STORE_PASSWORD=${passwords.store}\nSCOUTVAULT_KEY_PASSWORD=${passwords.store}\n`,{mode:0o600});
console.log('Android branding and a private release certificate are prepared.');console.log('APK certificate SHA-256:',fingerprint);
