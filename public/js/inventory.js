/* inventory.js - 장기재고현황 조회 화면 (요구사항 7: 조회용 화면 복원 + PPT 다운로드)
   필터: 기준일자/공장/품목구분/LOT NO/품명/원가중심점/담당부서/소진계획방안
   7개월이상 장기재고는 빨간 배지로 강조 표시
*/
(function () {
  let currentUnit = 'HM';
  let currentPage = 1;
  const PAGE_SIZE = 50;
  let currentFilters = {};

  function monthsBadge(label) {
    if (label === '7개월이상') return `<span class="badge-critical">⚠ 7개월이상</span>`;
    return label || '-';
  }

  async function render() {
    const root = document.getElementById('inventory-root');
    if (!root) return;
    root.innerHTML = `<div class="loading">불러오는 중...</div>`;
    try {
      const refDatesRes = await API.fetch('/api/inventory/ref-dates');
      const refDates = refDatesRes.ref_dates || [];
      const refDate = currentFilters.ref_date || refDates[0] || null;
      currentFilters.ref_date = refDate;

      if (!refDate) {
        root.innerHTML = `<div class="empty-state">업로드된 재고 데이터가 없습니다.</div>`;
        return;
      }

      const refDateOptions = refDates.map(
        (rd) => `<option value="${rd}" ${rd === refDate ? 'selected' : ''}>${FMT.date(rd)}</option>`
      ).join('');

      root.innerHTML = `
        <h2>장기재고현황 조회</h2>
        <p class="hint">업로드된 장기재고현황 데이터를 조건별로 조회합니다. 7개월이상 장기재고는 빨간 배지로 집중관리 표시됩니다.</p>

        <div class="filter-bar">
          <label>기준일자 <select id="f-ref-date">${refDateOptions}</select></label>
          <label>공장 <input type="text" id="f-factory" placeholder="예: 임실공장"></label>
          <label>LOT NO <input type="text" id="f-lot-no" placeholder="LOT 검색"></label>
          <label>품명 <input type="text" id="f-item-name" placeholder="품명 검색"></label>
          <label>원가중심점 <input type="text" id="f-cost-center" placeholder="원가중심점"></label>
          <label>금액단위
            <select id="f-unit">
              <option value="HM" ${currentUnit === 'HM' ? 'selected' : ''}>억원</option>
              <option value="MN" ${currentUnit === 'MN' ? 'selected' : ''}>백만원</option>
              <option value="KRW" ${currentUnit === 'KRW' ? 'selected' : ''}>원</option>
            </select>
          </label>
          <button id="f-search" class="btn-primary">조회</button>
        </div>

        <div class="action-bar">
          <button id="export-excel" class="btn-secondary">Excel 다운로드</button>
          <button id="export-ppt" class="btn-secondary">PPT 다운로드</button>
        </div>

        <div id="inventory-table-section"></div>
        <div id="inventory-pagination"></div>
      `;

      document.getElementById('f-search').addEventListener('click', () => {
        currentFilters = {
          ref_date: document.getElementById('f-ref-date').value,
          factory: document.getElementById('f-factory').value.trim(),
          lot_no: document.getElementById('f-lot-no').value.trim(),
          item_name: document.getElementById('f-item-name').value.trim(),
          cost_center: document.getElementById('f-cost-center').value.trim(),
        };
        currentUnit = document.getElementById('f-unit').value;
        currentPage = 1;
        render();
      });

      document.getElementById('export-excel').addEventListener('click', async () => {
        await API.download(`/api/inventory/export?${buildQuery()}`, '장기재고현황.xlsx');
      });
      document.getElementById('export-ppt').addEventListener('click', async () => {
        await API.download(`/api/inventory/export-ppt?${buildQuery()}`, '장기재고현황.pptx');
      });

      loadTable();
    } catch (err) {
      root.innerHTML = `<div class="error-state">재고조회 화면 오류: ${err.message}</div>`;
    }
  }

  function buildQuery() {
    const params = new URLSearchParams();
    if (currentFilters.ref_date) params.set('ref_date', currentFilters.ref_date);
    if (currentFilters.factory) params.set('factory', currentFilters.factory);
    params.set('unit', currentUnit);
    return params.toString();
  }

  async function loadTable() {
    const el = document.getElementById('inventory-table-section');
    if (!el) return;
    el.innerHTML = `<div class="loading">불러오는 중...</div>`;
    try {
      const params = new URLSearchParams();
      if (currentFilters.ref_date) params.set('ref_date', currentFilters.ref_date);
      if (currentFilters.factory) params.set('factory', currentFilters.factory);
      if (currentFilters.lot_no) params.set('lot_no', currentFilters.lot_no);
      if (currentFilters.item_name) params.set('item_name', currentFilters.item_name);
      if (currentFilters.cost_center) params.set('cost_center', currentFilters.cost_center);
      params.set('unit', currentUnit);
      params.set('page', currentPage);
      params.set('page_size', PAGE_SIZE);

      const data = await API.fetch(`/api/inventory?${params.toString()}`);
      const rows = (data.items || []).map((it) => `
        <tr class="${it.months_label === '7개월이상' ? 'row-critical' : ''}">
          <td>${it.factory || ''}</td>
          <td>${it.item_type || ''}</td>
          <td>${it.lot_no || ''}</td>
          <td>${it.item_name || ''}</td>
          <td>${it.cc_name || '-'}</td>
          <td class="num">${Number(it.weight_ton).toFixed(2)} ton</td>
          <td class="num">${Number(it.amount).toFixed(2)}${FMT.unitLabel(currentUnit)}</td>
          <td>${monthsBadge(it.months_label)}</td>
          <td>${it.plan_type || '-'}</td>
          <td class="${it.has_actual ? 'status-ok' : 'status-bad'}">${it.has_actual ? '조치' : '미조치'}</td>
        </tr>
      `).join('');

      el.innerHTML = `
        <p class="hint">총 ${data.total}건 (${currentPage}페이지 / ${Math.max(1, Math.ceil(data.total / PAGE_SIZE))}페이지)</p>
        <table class="data-table">
          <thead>
            <tr>
              <th>공장</th><th>품목구분</th><th>LOT NO</th><th>품명</th><th>원가중심점</th>
              <th>중량</th><th>금액</th><th>개월</th><th>소진계획방안</th><th>조치여부</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="10">데이터 없음</td></tr>'}</tbody>
        </table>
      `;

      renderPagination(data.total);
    } catch (err) {
      el.innerHTML = `<div class="error-state">목록 로드 오류: ${err.message}</div>`;
    }
  }

  function renderPagination(total) {
    const el = document.getElementById('inventory-pagination');
    if (!el) return;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (totalPages <= 1) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <div class="pagination">
        <button id="page-prev" class="btn-small" ${currentPage <= 1 ? 'disabled' : ''}>이전</button>
        <span>${currentPage} / ${totalPages}</span>
        <button id="page-next" class="btn-small" ${currentPage >= totalPages ? 'disabled' : ''}>다음</button>
      </div>
    `;
    const prevBtn = document.getElementById('page-prev');
    const nextBtn = document.getElementById('page-next');
    if (prevBtn) prevBtn.addEventListener('click', () => { currentPage--; loadTable(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { currentPage++; loadTable(); });
  }

  window.InventoryView = { render };
})();
