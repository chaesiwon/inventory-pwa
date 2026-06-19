/* compare.js - 계획/실적 비교 (Lot No 기준 자동 매칭)
   [요구사항 8] 공장/원가중심점 필터 추가, 조치완료/미조치 카드에 중량+금액 함께 표시
   [요구사항 7] 실적유형이 Sales로 시작하면 전환판매, WIP로 시작하면 생산투입 실적으로 매핑되어
   계획유형과의 일치 여부(type_match)가 화면에 표시됨
*/
(function () {
  let currentUnit = 'HM';
  let currentFactory = '';
  let currentCostCenter = '';

  function filterQuery() {
    const params = new URLSearchParams();
    if (currentFactory) params.set('factory', currentFactory);
    if (currentCostCenter) params.set('cost_center', currentCostCenter);
    return params.toString();
  }

  async function render() {
    const root = document.getElementById('compare-root');
    if (!root) return;
    root.innerHTML = `<div class="loading">불러오는 중...</div>`;
    try {
      const filterOpts = await API.fetch('/api/inventory/filter-options');
      const fq = filterQuery();
      const qs = `unit=${currentUnit}${fq ? '&' + fq : ''}`;
      const summary = await API.fetch(`/api/compare/summary?${qs}`);
      const list = await API.fetch(`/api/compare?${qs}&page_size=100`);

      const factoryOptions = `<option value="">전체</option>` + (filterOpts.factories || []).map(
        (f) => `<option value="${f}" ${f === currentFactory ? 'selected' : ''}>${f}</option>`
      ).join('');
      const ccOptions = `<option value="">전체</option>` + (filterOpts.cost_centers || []).map(
        (c) => `<option value="${c.name}" ${c.name === currentCostCenter ? 'selected' : ''}>${c.name}</option>`
      ).join('');

      const rows = (list.items || []).map((it) => {
        let matchBadge = '';
        if (it.type_match === true) matchBadge = '<span class="status-ok">일치</span>';
        else if (it.type_match === false) matchBadge = '<span class="status-bad">불일치</span>';
        else matchBadge = '<span class="hint">-</span>';
        return `
        <tr>
          <td>${it.lot_no}</td>
          <td>${it.item_name || ''}</td>
          <td>${it.cc_name || '-'}</td>
          <td>${it.plan_type || '-'}</td>
          <td>${it.actual_type_manual || it.actual_type || '-'}</td>
          <td>${matchBadge}</td>
          <td class="${it.action_status === '조치' ? 'status-ok' : 'status-bad'}">${it.action_status}</td>
          <td class="num">${Number(it.weight_ton).toFixed(2)} ton</td>
          <td class="num">${Number(it.amount).toFixed(2)}${FMT.unitLabel(currentUnit)}</td>
        </tr>
      `;
      }).join('');

      root.innerHTML = `
        <h2>계획/실적 비교</h2>
        <p class="hint">계획은 시스템에 등록된 소진계획, 실적은 업로드된 파일의 상세시트(재고_상세/재공_상세)에서 산출됩니다.
        LOT NO를 기준으로 1:1 매칭하며, 실적유형이 'Sales'로 시작하면 전환판매, 'WIP'로 시작하면 생산투입 실적으로 분류됩니다.</p>

        <div class="filter-bar">
          <label>공장 <select id="f-factory">${factoryOptions}</select></label>
          <label>원가중심점 <select id="f-cc">${ccOptions}</select></label>
          <label>금액단위
            <select id="f-unit">
              <option value="HM" ${currentUnit === 'HM' ? 'selected' : ''}>억원</option>
              <option value="MN" ${currentUnit === 'MN' ? 'selected' : ''}>백만원</option>
              <option value="KRW" ${currentUnit === 'KRW' ? 'selected' : ''}>원</option>
            </select>
          </label>
        </div>

        <div class="kpi-grid kpi-grid-3">
          <div class="kpi-card" style="border-top-color:#1560A8">
            <div class="kpi-title">계획 등록 LOT</div>
            <div class="kpi-main">${summary.plan_total}건</div>
            <div class="kpi-sub">${FMT.weight(summary.total_weight)} · ${Number(summary.total_amount).toFixed(2)}${FMT.unitLabel(currentUnit)}</div>
          </div>
          <div class="kpi-card" style="border-top-color:#196B24">
            <div class="kpi-title">조치 완료</div>
            <div class="kpi-main">${summary.action_count}건</div>
            <div class="kpi-sub">${FMT.weight(summary.action_weight)} · ${Number(summary.action_amount).toFixed(2)}${FMT.unitLabel(currentUnit)}</div>
            <div class="kpi-sub">달성률(건수) ${summary.action_rate}% · 달성률(중량) ${summary.action_rate_weight}%</div>
          </div>
          <div class="kpi-card" style="border-top-color:#C1001B">
            <div class="kpi-title">미조치</div>
            <div class="kpi-main">${summary.no_action_count}건</div>
            <div class="kpi-sub">${FMT.weight(summary.no_action_weight)} · ${Number(summary.no_action_amount).toFixed(2)}${FMT.unitLabel(currentUnit)}</div>
          </div>
        </div>

        <div class="action-bar">
          <button id="export-excel" class="btn-secondary">Excel 다운로드</button>
          <button id="export-ppt" class="btn-secondary">PPT 다운로드</button>
        </div>

        <table class="data-table">
          <thead><tr><th>LOT NO</th><th>품명</th><th>원가중심점</th><th>계획유형</th><th>실적유형</th><th>일치여부</th><th>조치여부</th><th>중량</th><th>금액</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="9">등록된 계획 없음</td></tr>'}</tbody>
        </table>
      `;

      document.getElementById('f-factory').addEventListener('change', (e) => {
        currentFactory = e.target.value;
        render();
      });
      document.getElementById('f-cc').addEventListener('change', (e) => {
        currentCostCenter = e.target.value;
        render();
      });
      document.getElementById('f-unit').addEventListener('change', (e) => {
        currentUnit = e.target.value;
        render();
      });
      document.getElementById('export-excel').addEventListener('click', async () => {
        await API.download(`/api/compare/export?${qs}`, '계획실적비교.xlsx');
      });
      document.getElementById('export-ppt').addEventListener('click', async () => {
        await API.download(`/api/compare/export-ppt?${qs}`, '계획실적비교.pptx');
      });
    } catch (err) {
      root.innerHTML = `<div class="error-state">비교 화면 오류: ${err.message}</div>`;
    }
  }

  window.Compare = { render };
})();
