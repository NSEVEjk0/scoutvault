"""Export the recorded browser journey as an exactly 150-second captioned MP4."""
import json
import pathlib
import re
import subprocess

root=pathlib.Path(__file__).resolve().parents[1]
data=json.loads((root/'.local/demo-recording/metadata.json').read_text())
scale=150/data['duration']
events=[]
for scene in data['scenes']:
    sentences=re.split(r'(?<=[.!?])\s+',scene['text'])
    total=sum(len(sentence.split()) for sentence in sentences)
    time=scene['start']*scale
    for sentence in sentences:
        length=(scene['end']-scene['start'])*scale*len(sentence.split())/total
        events.append((time,time+length,sentence))
        time+=length
def timestamp(seconds,comma=False):
    millis=max(0,round(seconds*1000));hours,millis=divmod(millis,3600000);minutes,millis=divmod(millis,60000);seconds,millis=divmod(millis,1000)
    return f'{hours:02}:{minutes:02}:{seconds:02}{"," if comma else "."}{millis:03}'
vtt=['WEBVTT','']
srt=[]
for index,(start,end,text) in enumerate(events,1):
    vtt.extend([f'{timestamp(start)} --> {timestamp(end)}',text,''])
    srt.extend([str(index),f'{timestamp(start,True)} --> {timestamp(end,True)}',text,''])
(root/'public/demo/captions.vtt').write_text('\n'.join(vtt))
(root/'.local/demo-recording/captions.srt').write_text('\n'.join(srt))
output=root/'public/demo/scoutvault-demo.mp4'
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
subtitle=str(root/'.local/demo-recording/captions.srt')
style='FontName=DejaVu Sans,FontSize=22,PrimaryColour=&H002E3E24,Outline=0,Shadow=0,Alignment=2,MarginL=90,MarginR=90,MarginV=20'
filters=(f'setpts={scale:.8f}*PTS,fps=30,pad=1280:920:0:0:color=0xf7f8f4,'
         'drawbox=x=0:y=800:w=1280:h=1:color=0xd8e1cf:t=fill,'
         f"drawtext=fontfile={font}:text='LOCAL SOLANA VALIDATOR · TEST TOKENS · SAMPLE REPORT':fontsize=14:fontcolor=0x526553:x=32:y=812,"
         f"subtitles={subtitle}:force_style='{style}'")
subprocess.run(['ffmpeg','-hide_banner','-loglevel','warning','-y','-ss',str(data['trimStart']),'-i',data['path'],
    '-vf',filters,'-t','150','-an','-c:v','libx264','-preset','fast','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',str(output)],check=True)
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration,size','-of','json',str(output)]))
duration=float(probe['format']['duration'])
if not 149<=duration<180:raise SystemExit('The finished video must be approximately 2:30 and strictly under three minutes.')
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss','2','-i',str(output),'-frames:v','1',str(root/'public/demo/poster.jpg')],check=True)
report={'durationSeconds':duration,'narrationWords':sum(len(scene['text'].split()) for scene in data['scenes']),
    'captioned':True,'workingProductFootage':True,'physicalVisitClaimed':False,'physicalSeekerTest':False,
    'receipt':data['receipt']}
(root/'reports/demo.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
