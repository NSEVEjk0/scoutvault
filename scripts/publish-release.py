"""Publish only the reviewed public build artifacts to the project's release."""
import hashlib
import json
import pathlib
import urllib.error
import urllib.parse
import urllib.request

root=pathlib.Path(__file__).resolve().parents[1]
credential=None
for line in pathlib.Path('/root/.git-credentials').read_text().splitlines():
    item=urllib.parse.urlparse(line)
    if item.hostname=='github.com':
        credential=urllib.parse.unquote(item.password or item.username or '')
        break
if not credential:raise SystemExit('The authorized GitHub connection is unavailable.')
headers={'Authorization':'Bearer '+credential,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}
def call(path,method='GET',body=None):
    request=urllib.request.Request('https://api.github.com'+path,data=json.dumps(body).encode() if body is not None else None,
        headers={**headers,'Content-Type':'application/json'},method=method)
    with urllib.request.urlopen(request,timeout=30) as response:
        return None if response.status==204 else json.load(response)
artifacts=[(root/'public/downloads/scoutvault-android.apk','application/vnd.android.package-archive'),
    (root/'public/demo/scoutvault-demo.mp4','video/mp4'),(root/'.local/deploy/scout_vault.so','application/octet-stream')]
if any(not path.exists() for path,_ in artifacts):raise SystemExit('Finish and verify the APK, video, and compiled program before publishing the release.')
if call('/user')['login']!='NSEVEjk0':raise SystemExit('The connected GitHub account is not the project owner.')
repository='/repos/NSEVEjk0/scoutvault'
notes=(root/'docs/release-notes.md').read_text()
try:release=call(repository+'/releases/tags/v0.1.0')
except urllib.error.HTTPError as error:
    if error.code!=404:raise
    release=call(repository+'/releases','POST',{'tag_name':'v0.1.0','target_commitish':'main',
        'name':'ScoutVault 0.1.0 — development demo','body':notes,'draft':False,'prerelease':True})
if release.get('body')!=notes:
    release=call(repository+'/releases/'+str(release['id']),'PATCH',{'body':notes})
uploaded=[]
for path,mime in artifacts:
    data=path.read_bytes()
    existing=next((asset for asset in release.get('assets',[]) if asset['name']==path.name),None)
    digest='sha256:'+hashlib.sha256(data).hexdigest()
    if existing and existing.get('digest')==digest:
        uploaded.append({'name':path.name,'url':existing['browser_download_url'],'sha256':digest[7:]});continue
    if existing:call(repository+'/releases/assets/'+str(existing['id']),'DELETE')
    url=release['upload_url'].split('{')[0]+'?'+urllib.parse.urlencode({'name':path.name})
    request=urllib.request.Request(url,data=data,headers={**headers,'Content-Type':mime},method='POST')
    asset=json.load(urllib.request.urlopen(request,timeout=45))
    uploaded.append({'name':path.name,'url':asset['browser_download_url'],'sha256':digest[7:]})
summary={'release':release['html_url'],'assets':uploaded}
(root/'.local/public-release.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
