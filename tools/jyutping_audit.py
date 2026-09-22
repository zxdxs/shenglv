#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
jyutping_audit.py —— 聲律發蒙語料 × 粵拼字典 覆蓋率與反切交叉校驗

用途
    在任何改動後重跑，回答四個問題：
      1. 語料需要的字，粵拼字典覆蓋多少？
      2. 其中多少是多音字（真正的人工工作量）？
      3. 字譜反切與粵拼是否對得上？（自動校驗集）
      4. 入聲卷的字有多少真的帶 -p/-t/-k？（立論的可量化證明）

用法
    python3 jyutping_audit.py --corpus ~/Desktop/getData --dict ./dict.yaml
    python3 jyutping_audit.py --corpus ~/Desktop/getData --dict ./dict.yaml --volume 第五卷

設計原則（沿用本專案紀律）
    - 反切校驗是「對照組」：沒有它，粵拼標注無從驗證
    - 未命中字必須逐字列出，不得只報覆蓋率
    - 失配必須可枚舉、可解釋，不得當成誤差抹去
"""

import argparse, glob, os, re, sys
from collections import Counter, defaultdict

CJK = re.compile(r'[\u4e00-\u9fff]')
FANQIE = re.compile(r'^([\u4e00-\u9fff]{2})切[：:](.*)$')
LISTED = re.compile(r'([\u4e00-\u9fff])（')
HAS_LATIN = re.compile(r'[A-Za-z]')

# 粵拼聲母（由長到短，避免 ng/g、gw/g 誤切）
INITIALS = ['ng', 'gw', 'kw', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l',
            'g', 'k', 'h', 'w', 'z', 'c', 's', 'j']
RUSHENG_TAILS = ('p', 't', 'k')
TONE_CLASS = {'1': '平', '4': '平', '2': '上', '5': '上', '3': '去', '6': '去'}


def load_jyutping(path):
    """讀 rime-cantonese 之 chars.dict.yaml → {字: [粵拼, ...]}"""
    table = defaultdict(list)
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            if line.startswith('#') or '\t' not in line:
                continue
            parts = line.rstrip('\n').split('\t')
            if len(parts[0]) != 1 or not CJK.fullmatch(parts[0]):
                continue
            for code in parts[1].split(','):
                code = code.strip()
                if code and code not in table[parts[0]]:
                    table[parts[0]].append(code)
    return table


def parse_reader(path):
    """解析《童蒙誦讀本》→ (字譜[(反切, [字...])], 對句用字集合)

    對句行判定：中文行，且上下相鄰非空行中含拼音行（三行對齊結構）。
    """
    lines = open(path, encoding='utf-8').read().split('\n')
    zupu, duiju = [], set()
    for i, line in enumerate(lines):
        s = line.strip()
        if not s or s.startswith('#') or s.startswith('|'):
            continue
        m = FANQIE.match(s)
        if m:
            zupu.append((m.group(1), [x.group(1) for x in LISTED.finditer(m.group(2))]))
            continue
        if not CJK.search(s) or HAS_LATIN.search(s):
            continue
        neighbours = [lines[j].strip() for j in (i - 1, i + 1, i - 2, i + 2)
                      if 0 <= j < len(lines) and lines[j].strip()]
        if any(HAS_LATIN.search(x) for x in neighbours):
            duiju |= set(CJK.findall(s))
    return zupu, duiju


def split_syllable(code):
    """粵拼音節 → (聲母, 韻母)，去聲調。"""
    bare = re.sub(r'\d$', '', code)
    for ini in INITIALS:
        if bare.startswith(ini):
            return ini, bare[len(ini):]
    return '', bare


def tone_class(code):
    """粵拼音節 → 中古四聲類別（平／上／去／入）。"""
    bare = re.sub(r'\d$', '', code)
    if bare.endswith(RUSHENG_TAILS):
        return '入'
    return TONE_CLASS.get(code[-1], '?')


def is_rusheng(code):
    return re.sub(r'\d$', '', code).endswith(RUSHENG_TAILS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--corpus', required=True, help='getData 目錄')
    ap.add_argument('--dict', required=True, help='jyut6ping3.chars.dict.yaml')
    ap.add_argument('--volume', default=None, help='只驗某一卷，如「第五卷」')
    args = ap.parse_args()

    jyut = load_jyutping(args.dict)
    print(f"【粵拼字典】{args.dict}")
    print(f"  單字 {len(jyut)} 個，總讀音 {sum(len(v) for v in jyut.values())} 條\n")

    files = sorted(f for f in glob.glob(os.path.join(args.corpus, '*誦讀本*.md'))
                   if '校對報告' not in f)
    if args.volume:
        files = [f for f in files if args.volume in os.path.basename(f)]
    if not files:
        sys.exit("找不到語料檔案")

    zupu, duiju = [], set()
    print("【逐檔】")
    for f in files:
        z, d = parse_reader(f)
        zupu += z
        duiju |= d
        print(f"  {os.path.basename(f):<44} 字譜反切 {len(z):5d}　對句用字 {len(d):5d}")

    zupu_chars = {c for _, cs in zupu for c in cs}
    need = zupu_chars | duiju
    print(f"\n【語料規模】字譜字 {len(zupu_chars)}｜對句用字 {len(duiju)}｜需標音聯集 {len(need)}")

    # ---- 1. 覆蓋率（未命中必須逐字列出）----
    missing = sorted(c for c in need if c not in jyut)
    hit = len(need) - len(missing)
    print(f"\n【覆蓋率】{hit}/{len(need)} = {100 * hit / len(need):.1f}%")
    print(f"  未命中 {len(missing)} 字：{''.join(missing) if missing else '無'}")

    # ---- 2. 多音字＝真正工作量 ----
    multi = [c for c in need if len(jyut.get(c, [])) > 1]
    print(f"\n【多音字】{len(multi)}/{len(need)} = {100 * len(multi) / len(need):.1f}%"
          f"　← 需依文讀／平仄判讀，這才是人工工作量")

    # ---- 3. 反切交叉校驗 ----
    tot = ini_fin_ok = fin_ok = tone_ok = 0
    fin_bad = Counter()
    for fanqie, chars in zupu:
        a, b = fanqie[0], fanqie[1]
        if a not in jyut or b not in jyut or not chars:
            continue
        ini_a, fin_a = split_syllable(jyut[a][0])
        _, fin_b = split_syllable(jyut[b][0])
        cls_b = tone_class(jyut[b][0])
        for c in chars:
            if c not in jyut:
                continue
            tot += 1
            reads = jyut[c]
            if ini_a + fin_b in {split_syllable(x)[0] + split_syllable(x)[1] for x in reads}:
                ini_fin_ok += 1
            if fin_b in {split_syllable(x)[1] for x in reads}:
                fin_ok += 1
            else:
                fin_bad[f"{fanqie}切 {c}　下字韻={fin_b}　實得"
                        f"{'/'.join(split_syllable(x)[1] for x in reads)}"] += 1
            if cls_b in {tone_class(x) for x in reads}:
                tone_ok += 1
    if tot:
        print(f"\n【反切交叉校驗】可校驗 {tot} 字次")
        print(f"  聲母＋韻母吻合　{ini_fin_ok:6d} = {100 * ini_fin_ok / tot:5.1f}%"
              f"　（低是正常的：中古全濁清化／云母等未建模）")
        print(f"  只比韻母吻合　　{fin_ok:6d} = {100 * fin_ok / tot:5.1f}%")
        print(f"  只比四聲類別吻合{tone_ok:6d} = {100 * tone_ok / tot:5.1f}%")
        print("  韻母失配 Top 6（補上中古→粵語對應後，這些即待查清單）：")
        for k, v in fin_bad.most_common(6):
            print(f"    {k}")

    # ---- 4. 入聲可聽辨率（字譜字與對句用字必須分開報）----
    #     字譜字＝該韻部所收之韻字，理應幾乎全為入聲；
    #     對句用字含句身，只有韻腳才受押韻約束，比例天然較低。混報會誤讀。
    def rus_rate(charset):
        cs = [c for c in charset if c in jyut]
        r = [c for c in cs if any(is_rusheng(x) for x in jyut[c])]
        return len(r), len(cs), (100 * len(r) / len(cs) if cs else 0.0)

    for label, charset in (('字譜字（韻部所收韻字）', zupu_chars),
                           ('對句用字（含句身，僅韻腳受限）', duiju),
                           ('全部需標音字', need)):
        r, n, pct = rus_rate(charset)
        print(f"\n【入聲辨識】{label}：{r}/{n} = {pct:.1f}% 帶 -p/-t/-k")


if __name__ == '__main__':
    main()
