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

認領規則（2026-10-03 業主指示）
    以**學會為單位**認領，不以個人 → society 必填，是認領主體；
      singer／lineage 只在 recorded 時填，記的是實際吟誦者（個人）。
    認領時自訂 promiseDate（承諾交件日），須晚於 claimDate，
      且不超過 claimDate + promiseMaxMonths（12 個月）——沒有上限的話，
      學會可以承諾很遠的日期，等於無限期占位。
    promiseDate 過後即「已逾期」；逾期再過 graceMonths（3 個月）仍未回覆者，
      **自動釋放**回「待認領」。
    其間若有回覆（lastReply ≥ promiseDate），則不自動釋放，改為「待另約」，
      由維護者與學會另訂新的 promiseDate。

    ★ 「自動釋放」在這裡**真的執行**：建置時把已達釋放條件者移出 claims、
      放進輸出裡的 released 陣列。故每次建置後該篇目就真的回到待認領，
      不靠人工記得去刪登記。前端亦以同一套日期規則即時計算，兩者一致。

校驗（任一不符即中止，不產出資料）
    P  篇目主表：卷→韻→章 順序提取，總數 376，序號連續 1..376，首句非空
    R  認領登記：序號在 1..376；方言點命中詞表（區→片→點 三級）；
       狀態 ∈ claimed／recorded；審核 ∈ pending／verified；
       **society 必填**（認領以學會為單位）；
       **promiseDate 必填**，且 claimDate < promiseDate ≤ claimDate + promiseMaxMonths；
       lastReply 選填，若填須 ≥ claimDate；
       recorded 必須有 singer、音頻路徑且檔案存在（相對站點根）；
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


def _add_months(iso, n):
    """YYYY-MM-DD 加 n 個月。月底夾擠：1/31 + 1 個月 → 2/28（不溢到 3/3）。"""
    y, m, d = (int(x) for x in iso.split('-'))
    m0 = m - 1 + n
    y2, m2 = y + m0 // 12, m0 % 12 + 1
    last = [31, 29 if (y2 % 4 == 0 and (y2 % 100 != 0 or y2 % 400 == 0)) else 28,
            31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m2 - 1]
    return '%04d-%02d-%02d' % (y2, m2, min(d, last))


def claim_state(c, today, grace_months):
    """認領狀態機。前端 assets/app.js 的 claimState() 用同一套規則，兩者必須一致。

        recorded     已收錄（不因期限釋放）
        renegotiate  已逾期但期間有回覆 → 不自動釋放，待另約新承諾時間
        overdue      promiseDate 已過，尚在 graceMonths 寬限內且未回覆
        claimed      尚未到 promiseDate
        released     逾期滿 graceMonths 仍未回覆 → 自動釋放回待認領
    """
    if c.get('status') == 'recorded':
        return 'recorded'
    pd = c.get('promiseDate')
    if not pd or not DATE_RE.match(pd):
        return 'claimed'
    lr = c.get('lastReply')
    if lr and lr >= pd:
        return 'renegotiate'
    if today > _add_months(pd, grace_months):
        return 'released'
    if today > pd:
        return 'overdue'
    return 'claimed'


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
    grace_months = int(data.get('graceMonths', 3))
    promise_max = int(data.get('promiseMaxMonths', 12))
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
        # 認領以學會為單位，不以個人
        if not (c.get('society') or '').strip():
            errs.append('缺 society —— 認領以學會為單位，不以個人')
        for k in ('claimDate', 'promiseDate'):
            v = c.get(k)
            if not (v and DATE_RE.match(v)):
                errs.append(f'{k} {v!r} 非 YYYY-MM-DD')
        cd, pd = c.get('claimDate', ''), c.get('promiseDate', '')
        if DATE_RE.match(cd) and DATE_RE.match(pd):
            if pd <= cd:
                errs.append(f'承諾時間 {pd} 未晚於認領日 {cd}')
            else:
                cap = _add_months(cd, promise_max)
                if pd > cap:
                    errs.append(f'承諾時間 {pd} 超過上限 {cap}'
                                f'（認領日 + {promise_max} 個月）')
        lr = c.get('lastReply')
        if lr is not None:
            if not (isinstance(lr, str) and DATE_RE.match(lr)):
                errs.append(f'lastReply {lr!r} 非 YYYY-MM-DD')
            elif DATE_RE.match(cd) and lr < cd:
                errs.append(f'lastReply {lr} 早於認領日 {cd}')
        if c.get('status') == 'recorded':
            if not (c.get('singer') or '').strip():
                errs.append('已收錄但缺 singer（實際吟誦者）')
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

    # 狀態判定 ＋ 自動釋放
    today = _dt.date.today().isoformat()
    for c in claims:
        c['state'] = claim_state(c, today, grace_months)
        c['releaseDate'] = _add_months(c['promiseDate'], grace_months) \
            if DATE_RE.match(c.get('promiseDate', '')) else None

    # ★ 自動釋放：已達釋放條件者移出 claims，改列 released。
    #   這樣每次建置後該篇目就真的回到「待認領」，不必靠人記得去刪登記。
    released = [c for c in claims if c['state'] == 'released']
    active = [c for c in claims if c['state'] != 'released']
    for c in released:
        c['releasedOn'] = c['releaseDate']
    claims = active

    n_recorded = sum(1 for c in claims if c['state'] == 'recorded')
    n_claimed = sum(1 for c in claims if c['state'] == 'claimed')
    n_overdue = sum(1 for c in claims if c['state'] == 'overdue')
    n_renego = sum(1 for c in claims if c['state'] == 'renegotiate')
    n_released = len(released)
    per_dialect = {}
    for c in claims:
        d = dmap[c['dialect']['d']]['name']
        s = per_dialect.setdefault(d, {'recorded': 0, 'claimed': 0, 'overdue': 0})
        s[c['state'] if c['state'] in ('recorded',) else 'claimed'] += 1
        if c['state'] == 'overdue':
            s['overdue'] += 1

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
            'nRenegotiate': n_renego,
            'nReleased': n_released,
            'graceMonths': grace_months,
            'promiseMaxMonths': promise_max,
            'perDialect': per_dialect,
        },
        'dialects': dialects,
        'poems': poems,
        'claims': claims,
        'released': released,
    }
    os.makedirs(ASSETS, exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write('/* 自動產生，勿手改 —— build_registry.py（輸入：tools/registry-claims.json ＋ assets/vol1..5.js） */\n')
        fh.write('window.SHENGLV_REGISTRY=' + json.dumps(payload, ensure_ascii=False,
                                                         separators=(',', ':')) + ';\n')
    size = os.path.getsize(OUT)
    print(f'【輸出】assets/registry.js  {size:,} B')
    print(f'【狀態】已收錄 {n_recorded}、已認領 {n_claimed}、已逾期 {n_overdue}、'
          f'待另約 {n_renego}、本次自動釋放 {n_released}；方言 {len(dialects)} 區')
    print(f'        規則：承諾時間上限 {promise_max} 個月，逾期寬限 {grace_months} 個月')
    for d, s in sorted(per_dialect.items()):
        print(f'     {d}：已收錄 {s["recorded"]} / 已認領 {s["claimed"]}')
    print('\n→ 完成。前端逾期由 registry.js 內日期即時計算，不以此報告為準。')


if __name__ == '__main__':
    main()
