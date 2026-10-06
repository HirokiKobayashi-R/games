"""Optional macOS maintainer preview: Pillow; not a gameplay dependency."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import re

mono=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc',20)
cjk=ImageFont.truetype('/System/Library/Fonts/Hiragino Sans GB.ttc',20)
standard=['#17202a','#cf5555','#5b9960','#d4bb67','#5f90bf','#b281c4','#67bec3','#dce1e7']
def color(n):
    if n<16: return standard[n%8]
    if n>=232:
        v=8+(n-232)*10; return (v,v,v)
    n-=16; levels=[0,95,135,175,215,255]; return (levels[n//36],levels[n//6%6],levels[n%6])
def render(path, rows, columns=80, ambiguous=1):
    frames=[frame for frame in path.read_bytes().decode().split('\x1b[H')[1:] if '\x1b[J' in frame]
    raw=frames[-1].split('\x1b[J',1)[0]
    cw,ch,margin=12,24,28
    image=Image.new('RGB',(columns*cw+margin*2,rows*ch+margin*2),'#101820'); d=ImageDraw.Draw(image)
    x=y=0; fg='#dce1e7'; bg='#101820'
    for token in re.findall(r'\x1b\[[0-9;?]*[A-Za-z]|.',raw,re.S):
        if token.startswith('\x1b'):
            end=token[-1]; args=token[2:-1]
            if end=='G': x=int(args)-1
            if end=='m':
                codes=list(map(int,args.split(';'))); i=0
                while i<len(codes):
                    n=codes[i]
                    if n==0: fg='#dce1e7'; bg='#101820'
                    elif n in (38,48) and codes[i+1]==5:
                        if n==38: fg=color(codes[i+2])
                        else: bg=color(codes[i+2])
                        i+=2
                    elif n in (38,48) and codes[i+1]==2:
                        if n==38: fg=tuple(codes[i+2:i+5])
                        else: bg=tuple(codes[i+2:i+5])
                        i+=4
                    elif 30<=n<=37: fg=color(n-30)
                    elif 90<=n<=97: fg=color(n-90+8)
                    elif 40<=n<=47: bg=color(n-40)
                    i+=1
            continue
        if token=='\n': y+=1; continue
        if token=='\r': x=0; continue
        if ord(token)<32: continue
        wide=ord(token)>=0x2e80; width=ambiguous if token in '●○·▘▝▀▖▌▞▛▗▚▐▜▄▙▟█' else 2 if wide else 1
        px,py=margin+x*cw,margin+y*ch
        d.rectangle((px,py,px+width*cw-1,py+ch-1),fill=bg)
        if token in '▘▝▀▖▌▞▛▗▚▐▜▄▙▟█':
            mask=' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█'.index(token)
            for i in range(4):
                if mask & (1<<i):
                    x0=px+(i%2)*cw*width//2; y0=py+(i//2)*ch//2
                    d.rectangle((x0,y0,x0+cw*width//2-1,y0+ch//2-1),fill=fg)
        else: d.text((px,py),token,font=cjk if wide else mono,fill=fg)
        x+=width
    return image

if __name__ == '__main__':
    import argparse
    parser=argparse.ArgumentParser(description='Reconstruct ANSI PTY output with illustrative fonts; not a GUI screenshot.')
    parser.add_argument('input',type=Path);parser.add_argument('output',type=Path)
    parser.add_argument('--rows',type=int,default=40);parser.add_argument('--columns',type=int,default=80)
    parser.add_argument('--ambiguous',type=int,choices=[1,2],default=1)
    args=parser.parse_args()
    render(args.input,args.rows,args.columns,args.ambiguous).save(args.output)
