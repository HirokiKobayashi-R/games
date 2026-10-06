"""Low-rate public QA with two real PTY clients; abort unknown pairings.
Test-only preload observes incoming states. All moves are typed into PTYs.
No server changes, token output, GUI access or Codex session access.
"""
import codecs
import fcntl
import json
import os
from pathlib import Path
import pty
import select
import signal
import struct
import subprocess
import sys
import tempfile
import termios
import time

root = Path(__file__).resolve().parents[1]
url = sys.argv[1] if len(sys.argv)>1 else 'https://terminal-othello.hiroki-c3a.workers.dev'
output = Path(sys.argv[2]) if len(sys.argv)>2 else root.parent/'dist/online-qa'
output.mkdir(parents=True,exist_ok=True)
clients=[]; report={'endpoint':url,'checks':[],'unknown_pairings':0}

def pump(seconds=.03):
    end=time.monotonic()+seconds
    while time.monotonic()<end:
        ready=select.select([c.master for c in clients if not c.closed],[],[],.01)[0]
        for c in clients:
            if c.master in ready:
                try:c.text=(c.text+c.decoder.decode(os.read(c.master,65536)))[-500000:]
                except OSError:pass
            if c.log.exists():
                messages=[]
                for line in c.log.read_text().splitlines():
                    try:messages.append(json.loads(line))
                    except json.JSONDecodeError:pass
                states=[x for x in messages if x['type']=='state']
                if states:c.state=states[-1]
                c.errors=[x for x in messages if x['type']=='error']

def until(predicate,label,seconds=8):
    end=time.monotonic()+seconds
    while not predicate():
        assert time.monotonic()<end, 'Timed out: '+label
        pump()

def check(label):
    report['checks'].append(label); print('PASS',label,flush=True)

class Client:
    def __init__(self,folder,name):
        self.master,self.slave=pty.openpty(); self.closed=False
        self.original=termios.tcgetattr(self.slave)
        fcntl.ioctl(self.slave,termios.TIOCSWINSZ,struct.pack('HHHH',40,80,0,0))
        self.log=folder/(name+'.jsonl');self.log.write_text('')
        env={**os.environ,'TERM':'xterm-256color','OTHELLO_QA_LOG':str(self.log),'OTHELLO_QA_GAME':str(folder/'confirmed-game')};env.pop('NO_COLOR',None)
        self.process=subprocess.Popen(['node','--import',str(root/'test/qa-tap.mjs'),str(root/'client.js'),'--url',url,'--session',str(folder/(name+'.session.json'))],stdin=self.slave,stdout=self.slave,stderr=self.slave,env=env)
        self.decoder=codecs.getincrementaldecoder('utf-8')();self.text='';self.state={};self.errors=[]
        clients.append(self)
    def key(self,text):os.write(self.master,text.encode())
    def resize(self,rows,cols):
        fcntl.ioctl(self.slave,termios.TIOCSWINSZ,struct.pack('HHHH',rows,cols,0,0));self.process.send_signal(signal.SIGWINCH)
    def frame(self):
        frames=[x.split('\x1b[J',1)[0]+'\x1b[J' for x in self.text.split('\x1b[H')[1:] if '\x1b[J' in x]
        return '\x1b[H'+frames[-1] if frames else ''
    def capture(self,name):
        pump(.35);(output/(name+'.ansi')).write_bytes(self.frame().encode())
    def quit(self):
        if self.process.poll() is None:
            self.key('q');until(lambda:self.process.poll() is not None,'quit and restore')
            assert self.process.returncode==0 and termios.tcgetattr(self.slave)==self.original
            assert '\x1b[?1049l' in self.text
    def close(self):
        if not self.closed:os.close(self.master);os.close(self.slave);self.closed=True

def waiting(c):
    until(lambda:c.state.get('status') in ['waiting','playing'],'waiting')
    if c.state['status']!='waiting':
        report['unknown_pairings']+=1
        raise RuntimeError('Unknown public opponent; no test moves sent. Stopping.')

def pair(a,b):
    try:
        until(lambda:a.state.get('status')=='playing' and b.state.get('status')=='playing','two players matched',3)
    except AssertionError:
        report['unknown_pairings'] += int(any(c.state.get('status')=='playing' for c in (a,b)))
        raise RuntimeError('Could not confirm the public pairing; no test moves sent. Stopping.')
    if a.state['game']['id']!=b.state['game']['id']:
        report['unknown_pairings']+=1
        raise RuntimeError('Public pair IDs differ; no test moves sent. Stopping.')
    assert a.state['color']!=b.state['color']
    return a.state['game']['id']

def synchronized(a,b,game_id):
    assert a.state['game']['id']==b.state['game']['id']==game_id
    assert a.state['game']==b.state['game']

