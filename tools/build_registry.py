#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_registry.py —— 分工表資料產線（篇目主表 ＋ 認領／收錄登記）

輸入
    1. assets/vol1..5.js    已產出的分卷內容（篇目坐標與首句的唯一來源，勿手改）
    2. tools/registry-claims.json   人工維護的方言詞表 ＋ 認領／收錄登記

輸出
    assets/registry.js      分工表資料（站上前端唯一資料來源）

為什麼獨立於 build_shenglv.py
    build_shenglv.py 需要語料與粵拼字典（本倉庫不隨附），無法在本倉庫內重建；
    篇目主表只依賴已提交的 vol1..5.js（與倉庫逐位元一致），故獨立成腳本，
    任何人拿到本倉庫即可重建、可驗證。build_shenglv.py 不寫 registry.js，
    兩條產線互不覆蓋。

校驗（任一不符即中止，不產出資料）
    P  篇目主表：卷→韻→章 順序提取，總數 376，序號連續 1..376，首句非空
    R  認領登記：序號在 1..376；方言點命中詞表（區→片→點 三級）；
       狀態 ∈ claimed／recorded；審核 ∈ pending／verified；
       日期為 YYYY-MM-DD 且期限 ≥ 認領日期；
       recorded 必須有音頻路徑且檔案存在（相對站點根）；
       (序號, 方言點) 不得重複
