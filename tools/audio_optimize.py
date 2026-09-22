#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
audio_optimize.py —— 音頻後處理：去頭尾靜音 ＋ 降位元率

為什麼要做
    1. 聽感：TTS 每句頭尾各有約 0.3–0.5 秒空白，「讀整章」連播時會一段段卡頓；
       去掉後句子之間才連得起來。
    2. 體積：原始輸出為 48 kbps，對語音而言過高；32 kbps 單聲道仍足夠清晰。

做法
    以 imageio-ffmpeg 隨附的靜態 ffmpeg 執行，不需系統安裝 ffmpeg：
        去頭靜音 → 反轉 → 去頭靜音 → 反轉（等效於同時去頭尾）
        重新編碼為 32 kbps / 24 kHz / 單聲道 mp3

用法
    python3 tools/audio_optimize.py --dry-run        # 先看能省多少（不寫檔）
    python3 tools/audio_optimize.py                  # 就地替換（原檔備份為 .orig/）
    python3 tools/audio_optimize.py --restore        # 從 .orig/ 還原
    python3 tools/audio_optimize.py --bitrate 24k
"""

import argparse, os, shutil, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
# 同時支援舊佈局（ROOT/site/）與倉庫佈局（ROOT 本身即站點）
_site_sub = os.path.join(ROOT, 'site')
SITE = _site_sub if os.path.isdir(_site_sub) else ROOT
AUDIO = os.path.join(SITE, 'audio')
ORIG = os.path.join(ROOT, '_work', 'audio_orig')

try:
    import imageio_ffmpeg
except ImportError:
    sys.exit('缺少 imageio-ffmpeg：pip install imageio-ffmpeg（或自備 ffmpeg 並設定 FFMPEG）')

FFMPEG = os.environ.get('FFMPEG') or imageio_ffmpeg.get_ffmpeg_exe()

TRIM = ('silenceremove=start_periods=1:start_silence=0:start_threshold=-50dB,'
        'areverse,'
        'silenceremove=start_periods=1:start_silence=0:start_threshold=-50dB,'
        'areverse')


def all_mp3():
    out = []
    for root, _d, files in os.walk(AUDIO):
        for f in files:
            if f.endswith('.mp3'):
                out.append(os.path.join(root, f))
    return sorted(out)


def duration(path):
    """用 ffmpeg -i 取時長（秒）；失敗回 None。"""
    try:
        p = subprocess.run([FFMPEG, '-hide_banner', '-i', path],
                           capture_output=True, text=True, timeout=30)
        for line in p.stderr.split('\n'):
            if 'Duration:' in line:
                t = line.split('Duration:')[1].split(',')[0].strip()
                h, m, s = t.split(':')
                return int(h) * 3600 + int(m) * 60 + float(s)
    except Exception:
        pass
    return None


def optimize(path, bitrate, dry):
    rel = os.path.relpath(path, SITE)
    dst_orig = os.path.join(ORIG, rel)
    if os.path.exists(dst_orig):
        return 'skip'                      # 已處理過
    tmp = path + '.tmp.mp3'
    cmd = [FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', '-i', path,
           '-af', TRIM, '-c:a', 'libmp3lame', '-b:a', bitrate,
           '-ar', '24000', '-ac', '1', tmp]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if r.returncode != 0 or not os.path.exists(tmp) or os.path.getsize(tmp) < 500:
            if os.path.exists(tmp):
                os.remove(tmp)
            return 'fail'
    except Exception:
        if os.path.exists(tmp):
            os.remove(tmp)
        return 'fail'
    if dry:
        a, b = os.path.getsize(path), os.path.getsize(tmp)
        os.remove(tmp)
        return ('dry', a, b)
    os.makedirs(os.path.dirname(dst_orig), exist_ok=True)
    shutil.move(path, dst_orig)
    shutil.move(tmp, path)
    return 'ok'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bitrate', default='32k')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--restore', action='store_true')
    ap.add_argument('--limit', type=int, default=0)
    args = ap.parse_args()

    if args.restore:
        n = 0
        for root, _d, files in os.walk(ORIG):
            for f in files:
                src = os.path.join(root, f)
                rel = os.path.relpath(src, ORIG)
                dst = os.path.join(SITE, rel)
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                shutil.move(src, dst)
                n += 1
        print(f'已還原 {n} 檔')
        return

    files = all_mp3()
    if args.limit:
        files = files[:args.limit]
    if not files:
        sys.exit('找不到音檔')

    print(f'【音頻優化】{len(files)} 檔｜目標 {args.bitrate}/24kHz/mono'
          f'{"｜dry-run 不寫入" if args.dry_run else ""}')
    print(f'           ffmpeg = {FFMPEG}')

    before = sum(os.path.getsize(f) for f in files)
    t0 = time.time()
    stats = {'ok': 0, 'skip': 0, 'fail': 0}
    dry_before = dry_after = 0
    fails = []

    for i, f in enumerate(files, 1):
        r = optimize(f, args.bitrate, args.dry_run)
        if isinstance(r, tuple):
            dry_before += r[1]
            dry_after += r[2]
            stats['ok'] += 1
        elif r == 'ok':
            stats['ok'] += 1
        elif r == 'skip':
            stats['skip'] += 1
        else:
            stats['fail'] += 1
            if len(fails) < 8:
                fails.append(os.path.relpath(f, SITE))
        if i % 500 == 0 or i == len(files):
            el = time.time() - t0
            print(f'    {i}/{len(files)}　ok {stats["ok"]} skip {stats["skip"]} '
                  f'fail {stats["fail"]}　{el/60:.1f} 分', flush=True)

    print('=' * 62)
    after = sum(os.path.getsize(f) for f in files if os.path.exists(f))
    if args.dry_run:
        print(f'試算：{dry_before/1024/1024:.1f} MB → {dry_after/1024/1024:.1f} MB'
              f'（省 {100*(1-dry_after/max(dry_before,1)):.0f}%）')
    else:
        print(f'完成：{stats["ok"]} 優化 / {stats["skip"]} 略過 / {stats["fail"]} 失敗')
        print(f'體積：{before/1024/1024:.1f} MB → {after/1024/1024:.1f} MB'
              f'（省 {100*(1-after/max(before,1)):.0f}%）')
        print(f'原檔備份於 {ORIG}（--restore 可還原）')
    if fails:
        print(f'✗ 失敗樣本：{fails}')


if __name__ == '__main__':
    main()
