#!/usr/bin/env bash
# verify_live.sh —— 同步後驗收：一次確認線上已是合併後的單一站
#
# 為什麼要有這支
#   部署模型是「shenglv-site-repo 的內容即線上內容」，但 GitHub 推送**不會**自動部署，
#   需在伺服器端同步。同步是否真的生效、有沒有漏檔或只同步一半，
#   先前只能靠人一一點開看。這支把它變成一條指令，且**同時驗狀態碼與內容標記**——
#   只看 200 不夠：舊版頁面也是 200，必須確認新版特有的東西出現了。
#
# 用法
#   ./tools/verify_live.sh                              # 驗正式站
#   BASE=http://127.0.0.1:8794 ./tools/verify_live.sh   # 驗本機預覽
#
# ★ 排版注意：所有變數一律寫成 ${var}。訊息字串裡緊接著全形標點時，
#   `$c（` 會被 bash 當成變數名 `c（` 而報 unbound variable——實際踩過。
set -uo pipefail

BASE="${BASE:-https://shenglv.org.cn}"
PASS=0; FAIL=0

# 取狀態碼（網路錯誤時回 000，不中止）
code() { curl -s -o /dev/null -w '%{http_code}' -m 20 "${1}" 2>/dev/null || echo 000; }
# 取內容（失敗回空字串）
body() { curl -s -m 20 "${1}" 2>/dev/null || true; }

ok() { PASS=$((PASS + 1)); printf '  \033[32m✓\033[0m %s\n' "${1}"; }
no() { FAIL=$((FAIL + 1)); printf '  \033[31m✗\033[0m %s\n' "${1}"; }

expect_code() {  # <路徑> <期望碼> <說明>
  local c; c=$(code "${BASE}${1}")
  if [ "${c}" = "${2}" ]; then
    ok "${3} —— ${1} → ${c}"
  else
    no "${3} —— ${1} → ${c}，期望 ${2}"
  fi
}

expect_has() {   # <路徑> <關鍵字> <說明>
  local b; b=$(body "${BASE}${1}")
  if printf '%s' "${b}" | grep -q -- "${2}"; then
    ok "${3}"
  else
    no "${3} —— ${1} 找不到「${2}」"
  fi
}

echo "驗收目標：${BASE}"
echo
echo "── 一、主站未被破壞（原粵語內容與資產必須還在）"
expect_code / 200 "首頁"
expect_has  / "中文聲韻" "首頁品牌為「中文聲韻」"
expect_code /quanben.html 200 "全本頁"
expect_code /jyutping.html 200 "粵拼入門"
expect_code /fengong.html 200 "歸集進度"
expect_code /duizhang.html 200 "反切對帳"
expect_code /audio/v1/0001.mp3 200 "粵語音檔 v1 首條"
expect_code /audio/v5/5998.mp3 200 "粵語音檔 v5 末條（全書最後一句）"
expect_code /audio/demo/manjianghong.mp3 200 "真人吟誦示範音檔"
expect_code /audio/jyutping/zuk1.mp3 200 "粵拼點讀音檔"

echo
echo "── 二、合併後的新東西已上線"
expect_has  /quanben.html 'id="ptBar"' "全本頁含方言切換器容器 #ptBar（舊版沒有）"
expect_has  /shengyun.html "聲韻入門" "新增的聲韻入門頁"
expect_code /sources.html 200 "上游來源清單頁"
expect_has  /sources.html "上游來源檔" "來源清單頁內容正確"
expect_code /assets/fangyan-meta.js 200 "方言清單 fangyan-meta.js"
expect_code /assets/fangyan.js 200 "逐字方言讀音 fangyan.js"

echo
echo "── 三、GPL-3.0 對應來源可自助取得"
expect_code /data/LICENSE-GPL-3.0.txt 200 "授權全文"
expect_code /data/upstream/shupin.dict.yaml 200 "蜀拼字典（GPL-3.0 上游）"
expect_code /data/upstream-min/chaozhou.dict.yaml 200 "潮汕方案（GPL-3.0 上游）"

echo
echo "── 四、/fangyan/ 已廢除"
expect_code /fangyan/ 404 "舊子站路徑"
expect_code /fangyan/index.html 404 "舊子站首頁"

echo
echo "── 五、另一站未受影響"
c=$(code https://solve-lab.cn/)
if [ "${c}" = "200" ]; then
  ok "問題解決訓練站 —— solve-lab.cn → ${c}"
else
  no "問題解決訓練站 —— solve-lab.cn → ${c}"
fi

echo
echo "════════════════════════════════"
if [ "${FAIL}" = 0 ]; then
  echo "結果：${PASS} 項全數通過 —— 線上已是合併後的單一站。"
  exit 0
fi
echo "結果：${PASS} 項通過 / ${FAIL} 項未過。"
echo
echo "若第一、二節多數未過，代表伺服器尚未同步："
echo "  若是 git checkout：cd <站點根目錄> && git pull"
echo "  若是純檔案目錄：rsync -av --exclude .git --exclude .DS_Store \\"
echo "                    shenglv-site-repo/ <帳號>@123.206.124.48:<站點根目錄>/"
echo "  注意：不要加 --delete（伺服器上可能有 repo 沒有的檔案）。"
exit 1