"""

import datetime as _dt
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
_site_sub = os.path.join(HERE, 'site')
SITE = _site_sub if os.path.isdir(_site_sub) else os.path.dirname(HERE)
ASSETS = os.path.join(SITE, 'assets')
CLAIMS_PATH = os.path.join(HERE, 'registry-claims.json')
OUT = os.path.join(ASSETS, 'registry.js')

EXPECT_POEMS = 376
DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
STATUSES = ('claimed', 'recorded')
AUDITS = ('pending', 'verified')


def strip_js(raw):
    return json.loads(raw[raw.index('=') + 1:].rstrip().rstrip(';'))


def fail(msg):
    sys.exit('✗ ' + msg)


def main():
    print('【篇目主表】讀取 assets/vol1..5.js …')
    poems = []
    for i in range(1, 6):
        path = os.path.join(ASSETS, f'vol{i}.js')
        if not os.path.exists(path):
            fail(f'找不到 {path}（先跑過 build_shenglv.py 或有提交的 vol 檔）')
        V = strip_js(open(path, encoding='utf-8').read())
        for r in V['rhymes']:
            for ch in r['chapters']:
                first = ch['lines'][0]['t'] if ch['lines'] else ''
                poems.append({
                    'seq': len(poems) + 1,
                    'vol': V['label'],
                    'volId': V['id'],
                    'rhyme': r['name'],
                    'chapter': ch['title'],
                    'first': first,
                    'nLines': len(ch['lines']),
                })

    # 校驗 P
    if len(poems) != EXPECT_POEMS:
        fail(f'校驗P：章總數 {len(poems)} ≠ 預期 {EXPECT_POEMS}（vol 檔可能變更）')
    bad_p = [p for p in poems if not (p['vol'] and p['rhyme'] and p['first'] and p['nLines'])]
    if bad_p:
        fail(f'校驗P：{len(bad_p)} 章缺少坐標或首句：{bad_p[:3]}')
    seqs = [p['seq'] for p in poems]
    if seqs != list(range(1, EXPECT_POEMS + 1)):
        fail('校驗P：序號不連續 1..376')
    n_rhyme = len({(p['volId'], p['rhyme']) for p in poems})
    print(f'     ✓ {len(poems)} 章、{n_rhyme} 韻、序號 1..{len(poems)} 連續')

    # 讀人工登記
    data = json.load(open(CLAIMS_PATH, encoding='utf-8'))
    dialects, claims = data['dialects'], data['claims']
    claim_months = int(data.get('claimMonths', 3))
    dmap = {d['id']: d for d in dialects}
    print(f'【認領登記】方言 {len(dialects)} 區；現有認領/收錄 {len(claims)} 條')

    # 校驗 R
    seen = {}
    for c in claims:
        errs = []
        seq = c.get('seq')
        if not isinstance(seq, int) or not (1 <= seq <= EXPECT_POEMS):
            errs.append(f'序號 {seq!r} 不在 1..{EXPECT_POEMS}')
        d = c.get('dialect') or {}
        dname = dmap.get(d.get('d'))
        if not dname:
            errs.append(f'方言區 {d.get("d")!r} 不在詞表')
        else:
            pian_ids = {p['id'] for p in dname['pian']}
            if d.get('pian') not in pian_ids:
                errs.append(f'片 {d.get("pian")!r} 不在 {dname["name"]} 的片區')
            if not d.get('dian'):
                errs.append('方言點（dian）不可空')
        if c.get('status') not in STATUSES:
            errs.append(f'狀態 {c.get("status")!r} ∉ {STATUSES}')
        if c.get('audit') not in AUDITS:
            errs.append(f'審核 {c.get("audit")!r} ∉ {AUDITS}')
        for k in ('claimDate', 'deadline'):
            v = c.get(k)
            if not (v and DATE_RE.match(v)):
                errs.append(f'{k} {v!r} 非 YYYY-MM-DD')
        cd, dl = c.get('claimDate', ''), c.get('deadline', '')
        if DATE_RE.match(cd) and DATE_RE.match(dl) and dl < cd:
            errs.append('期限早於認領日期')
        if c.get('status') == 'recorded':
            ap = c.get('audio')
            if not ap:
                errs.append('已收錄但缺 audio 路徑')
            elif not os.path.exists(os.path.join(SITE, ap.lstrip('/'))):
                errs.append(f'音頻不存在：{ap}')
        key = (seq, d.get('d'), d.get('pian'), d.get('dian'))
        if key in seen:
            errs.append(f'與 {seen[key]} 重複（同一首同一方言點）')
        seen[key] = c.get('id') or key
        if errs:
            fail(f'校驗R：第 {c.get("id", "?")} 條不合法 → {"；".join(errs)}')
    print('     ✓ 全部認領記錄通過（序號／方言點／狀態／日期／音頻存在性）')

    # 統計
    today = _dt.date.today().isoformat()
    n_recorded = sum(1 for c in claims if c['status'] == 'recorded')
    n_claimed = sum(1 for c in claims if c['status'] == 'claimed')
    n_overdue = sum(1 for c in claims
                    if c['status'] == 'claimed' and c.get('deadline', '') < today)
    per_dialect = {}
    for c in claims:
        d = dmap[c['dialect']['d']]['name']
        s = per_dialect.setdefault(d, {'recorded': 0, 'claimed': 0})
        s['recorded' if c['status'] == 'recorded' else 'claimed'] += 1

    payload = {
        'meta': {
            'generated': today,
            'nPoems': len(poems),
            'nRhymes': n_rhyme,
            'nVolumes': len({p['volId'] for p in poems}),
            'nDialects': len(dialects),
            'nClaims': len(claims),
            'nRecorded': n_recorded,
            'nClaimed': n_claimed,
            'nOverdue': n_overdue,
            'claimMonths': claim_months,
            'perDialect': per_dialect,
        },
        'dialects': dialects,
        'poems': poems,
        'claims': claims,
    }
    os.makedirs(ASSETS, exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write('/* 自動產生，勿手改 —— build_registry.py（輸入：tools/registry-claims.json ＋ assets/vol1..5.js） */\n')
        fh.write('window.SHENGLV_REGISTRY=' + json.dumps(payload, ensure_ascii=False,
                                                         separators=(',', ':')) + ';\n')
    size = os.path.getsize(OUT)
    print(f'【輸出】assets/registry.js  {size:,} B')
    print(f'【狀態】已收錄 {n_recorded}、已認領 {n_claimed}、已逾期(建置日算) {n_overdue}、'
          f'方言 {len(dialects)} 區；單方言覆蓋目標 {EXPECT_POEMS} 首')
    for d, s in sorted(per_dialect.items()):
        print(f'     {d}：已收錄 {s["recorded"]} / 已認領 {s["claimed"]}')
    print('\n→ 完成。前端逾期由 registry.js 內日期即時計算，不以此報告為準。')


if __name__ == '__main__':
    main()
