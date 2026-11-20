import os,json,pathlib,urllib.request,urllib.error,hashlib,time

root=pathlib.Path(__file__).resolve().parents[1]
project=json.loads((root/'.local/vercel-project.json').read_text())
token=os.environ['VERCEL_TOKEN']
team=project['orgId']
allowed_roots={'src','shared','public','api'}
allowed_files={'package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','vercel.json','gateway.json'}
files=[]
for path in root.iterdir():
    if path.is_file() and path.name in allowed_files: candidates=[path]
    elif path.is_dir() and path.name in allowed_roots: candidates=[p for p in path.rglob('*') if p.is_file()]
    else: continue
    for file in candidates:
        relative=file.relative_to(root).as_posix()
        if any(part.startswith('.') and part!='.well-known' for part in file.relative_to(root).parts):continue
        if file.suffix in {'.apk','.mp4','.webm'}:continue
        files.append({'file':relative,'data':file.read_bytes().decode('utf-8') if file.suffix not in {'.png','.jpg','.jpeg','.woff','.woff2'} else __import__('base64').b64encode(file.read_bytes()).decode(),'encoding':'utf-8' if file.suffix not in {'.png','.jpg','.jpeg','.woff','.woff2'} else 'base64'})
body={'name':project['projectName'],'project':project['projectId'],'target':'production','files':files,'projectSettings':{'framework':'vite','nodeVersion':'24.x','buildCommand':'npm run build','installCommand':'npm ci','outputDirectory':'dist'},'meta':{'scoutvault':'true'}}
request=urllib.request.Request('https://api.vercel.com/v13/deployments?teamId='+team,data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},method='POST')
try:
    response=json.load(urllib.request.urlopen(request,timeout=45))
except urllib.error.HTTPError as error:
    print('Deployment API error',error.code,error.read().decode()[:700]);raise SystemExit(1)
summary={key:response.get(key) for key in ['id','url','readyState','createdAt']}
(root/'.local/latest-deployment.json').write_text(json.dumps(summary,indent=2))
print(json.dumps(summary,indent=2))
