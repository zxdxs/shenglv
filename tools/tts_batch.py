#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tts_batch.py —— 逐行粵語音頻批次合成（一次性下載）

來源：Microsoft Edge 朗讀服務（雲端神經 TTS），粵語語音 zh-HK。
      無需 API 憑證；語音清單見 edge-tts --list-voices。

用法
    python3 tools/tts_batch.py                      # 預設 6 並發、男聲 WanLung
    python3 tools/tts_batch.py --workers 8
    python3 tools/tts_batch.py --voice zh-HK-HiuMaanNeural --rate=-10%
    python3 tools/tts_batch.py --limit 20           # 試跑前 20 條

特性
    - 可續跑：已存在且大小合理的檔案直接跳過，中斷後重跑不重做
    - 重試：每條最多 3 次，指數退避
    - 失敗逐條列出，不靜默吞掉
    - 完成後寫出 _work/tts_report.json

注意
    - 逐行音檔數 ＝ 對句行數（全書 5,998）
    - 邊緣服務為免費公開端點，請以合理並發批次取用；本腳本預設 6 並發
"""

import argparse, asyncio, json, os, sys, time, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
# 同時支援舊佈局（ROOT/site/）與倉庫佈局（ROOT 本身即站點）
_site_sub = os.path.join(ROOT, 'site')
SITE = _site_sub if os.path.isdir(_site_sub) else ROOT
MANIFEST = os.path.join(ROOT, '_work', 'tts_manifest.json')


def REPORT_FOR(manifest):
    """報告檔名跟著清單走，避免 demo 清單覆蓋主批次的報告。"""
    base = os.path.splitext(os.path.basename(manifest))[0]
    name = 'tts_report.json' if base == 'tts_manifest' else f'tts_report_{base}.json'
    return os.path.join(ROOT, '_work', name)

try:
    import edge_tts
except ImportError:
    sys.exit('缺少 edge-tts：pip install edge-tts（或用 /tmp/ttsenv/bin/python 執行）')


async def synth_one(sem, item, voice, rate, outroot, retries, counters, lock):
    rel = item['path']
    out = os.path.join(outroot, rel)
    os.makedirs(os.path.dirname(out), exist_ok=True)

    if os.path.exists(out) and os.path.getsize(out) > 800:
        async with lock:
            counters['skip'] += 1
        return

    async with sem:
        last = ''
        for attempt in range(retries):
            try:
                comm = edge_tts.Communicate(item['text'], voice, rate=rate)
                await comm.save(out)
                if os.path.getsize(out) > 800:
                    async with lock:
                        counters['ok'] += 1
                    return
                last = f'檔案過小（{os.path.getsize(out)} B）'
            except Exception as e:                       # noqa: BLE001
                last = f'{type(e).__name__}: {e}'
            await asyncio.sleep(1.2 * (attempt + 1))
        # 失敗：清掉半成品，記錄
        try:
            if os.path.exists(out):
                os.remove(out)
        except OSError:
            pass
        async with lock:
            counters['fail'] += 1
            counters['failures'].append({'id': item.get('u') or item.get('key'),
                                         'text': item['text'], 'err': last[:200]})


async def main_async(args):
    manifest = args.manifest
    if not os.path.isabs(manifest):
        manifest = os.path.join(ROOT, manifest)
    if not os.path.exists(manifest):
        sys.exit(f'缺少 {manifest}；請先跑 python3 build_shenglv.py')

    items = json.load(open(manifest, encoding='utf-8'))
    if args.limit:
        items = items[:args.limit]

    # manifest 的 path 已是相對於站點根的路徑（audio/v{n}/{u}.mp3），
    # 故 outroot 直接用站點根，不可再串一層 audio
    outroot = SITE
    os.makedirs(os.path.join(outroot, 'audio'), exist_ok=True)

    sem = asyncio.Semaphore(args.workers)
    lock = asyncio.Lock()
    counters = collections.Counter()
    counters['failures'] = []

    t0 = time.time()
    total = len(items)
    print(f'【TTS】{total} 條｜語音 {args.voice}｜語速 {args.rate}｜並發 {args.workers}')
    print(f'       輸出 {outroot}/')

    tasks = [asyncio.create_task(
        synth_one(sem, it, args.voice, args.rate, outroot, args.retries, counters, lock))
        for it in items]

    # 進度回報
    async def progress():
        while True:
            await asyncio.sleep(20)
            done = counters['ok'] + counters['skip'] + counters['fail']
            el = time.time() - t0
            rate = done / el if el else 0
            eta = (total - done) / rate if rate else 0
            print(f'    {done}/{total}　ok {counters["ok"]} skip {counters["skip"]} '
                  f'fail {counters["fail"]}　{rate:.1f}/s　ETA {eta/60:.1f} 分', flush=True)

    pt = asyncio.create_task(progress())
    await asyncio.gather(*tasks)
    pt.cancel()

    el = time.time() - t0
    sizes = 0
    n = 0
    for it in items:
        p = os.path.join(outroot, it['path'])
        if os.path.exists(p):
            sizes += os.path.getsize(p)
            n += 1

    print('=' * 62)
    print(f'完成：{n}/{total} 檔　ok {counters["ok"]}　skip {counters["skip"]}　fail {counters["fail"]}')
    print(f'耗時 {el/60:.1f} 分　總大小 {sizes/1024/1024:.1f} MB　平均 {sizes/n/1024:.1f} KB/檔' if n else '無檔案')
    if counters['failures']:
        print(f'✗ 失敗 {len(counters["failures"])} 條，前 10 條：')
        for f in counters['failures'][:10]:
            print(f'    u={f["u"]} 「{f["text"]}」 {f["err"]}')

    json.dump({'total': total, 'written': n, 'ok': counters['ok'], 'skip': counters['skip'],
               'fail': counters['fail'], 'seconds': round(el, 1),
               'bytes': sizes, 'voice': args.voice, 'rate': args.rate,
               'manifest': os.path.basename(manifest),
               'failures': counters['failures']},
              open(REPORT_FOR(manifest), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'→ {REPORT_FOR(manifest)}')
    return 1 if counters['fail'] else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--voice', default='zh-HK-WanLungNeural',
                    help='zh-HK-WanLungNeural（男）／zh-HK-HiuMaanNeural（女）／zh-HK-HiuGaaiNeural')
    ap.add_argument('--rate', default='-10%', help='語速，如 -10%%（誦讀宜稍慢）')
    ap.add_argument('--workers', type=int, default=6, help='並發數，預設 6')
    ap.add_argument('--retries', type=int, default=3)
    ap.add_argument('--manifest', default=MANIFEST,
                    help='清單檔（預設 _work/tts_manifest.json；例：_work/demo_manifest.json）')
    ap.add_argument('--limit', type=int, default=0, help='只做前 N 條（試跑用）')
    args = ap.parse_args()
    sys.exit(asyncio.run(main_async(args)))


if __name__ == '__main__':
    main()
