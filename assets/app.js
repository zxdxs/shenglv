/* 中文聲韻 —— 前端（全本 106 韻 · 中文聲韻歸集與多方言聲音證據）
   無框架、無後端、無追蹤。
   資料來源：assets/data.js（索引）、assets/chars.js（逐字粵拼）、
            assets/vol1..5.js（分卷內容，按需載入）、assets/duizhang.js（對帳表）、
            assets/registry.js（分工表：篇目主表＋認領/收錄登記）
*/

(function () {
  'use strict';

  var D = window.SHENGLV || { meta: {}, index: [], volumes: [] };
  var M = D.meta || {};
  var CH = window.SHENGLV_CHARS || {};

  /* ------------------------------------------------------------- 備案資訊
     ICP 備案號：本站（中文聲韻）為 蜀ICP备2026055920号-2；同一主體下的
     「解決問題訓練站」（solve-lab.cn）為 蜀ICP备2026055920号-1。
     留空 ⇒ 整段不輸出，頁面外觀完全不變。

     為什麼放在 app.js 而不放 data.js：data.js 是 build_shenglv.py 全量產生的
     （首行就寫「自動產生，勿手改」），手改會被下次建置覆蓋；app.js 才是手寫維護層。

     工信部要求備案號必須顯示在網站底部，並連結 https://beian.miit.gov.cn/ ——
     這是法律責任，不是裝飾。 */
  var BEIAN = '蜀ICP备2026055920号-2';
  var BEIAN_URL = 'https://beian.miit.gov.cn/';

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

  function renderStanza(ch, vid, seq) {
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
    if (seq) {
      var cs = claimsForSeq(seq);
      if (cs.length) {
        var vw = el('div', 'claim-list');
        vw.appendChild(el('span', 'muted', '吟誦版本：'));
        cs.forEach(function (c) { vw.appendChild(versionChip(c)); });
        box.appendChild(vw);
      }
    }
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
  /* 導航六項平鋪（不再分組；歸集與示例的層級關係由頁面內容表達） */
  var NAV = [
    { href: 'index.html', label: '首頁' },
    { href: 'weihe.html', label: '底本' },
    { href: 'fengong.html', label: '歸集進度' },
    { href: 'duizhang.html', label: '反切對帳' },
    { href: 'canyu.html', label: '共建與貢獻墻' },
    { href: 'quanben.html', label: '方言', children: [
      { label: '普通話', href: 'fangyan/?fam=cmn', on: true },
      { label: '粵語', href: 'quanben.html', on: true },
      { label: '西南官話', href: 'fangyan/?fam=sichuan', on: true },
      { label: '吳語', href: 'fangyan/?fam=wu', on: true },
      { label: '客家話', href: 'wip.html' },
      { label: '閩語', href: 'fangyan/?fam=min', on: true },
      { label: '＋ 添加', href: 'tigong.html', add: true }
    ]}
  ];

  function buildNav() {
    var host = $('#nav');
    if (!host) return;
    var page = (document.body.getAttribute('data-page') || '').split('.')[0];
    var head = el('div', 'wrap');
    var brand = el('a', 'brand');
    brand.href = 'index.html';
    brand.appendChild(document.createTextNode('中文聲韻'));
    brand.appendChild(el('small', null, '集各地各派吟誦，傳中文千古聲韻'));
    head.appendChild(brand);
    var nav = el('nav', 'main');
    nav.setAttribute('aria-label', '主導覽');
    var g = el('div', 'ng');
    NAV.forEach(function (it) {
      if (it.children) {
        var det = el('details', 'nav-dia');
        det.appendChild(el('summary', null, it.label));
        var menu = el('div', 'dia-menu');
        it.children.forEach(function (c) {
          if (c.add) {
            menu.appendChild(el('span', 'dia-div'));
            var b = el('a', 'dia-chip add', c.label);
            b.href = c.href;
            menu.appendChild(b);
          } else if (c.href) {
            var a = el('a', 'dia-chip' + (c.on ? ' on' : ' off'), c.label);
            a.href = c.href;
            if (!c.on) a.setAttribute('title', '建設中——點擊查看並留言');
            menu.appendChild(a);
          } else {
            var sp = el('span', 'dia-chip off', c.label);
            sp.setAttribute('title', '歸集框架下的待落地方言');
            menu.appendChild(sp);
          }
        });
        det.appendChild(menu);
        g.appendChild(det);
      } else {
        var a = el('a', null, it.label);
        a.href = it.href;
        if (it.href.split('.')[0] === page) a.setAttribute('aria-current', 'page');
        g.appendChild(a);
      }
    });
    nav.appendChild(g);
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
    col('本站', [{ text: '《聲律發蒙》全本 ' + (M.rhymeCount || 0) + ' 韻·中文聲韻歸集與反切對帳' },
                 { text: '維護者　課孫翁' },
                 { text: '關於與授權 →', href: 'about.html' },
                 { text: 'v' + (M.version || '1.0.0'), cls: 'muted' }]);
    col('文本來源', [{ text: M.source || '' }, { text: '正文屬公有領域', cls: 'muted' }]);
    col('粵拼與語音', [{ text: M.jyutpingSource || '' },
                       { text: M.ttsSource || '', cls: 'muted' },
                       { text: '授權說明見「關於與授權」', cls: 'muted' }]);
    col('相關', [{ text: '解決問題訓練站 →', href: 'https://solve-lab.cn/' },
                 { text: '同為「以訓練取代閱讀」的嘗試', cls: 'muted' }]);
    c.appendChild(cols);
    /* ICP 備案號：BEIAN 留空時整段不輸出（見檔頭「備案資訊」說明） */
    if (BEIAN) {
      var b = el('div', 'muted');
      b.style.marginTop = '12px';
      b.appendChild(document.createTextNode('ICP 備案：'));
      var ba = el('a', null, BEIAN);
      ba.href = BEIAN_URL;
      ba.target = '_blank';
      ba.rel = 'noopener';
      b.appendChild(ba);
      c.appendChild(b);
    }
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
       [M.fanqieCount, '條反切'], [M.needChars, '字標注粵拼'], [M.audioCount, '句粵語示範音頻']
      ].forEach(function (p) {
        var d = el('div', 'stat');
        d.appendChild(el('div', 'n', String(p[0])));
        d.appendChild(el('div', 'l', p[1]));
        s.appendChild(d);
      });
      if (REG && REG.meta) {
        var d1 = el('div', 'stat');
        d1.appendChild(el('div', 'n', String(REG.meta.nRecorded)));
        d1.appendChild(el('div', 'l', '段真人吟誦已收錄'));
        s.appendChild(d1);
        var d2 = el('div', 'stat');
        d2.appendChild(el('div', 'n', String(REG.meta.nPoems)));
        d2.appendChild(el('div', 'l', '首 篇目'));
        s.appendChild(d2);
      }
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
      [
        ['歸集', [['weihe.html', '底本', '譜系、全韻骨架、歸集什麼、研究什麼——先讀這一頁'],
                  ['fengong.html', '歸集進度', '376 首分工表：篇目／方言雙視圖，以學會認領、逾期釋放——空行就是推動力'],
                  ['duizhang.html', '反切對帳', '中古反切與粵語讀音逐條核對，失配即待查清單'],
                  ['canyu.html', '共建與貢獻墻', '提供錄音 · 提供文本 · 糾錯 · 榮譽，每一份採納都掛上墻']]],
        ['示例', [['quanben.html', '粵語卷 · 全本 106 韻', '五卷 ' + (M.rhymeCount || 0) + ' 韻逐字粵拼，反切入聲歸集，吟誦證據並排聽'],
                  ['jyutping.html', '粵拼入門', '九聲六調與粵拼方案，粵語卷的配套教程']]]
      ].forEach(function (grp) {
        links.appendChild(el('h3', null, grp[0]));
        grp[1].forEach(function (p) {
          var a = el('a', 'card card-link');
          a.href = p[0];
          a.appendChild(el('div', 't', p[1]));
          a.appendChild(el('div', 'd', p[2]));
          links.appendChild(a);
        });
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
    var hashVol = null, hashRhyme = null;
    if (first) {
      var hp = first.split('-');
      hashVol = hp[0] || null;
      hashRhyme = hp[1] ? decodeURIComponent(hp[1]) : null;
    }

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
      if ((first && hashVol === v.id) || (!first && i === 0)) {
        b.setAttribute('aria-pressed', 'true');
        setTimeout(function () { selectVolume(v.id, hashRhyme); }, 0);
      }
    });
  }

  function selectVolume(vid, rhymeName) {
    var nav = $('#rhymeNav'), host = $('#rhymeBody');
    clear(nav); clear(host);
    host.appendChild(el('p', 'muted', '載入中…'));
    loadVolume(vid, function () {
      var V = window['SHENGLV_VOL' + vid.slice(1)];
      curVol = vid;
      clear(nav); clear(host);
      var target = -1;
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
        if (rhymeName && r.name === rhymeName) target = i;
      });
      var idx = target >= 0 ? target : 0;
      nav.children[idx].setAttribute('aria-pressed', 'true');
      renderRhymeBody(host, V.rhymes[idx], vid);
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
    renderRhymeVersions(host, r, vid);
    var map = buildSeqMap();
    r.chapters.forEach(function (ch, i) {
      host.appendChild(renderStanza(ch, vid, map[vid + ':' + r.name + ':' + i]));
    });
  }

  /* 本韻的真人吟誦版本總表（並排聽；元數據即價值） */
  function renderRhymeVersions(host, r, vid) {
    var map = buildSeqMap();
    var rows = [];
    r.chapters.forEach(function (ch, i) {
      var seq = map[vid + ':' + r.name + ':' + i];
      claimsForSeq(seq).forEach(function (c) { rows.push([ch.title, c]); });
    });
    if (!rows.length) return;
    var card = el('div', 'card');
    card.appendChild(el('h3', null, '真人吟誦版本（' + rows.length + ' 段）'));
    var dl = el('div', 'claim-list');
    rows.forEach(function (t) {
      var c = t[1];
      var row = el('div', 'claim-row' + (claimState(c) === 'overdue' ? ' overdue' : ''));
      var meta = el('span', 'meta');
      meta.appendChild(el('span', 'who', t[0] + '　' + claimDialectLabel(c)));
      meta.appendChild(el('span', 'dim', (c.singer || '佚名') + (c.lineage ? '（' + c.lineage + '）' : '')
        + (c.society ? '　認領：' + c.society : '')));
      stateBadges(c).forEach(function (b) { meta.appendChild(b); });
      row.appendChild(meta);
      if (c.audio) {
        var au = document.createElement('audio');
        au.controls = true; au.preload = 'none'; au.src = c.audio;
        row.appendChild(au);
      }
      dl.appendChild(row);
    });
    card.appendChild(dl);
    host.appendChild(card);
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

  /* --------------------------------------------- 粵拼入門：單音點讀
     凡標了 data-r（粵拼讀音）的元素都可點，播放 audio/jyutping/<讀音>.mp3。
     音檔以「讀音」為檔名 ⇒ 同音的例字共用同一個檔，不重複合成，也不會各唸各的。
     播放器刻意與全本的 AU 分開，兩者不會互相打斷。 */
  var AU_JP = null, JP_NOW = null;

  function stopJp() {
    if (JP_NOW) JP_NOW.classList.remove('playing');
    JP_NOW = null;
  }

  function playJp(node) {
    /* data-src 優先：給「一句話」型示範用，直接指向既有音檔
       （例如「南對北」＝ audio/v1/0001.mp3，那本來就是全本第一句，不必重做）。
       其餘一律用 data-r 組出 audio/jyutping/<讀音>.mp3。 */
    var src = node.getAttribute('data-src');
    var r = node.getAttribute('data-r');
    if (!src && !r) return;
    if (!AU_JP) {
      AU_JP = document.createElement('audio');
      AU_JP.preload = 'none';
      AU_JP.addEventListener('ended', stopJp);
      AU_JP.addEventListener('error', stopJp);
    }
    if (JP_NOW && JP_NOW !== node) JP_NOW.classList.remove('playing');
    JP_NOW = node;
    node.classList.add('playing');
    AU_JP.src = src || ('audio/jyutping/' + r + '.mp3');
    try {
      var p = AU_JP.play();
      if (p && p.catch) p.catch(function () { stopJp(); });
    } catch (e) { stopJp(); }
  }

  function renderJyutping() {
    /* 一定要同時選 data-src：只選 [data-r] 會讓「南對北」那種指向既有音檔的
       示範沒有綁到 click，點了完全沒反應（實測踩過）。 */
    var nodes = document.querySelectorAll('[data-r], [data-src]');
    if (!nodes.length) return;          /* 不在這一頁就什麼都不做 */
    var seen = {};
    Array.prototype.forEach.call(nodes, function (n) {
      var r = n.getAttribute('data-r');
      if (r) seen[r] = 1;
      n.setAttribute('title', '點一下聽發音');
      n.addEventListener('click', function () { playJp(n); });
    });
    /* 頁首的自述數字由實際標記數算出來，不寫死（改頁面時不會對不上） */
    var c = document.querySelectorAll('[data-jpcount]');
    var nSyl = Object.keys(seen).length;
    Array.prototype.forEach.call(c, function (el2) {
      el2.textContent = nodes.length + ' 處（' + nSyl + ' 個不同音節）';
    });
  }

  /* ------------------------------------------------- 分工表（registry）
     資料來源 assets/registry.js（build_registry.py 產生）：
       poems[]   篇目主表（376 首，坐標＋首句，只讀）
       claims[]  認領／收錄登記（一首 × 一方言版本）
       dialects[] 受控詞表（區 → 片）
     狀態機：待認領 → 已認領（帶期限）→ 已收錄（帶審核）；已認領逾期限 → 已逾期。
     逾期由前端即時計算（認領日期＋期限都在資料裡，不靠後端、不靠建置）。 */
  var REG = window.SHENGLV_REGISTRY || null;

  function regPoems() { return REG ? REG.poems : []; }
  function regClaims() { return REG ? REG.claims : []; }
  function regDialects() { return REG ? REG.dialects : []; }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
           '-' + String(d.getDate()).padStart(2, '0');
  }

  /* 認領狀態：open（無登記）／claimed／overdue／recorded */
  function claimState(c) {
    if (!c) return 'open';
    if (c.status === 'recorded') return 'recorded';
    if (c.status === 'claimed' && c.deadline && c.deadline < todayStr()) return 'overdue';
    return 'claimed';
  }

  function dialectById(id) {
    var ds = regDialects();
    for (var i = 0; i < ds.length; i++) if (ds[i].id === id) return ds[i];
    return null;
  }

  /* 「吳語·甌江片·瑞安」 */
  function claimDialectLabel(c) {
    var d = dialectById(c.dialect.d), pian = '';
    if (d) {
      for (var i = 0; i < d.pian.length; i++) if (d.pian[i].id === c.dialect.pian) pian = d.pian[i].name;
    }
    return (d ? d.name : c.dialect.d) + '·' + (pian || c.dialect.pian) + '·' + c.dialect.dian;
  }

  /* 狀態徽章（已收錄者附審核徽章：已核／待核） */
  function stateBadges(c) {
    var st = claimState(c), out = [];
    if (st === 'open') out.push(el('span', 'badge open', '待認領'));
    else if (st === 'claimed') out.push(el('span', 'badge claimed', '已認領'));
    else if (st === 'overdue') out.push(el('span', 'badge overdue', '已逾期'));
    else if (st === 'recorded') {
      out.push(el('span', 'badge recorded', '已收錄'));
      out.push(el('span', 'badge ' + (c.audit === 'verified' ? 'verified' : 'pending'),
                  c.audit === 'verified' ? '已核' : '待核'));
    }
    return out;
  }

  function claimsForSeq(seq) {
    return regClaims().filter(function (c) { return c.seq === seq; });
  }

  /* 篇目主表座標 → 序號：key「卷:韻:章序」→ seq（與 vol js 章節順序一致） */
  var seqMap = null;
  function buildSeqMap() {
    if (seqMap) return seqMap;
    seqMap = {};
    var poems = regPoems();
    if (!poems.length) return seqMap;
    var pi = 0;
    (D.index || []).forEach(function (it) {
      for (var c = 0; c < it.nChapter; c++) {
        var p = poems[pi];
        if (p && p.volId === it.v && p.rhyme === it.name) seqMap[it.v + ':' + it.name + ':' + c] = p.seq;
        pi++;
      }
    });
    return seqMap;
  }

  /* 整首吟誦播放（真人版本；與逐行 TTS 播放器共用 AU） */
  function playWhole(src, node) {
    var a = audio();
    if (nowPlaying === node && a && !a.paused) { stopPlay(); return; }
    stopPlay();
    a.src = src;
    a.play().catch(function () { /* 使用者手勢或檔案缺失，靜默 */ });
    markPlaying(node || null);
  }

  function versionChip(c) {
    var chip = el('span', 'vchip');
    var p = el('button', 'vplay', '▶');
    p.type = 'button';
    p.setAttribute('aria-label', '播放 ' + claimDialectLabel(c) + ' 整首吟誦');
    p.addEventListener('click', function () { if (c.audio) playWhole(c.audio, chip); });
    chip.appendChild(p);
    chip.appendChild(document.createTextNode(claimDialectLabel(c) + ' · ' + (c.singer || '佚名')));
    return chip;
  }

  /* ------------------------------------------------ 分工表頁（fengong） */
  var fgVol = 'all', fgRhyme = 'all', fgDialect = 'all', fgState = 'all';

  function rhymeNamesFor(vol) {
    var seen = [], out = [];
    regPoems().forEach(function (p) {
      if (vol !== 'all' && p.volId !== vol) return;
      if (seen.indexOf(p.rhyme) < 0) { seen.push(p.rhyme); out.push(p.rhyme); }
    });
    return out;
  }

  function fillRhymeSelect(sel) {
    clear(sel);
    var o = el('option', null, '全部韻部');
    o.value = 'all'; sel.appendChild(o);
    rhymeNamesFor(fgVol).forEach(function (rn) {
      var op = el('option', null, rn);
      op.value = rn;
      if (rn === fgRhyme) op.selected = true;
      sel.appendChild(op);
    });
    if (fgRhyme !== 'all' && rhymeNamesFor(fgVol).indexOf(fgRhyme) < 0) fgRhyme = 'all';
  }

  function renderFengong() {
    var stats = $('#fgStats'), filters = $('#fgFilters'), host = $('#fgBody');
    if (!stats || !filters || !host) return;
    /* 篇目／方言 雙視圖（方言視圖始終渲染，hidden 僅控制顯示） */
    var bList = $('#fgViewListBtn'), bDia = $('#fgViewDiaBtn');
    function showDia(show) {
      var l = $('#fgViewList'), d = $('#fgViewDia');
      if (!l || !d) return;
      l.hidden = show; d.hidden = !show;
      if (bList) bList.setAttribute('aria-pressed', String(!show));
      if (bDia) bDia.setAttribute('aria-pressed', String(show));
    }
    if (bList) bList.addEventListener('click', function () { showDia(false); });
    if (bDia) bDia.addEventListener('click', function () { showDia(true); });
    renderFangyan();
    if (window.location.hash === '#fy') showDia(true);
    else showDia(false);
    var poems = regPoems(), claims = regClaims();
    var st = { recorded: 0, claimed: 0, overdue: 0 };
    claims.forEach(function (c) {
      var s = claimState(c);
      if (s === 'recorded') st.recorded++;
      else if (s === 'overdue') st.overdue++;
      else if (s === 'claimed') st.claimed++;
    });
    [[poems.length, '篇目（首）'], [REG.meta.nRhymes, '韻部'],
     [REG.meta.nDialects, '方言區'], [st.recorded, '已收錄版本'],
     [st.claimed, '已認領'], [st.overdue, '已逾期']
    ].forEach(function (p) {
      var d = el('div', 'stat');
      d.appendChild(el('div', 'n', String(p[0])));
      d.appendChild(el('div', 'l', p[1]));
      stats.appendChild(d);
    });

    var volSel = el('select'), rhymeSel = el('select'), diaSel = el('select'), stSel = el('select');
    var o = el('option', null, '全部卷'); o.value = 'all'; volSel.appendChild(o);
    (D.volumes || []).forEach(function (v) {
      var op = el('option', null, v.label);
      op.value = v.id; volSel.appendChild(op);
    });
    fillRhymeSelect(rhymeSel);
    var o2 = el('option', null, '全部方言'); o2.value = 'all'; diaSel.appendChild(o2);
    regDialects().forEach(function (d) {
      var op = el('option', null, d.name);
      op.value = d.name; diaSel.appendChild(op);
    });
    [['all', '全部狀態'], ['open', '待認領'], ['claimed', '已認領'],
     ['overdue', '已逾期'], ['recorded', '已收錄']].forEach(function (p) {
      var op = el('option', null, p[1]);
      op.value = p[0]; stSel.appendChild(op);
    });

    volSel.addEventListener('change', function () {
      fgVol = volSel.value; fgRhyme = 'all';
      fillRhymeSelect(rhymeSel);
      drawFengong(host);
    });
    rhymeSel.addEventListener('change', function () { fgRhyme = rhymeSel.value; drawFengong(host); });
    diaSel.addEventListener('change', function () { fgDialect = diaSel.value; drawFengong(host); });
    stSel.addEventListener('change', function () { fgState = stSel.value; drawFengong(host); });

    var bar = el('div', 'toolbar');
    bar.appendChild(el('label', null, '卷　')).appendChild(volSel);
    bar.appendChild(el('label', null, '韻　')).appendChild(rhymeSel);
    bar.appendChild(el('label', null, '方言')).appendChild(diaSel);
    bar.appendChild(el('label', null, '狀態')).appendChild(stSel);
    filters.appendChild(bar);

    drawFengong(host);
  }

  function drawFengong(host) {
    clear(host);
    var poems = regPoems(), claims = regClaims();
    var map = {};
    claims.forEach(function (c) { (map[c.seq] = map[c.seq] || []).push(c); });

    var rows = poems.filter(function (p) {
      if (fgVol !== 'all' && p.volId !== fgVol) return false;
      if (fgRhyme !== 'all' && p.rhyme !== fgRhyme) return false;
      var cs = map[p.seq] || [];
      if (fgDialect !== 'all' && !cs.some(function (c) {
        var d = dialectById(c.dialect.d); return d && d.name === fgDialect;
      })) return false;
      if (fgState !== 'all') {
        var states = cs.map(claimState);
        if (fgState === 'open' && cs.length) return false;
        if (fgState !== 'open' && states.indexOf(fgState) < 0) return false;
      }
      return true;
    });

    var wrap = el('div', 'tablewrap');
    var t = el('table', 'fg');
    var thead = el('thead'), hr = el('tr');
    ['序號', '卷次', '韻部', '章', '首句', '版本（方言點·吟誦者·師承）', '認領狀態'].forEach(function (x) {
      hr.appendChild(el('th', null, x));
    });
    thead.appendChild(hr); t.appendChild(thead);

    var tb = el('tbody');
    rows.forEach(function (p) {
      var cs = map[p.seq] || [];
      var tr = el('tr');
      if (!cs.length) tr.classList.add('blank');
      tr.appendChild(el('td', 'seq', String(p.seq).padStart(3, '0')));
      tr.appendChild(el('td', null, p.vol.split('·')[0]));
      tr.appendChild(el('td', null, p.rhyme));
      tr.appendChild(el('td', null, p.chapter));
      tr.appendChild(el('td', 'first', p.first));
      var vtd = el('td');
      if (!cs.length) vtd.appendChild(el('span', 'muted', '—'));
      else cs.forEach(function (c) {
        var line = el('div');
        line.appendChild(el('span', null, claimDialectLabel(c) + '　' + (c.singer || '佚名')
          + (c.lineage ? '（' + c.lineage + '）' : '') + (c.society ? '　' + c.society : '')));
        line.appendChild(el('a', 'muted', '去聽 →'));
        line.lastChild.href = 'quanben.html#' + p.volId + '-' + encodeURIComponent(p.rhyme);
        vtd.appendChild(line);
      });
      tr.appendChild(vtd);
      var std = el('td');
      if (!cs.length) std.appendChild(el('span', 'badge open', '待認領'));
      else cs.forEach(function (c) { stateBadges(c).forEach(function (b) { std.appendChild(b); }); });
      tr.appendChild(std);
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t);

    host.appendChild(el('p', 'muted', '顯示 ' + rows.length + ' / ' + poems.length + ' 首。'
      + '空行即「待認領」——公開的空格，就是推動力。'));
    host.appendChild(wrap);
  }

  /* --------------------------------------------------- 方言進度頁（fangyan） */
  function renderFangyan() {
    var tabs = $('#fyTabs'), stats = $('#fyStats'), grid = $('#fyGrid'), list = $('#fyList');
    if (!tabs || !stats || !grid || !list) return;
    var ds = regDialects();
    if (!ds.length) { tabs.appendChild(el('p', 'muted', '方言詞表尚未建立。')); return; }
    ds.forEach(function (d, i) {
      var b = el('button', null, d.name);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        ds.forEach(function (_, j) { tabs.children[j].setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        drawFangyan(d.id, stats, grid, list);
      });
      tabs.appendChild(b);
      if (i === 0) {
        b.setAttribute('aria-pressed', 'true');
        setTimeout(function () { drawFangyan(d.id, stats, grid, list); }, 0);
      }
    });
  }

  function drawFangyan(did, stats, grid, list) {
    clear(stats); clear(grid); clear(list);
    var poems = regPoems(), claims = regClaims();
    var cs = claims.filter(function (c) { return c.dialect.d === did; });
    var rec = cs.filter(function (c) { return claimState(c) === 'recorded'; });
    var clm = cs.filter(function (c) { return claimState(c) === 'claimed'; });
    var od = cs.filter(function (c) { return claimState(c) === 'overdue'; });
    var recS = {}, clmS = {}, odS = {}, covS = {};
    rec.forEach(function (c) { recS[c.seq] = 1; covS[c.seq] = 1; });
    clm.forEach(function (c) { clmS[c.seq] = 1; covS[c.seq] = 1; });
    od.forEach(function (c) { odS[c.seq] = 1; covS[c.seq] = 1; });
    var openCount = poems.length - Object.keys(covS).length;

    [[rec.length, '已收錄（首）'], [clm.length, '已認領'], [od.length, '已逾期'],
     [openCount, '待認領']].forEach(function (p) {
      var d = el('div', 'stat');
      d.appendChild(el('div', 'n', String(p[0])));
      d.appendChild(el('div', 'l', p[1]));
      stats.appendChild(d);
    });

    var byVol = {};
    poems.forEach(function (p) {
      var v = byVol[p.volId] = byVol[p.volId] || { order: [], rhymes: {} };
      if (!v.rhymes[p.rhyme]) { v.rhymes[p.rhyme] = []; v.order.push(p.rhyme); }
      v.rhymes[p.rhyme].push(p);
    });
    (D.volumes || []).forEach(function (v) {
      var bv = byVol[v.id];
      if (!bv) return;
      var sec = el('div', 'vol-sec');
      sec.appendChild(el('h3', null, v.label));
      var g = el('div', 'rhyme-grid');
      bv.order.forEach(function (rn) {
        var ps = bv.rhymes[rn];
        var a = el('a', 'rhyme-cell');
        a.href = 'quanben.html#' + v.id + '-' + encodeURIComponent(rn);
        a.appendChild(el('span', 'rn', rn));
        var dots = el('span', 'dots');
        ps.forEach(function (p) {
          var dot = el('span', 'dot');
          if (recS[p.seq]) dot.classList.add('rec');
          else if (odS[p.seq]) dot.classList.add('overdue');
          else if (clmS[p.seq]) dot.classList.add('claim');
          dots.appendChild(dot);
        });
        a.appendChild(dots);
        a.appendChild(el('div', 'n', ps.map(function (p) { return p.chapter.replace('其', ''); }).join('·')));
        g.appendChild(a);
      });
      sec.appendChild(g);
      grid.appendChild(sec);
    });

    if (rec.length) {
      list.appendChild(el('h3', null, '已收錄（' + rec.length + ' 首）'));
      var dl = el('div', 'claim-list');
      rec.slice().sort(function (a, b) { return a.seq - b.seq; }).forEach(function (c) {
        var row = el('div', 'claim-row');
        var meta = el('span', 'meta');
        meta.appendChild(el('span', 'who', '第 ' + String(c.seq).padStart(3, '0') + ' 首　' + claimDialectLabel(c)));
        meta.appendChild(el('span', 'dim', (c.singer || '佚名') + (c.lineage ? '（' + c.lineage + '）' : '')
          + (c.society ? '　認領：' + c.society : '')));
        stateBadges(c).forEach(function (b) { meta.appendChild(b); });
        row.appendChild(meta);
        if (c.audio) {
          var au = document.createElement('audio');
          au.controls = true; au.preload = 'none'; au.src = c.audio;
          row.appendChild(au);
        }
        dl.appendChild(row);
      });
      list.appendChild(dl);
    } else {
      list.appendChild(el('p', 'muted', '此方言尚未收錄任何真人吟誦。空著的格，就是等著被認領的。'));
    }
  }

  /* ---------------------------------------------------------- 提供錄音頁 */
  function renderContribute() {
    var c = $('#contributeCoverage');
    if (c && REG) c.textContent = String(REG.meta.nRecorded);
    var c2 = $('#contributeCoverage2');
    if (c2 && REG) c2.textContent = String(REG.meta.nRecorded);
  }


  /* ------------------------------------------------------------ 參與總覽頁 */
  function renderCanyu() {
    var c = $('#canyuRecorded');
    if (c && REG) c.textContent = String(REG.meta.nRecorded);
    var g = $('#canyuGrid');
    if (!g) return;
    [['contribute.html', '提供錄音', '以吟誦學會為單位認領，手機錄音即可；著作權歸吟誦者'],
     ['tigong.html', '提供文本', '其他方言的字音標注，填表一鍵寄給維護者——純靜態，不上傳'],
     ['jiucuo.html', '糾錯', '全本文字、反切、粵拼、入聲標記——每一條採納都記入榮譽榜'],
     ['rongyu.html', '榮譽榜', '吟誦、文本標注、糾錯三類貢獻者——空著的榜，本身就是邀請']
    ].forEach(function (p) {
      var a = el('a', 'card card-link');
      a.href = p[0];
      a.appendChild(el('div', 't', p[1]));
      a.appendChild(el('div', 'd', p[2]));
      g.appendChild(a);
    });
  }

  /* ------------------------------------------------------------ 榮譽榜頁 */
  function renderHonor() {
    var H = window.SHENGLV_HONOR || { text: [], correct: [] };
    var claims = (REG && REG.claims) ? REG.claims : [];
    var recorded = claims.filter(function (c) { return c.status === 'recorded'; });
    var st = $('#honorStats');
    if (st) {
      [[recorded.length, '吟誦已收錄'], [H.text.length, '文本標注'], [H.correct.length, '糾錯採納']]
        .forEach(function (p) {
          var d = el('div', 'stat');
          d.appendChild(el('div', 'n', String(p[0])));
          d.appendChild(el('div', 'l', p[1]));
          st.appendChild(d);
        });
    }
    var body = $('#honorBody');
    if (!body) return;
    body.appendChild(el('h3', null, '一　吟誦（來自分工表）'));
    if (recorded.length) {
      var ul = el('ul');
      recorded.forEach(function (c) {
        ul.appendChild(el('li', null,
          (c.singer || '佚名') + '（' + (c.society || '個人') + '）· ' +
          (c.dialect ? c.dialect.d : '') + ' · 第 ' + c.seq + ' 首 · ' +
          (c.audit === 'verified' ? '已核' : '待核')));
      });
      body.appendChild(ul);
    } else {
      body.appendChild(el('p', 'muted', '尚無已收錄的吟誦——第一個名字等你來。空著的格，就是等著被認領的。'));
    }
    body.appendChild(el('h3', null, '二　文本標注'));
    if (H.text.length) {
      var ul2 = el('ul');
      H.text.forEach(function (r) {
        ul2.appendChild(el('li', null,
          (r.dialect || '') + ' · ' + (r.person || '佚名') + ' · ' +
          (r.scope || '') + (r.date ? ' · ' + r.date : '')));
      });
      body.appendChild(ul2);
    } else {
      body.appendChild(el('p', 'muted', '尚無文本標注貢獻。空著的榜，等著第一位標注者。'));
    }
    body.appendChild(el('h3', null, '三　糾錯'));
    if (H.correct.length) {
      var ul3 = el('ul');
      H.correct.forEach(function (r) {
        ul3.appendChild(el('li', null,
          (r.where || '') + ' · ' + (r.person || '匿名') +
          (r.date ? ' · ' + r.date : '') + (r.note ? ' · ' + r.note : '')));
      });
      body.appendChild(ul3);
    } else {
      body.appendChild(el('p', 'muted', '尚無採納記錄。發現錯漏，歡迎指正——第一筆採納等你來。'));
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
    else if (page === 'jyutping') renderJyutping();
    else if (page === 'contribute') renderContribute();
    else if (page === 'fengong') renderFengong();
    else if (page === 'canyu') renderCanyu();
    else if (page === 'rongyu') renderHonor();
  });
})();
