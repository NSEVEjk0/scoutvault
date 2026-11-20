import pathlib,json,urllib.request,urllib.error,urllib.parse,subprocess,os

root=pathlib.Path(__file__).resolve().parents[1]
credential=None
for line in pathlib.Path('/root/.git-credentials').read_text().splitlines():
    value=urllib.parse.urlparse(line)
    if value.hostname=='github.com':credential=urllib.parse.unquote(value.password or value.username or '');break
if not credential:raise SystemExit('GitHub connection is unavailable.')
def call(path,method='GET',body=None):
    request=urllib.request.Request('https://api.github.com'+path,data=json.dumps(body).encode() if body is not None else None,headers={'Authorization':'Bearer '+credential,'Accept':'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},method=method)
    return json.load(urllib.request.urlopen(request,timeout=30))
user=call('/user')
if user['login']!='NSEVEjk0':raise SystemExit('The connected GitHub account does not match the expected owner.')
try:repo=call('/repos/NSEVEjk0/scoutvault')
except urllib.error.HTTPError as error:
    if error.code!=404:raise
    repo=call('/user/repos','POST',{'name':'scoutvault','description':'Ask a nearby scout to check a listing, review their signed report, and pay through Solana escrow.','private':False,'auto_init':False,'has_issues':True})
subprocess.run(['git','init','-b','main'],cwd=root,check=True,capture_output=True)
subprocess.run(['git','config','user.name','ScoutVault'],cwd=root,check=True)
subprocess.run(['git','config','user.email',str(user['id'])+'+'+user['login']+'@users.noreply.github.com'],cwd=root,check=True)
existing=subprocess.run(['git','remote','get-url','origin'],cwd=root,capture_output=True,text=True)
if existing.returncode:subprocess.run(['git','remote','add','origin',repo['clone_url']],cwd=root,check=True)
print(json.dumps({'repository':repo['html_url'],'owner':user['login']}))
