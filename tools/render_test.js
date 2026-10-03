/* render_test.js —— 無瀏覽器渲染測試
 *
 * 為什麼需要：`node --check` 只證明語法正確，不證明頁面渲染得出來。
 * 這支測試用最小 DOM 墊片載入 data.js / chars.js / app.js，對每個頁面實際跑一次渲染，
 * 並模擬 app.js 的動態 <script> 載入（vol1..5.js、duizhang.js），
 * 最後檢查產出的節點數——**空集合不得冒充通過**。
 *
 * 用法： node tools/render_test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 同時支援兩種放置方式：舊佈局（上一層有 site/）與倉庫佈局（上一層就是站點）
const _siteSub = path.join(__dirname, '..', 'site');
const SITE = fs.existsSync(_siteSub) ? _siteSub : path.join(__dirname, '..');
const PAGES = ['index.html', 'weihe.html', 'fengong.html', 'canyu.html', 'wip.html', 'quanben.html', 'duizhang.html', 'jyutping.html', 'contribute.html', 'jiucuo.html', 'rongyu.html', 'about.html', 'shengyun.html', '404.html'];

/* ------------------------------------------------------------ 最小 DOM 墊片 */
function makeNode(tag) {
  const n = {
    tagName: tag, children: [], attrs: {}, _text: '', _cls: '',
    parentNode: null, style: {},
    appendChild(c) { c.parentNode = n; n.children.push(c); return c; },
    removeChild(c) { n.children = n.children.filter(x => x !== c); return c; },
    setAttribute(k, v) { n.attrs[k] = String(v); },
    getAttribute(k) { return k in n.attrs ? n.attrs[k] : null; },
    addEventListener(ev, fn) { (n._ev = n._ev || {})[ev] = fn; },
    classList: { add(c) { n._cls = (n._cls ? n._cls + ' ' : '') + c; }, remove() {}, contains() { return false; } },
    get firstChild() { return n.children[0] || null; },
    get className() { return n._cls; },
    set className(v) { n._cls = v; },
    get textContent() { return n._text; },
    set textContent(v) { n._text = String(v); n.children = []; }
  };
  return n;
}

function descendants(n) {
  let k = n.children.length;
  n.children.forEach(c => { k += descendants(c); });
  return k;
}

/* 依 HTML 頁面建立「已知節點」註冊表：id 與 data-m 元素 */
function buildDoc(html, page, loadScript) {
  const registry = {};
  const dataNodes = [];

  let m;
  const idRe = /id="([A-Za-z0-9_-]+)"/g;
  while ((m = idRe.exec(html))) registry[m[1]] = makeNode('div');

  const tagRe = /<(\w+)([^>]*\bdata-m="[^"]+"[^>]*)>/g;
  while ((m = tagRe.exec(html))) {
    const attrs = m[2];
    const node = makeNode(m[1].toLowerCase());
    const mm = /data-m="([^"]+)"/.exec(attrs);
    const ff = /data-fmt="([^"]+)"/.exec(attrs);
    if (mm) node.setAttribute('data-m', mm[1]);
    if (ff) node.setAttribute('data-fmt', ff[1]);
    dataNodes.push(node);
  }

  const body = makeNode('body');
  body.setAttribute('data-page', page);

  let domReady = null;

  function createElement(tag) {
    if (tag === 'script') {
      const s = makeNode('script');
      s.onload = null; s.onerror = null;
      Object.defineProperty(s, 'src', {
        set(v) { setTimeout(() => loadScript(v, s), 0); },
        get() { return s._src; }
      });
      return s;
    }
    if (tag === 'audio') {
      const a = makeNode('audio');
      a.play = () => Promise.resolve();
      a.pause = () => {};
      a.paused = true;
      return a;
    }
    return makeNode(tag);
  }

  const document = {
    body,
    createElement,
    createTextNode: (t) => { const n = makeNode('#text'); n.textContent = t; return n; },
    querySelector(sel) {
      const mm = /^#([A-Za-z0-9_-]+)$/.exec(sel);
      return mm ? (registry[mm[1]] || null) : null;
    },
    querySelectorAll(sel) { return sel === '[data-m]' ? dataNodes.slice() : []; },
    addEventListener(ev, fn) { if (ev === 'DOMContentLoaded') domReady = fn; }
  };
  return { document, registry, dataNodes, fire: () => domReady && domReady() };
}

