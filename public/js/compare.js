/* compare.js - 계획/실적 비교 (Lot No 기준 자동 매칭) */
(function () {
  let currentUnit = 'HM';

  async function render() {
    const root = document.getElementById('compare-root');
    if (!root) return;
    root.innerHTML = `<div class="loading">불러오는 중...</div>`;
    try {
      const summary = await API.fetch(`/api/compare/summary?unit=${currentUnit}`);
      const list = await API.fetch(`/api/compare?unit=${currentUnit}&page_size=100`);

      const rows = (list.items || []).map((it) => `
        <tr>
          <td>${it.lot_no}</td>
          <td>${it.item_name || ''}</td>
          <td>${it.plan_type || '-'}</td>
          <td>${it.actual_type_manual || it.actual_type || '-'}</td>
          <td class="${it.action_status === '조치' ? 'status-ok' : 'status-bad'}">${it.action_status}</td>
          <td class="num">${Number(it.amount).toFixed(2)}${FMT.unitLabel(currentUnit)}</td>
        </tr>
      `).join('');

      root.innerHTML = `
        <h2>계획/실적 비교</h2>
        <p class="hint">계획은 시스템에 등록된 소진계획, 실적은 업로드된 파일의 상세시트(재고_상세/재공_상세)에서 산출됩니다.
        LOT NO를 기준으로 1:1 매칭합니다.</p>

        <div class="kpi-grid kpi-grid-3">
          <div class="kpi-card" style="border-top-color:#1560A8">
            <div class="kpi-title">계획 등록 LOT</div>
            <div class="kpi-main">${summary.plan_total}건</div>
          </div>
          <div class="kpi-card" style="border-top-color:#196B24">
            <div class="kpi-title">조치 완료</div>
            <div class="kpi-main">${summary.action_count}건</div>
            <div class="kpi-sub">달성률(건수) ${summary.action_rate}% · 달성률(중량) ${summary.action_rate_weight}%</div>
          </div>
          <div class="kpi-card" style="border-top-color:#C1001B">
            <div class="kpi-title">미조치</div>
            <div class="kpi-main">${summary.no_action_count}건</div>
          </div>
        </div>

        <div class="action-bar">
          <button id="export-excel" class="btn-secondary">Excel 다운로드</button>
          <button id="export-ppt" class="btn-secondary">PPT 다운로드</button>
        </div>

        <table class="data-table">
          <thead><tr><th>LOT NO</th><th>품명</th><th>계획유형</th><th>실적유형</th><th>조치여부</th><th>금액</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6">등록된 계획 없음</td></tr>'}</tbody>
        </table>
      `;

      document.getElementById('export-excel').addEventListener('click', async () => {
        await API.download(`/api/compare/export?unit=${currentUnit}`, '계획실적비교.xlsx');
      });
      document.getElementById('export-ppt').addEventListener('click', async () => {
        await API.download(`/api/compare/export-ppt?unit=${currentUnit}`, '계획실적비교.pptx');
      });
    } catch (err) {
      root.innerHTML = `<div class="error-state">비교 화면 오류: ${err.message}</div>`;
    }
  }

  window.Compare = { render };
})();
