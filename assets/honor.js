/* 中文聲韻 —— 榮譽榜數據
   由維護者手動維護（採納後記錄）。
   吟誦類直接從 registry claims（status=recorded）自動讀取，不在此重複。
   correct:  糾錯貢獻      {where 位置, person 糾錯者(可匿名), date, note}
   （原 text 文本標注一類已撤：文本層由維護者統一整理，不對外徵集。）
   空數組即顯示「尚無記錄」。
   硬規則：候選名單、建議人選、未實際收錄者一律不列名——
   上榜的唯一標準是真實發生並被採納（吟誦已收到錄音、文本已納入全本、糾錯已修正）。 */
window.SHENGLV_HONOR = {
  correct: []
};
