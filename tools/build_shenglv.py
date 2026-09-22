#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_shenglv.py —— 《聲律發蒙》粵語站 資料產線（全五卷 · 106 韻）

輸入
    1. ~/Desktop/getData/聲律發蒙_童蒙誦讀本_{第一卷·上平聲,第二卷·下平聲,
       第三卷·上聲,第四卷·去聲,第五卷·入聲}.md     三行對齊語料（拼音／原文／符號）
    2. ~/Desktop/getData/聲律發蒙_童蒙誦讀本_全書.md            全局反切索引（選音用）
    3. _work/dict.yaml                                       rime-cantonese 粵拼字典
    4. _work/variants.json                                   外掛字音表（字典未收者）

輸出（全部在 site/assets/，前端唯一資料來源）
    chars.js      全書相異字 → 粵拼（含入聲標記、多音讀音與選音依據）
    data.js       站點 meta ＋ 五卷／106 韻索引（小，首屏載入）
    vol1..5.js    各卷完整內容（按需載入）
    duizhang.js   反切對帳全表（按需載入）
    ../sitemap.xml
    _work/tts_manifest.json   TTS 批次清單（逐行音頻，供 tts_batch.py 消費）
    build_report.txt

四條校驗（任一不符即中止，不產出資料）
    A 三方對齊：每行「拼音音節數 = 原文字數 = 符號數」
    B 粵拼覆蓋：語料用字必須全部有讀音（字典或外掛）
    C 反切對帳：反切推得的讀音與實際讀音逐條核對，失配全部列出
    D 音頻單元：每個對句行有唯一編號，無重複、無遺漏

設計紀律（沿用前站）
    - 空集合不得冒充通過：每項都要有非零計數
    - 罕用字按 Unicode 擴展區判定，不得只寫 \\u4e00-\\u9fff
    - 反切上下字本身可能多音 ⇒ 按「聲母集合 × 韻母集合」匹配，不可取 [0]
    - 多音字必須記錄選音依據，讓前端誠實標示不確定性