/* ------------------------------------------------------------------ 測試 */
const EXPECT = {
  'index.html': [['#stats', 24], ['#demo', 200], ['#links', 15], ['#famGrid', 30]],
  'weihe.html': [],                       // 純內容頁：無動態區塊，只需不拋例外
                                          // 表單結構與按鈕邏輯由 precheck 標籤配平＋瀏覽器抽查把關
  'jiucuo.html': [],                       // 純靜態糾錯表單頁：同上
  'rongyu.html': [['#honorStats', 6], ['#honorBody', 6]],  // 三類統計＋三類空榜列表
  'fengong.html': [['#fgStats', 18], ['#fgBody', 500], ['#fyTabs', 5], ['#fyStats', 12], ['#fyGrid', 100]],
  'quanben.html': [['#volTabs', 5], ['#rhymeNav', 15], ['#rhymeBody', 500]],
  'canyu.html': [['#canyuGrid', 9]],
  'wip.html': [],
  'duizhang.html': [['#dzStats', 12], ['#dzFilters', 9], ['#dzBody', 500]],
  'about.html': [['#variants', 27], ['#aboutStats', 15]],
  'contribute.html': [],                  // 純內容頁＋一個動態計數（#contributeCoverage）：由 app.js renderContribute 填值，
                                          // 該計數值與 registry 一致性由 precheck ⑪ 與人工核對把關
  'jyutping.html': [],                    // 純內容頁（粵拼入門）：五張表都是靜態 HTML，
                                          // 由 precheck 的標籤配平與人工核對把關（見提交說明）
  // 聲韻入門：五個語族段落的動態表都由資料即時算出（原 /fangyan/ 併入）
  'shengyun.html': [['#yue-ru', 14], ['#yue-cmp', 60], ['#cmn-dist', 20], ['#cmn-ru', 25],
                    ['#sc-zh', 36], ['#sc-tone', 24], ['#sc-ru', 36],
                    ['#wu-voiced', 30], ['#wu-ru', 28], ['#wu-diff', 14],
                    ['#min-ru', 54], ['#min-nasal', 42], ['#min-diff', 38]],
  '404.html': []
};

let pass = 0, fail = 0;
const problems = [];

