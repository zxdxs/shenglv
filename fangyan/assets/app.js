/* 聲律發蒙 · 方言導讀（試作）前端
 *
 * 資料形狀（由 build_sichuan_site.py 產生）：
 *   window.SHENGLV          meta ＋ points[] ＋ volumes[{id,name,tone,rhymes[{name,lineCount}]}]
 *   window.SHENGLV_CHARS    字 → { cg 中古聲調, ru 是否入聲, p:{方言點:讀音} }
 *   window.SHENGLV_VOL1..5  每卷對句 [{ ry 韻, ch 章, t 原文, s 吟誦符號 }]
 *   window.SHENGLV_DUIZHANG 各韻字譜 { 韻: { vol, tone, fanqie[{qie,chars}], yin[] } }
 *
 * 讀音不進 vol 檔：切換方言點時即時由 SHENGLV_CHARS 重組，故切換零延遲。
 * 樣式沿用 style.css 既有類別（.vol-tabs / .rhyme-nav / .zupu），當前項用 aria-pressed。
 */
'use strict';

var M = (window.SHENGLV || { meta: {}, points: [], volumes: [] });
var C = window.SHENGLV_CHARS || {};
var PT_KEY = 'sc_point_v1';
var FAM_KEY = 'sc_family_v1';
var QB = { v: 0, r: 0 };                 // 全本頁當前卷／韻，跨重繪保留

function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function isCJK(ch) {
  var c = ch.codePointAt(0);
  return (c >= 0x3400 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff) ||
         (c >= 0x20000 && c <= 0x2fa1f);
}

