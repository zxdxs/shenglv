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

  /* ------------------------------------------------------- 方言點（原 /fangyan/ 併入）
     本站原本只呈現粵語（assets/chars.js 的 r 欄）。現把 14 個方言點併進來，
     粵語降為切換器中的一個點，與普通話、四川話 6 點、吳語 2 點、閩南語 6 點並列。

     兩份資料各有其主：
       · 粵語    → assets/chars.js（既有，含逐字粵拼與音檔序），**不在此重複存放**
       · 其餘 14 點 → assets/fangyan.js
     粵語讀音若再存一份到 fangyan.js，兩份就會漂移。

     載入策略：fangyan.js 約 1.8MB，**按需載入**。預設粵語視圖完全不載入它，
     故多數訪客的載入量與合併前相同。 */
  var FYM = window.SHENGLV_FANGYAN_META || null;   // 語族／點位／統計（小，常駐）
  // 逐字讀音（大，按需）。頁面若已用 <script> 直接載入（聲韻入門頁就是），
  // 這裡必須立刻接手——否則 FY 永遠是 null，ensureFangyan 還會再抓一次同一支檔案。
  var FY = window.SHENGLV_FANGYAN || null;
  var PT = 'yue';             // 當前方言點
  var FY_STATE = FY ? 2 : 0;  // 0 未載入 · 1 載入中 · 2 就緒 · -1 失敗
  var FY_WAIT = [];

  function fyPoint(k) {
    if (k === 'yue') return { key: 'yue', name: '粵語', area: '粵海片',
                              ruCoda: '-p／-t／-k（完整保留）', toneMarked: true };
    if (!FYM) return null;
    for (var i = 0; i < FYM.points.length; i++) if (FYM.points[i].key === k) return FYM.points[i];
    return null;
  }
  function fyFamily(k) {
    if (!FYM) return null;
    for (var i = 0; i < FYM.families.length; i++) if (FYM.families[i].key === k) return FYM.families[i];
    return null;
  }
  function ptIsYue() { return PT === 'yue'; }
  function ptName() { var p = fyPoint(PT); return p ? p.name : PT; }

  function ensureFangyan(cb) {
    if (FY) { cb(); return; }
    if (FY_STATE === -1) { cb(); return; }
    if (cb) FY_WAIT.push(cb);
    if (FY_STATE === 1) return;
    FY_STATE = 1;
    var s = document.createElement('script');
    s.src = 'assets/fangyan.js';
    s.onload = function () {
      FY = window.SHENGLV_FANGYAN || null;
      FY_STATE = FY ? 2 : -1;
      var q = FY_WAIT; FY_WAIT = [];
      q.forEach(function (f) { f(); });
    };
    s.onerror = function () {
      FY_STATE = -1;
      var q = FY_WAIT; FY_WAIT = [];
      q.forEach(function (f) { f(); });
    };
    document.body.appendChild(s);
  }

  /* 取某字在當前方言點的讀音。粵語走主站 chars.js，其餘走 fangyan.js。
     回 null 表示**該點未收此字**（不是讀音為空），呼叫端須照實顯示「—」。 */
  function readOf(c, info) {
    return readAt(c, PT, info);
  }

  /* 指定方言點取值（聲韻入門要並列多點，不能只讀當前點）。 */
  function readAt(c, k, info) {
    if (k === 'yue') {
      info = info || CH[c] || {};
      return info.x ? null : (info.r || null);
    }
    if (!FY || !FY.chars) return null;
    var d = FY.chars[c];
    return (d && d[k]) || null;
  }

  /* 某語族的方言點。粵語也是一個語族（只有一點），故這裡同樣取得到。 */
  function famPoints(k) {
    var f = fyFamily(k);
    return f ? f.points : [];
  }

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
    var r = readOf(cell.c, info);
    if (info.ru) box.classList.add('ru');
    if (info.m && ptIsYue()) box.classList.add('multi');
    if (info.x && ptIsYue()) box.classList.add('pending');
    if (cell.rhymeEnd) box.classList.add('end');

    box.appendChild(el('span', 'r', r || (info.x && ptIsYue() ? '待考' : '—')));
    // 普通話拼音只在「當前讀音不是普通話」時才另列一行，否則同一格重複兩次
    box.appendChild(el('span', 'p', ptIsYue() || PT !== 'putonghua' ? (cell.pin || '') : ''));
    box.appendChild(el('span', 'c', cell.c));
    box.appendChild(el('span', 's', cell.sym || ''));

    var tip = [cell.c, ptName() + ' ' + (r || '（該點未收此字）')];
    if (!ptIsYue() || PT !== 'putonghua') tip.push('拼音 ' + (cell.pin || '—'));
    if (info.ru) tip.push('中古入聲字；' + ptName() + '入聲韻尾：' + codaOf(PT));
    if (ptIsYue() && info.m) {
      tip.push('多音字，已選：' + info.r + '（' + (info.b || '') + '）');
      tip.push('全部讀音：' + (info.a || []).join('、'));
    }
    box.setAttribute('title', tip.join('\n'));
    return box;
  }

  /* 某方言點的入聲韻尾實況。來自 fangyan.js 的 ruCoda；粵語與未載入時給明確值。 */
  function codaOf(k) {
    if (k === 'yue') return '-p／-t／-k（完整保留）';
    var p = fyPoint(k);
    return (p && p.ruCoda) || '未知';
  }

  /* ------------------------------------------------ 方言切換器（兩級）
     先選語族，再選該語族下的方言點。粵語只有一點，故選了粵語就不顯示第二級。
     只改 state 後重繪，不換頁——切換方言不該讓讀者丟掉正在看的韻。 */
  function renderPointBar(host, redraw) {
    if (!host) return;
    clear(host);
    if (!FYM) {
      var only = el('div', 'ptbar');
      only.appendChild(el('span', 'ptlabel', '方言'));
      var b0 = el('button', 'on', '粵語');
      b0.type = 'button';
      only.appendChild(b0);
      only.appendChild(el('span', 'muted', '方言清單未載入（assets/fangyan-meta.js）'));
      host.appendChild(only);
      return;
    }

    var fams = FYM.families;
    var curFam = PT === 'yue' ? 'yue' : null;
    if (!curFam) {
      for (var i = 0; i < fams.length && !curFam; i++) {
        for (var j = 0; j < fams[i].points.length; j++) {
          if (fams[i].points[j].key === PT) { curFam = fams[i].key; break; }
        }
      }
    }
    var fam = fyFamily(curFam) || fams[0];

    var wrap = el('div', 'ptbar');
    var r1 = el('div', 'ptrow');
    r1.appendChild(el('span', 'ptlabel', '語族'));
    fams.forEach(function (f) {
      var b = el('button', f.key === fam.key ? 'on' : null, f.name);
      b.type = 'button';
      b.setAttribute('aria-pressed', f.key === fam.key ? 'true' : 'false');
      b.addEventListener('click', function () {
        // 切語族 → 落到該族第一點
        setPoint(f.points[0].key, redraw);
      });
      r1.appendChild(b);
    });
    wrap.appendChild(r1);

    if (fam.points.length > 1) {
      var r2 = el('div', 'ptrow');
      r2.appendChild(el('span', 'ptlabel', '方言點'));
      fam.points.forEach(function (p) {
        var b = el('button', p.key === PT ? 'on' : null, p.name);
        b.type = 'button';
        b.setAttribute('aria-pressed', p.key === PT ? 'true' : 'false');
        b.setAttribute('title', (p.area ? p.area + '　' : '') + (p.note || ''));
        b.addEventListener('click', function () { setPoint(p.key, redraw); });
        r2.appendChild(b);
      });
      wrap.appendChild(r2);
    }
    var cur = fyPoint(PT);
    if (cur && cur.note) wrap.appendChild(el('p', 'ptnote', cur.name + '：' + cur.note));
    host.appendChild(wrap);
  }

  function setPoint(k, redraw) {
    PT = k;
    var u = new URL(window.location.href);
    if (k === 'yue') u.searchParams.delete('pt'); else u.searchParams.set('pt', k);
    u.searchParams.delete('fam');
    window.history.replaceState(null, '', u.toString());
    if (k === 'yue') { redraw(); return; }
    ensureFangyan(redraw);
  }

  function renderLine(line, vid) {
    var row = el('div', 'line');
    row.setAttribute('data-u', line.u);
    // 音檔只有粵語有（5998 條 zh-HK TTS）。切到其他方言點時不給假按鈕，
    // 改以 muted 說明，免得讀者以為壞了。
    if (ptIsYue()) {
      var btn = el('button', 'pbtn', '▶');
      btn.type = 'button';
      btn.setAttribute('aria-label', '播放這一句');
      btn.addEventListener('click', function () { toggleLine(line.u, vid, row); });
      row.appendChild(btn);
    } else {
      var ph = el('span', 'pbtn off', '—');
      ph.setAttribute('title', ptName() + '尚無音檔；本站音檔為粵語 zh-HK 合成語音');
      row.appendChild(ph);
    }

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
    if (units.length && ptIsYue()) {
      var b = el('button', 'cbtn', '▶ 讀整章');
      b.type = 'button';
      b.addEventListener('click', function () { playChapter(units, vid, box); });
      head.appendChild(b);
      head.appendChild(el('span', 'st-count', ch.lines.length + ' 句'));
    } else if (units.length) {
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
    var rows = [
      ['藍字', ptIsYue() ? '粵拼（Jyutping）' : ptName() + '讀音'],
      ['灰字', ptIsYue() || PT !== 'putonghua' ? '普通話拼音（對照）' : '（同左）'],
      ['紅字', '韻腳'],
      ['褐色加底線', '中古入聲；' + ptName() + '入聲韻尾 ' + codaOf(PT)]
    ];
    if (ptIsYue()) {
      rows.push(['r 後 ?', '多音字，游標停留看全部讀音']);
      rows.push(['待考', '粵語字典未收之罕用字，不自造讀音']);
    } else {
      rows.push(['—', '該方言點字典未收此字（覆蓋率見上）']);
    }
    rows.forEach(function (p) {
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
      // ★ 方言點已併入本站，不再外連 /fangyan/。
      //   這些連結指向本站全本頁並帶 ?pt=，由前端切到該點。
      // ★ 普通話排首位（業主指示）：它是整組對照的基準線。
      //   注意順序與預設是兩件事——預設選中的點仍是粵語（見 PT 預設值），
      //   因粵語有逐字粵拼與全書音檔，是本站主線視圖。
      { label: '普通話', href: 'quanben.html?pt=putonghua', on: true },
      { label: '粵語', href: 'quanben.html', on: true },
      { label: '四川話', href: 'quanben.html?pt=tongyin', on: true },
      { label: '吳語', href: 'quanben.html?pt=shanghai', on: true },
      { label: '閩南語', href: 'quanben.html?pt=chaozhou', on: true },
      { label: '聲韻入門', href: 'shengyun.html', on: true },
      { label: '客家話', href: 'wip.html' },
      { label: '＋ 添加', href: 'tigong.html', add: true }
    ]}
  ];

  /* URL 的 ?pt= 決定初始方言點。無效值一律退回粵語——壞參數不該弄壞頁面。
     透過 ensureFangyan 先載入 fangyan.js 再啟動，否則第一次繪製會全部顯示「—」。 */
  function say(t) { if (window.console) console.warn('[中文聲韻] ' + t); }

  function bootWithPoint(start) {
    var m = /[?&]pt=([A-Za-z0-9_]+)/.exec(window.location.search);
    if (!m || m[1] === 'yue') { start(); return; }
    // 先用小檔驗證點位是否存在，避免為了無效參數去抓 1.7MB
    if (!fyPoint(m[1])) { say('未知方言點「' + m[1] + '」，改用粵語。'); start(); return; }
    PT = m[1];
    ensureFangyan(function () {
      if (!FY) say('方言讀音載入失敗，' + ptName() + '欄位將顯示「—」。');
      start();
    });
  }

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
                  ['fengong.html', '歸集進度', '376 首分工表：篇目／方言雙視圖，以學會認領、承諾時間逾期滿三個月自動釋放——空行就是推動力'],
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

    // 方言切換器：切換只改 state 並重繪本韻，不換頁（不丟失正在看的韻）
    renderPointBar($('#ptBar'), function () {
      var V = window['SHENGLV_VOL' + String(curVol).slice(1)];
      if (!V) return;
      var target = V.rhymes[0];
      for (var j = 0; j < V.rhymes.length; j++) {
        if (V.rhymes[j].name === curRhyme) { target = V.rhymes[j]; break; }
      }
      renderRhymeBody(host, target, curVol);
    });
    curRhyme = r.name;

    var h = el('h2', null, r.name);
    h.id = 'rhyme-' + r.name;
    host.appendChild(h);
    host.appendChild(el('p', 'muted',
      '字譜 ' + zlist.length + ' 字，其中 ' + ru + ' 字為中古入聲'
      + (zlist.length ? '（' + pct(100 * ru / zlist.length) + '）' : '')
      + '；' + ptName() + '的入聲韻尾為 ' + codaOf(PT) + '。'
      + (ptIsYue() && pend ? pend + ' 字為粵語字典未收之罕用字，標為待考。' : '')));

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
      var w1 = claimWho(c);
      meta.appendChild(el('span', 'dim', '認領：' + w1.who
        + (w1.by ? '　吟誦：' + w1.by : '')));
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
      var r = readOf(c, info);
      var z = el('span', 'zc' + (info.ru ? ' ru' : '') + (info.m && ptIsYue() ? ' multi' : '')
        + (info.x && ptIsYue() ? ' pending' : ''));
      z.appendChild(el('span', 'c', c));
      z.appendChild(el('span', 'r', r || (info.x && ptIsYue() ? '待考' : '—')));
      var tip = [c, info.x && ptIsYue() ? '待考：字典未收之罕用字'
                                        : ptName() + ' ' + (r || '（該點未收此字）')];
      if (info.ru) tip.push('中古入聲字；' + ptName() + '入聲韻尾：' + codaOf(PT));
      if (ptIsYue() && info.m) tip.push('多音字，已選：' + info.r + '（' + (info.b || '') + '）',
                                        '全部讀音：' + (info.a || []).join('、'));
      z.setAttribute('title', tip.join('\n'));
      cs.appendChild(z);
    });
    return cs;
  }

  /* 首頁的方言索引：把 5 個語族 16 個點列出來，連結直接帶 ?pt= 進全本。
     由 fangyan-meta.js 生成，不寫死——新增方言點時首頁自動跟著長。 */
  function renderFamGrid() {
    var host = $('#famGrid');
    if (!host) return;
    if (!FYM) {
      host.appendChild(el('p', 'muted', '方言清單未載入（assets/fangyan-meta.js）。'));
      return;
    }
    // ★ 直接照 fangyan-meta.js 的語族順序排（已含粵語）。
    //   先前在這裡把粵語硬寫在首位，於是改順序時漏了這一頁——
    //   順序只能有一個來源，就是產線給的那份。
    var grid = el('div', 'fampoints');
    FYM.families.forEach(function (f) {
      var box = el('div', 'famrow2');
      box.appendChild(el('div', 'famname', f.name));
      var chips = el('div', 'chips');
      f.points.forEach(function (p) {
        var a = el('a', 'ptlink' + (p.key === 'yue' ? ' on' : ''), p.name);
        a.href = 'quanben.html' + (p.key === 'yue' ? '' : '?pt=' + p.key);
        a.setAttribute('title', (p.area ? p.area + '　' : '') + (p.note || '')
          + (p.coverage ? '　覆蓋 ' + p.coverage + '%' : ''));
        chips.appendChild(a);
      });
      box.appendChild(chips);
      grid.appendChild(box);
    });
    host.appendChild(grid);
  }

  /* -------------------------------------------------- 聲韻入門（原 /fangyan/ 併入）
     原站以「語族」分頁隱藏非當前段落；合併後改為**全部展開**——這一頁是解說，
     讀者需要的是前後對照，不是逐族切換。
     各表都是即時由資料算出來的，不寫死讀音。 */
  function miniTable(chars, keys, caption) {
    var w = el('div', 'cmpwrap'), t = el('table', 'cmp'), head = el('tr');
    head.appendChild(el('th', null, caption || '字'));
    keys.forEach(function (p) { head.appendChild(el('th', null, p.name)); });
    t.appendChild(head);
    chars.forEach(function (ch) {
      var ru = !!(CH[ch] || {}).ru;
      var tr = el('tr');
      tr.appendChild(el('td', 'zi' + (ru ? ' ru' : ''), ch));
      keys.forEach(function (p) {
        var v = readAt(ch, p.key);
        tr.appendChild(el('td', ru ? 'ru' : null,
          v || (ptIsYue() || p.key !== 'yue' ? '—' : '—')));
      });
      t.appendChild(tr);
    });
    w.appendChild(t);
    return w;
  }

  function twoColTable(rows) {
    var w = el('div', 'cmpwrap'), t = el('table', 'cmp');
    rows.forEach(function (r) {
      var tr = el('tr');
      tr.appendChild(el('td', 'ptname', r[0]));
      var td = el('td');
      if (r[2] === 'html') td.innerHTML = r[1]; else td.textContent = r[1];
      tr.appendChild(td);
      t.appendChild(tr);
    });
    w.appendChild(t);
    return w;
  }

  function renderShengyun() {
    function fill(id, chars, keys) {
      var host = $('#' + id);
      if (host && !host.firstChild) host.appendChild(miniTable(chars, keys));
    }
    var YUE_P = [{ key: 'yue', name: '粵語' }];
    var CMN_P = [{ key: 'putonghua', name: '普通話' }];

    // 粵語：入聲三調分佈（實測自主站資料，不寫死）
    var yh = $('#yue-ru');
    if (yh && !yh.firstChild) {
      var cnt = {};
      Object.keys(CH).forEach(function (c) {
        var i = CH[c];
        if (!i.ru || !i.r) return;
        var m = /(\d)$/.exec(i.r);
        if (m) cnt[m[1]] = (cnt[m[1]] || 0) + 1;
      });
      var tot = 0;
      Object.keys(cnt).forEach(function (k) { tot += cnt[k]; });
      var rows = [['入聲調', '字數', '佔比']];
      var NAME = { '1': '上陰入', '3': '下陰入', '6': '陽入' };
      Object.keys(cnt).sort().forEach(function (k) {
        rows.push(['第 ' + k + ' 調　' + (NAME[k] || ''), String(cnt[k]),
                   (100 * cnt[k] / tot).toFixed(1) + '%']);
      });
      rows.push(['合計', String(tot), '100%']);
      var w = el('div', 'cmpwrap'), t = el('table', 'cmp');
      rows.forEach(function (r, i) {
        var tr = el('tr');
        r.forEach(function (v) { tr.appendChild(el(i ? 'td' : 'th', i ? null : null, v)); });
        if (!i) tr.children[0].className = 'ptname';
        t.appendChild(tr);
      });
      w.appendChild(t); yh.appendChild(w);
    }
    fill('yue-cmp', ['屋', '竹', '木', '白', '月', '學', '十', '七'],
         YUE_P.concat(CMN_P).concat(famPoints('min')));

    // 普通話
    fill('cmn-ru', ['屋', '竹', '木', '白', '月', '學', '十', '七'], YUE_P.concat(CMN_P));
    var d2 = $('#cmn-dist');
    if (d2 && !d2.firstChild && FY) {
      var cnt2 = {}, all = 0;
      var MARK = { 'ā': '1', 'á': '2', 'ǎ': '3', 'à': '4', 'ē': '1', 'é': '2', 'ě': '3', 'è': '4',
                   'ī': '1', 'í': '2', 'ǐ': '3', 'ì': '4', 'ō': '1', 'ó': '2', 'ǒ': '3', 'ò': '4',
                   'ū': '1', 'ú': '2', 'ǔ': '3', 'ù': '4', 'ǖ': '1', 'ǘ': '2', 'ǚ': '3', 'ǜ': '4' };
      var NK = { '1': '陰平', '2': '陽平', '3': '上聲', '4': '去聲', '0': '輕聲' };
      Object.keys(FY.chars).forEach(function (c) {
        if ((CH[c] || {}).ru === undefined && !(CH[c] || {}).ru) return;
        var r = FY.chars[c].putonghua;
        if (!r) return;
        var tk = '0';
        for (var i = 0; i < r.length; i++) { if (MARK[r[i]]) { tk = MARK[r[i]]; break; } }
        cnt2[tk] = (cnt2[tk] || 0) + 1; all++;
      });
      var rows2 = [['普通話聲調', '字數', '佔比']];
      Object.keys(cnt2).sort().forEach(function (k) {
        rows2.push(['第 ' + k + ' 聲　' + (NK[k] || ''), String(cnt2[k]),
                    (100 * cnt2[k] / all).toFixed(1) + '%']);
      });
      rows2.push(['合計', String(all), '100%']);
      var w2 = el('div', 'cmpwrap'), t2 = el('table', 'cmp');
      rows2.forEach(function (r, i) {
        var tr = el('tr');
        r.forEach(function (v) { tr.appendChild(el(i ? 'td' : 'th', null, v)); });
        if (!i) tr.children[0].className = 'ptname';
        t2.appendChild(tr);
      });
      w2.appendChild(t2); d2.appendChild(w2);
    }

    // 四川話
    fill('sc-zh', ['竹', '車', '山', '師', '十'], YUE_P.concat(famPoints('sichuan')));
    fill('sc-ru', ['屋', '屈', '欲', '菊', '七'], YUE_P.concat(famPoints('sichuan')));
    var d = $('#sc-tone');
    if (d && !d.firstChild && FYM) {
      var rows3 = [['四川話方言點', '片區', '入聲字數', '主要去向']];
      famPoints('sichuan').forEach(function (p) {
        var st = (FYM.pointStats || {})[p.key] || {};
        rows3.push([p.name, p.area || '', st.ruTotal == null ? '' : String(st.ruTotal),
                    st.top ? ('第 ' + st.top + ' 聲 · ' + (st.topPct || 0).toFixed(1) + '%') : '—']);
      });
      var w3 = el('div', 'cmpwrap'), t3 = el('table', 'cmp');
      rows3.forEach(function (r, i) {
        var tr = el('tr');
        r.forEach(function (v) { tr.appendChild(el(i ? 'td' : 'th', 'ptname', v)); });
        t3.appendChild(tr);
      });
      w3.appendChild(t3); d.appendChild(w3);
    }

    // 吳語
    fill('wu-voiced', ['同', '道', '並', '定', '奉', '床', '婆', '茶'], YUE_P.concat(famPoints('wu')));
    fill('wu-ru', ['一', '七', '屋', '竹', '白', '月', '學'], YUE_P.concat(famPoints('wu')));
    fill('wu-diff', ['泥', '來', '日', '十'], famPoints('wu'));

    // 閩南語
    fill('min-ru', ['十', '法', '七', '屋', '竹', '白', '月', '學'], YUE_P.concat(famPoints('min')));
    fill('min-nasal', ['我', '五', '牙', '岸', '目', '黃'], YUE_P.concat(famPoints('min')));
    fill('min-diff', ['葉', '法', '問', '七', '先', '關'], famPoints('min'));
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

  /* YYYY-MM-DD 加 n 個月。月底夾擠（1/31 + 1 個月 → 2/28），與 build_registry.py
     的 _add_months() 同一規則——兩端必須算出同一天，否則頁面與建置會不同調。 */
  function addMonths(iso, n) {
    var y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10);
    var m0 = m - 1 + n, y2 = y + Math.floor(m0 / 12), m2 = m0 % 12 + 1;
    var leap = (y2 % 4 === 0 && (y2 % 100 !== 0 || y2 % 400 === 0));
    var last = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m2 - 1];
    return y2 + '-' + String(m2).padStart(2, '0') + '-' + String(Math.min(d, last)).padStart(2, '0');
  }

  /* 認領狀態機（與 build_registry.py 的 claim_state() 同一套規則）
       open         無登記
       claimed      已認領，尚未到承諾時間
       overdue      承諾時間已過，仍在寬限內且未回覆
       renegotiate  逾期後已回覆 → 不自動釋放，待另約新承諾時間
       released     逾期滿寬限期仍未回覆 → 自動釋放回「待認領」
       recorded     已收錄（不因期限釋放）
     ★ 關鍵：逾期 ≠ 釋放。逾期只是提醒，要再過 graceMonths 個月沒回覆才釋放。 */
  function claimState(c) {
    if (!c) return 'open';
    if (c.status === 'recorded') return 'recorded';
    var pd = c.promiseDate;
    if (!pd) return 'claimed';
    var g = (REG && REG.meta && REG.meta.graceMonths) || 3;
    if (c.lastReply && c.lastReply >= pd) return 'renegotiate';
    var rel = c.releaseDate || addMonths(pd, g);
    var t = todayStr();
    if (t > rel) return 'released';
    if (t > pd) return 'overdue';
    return 'claimed';
  }

  /* 已釋放者回到「待認領」——但它曾有認領紀錄，公開列出來才誠實 */
  function releasedFor(seq) {
    if (!REG || !REG.released) return null;
    for (var i = 0; i < REG.released.length; i++) {
      if (REG.released[i].seq === seq) return REG.released[i];
    }
    return null;
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

  /* 認領主體（學會）與實際吟誦者（個人）分開顯示。
     規則：認領以學會為單位，不以個人；singer 只在已收錄時才出現。
     回傳兩段：{who: 認領者文字, by: 吟誦者文字（可能為空）} */
  function claimWho(c) {
    var who = (c.society || '').trim() || '（未載明學會）';
    var by = '';
    if (claimState(c) === 'recorded' && c.singer) {
      by = c.singer + (c.lineage ? '（' + c.lineage + '）' : '');
    }
    return { who: who, by: by };
  }

  /* 狀態徽章（已收錄者附審核徽章：已核／待核） */
  function stateBadges(c) {
    var st = claimState(c), out = [];
    if (st === 'open' || st === 'released') out.push(el('span', 'badge open', '待認領'));
    else if (st === 'claimed') out.push(el('span', 'badge claimed', '已認領'));
    else if (st === 'overdue') out.push(el('span', 'badge overdue', '已逾期'));
    else if (st === 'renegotiate') out.push(el('span', 'badge renego', '待另約'));
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
    var w2 = claimWho(c);
    chip.appendChild(document.createTextNode(claimDialectLabel(c) + ' · ' + w2.who
      + (w2.by ? '（吟誦 ' + w2.by + '）' : '')));
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
    var st = { recorded: 0, claimed: 0, overdue: 0, renegotiate: 0 };
    claims.forEach(function (c) {
      var s = claimState(c);
      if (st[s] !== undefined) st[s]++;
    });
    var nRel = (REG.released || []).length;
    [[poems.length, '篇目（首）'], [REG.meta.nRhymes, '韻部'],
     [REG.meta.nDialects, '方言區'], [st.recorded, '已收錄版本'],
     [st.claimed, '已認領'], [st.overdue, '已逾期'],
     [st.renegotiate, '待另約'], [nRel, '已釋放（回到待認領）']
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
     ['overdue', '已逾期'], ['renegotiate', '待另約'],
     ['recorded', '已收錄']].forEach(function (p) {
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
        var w3 = claimWho(c);
        line.appendChild(el('span', null, claimDialectLabel(c) + '　' + w3.who
          + (w3.by ? '　吟誦：' + w3.by : '')));
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
    var rg = cs.filter(function (c) { return claimState(c) === 'renegotiate'; });
    var recS = {}, clmS = {}, odS = {}, rgS = {}, covS = {};
    rec.forEach(function (c) { recS[c.seq] = 1; covS[c.seq] = 1; });
    clm.forEach(function (c) { clmS[c.seq] = 1; covS[c.seq] = 1; });
    od.forEach(function (c) { odS[c.seq] = 1; covS[c.seq] = 1; });
    rg.forEach(function (c) { rgS[c.seq] = 1; covS[c.seq] = 1; });
    // 已釋放者不在 claims 內，故自然落回「待認領」——正是自動釋放的用意
    var openCount = poems.length - Object.keys(covS).length;

    [[rec.length, '已收錄（首）'], [clm.length, '已認領'], [od.length, '已逾期'],
     [rg.length, '待另約'], [openCount, '待認領']].forEach(function (p) {
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
          else if (rgS[p.seq]) dot.classList.add('renego');
          else if (odS[p.seq]) dot.classList.add('overdue');
          else if (clmS[p.seq]) dot.classList.add('claim');
          // 其餘（含已自動釋放者）留白＝待認領，與自動釋放的用意一致
          if (releasedFor(p.seq)) dot.classList.add('was-released');
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
        var w4 = claimWho(c);
        meta.appendChild(el('span', 'dim', '認領：' + w4.who
          + (w4.by ? '　吟誦：' + w4.by : '')));
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
          c.society + (c.singer ? '（吟誦 ' + c.singer + '）' : '') + ' · ' +
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
    // ?pt= 需先載入 fangyan.js 才能正確繪製，故把整個分派包進 bootWithPoint
    bootWithPoint(function () {
      if (page === 'index') { renderHome(); renderFamGrid(); }
      else if (page === 'quanben') renderQuanben();
      else if (page === 'duizhang') renderDuizhang();
      else if (page === 'shengyun') renderShengyun();
      else if (page === 'about') renderAbout();
      else if (page === 'jyutping') renderJyutping();
      else if (page === 'contribute') renderContribute();
      else if (page === 'fengong') renderFengong();
      else if (page === 'canyu') renderCanyu();
      else if (page === 'rongyu') renderHonor();
    });
  });
})();