scratch=tempfile.TemporaryDirectory(prefix='othello-public-qa-')
folder=Path(scratch.name)
(folder/'confirmed-game').write_text('')
try:
    a=Client(folder,'a');waiting(a)
    a.key('d3\r');until(lambda:'● 03' in a.frame() and '○ 03' in a.frame(),'CPU reply')
    a.capture('waiting');a.key('m');until(lambda:a.state.get('status')=='idle','cancel queue')
    a.key('m');waiting(a)
    check('CPU practice while waiting; cancel and resume matchmaking')
    b=Client(folder,'b');game_id=pair(a,b);synchronized(a,b,game_id)
    assert a.state['game']['score']=={'black':2,'white':2} and a.state['game']['revision']==0
    until(lambda:'TABLE '+game_id[:8] in a.frame() and 'TABLE '+game_id[:8] in b.frame(),'matching notification')
    assert '\x07' in a.text and '\x07' in b.text
    report['game_id']=game_id
    (folder/'confirmed-game').write_text(game_id)
    a.capture('opening')
    check('Same game ID, opposite colors, fresh board and matching notification in two real clients')
    black=a if a.state['color']==1 else b;white=b if black is a else a
    white.key('d3\r');until(lambda:len(white.errors)>=1,'wrong turn rejected');pump(.2)
    black.key('a1\r');until(lambda:len(black.errors)>=1,'illegal move rejected');pump(.2)
    assert a.state['game']['revision']==0
    black.key('d3\r\r');until(lambda:a.state['game']['revision']==b.state['game']['revision']==1,'one move from repeated Enter')
    until(lambda:len(black.errors)>=2,'duplicate rejected');synchronized(a,b,game_id)
    check('Wrong turn, illegal cell and repeated Enter rejected; exactly one revision accepted')
    a.resize(22,40);pump(.2);a.resize(6,28);pump(.2)
    a.key('a1\r');pump(.25);assert a.state['game']['revision']==1
    a.resize(40,80);a.key('\x1b[C'*12);pump(.2);synchronized(a,b,game_id)
    check('Narrow/undersized resize and repeated navigation preserve board synchronization')
    a.process.send_signal(signal.SIGUSR2)
    until(lambda:b.state.get('opponentOnline') is False,'disconnect notice')
    b.capture('reconnecting')
    until(lambda:a.state.get('opponentOnline') and b.state.get('opponentOnline'),'automatic reconnect')
    synchronized(a,b,game_id);assert a.state['game']['revision']==1
    check('Real WebSocket close, opponent offline notice and automatic same-session recovery')
    passes=0; moves=1
    while not a.state['game']['ended']:
        game=a.state['game'];revision=game['revision']
        who=a if game['turn']==a.state['color'] else b
        cell=game['legal'][0];coord='abcdefgh'[cell%8]+str(cell//8+1)
        pump(.2);who.key(coord+'\r')
        until(lambda:a.state['game']['revision']>revision and b.state['game']['revision']>revision,'move sync')
        synchronized(a,b,game_id);moves+=1
        if a.state['game']['passed'] and not a.state['game']['ended']:passes+=1
        if moves==22:
            a.capture('online-midgame');b.capture('online-opponent')
            a.resize(48,100);a.capture('online-wide');a.resize(40,80);pump(.2)
    game=a.state['game'];assert passes>0 and game['reason']=='scored'
    scores={'black':game['board'].count(1),'white':game['board'].count(2)}
    assert game['score']==scores
    expected=0 if scores['black']==scores['white'] else 1 if scores['black']>scores['white'] else 2
    assert game['winner']==expected and a.state['status']==b.state['status']=='finished'
    a.capture('result');b.capture('result-opponent')
    report.update(moves=moves,passes=passes,score=scores,winner=expected)
    check(f'Full game: {moves} moves, {passes} passes; every board/turn synchronized and final score counted independently')
    (folder/'confirmed-game').write_text('')
    a.key('r');waiting(a);b.key('r');next_id=pair(a,b);synchronized(a,b,next_id)
    (folder/'confirmed-game').write_text(next_id)
    a.key('m');until(lambda:a.state['status']=='idle' and b.state['status']=='finished','resignation')
    assert b.state['game']['reason']=='cancelled' and b.state['game']['winner']==b.state['color']
    check('Next random match, resignation and opponent victory')
    a.quit();b.quit();check('Both PTYs restore tty modes, cursor and alternate screen')
    report['ok']=True
finally:
    for c in clients:
        try:c.quit()
        except Exception:
            if c.process.poll() is None:c.process.terminate();pump(.5)
            if c.process.poll() is None:c.process.kill();c.process.wait()
        c.close()
    (output/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    scratch.cleanup()