(async function run() {
  for (const page of PAGES) {
    const html = fs.readFileSync(path.join(SITE, page), 'utf8');

    const sandbox = { window: {}, document: null, console, Array, Math, String, JSON,
                      Object, Promise, setTimeout, Boolean, Number, RegExp };
    sandbox.window.location = { hash: '' };
    sandbox.window.document = null;
    vm.createContext(sandbox);

    // 模擬 <script src>：由磁碟載入並在沙箱中執行
    function loadScript(src, node) {
      const p = path.join(SITE, src.replace(/^\.?\//, ''));
      try {
        vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: src });
        if (node && node.onload) node.onload();
      } catch (e) {
        problems.push(`${page}：載入 ${src} 失敗 → ${e.message}`);
        if (node && node.onerror) node.onerror();
      }
    }

    const { document, registry, dataNodes, fire } = buildDoc(html, page, loadScript);
    sandbox.document = document;
    sandbox.window.document = document;

    let err = null;
    try {
      // ★ 依頁面**自己**的 <script src> 載入，順序照頁面。
      //   先前這裡寫死 ['data.js','chars.js','registry.js']，於是對
      //   shengyun.html 這種多引用一支資料檔的頁面，測試少載了一支卻照樣「通過」，
      //   掩蓋了真實瀏覽器會遇到的問題。測試載入的檔案必須等於瀏覽器載入的檔案。
      const srcs = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1]);
      const missing = srcs.filter(s => !fs.existsSync(path.join(SITE, s.replace(/^\.?\//, ''))));
      if (missing.length) throw new Error('頁面引用了不存在的檔案：' + missing.join('、'));
      for (const f of srcs) {
        vm.runInContext(
          fs.readFileSync(path.join(SITE, f.replace(/^\.?\//, '')), 'utf8'),
          sandbox, { filename: f });
      }
      fire();
      await new Promise(r => setTimeout(r, 120));   // 等動態 script 載入
    } catch (e) { err = e; }

    if (err) {
      fail++; problems.push(`${page}：渲染拋出例外 → ${err.message}`);
      continue;
    }

    const checks = [];
    // 全站共通：導覽與頁尾由 app.js 注入，每一頁都必須有內容（抓 app.js 全域性回歸）
    checks.push({ sel: '#nav', min: 3, got: descendants(registry['nav'] || makeNode('x')) });
    checks.push({ sel: '#foot', min: 8, got: descendants(registry['foot'] || makeNode('x')) });
    (EXPECT[page] || []).forEach(([sel, min]) => {
      const node = registry[sel.replace('#', '')];
      const n = node ? descendants(node) : -1;
      checks.push({ sel, min, got: n, ok: n >= min });
    });
    checks.forEach(c => { if (c.ok === undefined) c.ok = c.got >= c.min; });

    const unfilled = dataNodes.filter(nd => {
      const t = nd.textContent;
      return !t || t === '' || t === 'undefined' || t === 'null';
    });

    const badChecks = checks.filter(c => !c.ok);
    if (badChecks.length || unfilled.length) {
      fail++;
      badChecks.forEach(c => problems.push(
        `${page}：${c.sel} 只有 ${c.got} 個子節點（至少需 ${c.min}）`));
      if (unfilled.length) problems.push(
        `${page}：${unfilled.length} 個 data-m 佔位未填（${unfilled.slice(0, 4).map(x => x.getAttribute('data-m')).join(', ')}）`);
    } else {
      pass++;
      console.log(`✓ ${page.padEnd(15)} ` +
        checks.map(c => `${c.sel}=${c.got}`).join(' ') +
        (dataNodes.length ? `  data-m ${dataNodes.length}/${dataNodes.length} 已填` : ''));
    }
  }

  /* ── 方言切換：這是合併案的核心承諾，必須有閘門 ──────────────────────
     把 quanben.html 以 ?pt=chengdu 再跑一次，檢查：
       ① 字音真的換成成都讀音（出現蜀拼數字調，非粵拼）
       ② 不是一整片「—」（那代表資料沒接上，卻毫無錯誤訊息）
     沒有這道檢查，「切換器畫得出來但字音沒換」可以一路通過所有既有測試。 */
  {
    const page = 'quanben.html?pt=chengdu';
    const html = fs.readFileSync(path.join(SITE, 'quanben.html'), 'utf8');
    const sandbox = { window: {}, document: null, console, Array, Math, String, JSON,
                      Object, Promise, setTimeout, Boolean, Number, RegExp };
    sandbox.window.location = { hash: '', search: '?pt=chengdu' };
    sandbox.window.document = null;
    vm.createContext(sandbox);

    function loadScript(src, node) {
      const p = path.join(SITE, src.replace(/^\.?\//, ''));
      try {
        vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: src });
        if (node && node.onload) node.onload();
      } catch (e) { if (node && node.onerror) node.onerror(); }
    }
    const { document, registry, fire } = buildDoc(html, 'quanben.html', loadScript);
    sandbox.document = document;
    sandbox.window.document = document;

    let err = null;
    try {
      for (const f of [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1])) {
        vm.runInContext(fs.readFileSync(path.join(SITE, f.replace(/^\.?\//, '')), 'utf8'),
                        sandbox, { filename: f });
      }
      fire();
      await new Promise(r => setTimeout(r, 400));   // 等 fangyan.js 動態載入
    } catch (e) { err = e; }

    if (err) {
      fail++; problems.push(`${page}：渲染拋出例外 → ${err.message}`);
    } else {
      const body = registry['rhymeBody'];
      // 排除標點格的空字串（每句一個，其 .r 恆為空）
      const readings = collectClass(body, 'r').filter(t => t !== '');
      // ★ 只能在 .r（讀音）節點裡數「—」。
      //   平仄符號用的也是「—」，若整棵子樹一起數會把平聲字全算成缺音
      //   （實測：整樹 229 個，其中真正的缺音只有 22 個）。
      const dashes = readings.filter(t => t === '—').length;
      // 蜀拼：拉丁字母＋末尾聲調數字（1–5）
      const shupin = readings.filter(t => /^[a-zü]+[1-5]$/.test(t));
      // 非粵語方言點沒有音檔，播放鍵必須全部停用——否則讀者按了只會靜默失敗
      const offs = collectClass(body, 'off').length;
      const ok = readings.length > 100 && dashes < readings.length * 0.25 &&
                 shupin.length > readings.length * 0.7 && offs > 20;
      if (ok) {
        pass++;
        console.log(`✓ ${page.padEnd(15)} 讀音 ${readings.length} 個` +
                    `（蜀拼 ${shupin.length}／未收 ${dashes}／播放鍵停用 ${offs}）`);
      } else {
        fail++;
        problems.push(`${page}：切換方言後字音未正確替換 → 讀音 ${readings.length} 個、` +
                      `蜀拼 ${shupin.length} 個、未收「—」${dashes} 個、停用播放鍵 ${offs} 個`);
      }
    }
  }

  console.log('='.repeat(64));
  if (problems.length) {
    problems.forEach(p => console.log('✗ ' + p));
    console.log(`結果：${pass} 過 / ${fail} 未過`);
    process.exit(1);
  }
  console.log(`結果：${pass} 過 / 0 未過（${PAGES.length} 頁全部渲染出內容）`);
})();

/* 收集子樹中 class 含 cls 的節點文字 */
function collectClass(n, cls) {
  if (!n) return [];
  const out = [];
  (function walk(x) {
    if (x._cls && x._cls.split(/\s+/).indexOf(cls) >= 0) out.push(x.textContent);
    x.children.forEach(walk);
  })(n);
  return out;
}
