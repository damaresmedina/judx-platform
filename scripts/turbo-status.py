import json, glob, os
base = 'G:/datajud_raw'
active = []
done_count = 0
for chk in glob.glob(f'{base}/**/checkpoint.json', recursive=True):
    parts = chk.replace(os.sep, '/').split('/')
    try:
        idx = parts.index('datajud_raw'); after = parts[idx+1:]
        sigla = (after[-3]+'-'+after[-2]) if 'shards' in after else after[-2]
    except: continue
    try: c = json.load(open(chk))
    except: continue
    if c.get('done'):
        done_count += 1
        continue
    tot = c.get('total_fetched',0)
    sec = c.get('total_fetched_secondary',0)
    gho = c.get('total_fetched_ghosts',0)
    active.append((sigla, tot, sec, gho, c.get('pass','primary'), c.get('file_index',0)))
print(f'concluidos (done=true): {done_count}')
print(f'em andamento: {len(active)}')
print()
active.sort(key=lambda x: -x[1])
for s,t,sec,g,p,fi in active:
    extra = f' +sec={sec} +gho={g}' if (sec or g) else ''
    print(f'  {s:18s} primary={t:>10,}{extra} pass={p} fi={fi}')
