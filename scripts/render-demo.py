"""Export the recorded browser journey as an exactly 150-second captioned MP4."""
import json
import pathlib
import re
import subprocess
import textwrap

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
def ass_time(seconds):
    value=max(0,round(seconds*100));hours,value=divmod(value,360000);minutes,value=divmod(value,6000);seconds,value=divmod(value,100)
    return f'{hours}:{minutes:02}:{seconds:02}.{value:02}'
ass=['[Script Info]','ScriptType: v4.00+','PlayResX: 1280','PlayResY: 920','WrapStyle: 0','',
     '[V4+ Styles]','Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
     'Style: Default,DejaVu Sans,26,&H002E3E24,&H002E3E24,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,70,70,22,1','',
     '[Events]','Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text']
for start,end,text in events:
    wrapped='\\N'.join(textwrap.wrap(text,width=82))
    ass.append(f'Dialogue: 0,{ass_time(start)},{ass_time(end)},Default,,0,0,0,,{wrapped}')
(root/'.local/demo-recording/captions.ass').write_text('\n'.join(ass)+'\n')
output=root/'public/demo/scoutvault-demo.mp4'
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
subtitle=str(root/'.local/demo-recording/captions.ass')
overlay=('pad=1280:920:0:0:color=0xf7f8f4,'
         'drawbox=x=0:y=800:w=1280:h=1:color=0xd8e1cf:t=fill,'
         f"drawtext=fontfile={font}:text='LOCAL SOLANA VALIDATOR · TEST TOKENS · SAMPLE REPORT':fontsize=14:fontcolor=0x526553:x=32:y=812,"
         f"ass={subtitle}")
inputs=['-ss',str(data['trimStart']),'-i',data['path']]
extra_path=root/'.local/demo-recording/explorer-extra.json'
readable_explorer_seconds=None
if extra_path.exists():
    extra=json.loads(extra_path.read_text())
    scene=data['scenes'][7]
    start,end=scene['start']*scale,scene['end']*scale
    readable_explorer_seconds=end-start
    inputs+=['-ss',str(extra['trimStart']),'-i',extra['path']]
    graph=(f'[0:v]setpts={scale:.8f}*PTS,fps=30,tpad=stop_mode=clone:stop_duration=2,split=2[a][b];'
           f'[a]trim=end={start:.8f},setpts=PTS-STARTPTS[before];'
           f'[1:v]fps=30,tpad=stop_mode=clone:stop_duration=5,trim=duration={end-start:.8f},setpts=PTS-STARTPTS[receipt];'
           f'[b]trim=start={end:.8f}:end=150,setpts=PTS-STARTPTS[after];'
           f'[before][receipt][after]concat=n=3:v=1:a=0,{overlay}[out]')
    filters=['-filter_complex',graph,'-map','[out]']
else:
    filters=['-vf',f'setpts={scale:.8f}*PTS,fps=30,tpad=stop_mode=clone:stop_duration=2,'+overlay]
subprocess.run(['ffmpeg','-hide_banner','-loglevel','warning','-y',*inputs,*filters,'-t','150','-an','-c:v','libx264','-threads','2','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',str(output)],check=True)
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration,size','-of','json',str(output)]))
duration=float(probe['format']['duration'])
if not 149<=duration<180:raise SystemExit('The finished video must be approximately 2:30 and strictly under three minutes.')
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss','2','-i',str(output),'-frames:v','1',str(root/'public/demo/poster.jpg')],check=True)
report={'durationSeconds':duration,'narrationWords':sum(len(scene['text'].split()) for scene in data['scenes']),
    'captioned':True,'workingProductFootage':True,'physicalVisitClaimed':False,'physicalSeekerTest':False,
    'receipt':data['receipt']}
if readable_explorer_seconds is not None:report['readableExplorerSeconds']=round(readable_explorer_seconds,2)
(root/'reports/demo.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