/* ---------------------------------------------------------------- 方言點 */
/* 兩層：語族 → 方言點。相容舊資料（無 families 時視為單一語族）。 */
function families() {
  if (M.families && M.families.length) return M.families;
  return [{ key: 'sichuan', name: '四川話', points: M.points || [] }];
}
function qs(name) {                       // 讀網址參數（主站以 ?fam= 連進來）
  var m = location.search.match(new RegExp('[?&]' + name + '=([^&]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
function curFamily() {
  // 1) 頁面可用 <body data-family="..."> 鎖定語族（例如四川話專屬的入門／對帳頁）
  var lock = document.body.getAttribute('data-family');
  if (lock && families().some(function (f) { return f.key === lock; })) return lock;
  // 2) 網址參數優先（主站「方言 ▾」以 /fangyan/?fam=wu 連入）
  var q = qs('fam');
  if (q && families().some(function (f) { return f.key === q; })) return q;
  // 3) 再讀使用者上次的選擇
  var k = localStorage.getItem(FAM_KEY);
  return families().some(function (f) { return f.key === k; }) ? k : families()[0].key;
}
function setFamily(k) { localStorage.setItem(FAM_KEY, k); }
function familyObj(k) { return families().filter(function (f) { return f.key === k; })[0]; }
function pointsOf(k) { var f = familyObj(k || curFamily()); return f ? f.points : []; }
function allPoints() {
  return families().reduce(function (a, f) { return a.concat(f.points); }, []);
}
/* 對句並列時用的點集合：本語族全部點 */
function points() { return pointsOf(); }
function curPoint() {
  var qp = qs('pt');
  if (qp && pointsOf().some(function (p) { return p.key === qp; })) return qp;
  var k = localStorage.getItem(PT_KEY);
  if (k === 'all') return 'all';
  // ★ 必須驗證「屬於當前語族」，不能只驗證「是有效的點」：
  //   否則在鎖定語族的頁面上（如四川話的入門頁），localStorage 若存著別族的點，
  //   下拉會選不中而顯示空白。
  var ps = pointsOf();
  return ps.some(function (p) { return p.key === k; }) ? k : (ps[0] || {}).key;
}
function setPoint(k) { localStorage.setItem(PT_KEY, k); }
function curPointObj() { return allPoints().filter(function (x) { return x.key === curPoint(); })[0]; }
function reading(ch, k) {
  var c = C[ch];
  return (c && c.p) ? (c.p[k] || null) : null;
}
function isRu(ch) { var c = C[ch]; return !!(c && c.ru); }

/* ---------------------------------------------------------------- 頁首頁尾 */
function buildHeader() {
  var host = $('#nav');
  if (!host) return;
  var wrap = el('div', 'wrap');
  var brand = el('a', 'brand');
  brand.href = 'index.html';
  brand.appendChild(document.createTextNode('聲律發蒙 · 方言導讀'));
  brand.appendChild(el('small', null, '集各地各派吟誦，傳中文千古聲韻'));
  wrap.appendChild(brand);
  var nav = el('nav', 'main');
  nav.setAttribute('aria-label', '主導覽');
  var g = el('div', 'nav-g');
  var page = document.body.getAttribute('data-page') || '';
  [['index.html', '首頁', 'index'], ['quanben.html', '全本', 'quanben'],
   ['shengyun.html', '聲韻入門', 'shengyun'], ['duizhang.html', '反切對帳', 'duizhang'],
   ['about.html', '關於與授權', 'about'], ['license.html', '授權', 'license']].forEach(function (it) {
    var a = el('a', null, it[1]);
    a.href = it[0];
    if (page === it[2]) a.setAttribute('aria-current', 'page');
    g.appendChild(a);
  });
  // ── 方言 ▾：沿用主站（shenglv.org.cn）的下拉元件與類別，行為一致
  var det = el('details', 'nav-dia');
  det.appendChild(el('summary', null, '方言'));
  var menu = el('div', 'dia-menu');
  var cur = curFamily();
  // 粵語已完成，在主站根目錄；其餘在本站或建設中
  var DIA = [
    { key: 'cmn',   label: '普通話', on: true },      // 基準線：入聲的終點
    { key: '__yue', label: '粵語', href: 'https://shenglv.org.cn/quanben.html', on: true, ext: true },
    { key: 'sichuan', label: '西南官話', on: true },
    { key: 'wu', label: '吳語', on: true },
    { key: 'min', label: '閩語', on: true },
    { key: 'hakka', label: '客家話', on: false }
  ];
  DIA.forEach(function (d) {
    if (d.on) {
      var a = el('a', 'dia-chip' + (d.key === cur ? ' on' : ''), d.label);
      if (d.ext) {
        a.href = d.href;
      } else {
        a.href = '#';
        a.addEventListener('click', function (e) {
          e.preventDefault();
          setFamily(d.key);
          setPoint((pointsOf(d.key)[0] || {}).key);
          det.removeAttribute('open');
          render();
        });
      }
      menu.appendChild(a);
    } else {
      var sp = el('span', 'dia-chip off', d.label);
      sp.setAttribute('title', '建設中——無明確授權之資料來源，暫不納入');
      menu.appendChild(sp);
    }
  });
  menu.appendChild(el('span', 'dia-div'));
  var add = el('a', 'dia-chip add', '＋ 添加');
  add.href = 'about.html';
  menu.appendChild(add);
  det.appendChild(menu);
  g.appendChild(det);
  nav.appendChild(g);
  wrap.appendChild(nav);
  host.appendChild(wrap);
  host.appendChild(buildPointBar());
}

function buildPointBar() {
  var bar = el('div', 'wrap');
  var inner = el('div', 'ptbar');

  // 語族下拉（保留，供鍵盤操作與無腳本情境；語族主要仍由導覽「方言 ▾」切換）
  inner.appendChild(el('label', null, '語族'));
  var fs = el('select');
  fs.id = 'fam';
  fs.setAttribute('aria-label', '選擇語族');
  families().forEach(function (f) {
    var o = el('option', null, f.name + '（' + f.points.length + ' 點）');
    o.value = f.key;
    fs.appendChild(o);
  });
  fs.value = curFamily();
  fs.addEventListener('change', function () {
    setFamily(fs.value);
    setPoint((pointsOf(fs.value)[0] || {}).key);
    render();
  });
  inner.appendChild(fs);

  // 方言點
  inner.appendChild(el('label', null, '方言點'));
  var sel = el('select');
  sel.id = 'pt';
  sel.setAttribute('aria-label', '選擇方言點');
  pointsOf().forEach(function (p) {
    var o = el('option', null, p.name + '（' + p.area + '）');
    o.value = p.key;
    sel.appendChild(o);
  });
  var o2 = el('option', null, '本語族全部並列');
  o2.value = 'all';
  sel.appendChild(o2);
  sel.value = curPoint();
  sel.addEventListener('change', function () { setPoint(sel.value); render(); });
  inner.appendChild(sel);

  var p = curPointObj();
  var note = p ? (p.area + ' · ' + p.note) : ('並列本語族 ' + pointsOf().length + ' 個點');
  inner.appendChild(el('span', 'ptbadge', note));
  bar.appendChild(inner);
  return bar;
}

function buildFooter() {
  var host = $('#foot');
  if (!host) return;
  var wrap = el('div', 'wrap');
  var cols = el('div', 'cols');
  function col(title, items) {
    var d = el('div');
    d.appendChild(el('b', null, title));
    items.forEach(function (t) {
      if (t.href) {
        var a = el('a', null, t.text);
        a.href = t.href;
        d.appendChild(a);
      } else {
        d.appendChild(el('div', t.cls || null, t.text));
      }
    });
    cols.appendChild(d);
  }
  col('本站', [
    { text: '《聲律發蒙》全本 ' + (M.meta.rhymeCount || 0) + ' 韻 · '
            + families().length + ' 語族 ' + allPoints().length + ' 個方言點導讀' },
    { text: '試作版 ' + (M.meta.version || ''), cls: 'muted' }
  ]);
  col('文本來源', [{ text: M.meta.source || '' }, { text: '正文屬公有領域', cls: 'muted' }]);
  col('讀音來源', [
    { text: '四川話：蜀拼（GPL-3.0）' },
    { text: '吳語：上海話 CC0 1.0／寧波話 LGPL' },
    { text: '閩南語：潮汕六點 GPL-3.0' },
    { text: '各來源授權不同，見「授權」頁', cls: 'muted' }
  ]);
  col('授權', [
    { text: 'GNU GPL-3.0（' + (M.meta.license || '') + '）' },
    { text: '來源與改動說明 →', href: 'license.html' },
    { text: '上游：' + (M.meta.upstream || '').replace('https://github.com/', ''), cls: 'muted' }
  ]);
  col('相關', [
    { text: '中文聲韻（粵語） →', href: 'https://shenglv.org.cn/' },
    { text: '解決問題訓練站 →', href: 'https://solve-lab.cn/' }
  ]);
  wrap.appendChild(cols);
  /* ICP 備案號：工信部要求顯示於網站底部並連結 beian.miit.gov.cn（法律責任，非裝飾）。
     shenglv.org.cn 之備案為「中文声韵」，號碼見 data.js 的 meta.beian；
     留空則整段不輸出。 */
  if (M.meta.beian) {
    var ba = el('div', 'beian');
    ba.appendChild(document.createTextNode('ICP 備案：'));
    var a = el('a', null, M.meta.beian);
    a.href = 'https://beian.miit.gov.cn/';
    a.target = '_blank';
    a.rel = 'noopener';
    ba.appendChild(a);
    wrap.appendChild(ba);
  }
  host.appendChild(wrap);
}

/* ---------------------------------------------------------------- 對句 */
function charList(t) {
  var out = [], i, ch;
  for (i = 0; i < t.length; i++) {
    ch = t[i];
    if (isCJK(ch) && C[ch]) out.push(ch);
  }
  return out;
}

function coupletNode(line, forceAll) {
  var all = forceAll || curPoint() === 'all';
  var box = el('div', 'cp');

  if (all) {
    var t = el('table', 'cmp');
    var head = el('tr');
    head.appendChild(el('th', null, '方言點'));
    charList(line.t).forEach(function (ch) {
      head.appendChild(el('th', isRu(ch) ? 'ru' : null, ch));
    });
    t.appendChild(head);
    points().forEach(function (p) {
      var tr = el('tr');
      tr.appendChild(el('td', 'ptname', p.name));
      charList(line.t).forEach(function (ch) {
        tr.appendChild(el('td', isRu(ch) ? 'ru' : null, reading(ch, p.key) || '—'));
      });
      t.appendChild(tr);
    });
    var w = el('div', 'cmpwrap');
    w.appendChild(t);
    box.appendChild(w);
    box.appendChild(el('div', 'muted', line.t));
    return box;
  }

  // 一行即可：.cell 本身是直向堆疊（讀音／字／符號），不必複製三份
  var row = el('div', 'rrow');
  var syms = (line.s || '').split(/[\s　]+/).filter(function (x) { return x; });
  var si = 0, i, ch, cell;
  for (i = 0; i < line.t.length; i++) {
    ch = line.t[i];
    cell = el('div', 'cell');
    if (isCJK(ch) && C[ch]) {
      cell.appendChild(el('div', 'rd', reading(ch, curPoint()) || '—'));
      cell.appendChild(el('div', 'zi', ch));
      cell.appendChild(el('div', 'sy', syms[si] || ''));
      si++;
      if (isRu(ch)) cell.className = 'cell ru';
    } else {
      cell.className = 'cell punc';
      cell.appendChild(el('div', 'rd', ''));
      cell.appendChild(el('div', 'zi', ch));
      cell.appendChild(el('div', 'sy', ''));
    }
    row.appendChild(cell);
  }
  box.appendChild(row);
  return box;
}

/* ---------------------------------------------------------------- 首頁 */
function renderIndex() {
  // 重繪前先清空：切換方言點會重跑 render()，不清就會一直往上疊
  ['#stats', '#points', '#demo'].forEach(function (sel) {
    var n = $(sel);
    if (n) n.innerHTML = '';
  });
  var host = $('#stats');
  if (host) {
    [['卷', M.meta.volumeCount], ['韻', M.meta.rhymeCount], ['句', M.meta.lineCount],
     ['收字', M.meta.charCount],
     ['語族', families().length], ['方言點', allPoints().length]].forEach(function (x) {
      var c = el('div', 'stat');            // 沿用 style.css 的 .stat/.n/.l
      c.appendChild(el('div', 'n', String(x[1])));
      c.appendChild(el('div', 'l', x[0]));
      host.appendChild(c);
    });
  }
  var pt = $('#points');
  if (pt) {
    var t = el('table', 'cmp'), tr = el('tr');
    ['語族', '方言點', '片區', '入聲'].forEach(function (h) { tr.appendChild(el('th', null, h)); });
    t.appendChild(tr);
    families().forEach(function (f) {
      f.points.forEach(function (p, i) {
        var r = el('tr');
        if (i === 0) {
          var td = el('td', 'ptname', f.name);
          td.rowSpan = f.points.length;
          tr = r;
          r.appendChild(td);
        }
        r.appendChild(el('td', null, p.name));
        r.appendChild(el('td', null, p.area));
        r.appendChild(el('td', null, p.note));
        t.appendChild(r);
      });
    });
    var w = el('div', 'cmpwrap');
    w.appendChild(t);
    pt.appendChild(w);
  }
  var demo = $('#demo');
  if (demo) {
    demo.appendChild(coupletNode({ ry: '一屋', ch: '其一', t: '府對宮，', s: '|　|　—' }));
    demo.appendChild(coupletNode({ ry: '一屋', ch: '其一', t: '庭對屋。', s: '—　|　•' }));
  }
}

/* ---------------------------------------------------------------- 全本頁 */
function renderQuanben() {
  var tabs = $('#volTabs'), nav = $('#rhymeNav'), host = $('#rhymeBody');
  if (!tabs || !nav || !host) return;
  var vols = M.volumes || [];
  if (!vols.length) return;

  vols.forEach(function (v, i) {
    var b = el('button', null, v.name);
    b.type = 'button';
    b.setAttribute('aria-pressed', i === QB.v ? 'true' : 'false');
    b.addEventListener('click', function () {
      QB.v = i; QB.r = 0;
      $$('button', tabs).forEach(function (x, j) {
        x.setAttribute('aria-pressed', j === i ? 'true' : 'false');
      });
      drawRhymes();
    });
    tabs.appendChild(b);
  });
  drawRhymes();

  function drawRhymes() {
    var v = vols[QB.v];
    nav.innerHTML = '';
    (v.rhymes || []).forEach(function (r, i) {
      var b = el('button', null, r.name);
      b.type = 'button';
      b.setAttribute('aria-pressed', i === QB.r ? 'true' : 'false');
      b.addEventListener('click', function () {
        QB.r = i;
        $$('button', nav).forEach(function (x, j) {
          x.setAttribute('aria-pressed', j === i ? 'true' : 'false');
        });
        drawBody();
      });
      nav.appendChild(b);
    });
    drawBody();
  }

  function drawBody() {
    var v = vols[QB.v];
    var rhyme = (v.rhymes || [])[QB.r] || { name: '' };
    var lines = (window['SHENGLV_VOL' + (QB.v + 1)] || [])
      .filter(function (l) { return l.ry === rhyme.name; });
    host.innerHTML = '';
    host.appendChild(el('h3', null, rhyme.name + '（' + lines.length + ' 句）'));
    if (curPoint() === 'all') {
      var wrap = el('div');
      lines.forEach(function (l) { wrap.appendChild(coupletNode(l, true)); });
      host.appendChild(wrap);
    } else {
      lines.forEach(function (l) { host.appendChild(coupletNode(l)); });
    }
    var dz = (window.SHENGLV_DUIZHANG || {})[rhyme.name];
    if (dz && dz.fanqie && dz.fanqie.length) {
      var d = el('details');
      d.appendChild(el('summary', null, '本韻字譜（劉節原本 · ' + dz.fanqie.length + ' 小韻）'));
      var z = el('div', 'zupu');
      dz.fanqie.forEach(function (f) {
        var row = el('div', 'row');
        row.appendChild(el('div', 'qie', f.qie));
        var cs = el('div', 'cs');
        f.chars.forEach(function (c) {
          var sp = el('span', 'ch' + (isRu(c) ? ' ru' : ''));
          sp.appendChild(el('span', 'r', reading(c, curPoint() === 'all' ? 'yibin' : curPoint()) || ''));
          sp.appendChild(el('span', 'c', c));
          cs.appendChild(sp);
        });
        row.appendChild(cs);
        z.appendChild(row);
      });
      d.appendChild(z);
      host.appendChild(d);
    }
    host.appendChild(el('p', 'muted',
      '讀音由蜀拼通音字典按各方言規則推得，非逐字田野核對；紅棕色為入聲字。'));
  }
}


/* ------------------------------------------------- 共用小元件 */
function miniTable(chars, caption) {
  var w = el('div', 'cmpwrap'), t = el('table', 'cmp');
  var head = el('tr');
  head.appendChild(el('th', null, caption || '字'));
  points().forEach(function (p) { head.appendChild(el('th', null, p.name)); });
  t.appendChild(head);
  chars.forEach(function (ch) {
    var tr = el('tr');
    tr.appendChild(el('td', 'zi' + (isRu(ch) ? ' ru' : ''), ch));
    points().forEach(function (p) {
      tr.appendChild(el('td', isRu(ch) ? 'ru' : null, reading(ch, p.key) || '—'));
    });
    t.appendChild(tr);
  });
  w.appendChild(t);
  return w;
}

// rows: [標題, 內容] 或 [標題, 內容, 'html']（後者允許內容含標籤）
function twoColTable(rows) {
  var w = el('div', 'cmpwrap'), t = el('table', 'cmp');
  rows.forEach(function (r) {
    var tr = el('tr');
    tr.appendChild(el('td', 'ptname', r[0]));
    var td = el('td');
    if (r[2] === 'html') td.innerHTML = r[1];
    else td.textContent = r[1];
    tr.appendChild(td);
    t.appendChild(tr);
  });
  w.appendChild(t);
  return w;
}

/* ------------------------------------------------- 聲韻入門（三語族分頁） */
function renderShengyun() {
  var fam = curFamily();

  // 只顯示當前語族的分頁
  $$('section[data-fam]').forEach(function (sec) {
    var on = sec.getAttribute('data-fam') === fam;
    sec.style.display = on ? '' : 'none';
  });

  function fill(id, chars, caption) {
    var host = $('#' + id);
    if (host && !host.childNodes.length) host.appendChild(miniTable(chars, caption || '字'));
  }

  if (fam === 'cmn') {
    fill('cmn-ru', ['屋', '竹', '木', '白', '月', '學', '十', '七']);
    // 入聲在普通話的四聲分佈：由資料實測得出
    var d2 = $('#cmn-dist');
    if (d2 && !d2.childNodes.length) {
      var ru = [], all = 0;
      for (var ch in C) { if (C[ch].ru && C[ch].p && C[ch].p.putonghua) { ru.push(C[ch].p.putonghua); all++; } }
      var names = { '1': '陰平', '2': '陽平', '3': '上聲', '4': '去聲', '0': '輕聲' };
      var cnt = {};
      ru.forEach(function (r) {
        var t = '0';
        var MARK = { 'ā': '1', 'á': '2', 'ǎ': '3', 'à': '4', 'ē': '1', 'é': '2', 'ě': '3', 'è': '4',
                     'ī': '1', 'í': '2', 'ǐ': '3', 'ì': '4', 'ō': '1', 'ó': '2', 'ǒ': '3', 'ò': '4',
                     'ū': '1', 'ú': '2', 'ǔ': '3', 'ù': '4', 'ǖ': '1', 'ǘ': '2', 'ǚ': '3', 'ǜ': '4' };
        for (var i = 0; i < r.length; i++) { if (MARK[r[i]]) { t = MARK[r[i]]; break; } }
        cnt[t] = (cnt[t] || 0) + 1;
      });
      var w = el('div', 'cmpwrap'), t = el('table', 'cmp'), head = el('tr');
      ['普通話聲調', '字數', '佔比'].forEach(function (h) { head.appendChild(el('th', null, h)); });
      t.appendChild(head);
      Object.keys(cnt).sort().forEach(function (k) {
        var tr = el('tr');
        tr.appendChild(el('td', 'ptname', '第 ' + k + ' 聲　' + (names[k] || '')));
        tr.appendChild(el('td', null, String(cnt[k])));
        tr.appendChild(el('td', null, (100 * cnt[k] / all).toFixed(1) + '%'));
        t.appendChild(tr);
      });
      var tr2 = el('tr');
      tr2.appendChild(el('td', 'ptname', '合計'));
      tr2.appendChild(el('td', null, String(all)));
      tr2.appendChild(el('td', null, '100%'));
      t.appendChild(tr2);
      w.appendChild(t); d2.appendChild(w);
    }
  } else if (fam === 'sichuan') {
    fill('sc-zh', ['竹', '車', '山', '師', '十']);
    fill('sc-ru', ['屋', '屈', '欲', '菊', '七']);
    var d = $('#sc-tone');
    if (d && !d.childNodes.length && M.pointStats) {
      var w = el('div', 'cmpwrap'), t = el('table', 'cmp'), head = el('tr');
      ['四川話方言點', '片區', '入聲字數', '主要去向'].forEach(function (h) {
        head.appendChild(el('th', null, h));
      });
      t.appendChild(head);
      pointsOf('sichuan').forEach(function (p) {
        var st = M.pointStats[p.key] || {};
        var tr = el('tr');
        tr.appendChild(el('td', 'ptname', p.name));
        tr.appendChild(el('td', null, p.area));
        tr.appendChild(el('td', null, String(st.ruTotal == null ? '' : st.ruTotal)));
        tr.appendChild(el('td', null, st.top
          ? ('第 ' + st.top + ' 聲 · ' + (st.topPct || 0).toFixed(1) + '%') : '—'));
        t.appendChild(tr);
      });
      w.appendChild(t); d.appendChild(w);
    }
  } else if (fam === 'wu') {
    fill('wu-voiced', ['同', '道', '並', '定', '奉', '床', '婆', '茶']);
    fill('wu-ru', ['一', '七', '屋', '竹', '白', '月', '學']);
    fill('wu-diff', ['泥', '來', '日', '十']);
  } else if (fam === 'min') {
    fill('min-ru', ['十', '法', '七', '屋', '竹', '白', '月', '學']);
    fill('min-nasal', ['我', '五', '牙', '岸', '目', '黃']);
    fill('min-diff', ['葉', '法', '問', '七', '先', '關']);
  }
}

/* ------------------------------------------------- 反切對帳 */
function renderDuizhang() {
  var tabs = $('#dzVolTabs'), nav = $('#dzRhymeNav'), host = $('#dzBody');
  if (tabs && nav && host) {
    var vols = M.volumes || [];
    vols.forEach(function (v, i) {
      var btn = el('button', null, v.name);
      btn.type = 'button';
      btn.setAttribute('aria-pressed', i === QB.v ? 'true' : 'false');
      btn.addEventListener('click', function () {
        QB.v = i; QB.r = 0;
        $$('button', tabs).forEach(function (x, j) {
          x.setAttribute('aria-pressed', j === i ? 'true' : 'false');
        });
        drawR();
      });
      tabs.appendChild(btn);
    });
    drawR();

    function drawR() {
      var v = vols[QB.v];
      nav.innerHTML = '';
      (v.rhymes || []).forEach(function (r, i) {
        var btn = el('button', null, r.name);
        btn.type = 'button';
        btn.setAttribute('aria-pressed', i === QB.r ? 'true' : 'false');
        btn.addEventListener('click', function () {
          QB.r = i;
          $$('button', nav).forEach(function (x, j) {
            x.setAttribute('aria-pressed', j === i ? 'true' : 'false');
          });
          drawB();
        });
        nav.appendChild(btn);
      });
      drawB();
    }

    function drawB() {
      var v = vols[QB.v];
      var rhyme = (v.rhymes || [])[QB.r] || { name: '' };
      var dz = (window.SHENGLV_DUIZHANG || {})[rhyme.name];
      host.innerHTML = '';
      if (!dz) { host.appendChild(el('p', 'muted', '（此韻無字譜）')); return; }
      host.appendChild(el('h3', null, rhyme.name + '　中古 ' + dz.tone + ' 聲　' + dz.fanqie.length + ' 小韻'));
      var w = el('div', 'cmpwrap'), t = el('table', 'cmp'), head = el('tr');
      ['反切', '字', '中古'].forEach(function (h) { head.appendChild(el('th', null, h)); });
      points().forEach(function (p) { head.appendChild(el('th', null, p.name)); });
      t.appendChild(head);
      dz.fanqie.forEach(function (f) {
        f.chars.forEach(function (ch, i) {
          var tr = el('tr');
          if (i === 0) {
            var td = el('td', 'ptname', f.qie);
            td.rowSpan = f.chars.length;
            tr.appendChild(td);
          }
          tr.appendChild(el('td', 'zi' + (isRu(ch) ? ' ru' : ''), ch));
          tr.appendChild(el('td', null, (C[ch] && C[ch].cg) || dz.tone));
          points().forEach(function (p) {
            tr.appendChild(el('td', isRu(ch) ? 'ru' : null, reading(ch, p.key) || '—'));
          });
          t.appendChild(tr);
        });
      });
      w.appendChild(t);
      host.appendChild(w);
    }
  }

  var cf = $('#cf-count');
  if (cf) cf.textContent = String((M.meta.conflicts || []).length);
  var cfl = $('#cf-list');
  if (cfl && (M.meta.conflicts || []).length) {
    var w2 = el('div', 'cmpwrap'), t2 = el('table', 'cmp'), h2 = el('tr');
    ['字', '中古聲調', '字典候選', '暫取'].forEach(function (x) { h2.appendChild(el('th', null, x)); });
    t2.appendChild(h2);
    M.meta.conflicts.forEach(function (c) {
      var tr = el('tr');
      tr.appendChild(el('td', 'zi', c.ch));
      tr.appendChild(el('td', null, c.cg || '—'));
      tr.appendChild(el('td', null, (c.alt || []).join(' / ') || '無'));
      tr.appendChild(el('td', null, c.picked || '—'));
      t2.appendChild(tr);
    });
    w2.appendChild(t2);
    cfl.appendChild(w2);
  }

  var sl = $('#sharp-list');
  if (sl) sl.appendChild(miniTable(['七', '即', '夕', '息', '席', '惜', '悉', '寂', '戚', '昔'], '字'));

  var ms = $('#ms-count');
  if (ms) ms.textContent = String((M.meta.missing || []).length);
  var msl = $('#ms-list');
  if (msl) msl.appendChild(el('p', 'muted', (M.meta.missing || []).join('')));
}

/* ------------------------------------------------- 關於與授權 */
function renderAbout() {
  var q = $('#quality');
  if (!q) return;
  var chars = M.meta.charCount || 0;
  var miss = (M.meta.missing || []).length;
  q.appendChild(twoColTable([
    ['全書用字', chars + ' 字'],
    ['字典有讀音', (chars - miss) + ' 字　（' + (100 * (chars - miss) / Math.max(1, chars)).toFixed(1) + '%）'],
    ['字典未收', miss + ' 字（標「—」，不臆造）'],
    ['選音衝突', (M.meta.conflicts || []).length + ' 字（暫取主讀音，已逐一列出）'],
    ['入聲字', (M.meta.ruCount || 0) + ' 字'],
    ['全書規模', (M.meta.volumeCount || 0) + ' 卷　' + (M.meta.rhymeCount || 0) + ' 韻　' + (M.meta.lineCount || 0) + ' 句'],
    ['方言點', points().length + ' 個']
  ]));
}


/* ------------------------------------------------- 授權 */
function renderLicense() {
  var a = $('#src-list');
  if (a) {
    a.appendChild(twoColTable([
      ['上游字典', '<a href="data/upstream/shupin.dict.yaml">data/upstream/shupin.dict.yaml</a>（454,078 bytes，與上游逐位元組相同）', 'html'],
      ['各地方案', '<a href="data/upstream/schemas/">data/upstream/schemas/</a>（6 份 *.schema.yaml）', 'html'],
      ['授權全文', '<a href="data/upstream/LICENSE.md">data/upstream/LICENSE.md</a>（GPL-3.0）', 'html'],
      ['本站產線', '<code>build_sichuan.py</code>、<code>build_sichuan_site.py</code>', 'html'],
      ['衍生字表', '<a href="assets/chars.js">assets/chars.js</a>（6 個方言點）', 'html']
    ]));
  }
  var b = $('#part-list');
  if (b) {
    b.appendChild(twoColTable([
      ['《聲律發蒙》正文', '公有領域（元·祝明撰，明萬曆刊本）'],
      ['三行對齊與字譜整理', '本站成果，依 GPL-3.0 釋出'],
      ['普通話（基準線）', 'mozillazg/pinyin-data，<b>MIT</b>'],
      ['四川話 6 點', '蜀拼字典，GPL-3.0（Ciphotis、涼風Papnas、旷_野、soenghaagong、holy19891004）'],
      ['吳語 上海話', 'CC0 1.0（公眾領域貢獻）'],
      ['吳語 寧波話', 'GNU LGPL'],
      ['閩南語 潮汕 6 點', 'GPL-3.0（六份授權檔 md5 相同）'],
      ['客家話', '未納入 —— 高覆蓋來源無授權'],
      ['衍生字表 assets/chars.js', '含 GPL-3.0 衍生資料；本站自有整理亦依 GPL-3.0'],
      ['網頁與前端程式', '本站成果，依 GPL-3.0 釋出'],
      ['本站樣式 assets/style.css', '沿用「中文聲韻」（粵語）站，同作者']
    ]));
  }
}

/* ---------------------------------------------------------------- 入口 */
function render() {
  var host = $('#nav');
  if (host) { host.innerHTML = ''; buildHeader(); }
  var page = document.body.getAttribute('data-page') || '';
  if (page === 'index') renderIndex();
  if (page === 'shengyun') renderShengyun();
  if (page === 'duizhang') renderDuizhang();
  if (page === 'about') renderAbout();
  if (page === 'license') renderLicense();
  if (page === 'quanben') {
    ['#volTabs', '#rhymeNav', '#rhymeBody'].forEach(function (s) {
      var n = $(s);
      if (n) n.innerHTML = '';
    });
    renderQuanben();
  }
}

document.addEventListener('DOMContentLoaded', function () {
  buildFooter();
  render();
});
