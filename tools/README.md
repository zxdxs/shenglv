# tools —— 本專案的產線與自檢

這個目錄放的是**產生站上資料**與**驗證站上資料**的腳本。站上這些檔案全部是自動產生的，
檔頭都寫著「自動產生，勿手改 —— build_shenglv.py」：

| 產生檔 | 內容 |
|---|---|
| `assets/data.js` | 站點 meta ＋ 五卷／106 韻索引（小，首屏載入） |
| `assets/chars.js` | 7,730 字 → 粵拼（含入聲標記、多音讀音、選音依據） |
| `assets/vol1..5.js` | 各卷完整內容（按需載入） |
| `assets/duizhang.js` | 反切對帳全表 |
| `sitemap.xml` | 由站上**實際存在**的 `.html` 推導，新頁面自動納入 |

---

## 腳本

| 檔案 | 做什麼 |
|---|---|
| `build_shenglv.py` | **資料產線**：語料 ＋ 粵拼字典 → 上列產生檔。四道校驗（三方對齊／讀音覆蓋／反切對帳／音頻編號），任一不過即中止、不產出資料 |
| `precheck.py` | **上站前自檢十項**：標籤配平、資源引用、選取器、資料檔、連結、宣稱一致、音頻完整性、字表完整性、粵拼點讀音檔、入聲本調 |
| `render_test.js` | 無瀏覽器渲染測試：逐頁載入並實跑前端，確認動態區塊真的產出（空集合不得冒充通過） |
| `live_check.py` | 線上檢查：逐頁渲染 ＋ 靜態資源可達性 |
| `audio_optimize.py` | 音頻後處理：去頭尾靜音 ＋ 降位元率 |
| `tts_batch.py` | 逐句粵語音頻批次合成（Microsoft Edge TTS，`zh-HK-WanLungNeural`、語速 −10%） |
| `jyutping_audit.py` | 字典覆蓋率與反切交叉校驗（研究用） |
| `variants.json` | **外掛字音表**：字典未收之字（多為語料混入的簡體字形，據繁體定音） |

---

## 兩個刻意不隨附的輸入

### ① 粵拼字典 `dict.yaml`（必要）

來自 [rime-cantonese](https://github.com/rime/rime-cantonese)（**CC-BY-4.0 ＋ ODbL**）。

**本站不散布這個字典檔**，`about.html` 已如此聲明：

> 本站僅將之作為網站內容呈現（Produced Work），未提供資料集下載，亦未隨交付包散布該字典檔。

這不只是客氣話：ODbL 的義務之一是「若將衍生之**資料庫**公開發布，該資料庫須以 ODbL 釋出」。
只把資料當內容呈現、不散布資料庫本身，就不觸發這一條。放進本倉庫會改變這個狀態。

要跑 `build_shenglv.py` 請自行取得，例如：

```sh
git clone --depth 1 https://github.com/rime/rime-cantonese
# 取其中的粵拼字典（chars.dict.yaml 系列）作為 dict.yaml
```

### ② 語料 `.md`（必要）

五卷三行對齊語料（拼音在上、原文在中、吟誦符號在下）＋ 全書反切索引。

**正文屬公有領域**（《聲律發蒙》元·祝明撰，明萬曆刊本），但語料檔另含
**編者自撰的〈代序〉**與校勘、拼音、吟誦符號——其中〈代序〉**目前並未公開**，
所以未納入本倉庫。是否公開由著作人決定。

---

## 怎麼跑

```sh
# 建置（輸出到站點目錄；字典與語料請自備）
python3 tools/build_shenglv.py \
    --site . \
    --gd <語料目錄> \
    --dict <dict.yaml>

# 上站前自檢
python3 tools/precheck.py

# 無瀏覽器渲染測試
node tools/render_test.js

# 線上檢查
python3 tools/live_check.py --url http://127.0.0.1:8080
```

`build_shenglv.py` 與 `precheck.py` 會**自動判斷站點目錄**：
若上一層有 `site/` 就用它（舊的專案佈局），否則就用上一層本身（本倉庫的佈局）。
所以同一支腳本放在兩種位置都跑得起來。

`build_shenglv.py` 的完整參數：

```
--site      站點目錄（只會動 <site>/assets/ 下的產生檔與 <site>/sitemap.xml）
--gd        語料目錄（亦可用環境變數 SHENGLV_CORPUS）
--dict      粵拼字典 dict.yaml（本倉庫不隨附）
--variants  外掛字音表（預設 tools/variants.json）
--report    建置報告輸出路徑
--work-out  tts_manifest.json 輸出目錄
```

> ⚠️ `audio_optimize.py` 預設把原檔備份到 `<站點>/../_work/audio_orig`。
> 在本倉庫佈局下那就是倉庫上一層。**請確認備份不落在倉庫內**（相同理由見 `F0-2`：
> 備份進了交付物，重打包就會把它帶進去）。

---

## 驗證狀態

已在本倉庫佈局下實測：以本目錄的腳本 ＋ 外部語料與字典建置，
**8 個產生檔與 `sitemap.xml` 與倉庫內容逐位元相同**。
即「改了腳本不會動到不該動的資料」是量出來的，不是宣稱的。
