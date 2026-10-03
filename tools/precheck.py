#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
precheck.py —— 聲律發蒙·中文聲韻站 上站前自檢（全本 106 韻＋音頻＋分工表）

每一項都必須有非零計數才算通過（空集合不得冒充通過）。

① HTML 標籤配平             抓刪改造成的標籤失衡
② 本地資源引用存在           抓漏打包
③ app.js 取用的 id 存在於頁面  抓「選取器打錯、區塊永遠空白」
④ 資料檔可解析且計數非零      抓產線靜默失敗
⑤ 錨點與內部連結可達          抓死連結
⑥ 關鍵宣稱與資料一致          抓文案與數據不符（本專案高發病）
⑦ 音頻完整性                 每一行對句都要有音檔；數量與 meta 相符
⑧ 字表完整性                 vol*.js 內出現的每個字都要在 chars.js 有讀音或明確標為待考
⑨ 粵拼點讀音檔完整性（新）     jyutping.html 每個 data-r 都要有 audio/jyutping/<讀音>.mp3，
                            且不得有孤兒音檔。音檔缺失是「點了沒聲音」的靜默失敗，必須擋。
⑩ 入聲本調                   chars.js 入聲字不得標 2／4／5 調（那是變調，不是讀書音）
⑪ 分工表（新）                registry.js 主表與 vol 檔逐行一致；認領記錄的序號、
                            方言點詞表、狀態／審核枚舉、日期、音頻存在性逐條校驗