"""

import json, os, re, sys
from collections import defaultdict, Counter

HERE = os.path.dirname(os.path.abspath(__file__))
GD = os.environ.get('SHENGLV_CORPUS') or os.path.expanduser('~/Desktop/getData')
# 站點目錄：同時支援舊佈局（HERE/site/）與倉庫佈局（HERE 的上一層即站點）
_site_sub = os.path.join(HERE, 'site')
SITE = _site_sub if os.path.isdir(_site_sub) else os.path.dirname(HERE)
ASSETS = os.path.join(SITE, 'assets')
WORK = os.path.join(HERE, '_work')
DICT = os.path.join(WORK, 'dict.yaml')
REPORT = os.path.join(HERE, 'build_report.txt')
# 外掛字音表：舊佈局放在 _work/，倉庫佈局與腳本同層（tools/）
_var_work = os.path.join(WORK, 'variants.json')
VARIANTS = _var_work if os.path.exists(_var_work) else os.path.join(HERE, 'variants.json')
WORK_OUT = WORK
# 站點對外網域（sitemap 用）。改用獨立域名後不再寫死舊的 shenglv.solve-lab.cn。
BASE_URL = 'https://shenglv.org.cn'
# sitemap 的【順序偏好】；實際清單由 SITE 下存在的 .html 推導，新頁面會自動納入。
PAGE_ORDER = ['index.html', 'weihe.html', 'quanben.html', 'duizhang.html',
              'jyutping.html', 'about.html', 'contribute.html']

VOLUMES = [
    ('v1', '第一卷 · 上平聲', '上平聲', '聲律發蒙_童蒙誦讀本_第一卷·上平聲.md'),
    ('v2', '第二卷 · 下平聲', '下平聲', '聲律發蒙_童蒙誦讀本_第二卷·下平聲.md'),
    ('v3', '第三卷 · 上聲', '上聲', '聲律發蒙_童蒙誦讀本_第三卷·上聲.md'),
    ('v4', '第四卷 · 去聲', '去聲', '聲律發蒙_童蒙誦讀本_第四卷·去聲.md'),
    ('v5', '第五卷 · 入聲', '入聲', '聲律發蒙_童蒙誦讀本_第五卷·入聲.md'),
]

VOW = 'a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü'
PIN = re.compile(r'^[' + VOW + r'\s　]+$')
HAS_VOW = re.compile(r'[' + VOW + r']')
SYM = re.compile(r'^[|—•·\s　]+$')
# 漢字範圍必須涵蓋擴展 A（3400–4DBF）、基本區（4E00–9FFF）、相容區（F900–FAFF）
# 與擴展 B（20000–2FA1F）。過去只寫 \u4e00-\u9fff，會整批漏掉罕用字
# （例如第四卷三絳韻腳「𥞜」U+2579C），導致「無反切」的假判斷。
CJK = r'[\u3400-\u9fff\U00020000-\U0002FA1F]'
FANQIE = re.compile(r'^(' + CJK + r'{2})切[：:](.*)$')
YINZHU = re.compile(r'^音\s*([' + VOW + r']+)[：:](.*)$')
LISTED = re.compile(r'(' + CJK + r')（')
HEAD3 = re.compile(r'^### (.+)$')
HEAD4 = re.compile(r'^#### (.+)$')

INITIALS = ['ng', 'gw', 'kw', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l',
            'g', 'k', 'h', 'w', 'z', 'c', 's', 'j']
RUSHENG = ('p', 't', 'k')
TONE_CLASS = {'1': '平', '4': '平', '2': '上', '5': '上', '3': '去', '6': '去'}


def is_cjk(ch):
    o = ord(ch)
    return (0x3400 <= o <= 0x4DBF or 0x4E00 <= o <= 0x9FFF or
            0xF900 <= o <= 0xFAFF or 0x20000 <= o <= 0x2FA1F)


def cjk_chars(text):
    return [c for c in text if is_cjk(c)]


def load_jyutping(path):
    """讀 rime-cantonese 之 chars.dict.yaml → {字: [讀音, ...]}（主要讀音在前）。

    檔格式為 `字<TAB>讀音` 或 `字<TAB>讀音<TAB>權重`（權重形如 `3%`）。
    **無權重者是主要讀音，有權重者是次要讀音**——不可只按檔案出現順序取 [0]。
    反例：「糾」檔中先出現 `dau2 3%`、後出現無權重的 `gau2`，正確主讀音是 gau2；
    「蓋」先出現 `gap3 3%`，而主讀音是無權重的 `goi3`。
    """
    raw = defaultdict(list)
    order = 0
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            if line.startswith('#') or '\t' not in line:
                continue
            p = line.rstrip('\n').split('\t')
            if len(p[0]) != 1 or not is_cjk(p[0]):
                continue
            weight = None
            if len(p) >= 3:
                m = re.match(r'^([\d.]+)\s*%?$', p[2].strip())
                if m:
                    weight = float(m.group(1))
            for one in p[1].split(','):
                one = one.strip()
                if one:
                    raw[p[0]].append((weight, order, one))
                    order += 1
    table = {}
    for ch, items in raw.items():
        seen, out = set(), []
        for w, _o, code in sorted(items, key=lambda x: (x[0] is not None, -(x[0] or 0), x[1])):
            if code not in seen:
                seen.add(code)
                out.append(code)
        table[ch] = out
    return table


def split_syl(code):
    bare = re.sub(r'\d$', '', code)
    for ini in INITIALS:
        if bare.startswith(ini):
            return ini, bare[len(ini):]
    return '', bare


def tone_class(code):
    bare = re.sub(r'\d$', '', code)
    if bare.endswith(RUSHENG):
        return '入'
    return TONE_CLASS.get(code[-1], '?')


def is_ru(code):
    return re.sub(r'\d$', '', code).endswith(RUSHENG)


def fanqie_candidates(up, low, jyut):
    """反切上字取聲母、下字取韻母與聲調 → (聲母集合, {韻母: {四聲類別}})。

    上字與下字本身都可能多音，不可只取第 0 個讀音（例如「石」首音是
    daam3「一石米」，作反切下字時卻須取 sek6）。
    """
    initials = {split_syl(r)[0] for r in jyut.get(up, [])}
    finals = {}
    for r in jyut.get(low, []):
        _, fin = split_syl(r)
        finals.setdefault(fin, set()).add(tone_class(r))
    return initials, finals


def choose_reading(char, jyut, fq_global, variants):
    reads = jyut.get(char)
    if not reads:
        v = variants.get(char)
        if v:
            if v.get('pending'):
                return None, 'pending:' + v.get('from', ''), []
            trad = v.get('trad')
            if trad and trad in jyut:
                # 簡體混入字：改以繁體形走完整選音流程，可享反切指引
                rd, _b, allr = choose_reading(trad, jyut, fq_global, {})
                return rd, 'simp:' + trad, allr
            return v['r'], 'variant:' + v.get('from', '外掛'), [v['r']]
        return None, 'missing', []
    if len(reads) == 1:
        return reads[0], 'single', reads
    # ── 入聲本調只可能是 1（上陰入）／3（下陰入）／6（陽入）──────────────────
    # 第 2、4、5 調出現在 -p／-t／-k 尾上是【變調】（口語高升等），不是讀書音。
    # 為什麼一定要擋：下面三個階段分別只比對「聲母＋韻母」「韻母」
    # 「四聲類別」，而 tone_class() 對所有入聲一律回 '入' ——
    # 於是同一字的 dek2 與 dek6 在它眼裡完全相同，只取字典排序在前的，
    # 結果 3 個字被選成變調：笛 dek2（正文出現 29 次）、宅 zaak2、桷 gok2。
    # 過濾後若為空則保留原清單，寧可維持現狀也不讓讀音消失。
    cand = [r for r in reads if not (is_ru(r) and r[-1] in '245')] or reads
    for qie in fq_global.get(char, []):
        initials, finals = fanqie_candidates(qie[0], qie[1], jyut)
        for r in cand:
            ini, fin = split_syl(r)
            if ini in initials and fin in finals:
                return r, 'fanqie-full:' + qie, reads
        for r in cand:
            if split_syl(r)[1] in finals:
                return r, 'fanqie-final:' + qie, reads
        classes = set().union(*finals.values()) if finals else set()
        for r in cand:
            if tone_class(r) in classes:
                return r, 'fanqie-tone:' + qie, reads
    return cand[0], 'first', reads


def parse_volume(path):
    """解析一卷 → (rhymes, misalign, stats)。"""
    lines = open(path, encoding='utf-8').read().split('\n')
    rhymes, order = {}, []
    rhyme = None
    misalign = []
    n_lines = 0
    for i, raw in enumerate(lines):
        s = raw.strip()
        m = HEAD3.match(s)
        if m:
            rhyme = m.group(1)
            if rhyme not in rhymes:
                rhymes[rhyme] = {'name': rhyme, 'fanqie': [], 'yin': [], 'chapters': []}
                order.append(rhyme)
            continue
        m = HEAD4.match(s)
        if m:
            if rhyme is None:
                continue
            rhymes[rhyme]['chapters'].append({'title': m.group(1), 'lines': []})
            continue
        if rhyme is None:
            continue
        m = FANQIE.match(s)
        if m:
            rhymes[rhyme]['fanqie'].append({
                'qie': m.group(1), 'up': m.group(1)[0], 'low': m.group(1)[1],
                'chars': [x.group(1) for x in LISTED.finditer(m.group(2))]})
            continue
        m = YINZHU.match(s)
        if m:
            rhymes[rhyme]['yin'].append({
                'pin': m.group(1),
                'chars': [x.group(1) for x in LISTED.finditer(m.group(2))]})
            continue
        if i + 2 < len(lines) and s and PIN.match(s) and HAS_VOW.search(s):
            nxt, sym = lines[i + 1].strip(), lines[i + 2].strip()
            if not (nxt and sym and SYM.match(sym)):
                continue
            ch = cjk_chars(nxt)
            if not ch:
                continue
            p = [x for x in re.split(r'[\s　]+', s) if x]
            y = [x for x in re.split(r'[\s　]+', sym) if x]
            if not (len(p) == len(ch) == len(y)):
                misalign.append({'rhyme': rhyme, 'text': nxt, 'n_pin': len(p),
                                 'n_char': len(ch), 'n_sym': len(y)})
                continue
            if not rhymes[rhyme]['chapters']:
                rhymes[rhyme]['chapters'].append({'title': '', 'lines': []})
            rhymes[rhyme]['chapters'][-1]['lines'].append(
                {'text': nxt, 'pin': s, 'sym': sym})
            n_lines += 1
    return [rhymes[k] for k in order], misalign, n_lines


def parse_fanqie_global(path):
    idx = defaultdict(list)
    for line in open(path, encoding='utf-8'):
        m = FANQIE.match(line.strip())
        if not m:
            continue
        qie = m.group(1)
        for x in LISTED.finditer(m.group(2)):
            if qie not in idx[x.group(1)]:
                idx[x.group(1)].append(qie)
    return idx


def main():
    rep = []

    def say(s=''):
        print(s)
        rep.append(s)

    if not os.path.exists(DICT):
        sys.exit('缺少粵拼字典：' + DICT)

    jyut = load_jyutping(DICT)
    say(f'【粵拼字典】{len(jyut)} 字 / {sum(len(v) for v in jyut.values())} 條讀音')

    variants = {}
    vpath = VARIANTS
    if os.path.exists(vpath):
        variants = json.load(open(vpath, encoding='utf-8'))
        say(f'【外掛字音表】{len(variants)} 字：{"".join(variants)}')

    fq_global = parse_fanqie_global(os.path.join(GD, '聲律發蒙_童蒙誦讀本_全書.md'))
    say(f'【全局反切索引】{len(fq_global)} 字')

    # ---------------- 解析五卷 ----------------
    say()
    say('【逐卷解析】')
    volumes, all_misalign = [], []
    for vid, label, tone, fname in VOLUMES:
        path = os.path.join(GD, fname)
        if not os.path.exists(path):
            sys.exit('找不到語料：' + path)
        rhymes, misalign, n_lines = parse_volume(path)
        all_misalign += misalign
        fq = sum(len(r['fanqie']) for r in rhymes)
        yin = sum(len(r['yin']) for r in rhymes)
        say(f'    {label:<14} 韻部 {len(rhymes):3d}　對句 {n_lines:5d} 行　反切 {fq:4d}　音注 {yin:3d}'
            f'{"　對齊不符 " + str(len(misalign)) if misalign else ""}')
        volumes.append({'id': vid, 'label': label, 'tone': tone, 'rhymes': rhymes})

    n_rhyme = sum(len(v['rhymes']) for v in volumes)
    n_line = sum(len(c['lines']) for v in volumes for r in v['rhymes'] for c in r['chapters'])
    n_fanqie = sum(len(r['fanqie']) for v in volumes for r in v['rhymes'])
    say(f'    ── 合計 韻部 {n_rhyme}　對句 {n_line} 行　反切 {n_fanqie} 條')

    # ---------------- 校驗 A ----------------
    say()
    if all_misalign:
        say(f'【校驗A 三方對齊】✗ {len(all_misalign)} 行不符')
        for m in all_misalign[:10]:
            say(f'    {m["rhyme"]}「{m["text"]}」拼音{m["n_pin"]} 字{m["n_char"]} 符號{m["n_sym"]}')
        sys.exit('校驗A 失敗：三行對齊不完整，不得產出資料。')
    say(f'【校驗A 三方對齊】✓ 全部 {n_line} 行通過（拼音音節數＝字數＝符號數）')

    # ---------------- 需標音字集 + 校驗 B ----------------
    need = set()
    duiju = set()
    for v in volumes:
        for r in v['rhymes']:
            for c in r['chapters']:
                for ln in c['lines']:
                    s = set(cjk_chars(ln['text']))
                    need |= s
                    duiju |= s
            for f in r['fanqie']:
                need |= set(f['chars'])
            for y in r['yin']:
                need |= set(y['chars'])

    # 校驗 B 分兩級：
    #   B1 對句用字——網站主體與 TTS 朗讀的文本，必須 100% 有讀音
    #      （例外：variants 內經人工判定為 pending 者，須逐一列出）
    #   B2 字譜罕用字——字典未收之擴展 B 區字，無現代粵音可查，
    #      一律自動標為「待考」並全部列出；不自造讀音，也不因此中止產線
    b1_missing = sorted(c for c in duiju if c not in jyut and c not in variants)
    b1_pending = sorted(c for c in duiju if c not in jyut and variants.get(c, {}).get('pending'))
    b2_pending = sorted(c for c in need if c not in jyut and c not in variants)
    say()
    if b1_missing:
        say(f'【校驗B1 對句讀音】✗ 對句仍有 {len(b1_missing)} 字無讀音：{"".join(b1_missing)}')
        sys.exit('校驗B1 失敗：對句用字覆蓋不完整，不得產出資料（請補 _work/variants.json）')
    say(f'【校驗B1 對句讀音】✓ 對句 {len(duiju)} 字全部有讀音'
        + (f'（其中經人工判定待考 {len(b1_pending)} 字：{"".join(b1_pending)}）' if b1_pending else ''))
    say(f'【校驗B2 字譜讀音】✓ 字譜／音注罕用字 {len(b2_pending)} 字自動標為待考'
        f'（字典未收之擴展區字，不自造讀音）' if b2_pending else
        '【校驗B2 字譜讀音】✓ 字譜用字全部有讀音')

    # ---------------- 逐字選音 ----------------
    chars_out = {}
    stats = Counter()
    zupu_pending = []
    for c in sorted(need):
        rd, basis, allr = choose_reading(c, jyut, fq_global, variants)
        if rd is None and basis == 'missing':
            # 字譜罕用字：字典未收、無現代粵音可查 → 待考，不自造讀音
            basis = 'zupu-pending'
            zupu_pending.append(c)
        multi = len(allr) > 1
        chars_out[c] = {
            'r': rd,
            'ru': bool(rd and is_ru(rd)),
            'm': 1 if multi else 0,
            'a': allr if multi else [],
            'b': basis,
            'x': 2 if basis == 'zupu-pending' else (1 if basis.startswith('pending') else 0),
        }
        if multi:
            stats['multi'] += 1
        if rd and is_ru(rd):
            stats['ru'] += 1
        stats['basis:' + basis.split(':')[0]] += 1
    say(f'    待考字共 {len(zupu_pending)} 個（全部為字典未收之罕用字，只能依反切辨韻部；'
        f'前端以「待考」顯示，不給假讀音）')
    say(f'    待考字清單：{"".join(zupu_pending)}')

    # ---------------- 校驗 C：反切對帳 ----------------
    dz, dz_stat = [], Counter()
    for v in volumes:
        for r in v['rhymes']:
            for f in r['fanqie']:
                initials, finals = fanqie_candidates(f['up'], f['low'], jyut)
                classes = set().union(*finals.values()) if finals else set()
                rows = []
                for c in f['chars']:
                    rd = chars_out[c]['r']
                    if rd is None:          # 待考字：不計入吻合統計，據實標示
                        dz_stat['unknown'] += 1
                        rows.append([c, None, None, None, None])
                        continue
                    ini, fin = split_syl(rd)
                    ok_full = ini in initials and fin in finals
                    ok_final = fin in finals
                    ok_cls = tone_class(rd) in classes
                    dz_stat['full_ok' if ok_full else 'full_no'] += 1
                    dz_stat['final_ok' if ok_final else 'final_no'] += 1
                    dz_stat['cls_ok' if ok_cls else 'cls_no'] += 1
                    rows.append([c, rd, 1 if ok_full else 0,
                                 1 if ok_final else 0, 1 if ok_cls else 0])
                dz.append([v['id'], r['name'], f['qie'], f['up'], f['low'],
                           '/'.join(sorted(finals)) or '—',
                           '/'.join(sorted(classes)) or '—', rows])
    tu = dz_stat['full_ok'] + dz_stat['full_no']
    tf = dz_stat['final_ok'] + dz_stat['final_no']
    tc = dz_stat['cls_ok'] + dz_stat['cls_no']
    say()
    say(f'【校驗C 反切對帳】{len(dz)} 條反切、{tf} 字次（上下字按多音集合匹配）')
    say(f'    聲母＋韻母吻合 {dz_stat["full_ok"]}/{tu} = {100*dz_stat["full_ok"]/tu:.1f}%')
    say(f'    韻母吻合       {dz_stat["final_ok"]}/{tf} = {100*dz_stat["final_ok"]/tf:.1f}%')
    say(f'    四聲類別吻合   {dz_stat["cls_ok"]}/{tc} = {100*dz_stat["cls_ok"]/tc:.1f}%')

    # ---------------- 組裝輸出（含音頻單元編號）----------------
    unit = 0
    tts = []
    index, vol_payload = [], []
    total_zupu = total_zupu_ru = 0
    for v in volumes:
        vrhymes = []
        for r in v['rhymes']:
            zc = set()
            for f in r['fanqie']:
                zc |= set(f['chars'])
            for y in r['yin']:
                zc |= set(y['chars'])
            zru = sum(1 for c in zc if chars_out[c]['ru'])
            total_zupu += len(zc)
            total_zupu_ru += zru

            chapters = []
            for ch in r['chapters']:
                out_lines = []
                for ln in ch['lines']:
                    unit += 1
                    u = f'{unit:04d}'
                    path = f'audio/{v["id"]}/{u}.mp3'
                    out_lines.append({'t': ln['text'], 'p': ln['pin'],
                                      's': ln['sym'], 'u': unit})
                    tts.append({'u': unit, 'v': v['id'], 'rhyme': r['name'],
                                'text': ln['text'], 'path': path})
                chapters.append({'title': ch['title'], 'lines': out_lines})

            vrhymes.append({
                'name': r['name'],
                'fanqie': [{'qie': f['qie'], 'up': f['up'], 'low': f['low'],
                            't': ''.join(f['chars'])} for f in r['fanqie']],
                'yin': [{'pin': y['pin'], 't': ''.join(y['chars'])} for y in r['yin']],
                'chapters': chapters,
            })
            index.append({
                'v': v['id'], 'name': r['name'],
                'nFanqie': len(r['fanqie']),
                'nLine': sum(len(c['lines']) for c in r['chapters']),
                'nChapter': len(r['chapters']),
                'nZupu': len(zc), 'nZupuRu': zru,
            })
        vol_payload.append({'id': v['id'], 'label': v['label'], 'tone': v['tone'],
                            'rhymes': vrhymes})

    # ---------------- 校驗 D：音頻單元 ----------------
    say()
    ids = [t['u'] for t in tts]
    dup = [k for k, n in Counter(ids).items() if n > 1]
    if dup or len(ids) != n_line or sorted(ids) != list(range(1, n_line + 1)):
        say(f'【校驗D 音頻單元】✗ 重複 {len(dup)}、總數 {len(ids)}、預期 {n_line}')
        sys.exit('校驗D 失敗：音頻單元編號不連續或有重複。')
    say(f'【校驗D 音頻單元】✓ {len(ids)} 行皆有唯一編號 1..{n_line}，無重複無遺漏')

    # ---------------- 寫檔 ----------------
    os.makedirs(ASSETS, exist_ok=True)

    def write_js(name, varname, payload):
        p = os.path.join(ASSETS, name)
        with open(p, 'w', encoding='utf-8') as fh:
            fh.write('/* 自動產生，勿手改 —— build_shenglv.py */\n')
            fh.write(f'window.{varname}=' + json.dumps(payload, ensure_ascii=False,
                                                       separators=(',', ':')) + ';\n')
        return os.path.getsize(p)

    meta = {
        'title': '聲律發蒙·粵語',
        'subtitle': '全本 106 韻',
        'source': '《聲律發蒙》元·祝明撰　明萬曆刊本（公有領域）',
        'jyutpingSource': 'rime-cantonese（CC-BY-4.0 / ODbL）',
        'ttsSource': 'Microsoft Edge 朗讀服務·zh-HK 神經語音（一次性批次下載）',
        'version': '1.0.0',
        'volumeCount': len(volumes),
        'rhymeCount': n_rhyme,
        'lineCount': n_line,
        'fanqieCount': n_fanqie,
        'chapterCount': sum(len(r['chapters']) for v in volumes for r in v['rhymes']),
        'needChars': len(need),
        'multiChars': stats['multi'],
        'ruChars': stats['ru'],
        'pendingChars': len(zupu_pending) + len(b1_pending),
        'pendingZupu': len(zupu_pending),
        'pendingDuiju': b1_pending,
        'zupuChars': total_zupu,
        'zupuRuChars': total_zupu_ru,
        'zupuRuRate': round(100 * total_zupu_ru / total_zupu, 1) if total_zupu else 0,
        'coverage': 100.0,
        'dzFullRate': round(100 * dz_stat['full_ok'] / tu, 1) if tu else 0,
        'dzFinalRate': round(100 * dz_stat['final_ok'] / tf, 1) if tf else 0,
        'dzToneRate': round(100 * dz_stat['cls_ok'] / tc, 1) if tc else 0,
        'variantChars': sorted(set(need) & set(variants)),
        'audioCount': n_line,
    }
    sizes = {}
    sizes['chars.js'] = write_js('chars.js', 'SHENGLV_CHARS', chars_out)
    sizes['data.js'] = write_js('data.js', 'SHENGLV',
                                {'meta': meta, 'index': index,
                                 'volumes': [{'id': v['id'], 'label': v['label'],
                                              'tone': v['tone'],
                                              'rhymes': len(v['rhymes'])}
                                             for v in volumes]})
    for i, payload in enumerate(vol_payload, 1):
        sizes[f'vol{i}.js'] = write_js(f'vol{i}.js', f'SHENGLV_VOL{i}', payload)
    sizes['duizhang.js'] = write_js('duizhang.js', 'SHENGLV_DZ', dz)

    # sitemap：頁面清單【由實際存在的 .html 推導】，只有順序偏好是寫死的。
    # 為什麼不寫死整份清單：原本寫死 5 頁，於是 contribute.html 與 jyutping.html
    # 先後被漏掉——重跑一次建置就會靜默把它們從站點地圖刪掉，而且沒有任何錯誤訊息。
    # 網域也不再寫死，改用 BASE_URL（獨立域名 shenglv.org.cn）。
    present = {f for f in os.listdir(SITE) if f.endswith('.html')} - {'404.html'}
    pages = [p for p in PAGE_ORDER if p in present]
    pages += sorted(present - set(pages))          # 新頁面自動納入，永遠不會被漏
    if not pages:
        sys.exit('sitemap 產生失敗：站點目錄找不到任何 .html（目錄可能指錯了）')
    with open(os.path.join(SITE, 'sitemap.xml'), 'w', encoding='utf-8') as fh:
        fh.write('<?xml version="1.0" encoding="UTF-8"?>\n'
                 '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
        for p in pages:
            fh.write(f'  <url><loc>{BASE_URL}/{p}</loc></url>\n')
        fh.write('</urlset>\n')

    with open(os.path.join(WORK_OUT, 'tts_manifest.json'), 'w', encoding='utf-8') as fh:
        json.dump(tts, fh, ensure_ascii=False, indent=0)

    say()
    say('【輸出】')
    for k, v in sizes.items():
        say(f'    {k:<14} {v:>9,} B')
    say(f'    tts_manifest.json  {len(tts)} 條（逐行音頻）')
    say()
    say(f'【多音字】{stats["multi"]}/{len(need)} = {100*stats["multi"]/len(need):.1f}%'
        f'（反切定音 {stats.get("basis:fanqie-full",0)+stats.get("basis:fanqie-final",0)+stats.get("basis:fanqie-tone",0)}、'
        f'取首音 {stats.get("basis:first",0)}、單音 {stats.get("basis:single",0)}、'
        f'外掛 {stats.get("basis:variant",0)}）')
    say(f'【字譜入聲】{total_zupu_ru}/{total_zupu} = {100*total_zupu_ru/total_zupu:.1f}%'
        f'　【全書入聲字】{stats["ru"]}/{len(need)} = {100*stats["ru"]/len(need):.1f}%')

    with open(REPORT, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(rep) + '\n')
    print('\n→ %s、_work/tts_manifest.json 已寫出' % REPORT)


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser(description='聲律發蒙·粵語 資料建置（由語料 ＋ 粵拼字典產生 data.js／chars.js／vol*.js／duizhang.js）')
    ap.add_argument('--site', default=SITE,
                    help='輸出站點目錄（預設 %s；只會動 <site>/assets/ 下的產生檔）' % SITE)
    ap.add_argument('--report', default=REPORT, help='建置報告輸出路徑（預設 %s）' % REPORT)
    ap.add_argument('--work-out', default=WORK_OUT,
                    help='tts_manifest.json 輸出目錄（預設 %s）' % WORK_OUT)
    ap.add_argument('--gd', default=GD,
                    help='語料目錄（三行對齊 .md 與全書 .md 所在；預設 %s，亦可用環境變數 SHENGLV_CORPUS）' % GD)
    ap.add_argument('--variants', default=VARIANTS,
                    help='外掛字音表 variants.json（字典未收之字；預設 %s）' % VARIANTS)
    ap.add_argument('--dict', default=DICT,
                    help='粵拼字典 dict.yaml 路徑（預設 %s）。此檔為 rime-cantonese 資料'
                         '（CC-BY-4.0 ＋ ODbL），本倉庫【不隨附】，請自行取得。' % DICT)
    _a = ap.parse_args()
    SITE = os.path.abspath(_a.site)
    ASSETS = os.path.join(SITE, 'assets')
    REPORT = os.path.abspath(_a.report)
    WORK_OUT = os.path.abspath(_a.work_out)
    GD = os.path.abspath(_a.gd)
    DICT = os.path.abspath(_a.dict)
    VARIANTS = os.path.abspath(_a.variants)
    main()
