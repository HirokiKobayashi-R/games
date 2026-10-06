"""Build a client-only Codex catalog archive. No downloads or runtime install."""
from pathlib import Path
import io
import json
import tarfile

root = Path(__file__).resolve().parents[1]
out = root / 'dist'
out.mkdir(exist_ok=True)
files = ['client.js', 'render.js', 'rules.js', 'plugin.json', 'PLUGIN.md', 'PLUGIN.ja.md']
files += [str(p.relative_to(root / 'terminal-othello'))
          for folder in ['scripts', 'skills']
          for p in sorted((root / 'terminal-othello' / folder).rglob('*')) if p.is_file()]
def neutral_owner(info):
    info.uid = info.gid = 0
    info.uname = info.gname = ''
    return info

with tarfile.open(out / 'terminal-othello-plugin.tar.gz', 'w:gz') as archive:
    prefix = 'terminal-othello-plugin/'
    archive.add(root / '.agents/plugins/marketplace.json', prefix + '.agents/plugins/marketplace.json', filter=neutral_owner)
    for name in files:
        archive.add(root / 'terminal-othello' / name, prefix + 'terminal-othello/' + name, filter=neutral_owner)
    payload = b'# Terminal Othello plugin\n\n[English guide](terminal-othello/PLUGIN.md) / [Japanese guide](terminal-othello/PLUGIN.ja.md)\n'
    info = tarfile.TarInfo(prefix + 'README.md')
    info.size = len(payload); info.mode = 0o644
    archive.addfile(info, io.BytesIO(payload))
    # Only the ESM/runtime metadata is needed. No server dependency or install script.
    package = json.loads((root / 'terminal-othello/package.json').read_text())
    payload = (json.dumps({key: package[key] for key in ['name', 'version', 'private', 'type', 'engines']}, indent=2) + '\n').encode()
    info = tarfile.TarInfo(prefix + 'terminal-othello/package.json')
    info.size = len(payload); info.mode = 0o644
    archive.addfile(info, io.BytesIO(payload))
print(out / 'terminal-othello-plugin.tar.gz')
