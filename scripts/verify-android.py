"""Check the release identity and package before copying the public APK."""
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess

root=pathlib.Path(__file__).resolve().parents[1]
apk=root/'mobile/android/app/build/outputs/apk/release/app-release.apk'
tools=root/'.local/android-sdk/build-tools/37.0.0'
if not apk.exists():raise SystemExit('Finish the Android release build first.')
env=dict(os.environ)
env.setdefault('JAVA_HOME',str(root/'.local/java21/jdk-21.0.13.1+2'))
env['PATH']=str(pathlib.Path(env['JAVA_HOME'])/'bin')+os.pathsep+env.get('PATH','')
certificate=subprocess.check_output([str(tools/'apksigner'),'verify','--verbose','--print-certs',str(apk)],text=True,env=env)
fingerprint=re.search(r'certificate SHA-256 digest: ([a-f0-9]+)',certificate,re.IGNORECASE).group(1).lower()
links=json.loads((root/'public/.well-known/assetlinks.json').read_text())
expected=links[0]['target']['sha256_cert_fingerprints'][0].replace(':','').lower()
if fingerprint!=expected:raise SystemExit('The APK certificate does not match the website identity.')
badging=subprocess.check_output([str(tools/'aapt'),'dump','badging',str(apk)],text=True)
if "package: name='com.scoutvault.app'" not in badging:raise SystemExit('Unexpected Android package.')
if 'application-debuggable' in badging:raise SystemExit('The public APK must be a release build.')
permissions=re.findall(r"uses-permission: name='([^']+)'",badging)
for name in ['RECORD_AUDIO','SYSTEM_ALERT_WINDOW','READ_EXTERNAL_STORAGE','WRITE_EXTERNAL_STORAGE']:
    if 'android.permission.'+name in permissions:raise SystemExit('Unexpected permission: '+name)
destination=root/'public/downloads/scoutvault-android.apk'
destination.parent.mkdir(parents=True,exist_ok=True)
shutil.copyfile(apk,destination)
report={'package':'com.scoutvault.app','version':'0.1.0','releaseSigningVerified':True,
    'certificateMatchesWebsite':True,'certificateSha256':fingerprint,'apkSha256':hashlib.sha256(apk.read_bytes()).hexdigest(),
    'bytes':apk.stat().st_size,'permissions':permissions,
    'nativeArchitectures':re.search(r'native-code: (.+)',badging).group(1),'compileSdk':'37.0',
    'targetSdk':re.search(r"targetSdkVersion:'([^']+)'",badging).group(1),'physicalSeekerTest':False}
(root/'reports/android.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
