/* 聲律發蒙·粵語 —— 前端（全本 106 韻 + 逐行粵語音頻）
   無框架、無後端、無追蹤。
   資料來源：assets/data.js（索引）、assets/chars.js（逐字粵拼）、
            assets/vol1..5.js（分卷內容，按需載入）、assets/duizhang.js（對帳表）
*/

(function () {
  'use strict';

  var D = window.SHENGLV || { meta: {}, index: [], volumes: [] };
  var M = D.meta || {};
  var CH = window.SHENGLV_CHARS || {};

  /* ------------------------------------------------------------- 小工具 */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
  function $(s) { return document.querySelector(s); }
  function pct(x) { return (Math.round(x * 10) / 10) + '%'; }
  function cjkChars(s) {
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var o = s.charCodeAt(i);
      if (o >= 0x3400 && o <= 0x9fff) out.push(s[i]);
      else if (o >= 0xd800 && o <= 0xdbff && i + 1 < s.length) { out.push(s.substr(i, 2)); i++; }
    }
    return out;
  }
  function splitWs(s) { return String(s || '').split(/[\s\u3000]+/).filter(Boolean); }

  /* ------------------------------------------------------------ 音頻播放 */
  var AU = null, nowPlaying = null, playlist = [], playIdx = 0, playContainer = null, playVid = null;

  function audio() {
    if (!AU) {
      AU = document.createElement('audio');
      AU.preload = 'none';
      AU.addEventListener('ended', function () {
        if (playlist.length && playIdx < playlist.length - 1) {
          playIdx++;
          var n = playContainer
            ? playContainer.querySelector('[data-u="' + playlist[playIdx] + '"]') : null;
          playUnit(playlist[playIdx], playVid, n);
          return;
        }
        stopPlay();
      });
      document.body.appendChild(AU);
    }
    return AU;
  }

  function markPlaying(node) {
    if (nowPlaying && nowPlaying !== node) {
      nowPlaying.classList.remove('playing');
      var pb = nowPlaying.querySelector('.pbtn');
      if (pb) pb.textContent = '▶';
    }
    nowPlaying = node;
    if (node) {
      node.classList.add('playing');
      var b = node.querySelector('.pbtn');
      if (b) b.textContent = '⏸';
    }
  }

  function playUnit(u, v, node) {
    var a = audio();
    a.src = 'audio/' + v + '/' + String(u).padStart(4, '0') + '.mp3';
    a.play().catch(function () { /* 使用者手勢或檔案缺失，靜默 */ });
    markPlaying(node || null);
  }

  function stopPlay() {
    if (AU) AU.pause();
    if (nowPlaying) {
      var b = nowPlaying.querySelector('.pbtn');
      if (b) b.textContent = '▶';
      nowPlaying.classList.remove('playing');
    }
    nowPlaying = null;
    playlist = [];
    playIdx = 0;
    playContainer = null;
  }

  function toggleLine(u, v, node) {
    if (nowPlaying === node && AU && !AU.paused) { stopPlay(); return; }
    playlist = []; playIdx = 0; playContainer = null; playVid = v;
    playUnit(u, v, node);
  }

  function playChapter(units, v, container) {
    stopPlay();
    playlist = units.slice();
    playIdx = 0;
    playContainer = container;
    playVid = v;
    if (!playlist.length) return;
    var first = container.querySelector('[data-u="' + playlist[0] + '"]');
    playUnit(playlist[0], v, first);
  }

  /* --------------------------------------------------- 共用：對句渲染 */
  function charCol(cell) {
    var box = el('div', 'ch');
    var info = CH[cell.c] || {};
    if (info.ru) box.classList.add('ru');
    if (info.m) box.classList.add('multi');
    if (info.x) box.classList.add('pending');
    if (cell.rhymeEnd) box.classList.add('end');

    box.appendChild(el('span', 'r', info.x ? '待考' : (info.r || '—')));
    box.appendChild(el('span', 'p', cell.pin || ''));
    box.appendChild(el('span', 'c', cell.c));
    box.appendChild(el('span', 's', cell.sym || ''));

    var tip = [cell.c, '粵拼 ' + (info.x ? '待考（字典未收之罕用字）' : (info.r || '—')),
               '拼音 ' + (cell.pin || '—')];
    if (info.ru) tip.push('入聲（粵語 -p/-t/-k 收尾）');
    if (info.m) {
      tip.push('多音字，已選：' + info.r + '（' + (info.b || '') + '）');
      tip.push('全部讀音：' + (info.a || []).join('、'));
    }
    box.setAttribute('title', tip.join('\n'));
    return box;
  }

  function renderLine(line, vid) {
    var row = el('div', 'line');
    row.setAttribute('data-u', line.u);
    var btn = el('button', 'pbtn', '▶');
    btn.type = 'button';
    btn.setAttribute('aria-label', '播放這一句');
    btn.addEventListener('click', function () { toggleLine(line.u, vid, row); });
    row.appendChild(btn);

    var cs = cjkChars(line.t);
    var ps = splitWs(line.p), ss = splitWs(line.s);
    cs.forEach(function (c, i) {
      row.appendChild(charCol({ c: c, pin: ps[i], sym: ss[i], rhymeEnd: i === cs.length - 1 }));
    });
    var punct = line.t.replace(/[\u3400-\u9fff]/g, '');
    if (punct) {
      var p = el('div', 'ch punc');
      p.appendChild(el('span', 'r', ''));
      p.appendChild(el('span', 'p', ''));
      p.appendChild(el('span', 'c', punct));
      p.appendChild(el('span', 's', ''));
      row.appendChild(p);
    }
    return row;
  }

  function renderStanza(ch, vid) {
    var box = el('div', 'stanza');
    var head = el('div', 'st-head');
    head.appendChild(el('span', 'st-title', ch.title || ''));
    var units = ch.lines.map(function (l) { return l.u; });
    if (units.length) {
      var b = el('button', 'cbtn', '▶ 讀整章');
      b.type = 'button';
      b.addEventListener('click', function () { playChapter(units, vid, box); });
      head.appendChild(b);
      head.appendChild(el('span', 'st-count', ch.lines.length + ' 句'));
    }
    box.appendChild(head);
    ch.lines.forEach(function (ln) { box.appendChild(renderLine(ln, vid)); });
    return box;
  }

  function legend() {
    var l = el('div', 'legend');
    [['藍字', '粵拼（Jyutping）'], ['灰字', '普通話拼音（對照）'], ['紅字', '韻腳'],
     ['褐色加底線', '入聲（粵語 -p/-t/-k）'], ['r 後 ?', '多音字，游標停留看全部讀音'],
     ['待考', '字典未收之罕用字，不自造讀音']]
      .forEach(function (p) {
        var s = el('span');
        s.appendChild(el('b', null, p[0] + '：'));
        s.appendChild(document.createTextNode(p[1]));
        l.appendChild(s);
      });
    return l;
  }

  /* -------------------------------------------------- nav / footer */
  var NAV = [
    { href: 'index.html', label: '首頁' },
    { href: 'weihe.html', label: '為什麼用粵語' },
    { href: 'quanben.html', label: '全本 106 韻' },
    { href: 'duizhang.html', label: '反切對帳' },
    { href: 'contribute.html', label: '提供錄音' },
    { href: 'about.html', label: '關於與授權' }
  ];

  function buildNav() {
    var host = $('#nav');
    if (!host) return;
    var page = (document.body.getAttribute('data-page') || '').split('.')[0];
    var head = el('div', 'wrap');
    var brand = el('a', 'brand');
    brand.href = 'index.html';
    brand.appendChild(document.createTextNode('聲律發蒙'));
    brand.appendChild(el('small', null, '粵　語　讀　經　典'));
    head.appendChild(brand);
    var nav = el('nav', 'main');
    nav.setAttribute('aria-label', '主導覽');
    NAV.forEach(function (it) {
      var a = el('a', null, it.label);
      a.href = it.href;
      if (it.href.split('.')[0] === page) a.setAttribute('aria-current', 'page');
      nav.appendChild(a);
    });
    head.appendChild(nav);
    host.appendChild(head);
  }

  function buildFooter() {
    var host = $('#foot');
    if (!host) return;
    var c = el('div', 'wrap');
    var cols = el('div', 'cols');
    function col(title, lines) {
      var d = el('div');
      d.appendChild(el('b', null, title));
      lines.forEach(function (t) {
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
    col('本站', [{ text: '《聲律發蒙》全本 ' + (M.rhymeCount || 0) + ' 韻·粵語導讀與反切對帳' },
                 { text: '維護者　課孫翁' },
                 { text: 'v' + (M.version || '1.0.0'), cls: 'muted' }]);
    col('文本來源', [{ text: M.source || '' }, { text: '正文屬公有領域', cls: 'muted' }]);
    col('粵拼與語音', [{ text: M.jyutpingSource || '' },
                       { text: M.ttsSource || '', cls: 'muted' },
                       { text: '授權說明見「關於與授權」', cls: 'muted' }]);
    col('相關', [{ text: '解決問題訓練站 →', href: 'https://solve-lab.cn/' },
                 { text: '同為「以訓練取代閱讀」的嘗試', cls: 'muted' }]);
    c.appendChild(cols);
    host.appendChild(c);
  }

  function fillMeta() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-m]'), function (n) {
      var v = M[n.getAttribute('data-m')];
      if (v === undefined || v === null) return;
      var fmt = n.getAttribute('data-fmt') || '';
      if (fmt === 'pct') n.textContent = pct(v);
      else if (fmt === 'share' || fmt === 'ruShare') n.textContent = pct(100 * v / (M.needChars || 1));
      else if (fmt === 'list') n.textContent = Array.isArray(v) ? (v.join('、') || '無') : String(v);
      else n.textContent = String(v);
    });
  }

  /* ------------------------------------------------------------- 首頁 */
  function renderHome() {
    var s = $('#stats');
    if (s) {
      [[M.volumeCount, '卷'], [M.rhymeCount, '韻部'], [M.lineCount, '行對句'],
       [M.fanqieCount, '條反切'], [M.needChars, '字標注粵拼'], [M.audioCount, '句粵語音頻']
      ].forEach(function (p) {
        var d = el('div', 'stat');
        d.appendChild(el('div', 'n', String(p[0])));
        d.appendChild(el('div', 'l', p[1]));
        s.appendChild(d);
      });
    }
    var demo = $('#demo');
    if (demo && D.volumes.length) {
      demo.appendChild(el('p', 'muted', '正在載入示範…'));
      loadVolume('v5', function () {
        clear(demo);
        var V = window.SHENGLV_VOL5;
        demo.appendChild(legend());
        demo.appendChild(renderStanza(V.rhymes[0].chapters[0], 'v5'));
      });
    }
    var links = $('#links');
    if (links) {
      [['quanben.html', '讀全本 106 韻', '五卷 ' + (M.rhymeCount || 0) + ' 韻，逐字粵拼，逐句粵語朗讀'],
       ['duizhang.html', '反切對帳', '中古反切與粵語讀音逐條核對，失配即待查清單'],
       ['about.html', '關於與授權', '文本來源、粵拼與語音授權、方法與已知限制']
      ].forEach(function (p) {
        var a = el('a', 'card card-link');
        a.href = p[0];
        a.appendChild(el('div', 't', p[1]));
        a.appendChild(el('div', 'd', p[2]));
        links.appendChild(a);
      });
    }
  }

  /* -------------------------------------------------------- 全本 106 韻 */
  var curVol = null, curRhyme = null, volCache = {};

  function loadVolume(vid, cb) {
    if (volCache[vid]) { cb(); return; }
    var s = document.createElement('script');
    // 檔名為 vol1.js..vol5.js（vid 形如 v1），變數為 SHENGLV_VOL1..5
    s.src = 'assets/vol' + vid.slice(1) + '.js';
    s.onload = function () { volCache[vid] = true; cb(); };
    s.onerror = function () {
      var h = $('#rhymeBody');
      if (h) { clear(h); h.appendChild(el('p', 'muted', '載入 ' + vid + ' 失敗，請重新整理。')); }
    };
    document.body.appendChild(s);
  }

  function renderQuanben() {
    var tabs = $('#volTabs'), nav = $('#rhymeNav'), host = $('#rhymeBody');
    if (!tabs || !nav || !host) return;
    var first = window.location.hash ? window.location.hash.slice(1) : null;

    (D.volumes || []).forEach(function (v, i) {
      var b = el('button', null, v.label);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(tabs.children, function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        selectVolume(v.id);
      });
      tabs.appendChild(b);
      if ((first && first.indexOf(v.id) === 0) || (!first && i === 0)) {
        b.setAttribute('aria-pressed', 'true');
        setTimeout(function () { selectVolume(v.id); }, 0);
      }
    });
  }

  function selectVolume(vid) {
    var nav = $('#rhymeNav'), host = $('#rhymeBody');
    clear(nav); clear(host);
    host.appendChild(el('p', 'muted', '載入中…'));
    loadVolume(vid, function () {
      var V = window['SHENGLV_VOL' + vid.slice(1)];
      curVol = vid;
      clear(nav); clear(host);
      V.rhymes.forEach(function (r, i) {
        var b = el('button', null, r.name);
        b.type = 'button';
        b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', function () {
          Array.prototype.forEach.call(nav.children, function (x) { x.setAttribute('aria-pressed', 'false'); });
          b.setAttribute('aria-pressed', 'true');
          stopPlay();
          renderRhymeBody(host, r, vid);
        });
        nav.appendChild(b);
        if (i === 0) {
          b.setAttribute('aria-pressed', 'true');
          renderRhymeBody(host, r, vid);
        }
      });
    });
  }

  function renderRhymeBody(host, r, vid) {
    clear(host);

    var zc = {};
    r.fanqie.forEach(function (f) { cjkChars(f.t).forEach(function (c) { zc[c] = 1; }); });
    r.yin.forEach(function (y) { cjkChars(y.t).forEach(function (c) { zc[c] = 1; }); });
    var zlist = Object.keys(zc);
    var ru = zlist.filter(function (c) { return (CH[c] || {}).ru; }).length;
    var pend = zlist.filter(function (c) { return (CH[c] || {}).x; }).length;

    var h = el('h2', null, r.name);
    h.id = 'rhyme-' + r.name;
    host.appendChild(h);
    host.appendChild(el('p', 'muted',
      '字譜 ' + zlist.length + ' 字，其中 ' + ru + ' 字粵語以 -p/-t/-k 收尾'
      + (zlist.length ? '（' + pct(100 * ru / zlist.length) + '）' : '')
      + (pend ? '；' + pend + ' 字為字典未收之罕用字，標為待考' : '')
      + '。字後「?」為多音字，游標停留可看全部讀音與選音依據。'));

    var zu = el('div', 'card zupu');
    zu.appendChild(el('h3', null, '本韻字譜（依反切）'));
    r.fanqie.forEach(function (f) {
      var row = el('div', 'row');
      row.appendChild(el('div', 'qie', f.qie + '切'));
      row.appendChild(charList(f.t));
      zu.appendChild(row);
    });
    r.yin.forEach(function (y) {
      var row = el('div', 'row');
      row.appendChild(el('div', 'qie', '音注' + y.pin));
      row.appendChild(charList(y.t));
      zu.appendChild(row);
    });
    host.appendChild(zu);

    host.appendChild(legend());
    r.chapters.forEach(function (ch) { host.appendChild(renderStanza(ch, vid)); });
  }

  function charList(text) {
    var cs = el('div', 'cs');
    cjkChars(text).forEach(function (c) {
      var info = CH[c] || {};
      var z = el('span', 'zc' + (info.ru ? ' ru' : '') + (info.m ? ' multi' : '')
        + (info.x ? ' pending' : ''));
      z.appendChild(el('span', 'c', c));
      z.appendChild(el('span', 'r', info.x ? '待考' : (info.r || '—')));
      var tip = [c, info.x ? '待考：字典未收之罕用字' : '粵拼 ' + (info.r || '—')];
      if (info.m) tip.push('多音字，已選：' + info.r + '（' + (info.b || '') + '）',
                           '全部讀音：' + (info.a || []).join('、'));
      z.setAttribute('title', tip.join('\n'));
      cs.appendChild(z);
    });
    return cs;
  }

  /* --------------------------------------------------------- 反切對帳 */
  var dzFilter = 'all', dzLoaded = false, dzLimit = 400;

  function renderDuizhang() {
    var host = $('#dzBody');
    if (!host) return;
    var s = $('#dzStats');
    if (s) {
      [[M.fanqieCount, '條反切'], [pct(M.dzFullRate), '聲母＋韻母吻合'],
       [pct(M.dzFinalRate), '韻母吻合'], [pct(M.dzToneRate), '四聲類別吻合']
      ].forEach(function (p) {
        var d = el('div', 'stat');
        d.appendChild(el('div', 'n', String(p[0])));
        d.appendChild(el('div', 'l', p[1]));
        s.appendChild(d);
      });
    }
    var filters = $('#dzFilters');
    if (filters) {
      [['all', '全部'], ['final', '只看韻母不吻合'], ['tone', '只看四聲不吻合']]
        .forEach(function (p) {
          var lab = el('label');
          var inp = el('input');
          inp.type = 'radio'; inp.name = 'dzf'; inp.value = p[0];
          if (p[0] === 'all') inp.checked = true;
          inp.addEventListener('change', function () { dzFilter = p[0]; drawTable(host); });
          lab.appendChild(inp);
          lab.appendChild(document.createTextNode(p[1]));
          filters.appendChild(lab);
        });
    }
    host.appendChild(el('p', 'muted', '載入對帳資料…'));
    if (!dzLoaded) {
      var sc = document.createElement('script');
      sc.src = 'assets/duizhang.js';
      sc.onload = function () { dzLoaded = true; clear(host); drawTable(host); };
      sc.onerror = function () { clear(host); host.appendChild(el('p', 'muted', '載入失敗。')); };
      document.body.appendChild(sc);
    } else { clear(host); drawTable(host); }
  }

  function drawTable(host) {
    clear(host);
    var DZ = window.SHENGLV_DZ || [];

    // 先篩選再渲染：全表近八千列，一次插入十萬個節點會讓瀏覽器明顯卡頓
    var matched = [];
    DZ.forEach(function (f) {
      f[7].forEach(function (row) {
        if (dzFilter === 'final' && row[3]) return;
        if (dzFilter === 'tone' && row[4]) return;
        matched.push([f, row]);
      });
    });

    var slice = matched.slice(0, dzLimit);
    var wrap = el('div', 'tablewrap');
    var t = el('table');
    var thead = el('thead'), hr = el('tr');
    ['卷', '韻部', '反切', '上字', '下字', '期望韻母', '期望四聲', '字', '粵拼',
     '聲母＋韻母', '韻母', '四聲'].forEach(function (x) { hr.appendChild(el('th', null, x)); });
    thead.appendChild(hr); t.appendChild(thead);

    var tb = el('tbody');
    slice.forEach(function (pair) {
      var f = pair[0], row = pair[1];
      var okFull = row[2], okFinal = row[3], okCls = row[4];
      var tr = el('tr');
      tr.appendChild(el('td', null, f[0]));
      tr.appendChild(el('td', null, f[1]));
      tr.appendChild(el('td', null, f[2] + '切'));
      tr.appendChild(el('td', null, f[3]));
      tr.appendChild(el('td', null, f[4]));
      tr.appendChild(el('td', 'r', f[5]));
      tr.appendChild(el('td', null, f[6]));
      tr.appendChild(el('td', null, row[0]));
      tr.appendChild(el('td', 'r', row[1] || '待考'));
      [okFull, okFinal, okCls].forEach(function (v) {
        tr.appendChild(el('td', v === null ? '' : (v ? 'ok' : 'no'),
                           v === null ? '—' : (v ? '✓' : '✗')));
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t);

    host.appendChild(el('p', 'muted', '顯示 ' + slice.length + ' / ' + matched.length
      + ' 筆（全表 ' + DZ.length + ' 條反切）。上字取聲母、下字取韻母與聲調；'
      + '上下字本身多音時按讀音集合匹配，故單項吻合不代表全字無疑。'));
    host.appendChild(wrap);

    if (matched.length > slice.length) {
      var b = el('button', 'cbtn', '載入更多（還有 ' + (matched.length - slice.length) + ' 筆）');
      b.type = 'button';
      b.style.margin = '.7rem 0';
      b.addEventListener('click', function () {
        dzLimit += 400;
        drawTable(host);
      });
      host.appendChild(b);
    }
  }

  /* ------------------------------------------------------------- 關於 */
  function renderAbout() {
    var v = $('#variants');
    if (v) {
      (M.variantChars || []).forEach(function (c) {
        var info = CH[c] || {};
        v.appendChild(el('span', 'chip' + (info.x ? '' : ' ru'),
                         c + (info.r ? ' ' + info.r : ' 待考')));
      });
    }
    var ms = $('#aboutStats');
    if (ms) {
      [[M.needChars, '需標音字'], [M.multiChars, '多音字'],
       [pct(100 * (M.multiChars || 0) / (M.needChars || 1)), '多音字佔比'],
       [M.audioCount, '句音頻'], [M.pendingChars, '待考字']
      ].forEach(function (p) {
        var d = el('div', 'stat');
        d.appendChild(el('div', 'n', String(p[0])));
        d.appendChild(el('div', 'l', p[1]));
        ms.appendChild(d);
      });
    }
  }

  /* -------------------------------------------------------------- 啟動 */
  document.addEventListener('DOMContentLoaded', function () {
    buildNav();
    buildFooter();
    fillMeta();
    var page = (document.body.getAttribute('data-page') || '').split('.')[0];
    if (page === 'index') renderHome();
    else if (page === 'quanben') renderQuanben();
    else if (page === 'duizhang') renderDuizhang();
    else if (page === 'about') renderAbout();
  });
})();
