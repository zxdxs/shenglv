#!/usr/bin/env python3
"""live_check.py —— 線上站點驗收（真瀏覽器渲染，非 curl 200）

為什麼需要：curl 拿到 200 只證明檔案在，不證明 JS 把頁面渲染出來。
本工具用 Playwright 開真 Chrome，載入線上 URL，等 JS 完成後檢查：
  ① HTTP 200 且無 JS 例外／console error
  ② 動態區塊真的有子節點（空集合不得冒充通過）
  ③ 頁面上沒有殘留佔位（undefined／NaN／空 span）
  ④ <audio> 的 src 真的可播放（實際發 request 驗 content-type）
  ⑤ 抽驗音檔與 CSS/JS 資源

DNS 說明：部分環境直連 DNS 不通，故用 --host-resolver-rules 把站名釘到 IP，
TLS 仍以真站名驗證（SNI + 憑證），與走 DNS 等價。

用法：
  python3 tools/live_check.py                                  # 預設線上站
  python3 tools/live_check.py --url http://127.0.0.1:8080      # 測本機
  python3 tools/live_check.py --site shenglv.solve-lab.cn --ip 113.44.120.176
"""
import argparse
import json
import re
import sys

PAGES = [
    ("/", "首頁"),
    ("/weihe.html", "為什麼用粵語讀"),
    ("/quanben.html", "全本"),
    ("/duizhang.html", "對仗表"),
    ("/jyutping.html", "粵拼入門"),
    ("/contribute.html", "提供錄音"),
    ("/about.html", "關於與授權"),
]

# 每頁動態區塊的最低要求：(CSS selector, 最少內容量)
# 注意：判定用「後代總數 + 可見字數」的較大者，不是直系子節點——像 #dzBody 只有 3 個
# 直系子節點卻裝著 400 列表格與 1.3 萬字，用直系子節點數會誤報。
EXPECT = {
    "/": [("#stats", 5), ("#demo", 1), ("#links", 3)],
    "/weihe.html": [],
    "/quanben.html": [("#volTabs", 3), ("#rhymeNav", 3), ("#rhymeBody", 1500)],
    "/duizhang.html": [("#dzStats", 3), ("#dzBody", 3000)],
    "/about.html": [("#variants", 3), ("#aboutStats", 3)],
    "/contribute.html": [],
    "/jyutping.html": [],        # 五張表都是靜態 HTML，沒有 JS 產生的動態區塊
}

MAX_BYTES = 64 * 1024 * 1024   # 單一資源上限，超過就不整包下載


