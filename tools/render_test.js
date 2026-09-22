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
const PAGES = ['index.html', 'weihe.html', 'quanben.html', 'duizhang.html', 'jyutping.html', 'contribute.html', 'about.html', '404.html'];

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
  'index.html': [['#stats', 18], ['#demo', 200], ['#links', 9]],
  'weihe.html': [],                       // 純內容頁：無動態區塊，只需不拋例外
  'quanben.html': [['#volTabs', 5], ['#rhymeNav', 15], ['#rhymeBody', 500]],
  'duizhang.html': [['#dzStats', 12], ['#dzFilters', 9], ['#dzBody', 500]],
  'about.html': [['#variants', 27], ['#aboutStats', 15]],
  'contribute.html': [],                  // 純內容頁（徵集錄音）：無動態區塊，只需不拋例外
  'jyutping.html': [],                    // 純內容頁（粵拼入門）：五張表都是靜態 HTML，
                                          // 由 precheck 的標籤配平與人工核對把關（見提交說明）
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
      for (const f of ['assets/data.js', 'assets/chars.js']) {
        vm.runInContext(fs.readFileSync(path.join(SITE, f), 'utf8'), sandbox, { filename: f });
      }
      vm.runInContext(fs.readFileSync(path.join(SITE, 'assets', 'app.js'), 'utf8'), sandbox,
                      { filename: 'app.js' });
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

  console.log('='.repeat(64));
  if (problems.length) {
    problems.forEach(p => console.log('✗ ' + p));
    console.log(`結果：${pass} 過 / ${fail} 未過`);
    process.exit(1);
  }
  console.log(`結果：${pass} 過 / 0 未過（${PAGES.length} 頁全部渲染出內容）`);
})();
