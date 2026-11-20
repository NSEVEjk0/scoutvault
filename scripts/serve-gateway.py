import pathlib,subprocess,re,json,datetime,urllib.request,urllib.parse,urllib.error,time,os,argparse,fcntl

root=pathlib.Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--mode',choices=['devnet','local'],default='devnet')
mode=parser.parse_args().mode
port=45581 if mode=='local' else 45480
environment='local-demo.env' if mode=='local' else 'deployment.env'
service='scoutvault-demo-api' if mode=='local' else 'scoutvault-api'
def publish_endpoint(gateway):
    credential=None
    for line in pathlib.Path('/root/.git-credentials').read_text().splitlines():
        value=urllib.parse.urlparse(line)
        if value.hostname=='github.com':credential=urllib.parse.unquote(value.password or value.username or '');break
    if not credential:return
    url='https://api.github.com/repos/NSEVEjk0/scoutvault/contents/gateway.json'
    headers={'Authorization':'Bearer '+credential,'Accept':'application/vnd.github+json','Content-Type':'application/json'}
    try:
        current=json.load(urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=20))
        body={'message':'Update ScoutVault gateway endpoint','sha':current['sha'],'content':__import__('base64').b64encode((json.dumps(gateway,indent=2)+'\n').encode()).decode()}
        urllib.request.urlopen(urllib.request.Request(url,data=json.dumps(body).encode(),headers=headers,method='PUT'),timeout=20).close()
    except (urllib.error.HTTPError,urllib.error.URLError,TimeoutError):pass

child=subprocess.Popen([str(root/'.local/cloudflared'),'tunnel','--url',f'http://127.0.0.1:{port}','--no-autoupdate'],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1)
endpoint=None
with (root/f'.local/gateway-{mode}-runtime.log').open('a') as log:
    for line in child.stdout:
        log.write(line);log.flush()
        match=re.search(r'https://[a-z0-9-]+\.trycloudflare\.com',line)
        if match and match.group(0)!=endpoint:
            endpoint=match.group(0)
            addresses=json.loads((root/'.local/public-addresses.json').read_text())
            update={'endpoint':endpoint,'programId':addresses['program'],'updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
            with (root/'.local/gateway.lock').open('a') as lock:
                fcntl.flock(lock,fcntl.LOCK_EX)
                gateway=json.loads((root/'gateway.json').read_text()) if (root/'gateway.json').exists() else {}
                if mode=='local':gateway['localDemo']={**update,'network':'localnet'}
                else:gateway.update(update)
                (root/'gateway.json').write_text(json.dumps(gateway,indent=2)+'\n')
            file=root/'.local'/environment;env=file.read_text();env=re.sub(r'^PUBLIC_API_ORIGIN=.*$','PUBLIC_API_ORIGIN='+endpoint,env,flags=re.M);file.write_text(env);file.chmod(0o600)
            subprocess.run(['systemctl','restart',service],capture_output=True)
            publish_endpoint(gateway)
code=child.wait()
raise SystemExit(code or 1)
