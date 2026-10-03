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
import urllib.parse
import xml.etree.ElementTree as ET
from collections import Counter

# ★ 月份運算直接沿用建置腳本那一份，不抄第二份。
#   逾期釋放的日期算式若三處（build_registry／app.js／precheck）各寫一份，
#   遲早會算出不同的一天，而那種不一致要到線上才會被發現。
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_registry import _add_months   # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
# 站點目錄：同時支援兩種放置方式——
#   舊佈局   <專案>/precheck.py       站點在 <專案>/site/
#   倉庫佈局 <專案>/tools/precheck.py 站點就是 <專案>/
# 這樣同一支腳本放在哪裡都跑得起來，不必改路徑。
_site_sub = os.path.join(HERE, 'site')
SITE = _site_sub if os.path.isdir(_site_sub) else os.path.dirname(HERE)
ASSETS = os.path.join(SITE, 'assets')
PAGES = ['index.html', 'weihe.html', 'fengong.html', 'canyu.html', 'wip.html', 'quanben.html',
         'duizhang.html', 'jyutping.html', 'contribute.html', 'jiucuo.html', 'rongyu.html', 'about.html', 'shengyun.html', 'sources.html', '404.html']

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


def exists_exact(root, rel):
    """逐段比對大小寫的存在性檢查。

    ★ 為什麼不能只用 os.path.exists：開發機是 macOS（檔案系統不分大小寫），
      伺服器是 Linux（分大小寫）。連結把 About.html 寫成 about.html 之外的形式，
      在本機一律通過，上線才 404。逐段用 listdir 比對可把這種錯擋在提交前。
    """
    cur = root
    for part in str(rel).split('/'):
        if part in ('', '.'):
            continue
        if part == '..':
            cur = os.path.dirname(cur)
            continue
        if not os.path.isdir(cur) or part not in os.listdir(cur):
            return False
        cur = os.path.join(cur, part)
    return os.path.exists(cur)


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
        page_dir = os.path.dirname(page)
        for m in re.finditer(r'(?:href|src)="([^"]+)"', html):
            u = m.group(1)
            if u.startswith(('http', 'mailto:', '#', 'data:')):
                continue
            # ★ 先 URL 解碼再比對檔案。上游檔名含中文（小韻表.csv），
            #   sources.html 會寫成百分號編碼；不解碼就把它們誤報為不存在。
            u2 = urllib.parse.unquote(u.split('#')[0].split('?')[0])
            if not u2:
                continue
            refs += 1
            fp = os.path.normpath(os.path.join(SITE, page_dir, u2.lstrip('/')))
            if not exists_exact(SITE, os.path.relpath(fp, SITE)):
                missing.append(f'{page} → {u}（不存在或大小寫不符）')
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
    # ★ 掃描範圍為**所有** .html（含 data/index.html 這類子目錄頁），
    #   不限於 PAGES——否則子目錄頁自己的連結沒人管。
    all_html = []
    for root, dirs, fns in os.walk(SITE):
        dirs[:] = [d for d in dirs if d not in ('.git', 'audio')]   # audio 只有 mp3
        for fn in sorted(fns):
            if fn.endswith('.html'):
                all_html.append(os.path.relpath(os.path.join(root, fn), SITE)
                                .replace(os.sep, '/'))
    page_ids = {}
    page_body = {}
    for p in all_html:
        body = strip_comments(open(os.path.join(SITE, p), encoding='utf-8').read())
        page_body[p] = body
        page_ids[p] = set(re.findall(r'id="([^"]+)"', body))

    def resolve(page, rel):
        """把頁面內的相對網址解析成站點內的相對路徑（供存在性與錨點判斷）。"""
        base = os.path.dirname(page)
        return os.path.normpath(os.path.join(base, rel)) if base else rel

    for p in all_html:
        # ★ 404.html 用絕對路徑是**正確的**：它可能在任意深度被服務，
        #   相對路徑在那裡反而會斷。故不把它的 /xxx 當死鏈。
        if p == '404.html':
            continue
        for m in re.finditer(r'href="([^"]+)"', page_body[p]):
            u = m.group(1)
            if u.startswith(('http', 'mailto:', '#')):
                continue
            links += 1
            fn, _, frag = u.partition('#')
            # ★ 先 URL 解碼。檔名含中文時（小韻表.csv）產生器會寫成
            #   %E5%B0%8F%E9%9F%BB%E8%A1%A8.csv；不解碼就會把**存在**的檔案
            #   誤報為死鏈。
            fn = urllib.parse.unquote(fn)
            frag = urllib.parse.unquote(frag)
            tgt = resolve(p, fn.lstrip('/')) if fn else p
            tgt = tgt.replace(os.sep, '/')
            if fn and not exists_exact(SITE, tgt):
                dead_links.append(f'{p} → {u}（檔案不存在或大小寫不符）')
                continue
            # ★ 目錄網址：Caddy **不做目錄列表**，所以 /some/dir/ 在線上一定是 404，
            #   除非該目錄裡有 index.html（根目錄 / 就是靠 index.html 運作的）。
            #   先前只驗 os.path.exists，而**目錄也存在**，於是
            #   about.html 連到 data/upstream/ 這種死鏈一路綠燈——同步上線後才會爆。
            if fn and os.path.isdir(os.path.join(SITE, tgt)) and \
                    not os.path.exists(os.path.join(SITE, tgt, 'index.html')):
                dead_links.append(f'{p} → {u}（目錄且無 index.html，線上會 404）')
                continue
            if frag:
                anchor_page = (tgt.rstrip('/') + '/index.html') if \
                    os.path.isdir(os.path.join(SITE, tgt)) else tgt
                if anchor_page in page_ids and frag not in page_ids[anchor_page]:
                    dead_links.append(
                        f'{p} → {u}（錨點 {frag} 不存在於 {anchor_page}）')

    # ★ app.js 注入的導覽／頁尾連結也要驗。
    #   全站主要導覽（首頁／底本／歸集進度／反切對帳／共建／方言 ▾）不是寫在 HTML 裡，
    #   而是 app.js 用 NAV 陣列生成的；先前沒有任何檢查涵蓋它們，
    #   目標檔改名、大小寫寫錯或指向目錄，都不會被發現。
    js_links = 0
    js_src = open(os.path.join(SITE, 'assets', 'app.js'), encoding='utf-8').read()
    for m in re.finditer(r"href\s*[:=]\s*'([^']+)'", js_src):
        u = m.group(1)
        if u.startswith(('http', 'mailto:', '#')):
            continue
        fn = urllib.parse.unquote(u.split('#')[0].split('?')[0])
        if not fn:
            continue
        js_links += 1
        if not exists_exact(SITE, fn):
            dead_links.append(f'assets/app.js → {u}（目標不存在或大小寫不符）')
        elif os.path.isdir(os.path.join(SITE, fn)) and \
                not exists_exact(SITE, fn.rstrip('/') + '/index.html'):
            dead_links.append(f'assets/app.js → {u}（目錄且無 index.html，線上會 404）')

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
            # ★ 取「網域之後的完整路徑」，不是 basename。
            #   先前用 rsplit('/',1)[-1]，於是日後若列入 /data/index.html，
            #   會被當成根目錄的 index.html 而誤判為存在（假通過）。
            rel = t[len('https://shenglv.org.cn/'):]
            if not rel or rel.endswith('/'):
                rel = rel + 'index.html'      # 目錄網址即其 index.html
            sm_files.append(rel)
    want = [p for p in PAGES if p != '404.html']
    missing = [p for p in want if p not in sm_files]
    if missing:
        sm_bad.append('sitemap 漏列頁面：' + '、'.join(missing))
    for f in sm_files:
        if not exists_exact(SITE, f):
            dead_links.append(f'sitemap → {f}（不存在或大小寫不符）')

    if dead_links:
        bad('⑤ 連結', f'{dead_links}')
    elif sm_bad:
        bad('⑤ 連結', f'{sm_bad}')
    else:
        ok('⑤ 連結', f'{links} 個頁面連結 ＋ app.js {js_links} 條 ＋ sitemap {len(sm_files)} 條，'
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
    # ★ 文本標注通道已撤（業主指示：文本由維護者統一整理，不對外徵集）。
    #   三處必須一致：共建頁不得再列該通道、榮譽榜不得再有該類、honor.js 不得再有 text。
    #   只改一處就會出現「頁面說可以提交、但沒有入口」或「榜上有類別、卻永遠是空的」。
    canyu = open(os.path.join(SITE, 'canyu.html'), encoding='utf-8').read()
    rongyu = open(os.path.join(SITE, 'rongyu.html'), encoding='utf-8').read()
    honor = open(os.path.join(ASSETS, 'honor.js'), encoding='utf-8').read()
    claims += [
        # 用「文本」二字而非「提供文本」：先前寫死四字，把「<b>文本</b>：…」
        # 這種換了措辭的加回方式放行了——閘門被自己的字面假設騙過。
        ('共建頁未列文本通道', '文本' not in canyu),
        ('榮譽榜未列「文本標注」類', '文本標注' not in rongyu),
        ('honor.js 已無 text 類別', re.search(r'\btext\s*:', honor) is None),
        ('tigong.html 已無提交表單', '<form' not in
            open(os.path.join(SITE, 'tigong.html'), encoding='utf-8').read()),
    ]
    bad_claims = [c for c, v in claims if not v]
    if bad_claims:
        bad('⑥ 宣稱一致', f'{bad_claims}')
    else:
        ok('⑥ 宣稱一致', f'{len(claims)} 項宣稱與資料相符（含「字譜字」不得混用、文本通道已撤的三處一致）')

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
    reg_meta = REG.get('meta', {}) if isinstance(REG, dict) else {}
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
        # 認領以學會為單位，不以個人
        if not str(c.get('society') or '').strip():
            errs.append(f'{c.get("id")}: 缺 society（認領以學會為單位）')
        for k in ('claimDate', 'promiseDate'):
            if not re.match(r'^\d{4}-\d{2}-\d{2}$', str(c.get(k) or '')):
                errs.append(f'{c.get("id")}: {k} 非法')
        cd, pd = str(c.get('claimDate') or ''), str(c.get('promiseDate') or '')
        if re.match(r'^\d{4}-\d{2}-\d{2}$', cd) and re.match(r'^\d{4}-\d{2}-\d{2}$', pd):
            if pd <= cd:
                errs.append(f'{c.get("id")}: 承諾時間未晚於認領日')
            cap = reg_meta.get('promiseMaxMonths', 12)
            if pd > _add_months(cd, cap):
                errs.append(f'{c.get("id")}: 承諾時間超過 {cap} 個月上限')
        if c.get('status') == 'recorded' and not str(c.get('singer') or '').strip():
            errs.append(f'{c.get("id")}: 已收錄但缺 singer（實際吟誦者）')
        if c.get('status') == 'recorded' and not (
                c.get('audio') and os.path.exists(os.path.join(SITE, c['audio'].lstrip('/')))):
            errs.append(f'{c.get("id")}: 已收錄但音頻缺失')
        # 建置已把達釋放條件者移出 claims；仍留在 claims 者不應已是 released
        if c.get('state') == 'released':
            errs.append(f'{c.get("id")}: 已達自動釋放條件卻仍在 claims（應由 build_registry 移出）')
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