def fail(msg):
    print(f"  ✗ {msg}")
    return 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=None, help="完整 base URL（測本機用，例如 http://127.0.0.1:8080）")
    ap.add_argument("--site", default="shenglv.org.cn")
    ap.add_argument("--ip", default=None,
                    help="可選：強制把 --site 解析到這個 IP（測未生效的 DNS 用）")
    ap.add_argument("--timeout", type=int, default=30000)
    args = ap.parse_args()

    if args.url:
        base = args.url.rstrip("/")
        scheme_host = base            # 已有 scheme
    else:
        base = f"https://{args.site}"
        scheme_host = args.site

    from playwright.sync_api import sync_playwright

    problems = []
    passes = 0

    with sync_playwright() as p:
        launch = {"channel": "chrome", "headless": True}
        if not args.url:
            launch["args"] = [
                f"--host-resolver-rules=MAP {args.site} {args.ip}",
                "--ignore-certificate-errors-spki-list=",   # 不忽略憑證：要真的驗
            ]
        browser = p.chromium.launch(**launch)

        for path, name in PAGES:
            url = base + path
            ctx = browser.new_context(ignore_https_errors=False)
            pg = ctx.new_page()
            errs, cerrs, bad_resp = [], [], []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.on("console", lambda m: cerrs.append(m.text) if m.type == "error" else None)
            pg.on("response", lambda r: bad_resp.append(f"{r.status} {r.url}")
                  if r.status >= 400 else None)

            line = f"  {name:<12} {path:<16}"
            try:
                resp = pg.goto(url, wait_until="load", timeout=args.timeout)
                pg.wait_for_timeout(1500)          # 等動態 script
            except Exception as e:
                problems.append(f"{path}：載入失敗 → {e}")
                print(line + "✗ 載入失敗")
                ctx.close()
                continue

            status = resp.status if resp else 0
            # ① 狀態與例外
            if status != 200:
                problems.append(f"{path}：HTTP {status}")
            if errs:
                problems.append(f"{path}：JS 例外 {errs[:3]}")
            # favicon 404 之類不算問題；只挑本站 html/js/css 的 4xx/5xx
            hard = [b for b in bad_resp if re.search(r"\.(html|js|css|mp3|xml|txt)(\?|$)", b)]
            if hard:
                problems.append(f"{path}：資源 4xx/5xx → {hard[:3]}")

            # ② 動態區塊
            checks = []
            for sel, minimum in EXPECT.get(path, []):
                got = pg.evaluate(
                    """(sel) => { const n = document.querySelector(sel);
                         if (!n) return -1;
                         const desc = n.querySelectorAll('*').length;
                         const txt = (n.innerText || n.textContent || '').trim().length;
                         return Math.max(desc, txt); }""",
                    sel)
                checks.append((sel, minimum, got))
                if got < minimum:
                    problems.append(f"{path}：{sel} 內容量只有 {got}（需 ≥{minimum}）")

            # ③ 佔位殘留
            body = pg.inner_text("body")
            for token in ("undefined", "NaN", "[object Object]", "{{", "}}"):
                if token in body:
                    problems.append(f"{path}：頁面殘留佔位「{token}」")
            if len(body.strip()) < 200:
                problems.append(f"{path}：可見文字只有 {len(body.strip())} 字，疑似未渲染")

            # ④ audio 可播放
            audio = pg.evaluate(
                """() => Array.from(document.querySelectorAll('audio'))
                     .map(a => a.currentSrc || a.src || (a.querySelector('source')||{}).src)
                     .filter(Boolean)""")
            play_ok = None
            if audio:
                probe = audio[0]
                r = pg.evaluate(
                    """async (u) => { const r = await fetch(u, {method:'GET',
                         headers:{Range:'bytes=0-2047'}});
                         return {s:r.status, ct:r.headers.get('content-type')||''}; }""", probe)
                play_ok = (r["s"] in (200, 206) and "audio" in r["ct"])
                if not play_ok:
                    problems.append(f"{path}：audio 不可播放 {probe} → {r}")

            detail = " ".join(f"{s}={g}" for s, _m, g in checks)
            allok = (status == 200 and not errs and not hard
                     and all(g >= m for _s, m, g in checks)
                     and play_ok is not False)
            if allok:
                passes += 1
                print(f"{line}✓  {detail}" + (f"  audio {len(audio)} 檔，首檔可播" if audio else ""))
            else:
                print(f"{line}✗  {detail}")
            ctx.close()

        # ⑤ 額外資源抽驗
        print()
        print("  ── 靜態資源 ──")
        ctx = browser.new_context(ignore_https_errors=False)
        pg = ctx.new_page()
        for u in ["/assets/style.css", "/assets/app.js", "/assets/data.js",
                  "/assets/chars.js", "/sitemap.xml", "/robots.txt"]:
            try:
                r = pg.goto(base + u, wait_until="commit", timeout=args.timeout)
                sz = r.headers.get("content-length") or "-"
                mark = "✓" if r.status == 200 else "✗"
                if r.status != 200:
                    problems.append(f"{u}：HTTP {r.status}")
                print(f"  {mark} {u:<22} {r.status}  {sz} B")
            except Exception as e:
                problems.append(f"{u}：{e}")
                print(f"  ✗ {u:<22} 失敗")
        # 壓縮：用 Resource Timing 的 encodedBodySize。
        # 注意不能用 fetch().arrayBuffer().byteLength——那拿到的是「解壓後」長度，
        # 一定等於原檔大小，會誤判成「沒有壓縮」。
        # 本機裸 http.server 不支援 gzip ⇒ 對 http:// 目標只印資訊、不判成問題，
        # 否則每次本機預驗都會冒出四個假紅燈。
        skip_gzip = base.startswith("http://")
        pg.goto(base + "/", wait_until="load", timeout=args.timeout)
        pg.wait_for_timeout(1200)
        rt = pg.evaluate(
            """() => performance.getEntriesByType('resource')
                 .filter(e => /\\/(chars|app|data)\\.js|style\\.css/.test(e.name))
                 .map(e => ({n: e.name.split('/').pop(),
                             enc: e.encodedBodySize, dec: e.decodedBodySize}))""")
        print("  ── 壓縮（encoded/decoded）──" + ("　※ http:// 目標僅供參考" if skip_gzip else ""))
        for x in rt:
            if x["dec"]:
                ratio = x["dec"] / x["enc"] if x["enc"] else 0
                mark = "✓" if ratio > 1.5 else ("·" if skip_gzip else "✗")
                if ratio <= 1.5 and not skip_gzip:
                    problems.append(f"{x['n']}：未壓縮（{x['enc']}B）")
                print(f"  {mark} {x['n']:<12} {x['enc']:>8} / {x['dec']:>8} B  ({ratio:.1f}×)")
        ctx.close()
        browser.close()

    print()
    print("=" * 64)
    if problems:
        for x in problems:
            print(f"✗ {x}")
        print(f"結果：{passes} 過 / {len(problems)} 問題")
        return 1
    print(f"結果：{passes} 過 / 0 未過（{len(PAGES)} 頁全部渲染出內容）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
