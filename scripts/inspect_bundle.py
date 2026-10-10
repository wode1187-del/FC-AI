# -*- coding: utf-8 -*-
import re
js = open(r'I:\FC-AI生图工作台\dist\assets\index-NTbsLWlD.js', encoding='utf-8').read()
for pat in ['getElementById', '.render(', 'createRoot(', 'DOMContentLoaded', 'mountRoot']:
    ms = list(re.finditer(re.escape(pat), js))
    print('PAT', pat, 'COUNT', len(ms))
    for m in ms[:2]:
        s = max(0, m.start()-80)
        print('  ...' + js[s:m.start()+180].replace('\n',' ')[:260])