"""

import json, os, re, sys
import xml.etree.ElementTree as ET
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
# 站點目錄：同時支援兩種放置方式——
#   舊佈局   <專案>/precheck.py       站點在 <專案>/site/
#   倉庫佈局 <專案>/tools/precheck.py 站點就是 <專案>/
# 這樣同一支腳本放在哪裡都跑得起來，不必改路徑。
_site_sub = os.path.join(HERE, 'site')
SITE = _site_sub if os.path.isdir(_site_sub) else os.path.dirname(HERE)
ASSETS = os.path.join(SITE, 'assets')
PAGES = ['index.html', 'weihe.html', 'fengong.html', 'canyu.html', 'wip.html', 'quanben.html',
         'duizhang.html', 'jyutping.html', 'contribute.html', 'jiucuo.html', 'rongyu.html', 'about.html', 'shengyun.html', '404.html']

fails, warns, checks = [], [], []


def ok(name, detail):
    checks.append((name, True, detail))


def bad(name, detail):
    checks.append((name, False, detail))
    fails.append(f'{name}：{detail}')


def strip_js(raw):
    """取出 `window.XXX=...;` 的 JSON 部分。"""
    return json.loads(raw[raw.index('=') + 1:].rstrip().rstrip(';'))


def cjk_chars(s):
    return [c for c in s if 0x3400 <= ord(c) <= 0x9fff or 0x20000 <= ord(c) <= 0x2FA1F]


def main():
    # ---------- ① 標籤配平 ----------
    VOID = {'meta', 'link', 'br', 'hr', 'img', 'input', 'source', 'area', 'base', 'col'}
    total_tags = 0
    tag_problems = []
    for p in PAGES:
        path = os.path.join(SITE, p)
        if not os.path.exists(path):
            tag_problems.append(f'{p} 不存在')
            continue
        html = open(path, encoding='utf-8').read()
        stack, problems = [], []
        for m in re.finditer(r'<(/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(/?)>', html):
            closing, tag, selfclose = m.group(1), m.group(2).lower(), m.group(4)
            if tag in VOID or selfclose:
                continue
            line = html[:m.start()].count('\n') + 1
            total_tags += 1
            if closing:
                if not stack:
                    problems.append(f'多餘 </{tag}> @行{line}')
                elif stack[-1][0] != tag:
                    problems.append(f'</{tag}> 對不上 <{stack[-1][0]}> @行{line}')
                    stack.pop()
                else:
                    stack.pop()
            else:
                stack.append((tag, line))
        if stack:
            problems.append(f'未閉合：{stack}')
        if problems:
            tag_problems.append(f'{p}：{problems[:3]}')
    if tag_problems:
        bad('① 標籤配平', '；'.join(tag_problems))
    else:
        ok('① 標籤配平', f'{len(PAGES)} 頁全數配平（檢查 {total_tags} 個標籤）')

    # ---------- ② 本地資源引用 ----------
    refs, missing = 0, []
    for page in PAGES:
        page_path = os.path.join(SITE, page)
        if not os.path.exists(page_path):
            continue
        html = open(page_path, encoding='utf-8').read()
        for m in re.finditer(r'(?:href|src)="([^"]+)"', html):
            u = m.group(1)
            if u.startswith(('http', 'mailto:', '#', 'data:')):
                continue
            u2 = u.split('#')[0].split('?')[0]
            if not u2:
                continue
            refs += 1
            fp = os.path.join(SITE, u2.lstrip('/'))
            if not os.path.exists(fp):
                missing.append(f'{page} → {u}（不存在）')
            elif u.endswith('.mp3') and os.path.getsize(fp) < 800:
                missing.append(f'{page} → {u}（僅 {os.path.getsize(fp)} B，音頻可能未合成）')
    if missing:
        bad('② 資源引用', f'{len(missing)} 個有問題：{missing[:5]}')
    else:
        ok('② 資源引用', f'{refs} 個本地引用全部存在且非空')

    # ---------- ③ app.js 取用的 id ----------
    app = open(os.path.join(ASSETS, 'app.js'), encoding='utf-8').read()
    used = set(re.findall(r"\$\('#([A-Za-z0-9_-]+)'\)", app))
    present = set()
    for p in PAGES:
        present |= set(re.findall(r'id="([A-Za-z0-9_-]+)"',
                                  open(os.path.join(SITE, p), encoding='utf-8').read()))
    dead = sorted(used - present)
    if dead:
        bad('③ 選取器', f'app.js 取用但頁面不存在：{dead}')
    elif not used:
        bad('③ 選取器', 'app.js 未取用任何 id（檢查正則是否失效）')
    else:
        ok('③ 選取器', f'app.js 取用 {len(used)} 個 id，全部存在於頁面')

    # ---------- ④ 資料檔可解析 ----------
    try:
        M = strip_js(open(os.path.join(ASSETS, 'data.js'), encoding='utf-8').read())['meta']
        CH = strip_js(open(os.path.join(ASSETS, 'chars.js'), encoding='utf-8').read())
        DZ = strip_js(open(os.path.join(ASSETS, 'duizhang.js'), encoding='utf-8').read())
    except Exception as e:
        bad('④ 資料檔', f'無法解析：{e}')
        return report()
    zeros = [k for k in ('volumeCount', 'rhymeCount', 'lineCount', 'fanqieCount',
                         'needChars', 'zupuChars', 'zupuRuChars', 'audioCount')
             if not M.get(k)]
    if zeros:
        bad('④ 資料檔', f'計數為零（產線可能靜默失敗）：{zeros}')
    elif not CH or not DZ:
        bad('④ 資料檔', f'chars.js 或 duizhang.js 為空（chars={len(CH)} dz={len(DZ)}）')
    else:
        ok('④ 資料檔', f"data.js meta；chars.js {len(CH)} 字；duizhang.js {len(DZ)} 條反切")

    # ---------- ⑤ 連結 ----------
    # ★ 先去掉 HTML 註解再抽 id 與連結。否則註解裡提到的 id／href 會混進來：
    #   實測時我在 fengong.html 的註解寫了「id="fy" 是對外錨點」，
    #   於是就算把真正的 id="fy" 拿掉，錨點檢查仍會誤判為通過——
    #   閘門被自己的說明文字騙過去了。
    def strip_comments(h):
        return re.sub(r'<!--.*?-->', '', h, flags=re.S)

    links, dead_links = 0, []
    page_ids = {}
    for p in PAGES:
        page_ids[p] = set(re.findall(
            r'id="([^"]+)"',
            strip_comments(open(os.path.join(SITE, p), encoding='utf-8').read())))
    for p in PAGES:
        # ★ 404.html 用絕對路徑是**正確的**：它可能在任意深度被服務，
        #   相對路徑在那裡反而會斷。故不把它的 /xxx 當死鏈。
        if p == '404.html':
            continue
        html = strip_comments(open(os.path.join(SITE, p), encoding='utf-8').read())
        for m in re.finditer(r'href="([^"]+)"', html):
            u = m.group(1)
            if u.startswith(('http', 'mailto:', '#')):
                continue
            links += 1
            fn, _, frag = u.partition('#')
            if fn and not os.path.exists(os.path.join(SITE, fn.lstrip('/'))):
                dead_links.append(f'{p} → {u}（檔案不存在）')
                continue
            # ★ 錨點也要驗。先前只驗檔存在，於是 fengong.html#fy 這種
            #   「檔案在、錨點不在」的死鏈四頁齊發卻一路綠燈。
            tgt = fn.lstrip('/') or p
            if frag and tgt in page_ids and frag not in page_ids[tgt]:
                dead_links.append(f'{p} → {u}（錨點 {frag} 不存在於 {tgt}）')

    # sitemap：不只要「loc 可達」，還要結構正確、且涵蓋每一頁。
    # ★ 舊檢查只用正則抽 <loc> 再驗檔存在，因而漏掉兩種真缺陷：
    #   ① <url> 被嵌進 <loc> 裡——XML 合法，但違反 sitemap schema，搜尋引擎會拒收；
    #   ② 新頁面忘了加進 sitemap（shengyun.html 就是這樣漏的）。
    #   故改為用 XML 解析器驗結構，再比對 PAGES。
    sm_path = os.path.join(SITE, 'sitemap.xml')
    sm_raw = open(sm_path, encoding='utf-8').read()
    NS = '{http://www.sitemaps.org/schemas/sitemap/0.9}'
    sm_bad = []
    try:
        root = ET.fromstring(sm_raw)
    except ET.ParseError as e:
        sm_bad.append(f'sitemap.xml 不是合法 XML：{e}')
        root = None
    sm_files = []
    if root is not None:
        if root.tag != NS + 'urlset':
            sm_bad.append(f'sitemap 根元素應為 urlset，實為 {root.tag}')
        for i, u in enumerate(root.findall(NS + 'url')):
            loc = u.find(NS + 'loc')
            if loc is None:
                sm_bad.append(f'sitemap 第 {i+1} 個 <url> 沒有 <loc>')
                continue
            if len(loc):      # <loc> 內不得再有元素——正是先前那個缺陷
                sm_bad.append(f'sitemap 第 {i+1} 個 <loc> 內嵌了元素（結構錯誤）')
            t = (loc.text or '').strip()
            if not t.startswith('https://shenglv.org.cn/'):
                sm_bad.append(f'sitemap loc 不是本站網址：{t!r}')
                continue
            sm_files.append(t.rsplit('/', 1)[-1])
    want = [p for p in PAGES if p != '404.html']
    missing = [p for p in want if p not in sm_files]
    if missing:
        sm_bad.append('sitemap 漏列頁面：' + '、'.join(missing))
    for f in sm_files:
        if not os.path.exists(os.path.join(SITE, f)):
            dead_links.append(f'sitemap → {f}')

    if dead_links:
        bad('⑤ 連結', f'{dead_links}')
    elif sm_bad:
        bad('⑤ 連結', f'{sm_bad}')
    else:
        ok('⑤ 連結', f'{links} 個頁面連結 ＋ sitemap {len(sm_files)} 條，'
                     f'結構正確且涵蓋全部 {len(want)} 頁')

    # ---------- ⑥ 宣稱一致 ----------
    idx = open(os.path.join(SITE, 'index.html'), encoding='utf-8').read()
    claims = [
        ('首頁引用 zupuRuChars 且非零', 'data-m="zupuRuChars"' in idx and M['zupuRuChars'] > 0),
        ('首頁引用 zupuRuRate 且合理', 'data-m="zupuRuRate"' in idx and 0 < M['zupuRuRate'] <= 100),
        ('首頁未把全部字誤標為字譜字', 'data-m="ruChars" data-fmt="ruShare"' not in idx),
        ('首頁引用音頻數且非零', 'data-m="audioCount"' in idx and M['audioCount'] > 0),
        ('外掛字表非空', len(M.get('variantChars', [])) > 0),
        ('待考字數已揭露', 'pendingZupu' in idx and M.get('pendingZupu', 0) > 0),
        ('對帳率非零', M.get('dzToneRate', 0) > 0),
    ]
    bad_claims = [c for c, v in claims if not v]
    if bad_claims:
        bad('⑥ 宣稱一致', f'{bad_claims}')
    else:
        ok('⑥ 宣稱一致', f'{len(claims)} 項宣稱與資料相符（含「字譜字」與「全部字」不得混用）')

    # ---------- ⑦ 音頻完整性 ----------
    audio_root = os.path.join(SITE, 'audio')
    have = 0
    unit_ok = 0
    unit_missing = []
    for vid in ('v1', 'v2', 'v3', 'v4', 'v5'):
        d = os.path.join(audio_root, vid)
        if os.path.isdir(d):
            have += len([f for f in os.listdir(d) if f.endswith('.mp3')])
    # 每一行對句都要有檔（u 為全域連續編號）
    for vol in range(1, 6):
        raw = open(os.path.join(ASSETS, f'vol{vol}.js'), encoding='utf-8').read()
        V = strip_js(raw)
        for r in V['rhymes']:
            for ch in r['chapters']:
                for ln in ch['lines']:
                    p = os.path.join(audio_root, f'V{vol}'.lower(), f'{ln["u"]:04d}.mp3')
                    if os.path.exists(p) and os.path.getsize(p) > 800:
                        unit_ok += 1
                    elif len(unit_missing) < 8:
                        unit_missing.append(f'{ln["u"]}')
    if unit_missing:
        bad('⑦ 音頻完整性', f'缺檔之對句編號：{unit_missing}（共 {M["lineCount"]} 行需檔）')
    elif M['audioCount'] != have:
        bad('⑦ 音頻完整性', f'meta 稱 {M["audioCount"]} 檔，實際 {have} 檔')
    elif not have:
        bad('⑦ 音頻完整性', '音頻數為零（空集合不得冒充通過）')
    else:
        ok('⑦ 音頻完整性', f'{have} 個音檔，對應 {unit_ok}/{M["lineCount"]} 行對句，逐一存在')

    # ---------- ⑧ 字表完整性 ----------
    need_chars = set()
    for vol in range(1, 6):
        V = strip_js(open(os.path.join(ASSETS, f'vol{vol}.js'), encoding='utf-8').read())
        for r in V['rhymes']:
            for f in r['fanqie']:
                need_chars |= set(cjk_chars(f['t']))
            for y in r['yin']:
                need_chars |= set(cjk_chars(y['t']))
            for ch in r['chapters']:
                for ln in ch['lines']:
                    need_chars |= set(cjk_chars(ln['t']))
    absent = sorted(c for c in need_chars if c not in CH)
    no_reading = sorted(c for c in need_chars
                        if c in CH and not CH[c].get('r') and not CH[c].get('x'))
    if absent:
        bad('⑧ 字表完整性', f'{len(absent)} 字在 vol 檔出現但 chars.js 無記錄：{"".join(absent[:20])}')
    elif no_reading:
        bad('⑧ 字表完整性', f'{len(no_reading)} 字既無讀音也未標待考：{"".join(no_reading[:20])}')
    elif not need_chars:
        bad('⑧ 字表完整性', '未從 vol 檔取得任何字（正則或格式可能失效）')
    else:
        pend = sum(1 for c in need_chars if CH[c].get('x'))
        ok('⑧ 字表完整性', f'{len(need_chars)} 字全部有讀音或明確標為待考'
                           f'（待考 {pend} 字，佔 {100*pend/len(need_chars):.1f}%）')

    # ---------- ⑨ 粵拼點讀音檔完整性（2026-09-21 新增；同日修掉循環論證）----------
    # 可點元素有兩種來源：
    #   data-r="<讀音>"   → audio/jyutping/<讀音>.mp3
    #   data-src="<路徑>" → 直接指向既有音檔（例如「南對北」＝ audio/v1/0001.mp3）
    #
    # ★ 必須比對【頁面上顯示出來的讀音】，不是只比對 data-r。
    #   第一版只做「data-r ↔ 音檔」互比：兩邊來自同一次抽取，數量必然相等、
    #   永遠全綠，卻漏掉「顯示了讀音但沒被標記」的第二例字（邊 bin1、袍 pou4…共 9 個）。
    #   那是循環論證——拿標記驗標記。現在改成從畫面文字（span.muted／td.r／data-r）反推需求。
    jp_page = os.path.join(SITE, 'jyutping.html')
    if os.path.exists(jp_page):
        jp_html = open(jp_page, encoding='utf-8').read()
        shown = set(re.findall(r'data-r="([a-z]{1,4}[1-6])"', jp_html))
        shown |= set(re.findall(r'<span class="muted">([a-z]{1,4}[1-6])</span>', jp_html))
        for cell in re.findall(r'<td class="r[^"]*">([^<]*)</td>', jp_html):
            shown |= set(re.findall(r'\b([a-z]{1,4}[1-6])\b', cell))
        srcs = re.findall(r'data-src="([^"]+)"', jp_html)
        jp_dir = os.path.join(audio_root, 'jyutping')
        jpfiles = set()
        if os.path.isdir(jp_dir):
            jpfiles = {os.path.splitext(f)[0] for f in os.listdir(jp_dir) if f.endswith('.mp3')}
        miss = sorted(shown - jpfiles)
        orphan = sorted(jpfiles - shown)
        src_bad = [s for s in srcs if not os.path.exists(os.path.join(SITE, s))]
        if not shown:
            bad('⑨ 粵拼點讀', 'jyutping.html 找不到任何顯示中的讀音（選取器或標記格式可能失效）')
        elif miss:
            bad('⑨ 粵拼點讀',
                f'{len(miss)} 個「頁面顯示但沒有音檔」的讀音（點了不會有聲音）：{miss[:10]}')
        elif orphan:
            bad('⑨ 粵拼點讀', f'{len(orphan)} 個音檔沒有對應讀音（孤兒）：{orphan[:10]}')
        elif src_bad:
            bad('⑨ 粵拼點讀', f'data-src 指向不存在的檔案：{src_bad[:5]}')
        else:
            ok('⑨ 粵拼點讀', f'頁面顯示 {len(shown)} 個讀音 ↔ {len(jpfiles)} 個音檔，無缺漏亦無孤兒'
                            f'（另 {len(srcs)} 個 data-src 指向既有音檔）')

    # ---------- ⑩ 入聲本調（2026-09-21 新增，配合選音缺陷修復）----------
    # 粵語入聲只可能是第 1（上陰入）／3（下陰入）／6（陽入）調；
    # 落成第 2、4、5 調是【變調】（口語高升等），不是讀書音。
    # 守的是真實發生過的缺陷：build_shenglv.py 的選音只比對聲母／韻母／四聲類別，
    # 而 tone_class() 對所有入聲一律回「入」⇒ 同一字的 dek2 與 dek6 無法區分，
    # 就取了字典排序在前的變調（笛 dek2／宅 zaak2／桷 gok2）。
    ru_pairs = [(c, v['r']) for c, v in CH.items() if v.get('r') and v.get('ru')]
    bad_ru = [(c, r) for c, r in ru_pairs if r[-1] not in '136']
    if not ru_pairs:
        bad('⑩ 入聲本調', 'chars.js 找不到任何入聲字（ru 旗標或資料格式可能失效）')
    elif bad_ru:
        bad('⑩ 入聲本調', f'{len(bad_ru)} 個入聲字標了非本調（2／4／5）：{bad_ru[:8]}')
    else:
        d = Counter(r[-1] for _, r in ru_pairs)
        ok('⑩ 入聲本調', f'{len(ru_pairs)} 個入聲字全部落在第 1、3、6 調'
                         f'（上陰入 {d.get("1",0)}、下陰入 {d.get("3",0)}、陽入 {d.get("6",0)}）')

    # ---------- ⑪ 分工表（registry：篇目主表＋認領/收錄登記）----------
    # 主表必須與 vol 檔【逐行一致】（首句＋坐標）；認領記錄逐條校驗。
    try:
        REG = strip_js(open(os.path.join(ASSETS, 'registry.js'), encoding='utf-8').read())
    except Exception as e:
        bad('⑪ 分工表', f'registry.js 無法解析：{e}')
        return report()
    poems, claims, dialects = REG.get('poems', []), REG.get('claims', []), REG.get('dialects', [])
    errs = []
    if len(poems) != 376:
        errs.append(f'篇目 {len(poems)} ≠ 376')
    if [p.get('seq') for p in poems] != list(range(1, 377)):
        errs.append('序號不連續 1..376')
    pidx = 0
    for vol in range(1, 6):
        V = strip_js(open(os.path.join(ASSETS, f'vol{vol}.js'), encoding='utf-8').read())
        for r in V['rhymes']:
            for ch in r['chapters']:
                if pidx >= len(poems):
                    errs.append('poems 比 vol 檔少'); break
                p = poems[pidx]
                first = ch['lines'][0]['t'] if ch['lines'] else ''
                if (p.get('rhyme') != r['name'] or p.get('volId') != V['id']
                        or p.get('chapter') != ch['title'] or p.get('first') != first
                        or p.get('nLines') != len(ch['lines'])):
                    errs.append(f'第 {p.get("seq")} 首與 vol 檔不符'
                                f'（{p.get("rhyme")}/{p.get("chapter")}「{p.get("first")}」）')
                pidx += 1
    if pidx != len(poems):
        errs.append(f'poems 多出 {len(poems) - pidx} 首')
    dmap = {d['id']: d for d in dialects}
    seen = set()
    for c in claims:
        seq = c.get('seq')
        if not isinstance(seq, int) or not (1 <= seq <= 376):
            errs.append(f'{c.get("id")}: 序號非法')
        d = c.get('dialect') or {}
        dn = dmap.get(d.get('d'))
        if not dn or d.get('pian') not in {p['id'] for p in dn['pian']} or not d.get('dian'):
            errs.append(f'{c.get("id")}: 方言點不在詞表')
        if c.get('status') not in ('claimed', 'recorded'):
            errs.append(f'{c.get("id")}: 狀態 {c.get("status")} 非法')
        if c.get('audit') not in ('pending', 'verified'):
            errs.append(f'{c.get("id")}: 審核 {c.get("audit")} 非法')
        for k in ('claimDate', 'deadline'):
            if not re.match(r'^\d{4}-\d{2}-\d{2}$', str(c.get(k) or '')):
                errs.append(f'{c.get("id")}: {k} 非法')
        if str(c.get('deadline') or '') < str(c.get('claimDate') or ''):
            errs.append(f'{c.get("id")}: 期限早於認領日期')
        if c.get('status') == 'recorded' and not (
                c.get('audio') and os.path.exists(os.path.join(SITE, c['audio'].lstrip('/')))):
            errs.append(f'{c.get("id")}: 已收錄但音頻缺失')
        key = (seq, d.get('d'), d.get('pian'), d.get('dian'))
        if key in seen:
            errs.append(f'{c.get("id")}: 與他條重複')
        seen.add(key)
    if not poems:
        bad('⑪ 分工表', 'poems 為空（產線可能靜默失敗）')
    elif errs:
        bad('⑪ 分工表', f'{len(errs)} 處問題：{errs[:6]}')
    else:
        ok('⑪ 分工表', f'篇目 {len(poems)} 首與 vol 檔逐行一致；認領 {len(claims)} 條全數通過')

    report()


def report():
    print('=' * 64)
    for name, passed, detail in checks:
        print(f'{"✓" if passed else "✗"} {name}　{detail}')
    if warns:
        print('-' * 64)
        for w in warns:
            print(f'! {w}')
    print('=' * 64)
    n_ok = sum(1 for _, p, _ in checks if p)
    print(f'結果：{n_ok} 過 / {len(checks) - n_ok} 未過'
          + (f' / {len(warns)} 提醒' if warns else ''))
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
