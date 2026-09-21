/* ============================================================
   留言 · 交流 —— Twikoo 前端接入
   資料來源：無（留言存在 EdgeOne Makers 的 Blob KV，不在本站檔案內）
   ============================================================ */
(function () {
  'use strict';

  /* ---------------------------------------------------------------
     ★ 唯一要改的一行
     EdgeOne Pages → Makers 函式建立完成後，把它的網址貼在這裡。
     同網域可用相對路徑（例如 '/twikoo'）或完整網址。
     留空 ⇒ 不載入任何外部資源，只顯示「尚未啟用」與替代聯絡方式。
     --------------------------------------------------------------- */
  var TWIKOO_ENV_ID = '';

  /* 留言討論串的鍵。刻意寫死而不取 location.pathname：
     本站曾在 shenglv.solve-lab.cn 與 shenglv.org.cn 兩個網域間遷移過，
     寫死可確保換網域後留言不分裂成兩串。 */
  var THREAD_PATH = '/liuyan.html';

  var host = document.getElementById('tcomment');
  if (!host) return;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.appendChild(document.createTextNode(text));
    return n;
  }

  /* 尚未啟用／載入失敗時，給一段說得清楚的替代方案，
     而不是留一個空白或永遠轉圈的框。 */
  function fallback(title, lines) {
    host.innerHTML = '';
    var card = el('div', 'card');
    card.appendChild(el('p', null, title));
    lines.forEach(function (t) {
      card.appendChild(el('p', 'muted', t));
    });
    var p = el('p');
    p.appendChild(document.createTextNode('在這之前，歡迎改用'));
    var a1 = el('a', null, '「提供錄音」頁');
    a1.href = 'contribute.html';
    var a2 = el('a', null, '寫信');
    a2.href = 'mailto:hello@solve-lab.cn';
    p.appendChild(a1);
    p.appendChild(document.createTextNode('或'));
    p.appendChild(a2);
    p.appendChild(document.createTextNode('告訴我們。'));
    card.appendChild(p);
    host.appendChild(card);
  }

  if (!TWIKOO_ENV_ID) {
    fallback('留言區尚未啟用。',
      ['維護者還在設定後端（EdgeOne Makers 函式）。',
       '這一頁先放著，設定完成後留言框會自動出現在這裡——不需要你重新整理或重裝什麼。']);
    return;
  }

  var s = document.createElement('script');
  s.src = 'assets/twikoo.min.js';   /* 自架、鎖版本 2.0.5，見 assets/TWIKOO-VERSION.txt */
  s.onload = function () {
    if (typeof window.twikoo === 'undefined') {
      fallback('留言元件載入異常。', ['檔案載入成功但沒有初始化介面，請稍後再試。']);
      return;
    }
    window.twikoo.init({
      envId: TWIKOO_ENV_ID,
      el: '#tcomment',
      lang: 'zh-TW',          /* 本站為繁體站；Twikoo 有 zh-TW 語系 */
      path: THREAD_PATH
    });
  };
  s.onerror = function () {
    fallback('留言元件載入失敗。', ['可能是網路問題或檔案缺失（assets/twikoo.min.js）。']);
  };
  document.head.appendChild(s);
})();
