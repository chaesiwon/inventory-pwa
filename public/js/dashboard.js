/* dashboard.js - 대시보드 화면
   요구사항 반영:
   - 첫 줄 KPI 5개에 금액·중량·건수·전월대비금액을 모두 표시
   - 둘째 줄 중복 카드 제거
   - 금액 표기 단위(원/백만원/억원) 선택 가능, 기본값 억원
   - [신규] 공장(전체/임실공장/수원공장) 별, 원가중심점(전체/SMLS압연팀/PCT인발팀 등) 별로
     KPI/TOP20/원가중심점요약/소진계획방안실적을 모두 필터링해서 조회 가능
*/
(function () {
  let currentUnit = 'HM'; // 기본 표기단위: 억원
  let currentRefDate = null;
  let currentFactory = '';
  let currentCostCenter = '';

  function kpiCard({ title, badgeColor, mainAmount, weight, count, prevAmount, sub }) {
    return `
      <div class="kpi-card" style="border-top-color:${badgeColor}">
        <div class="kpi-title">${title}</div>
        <div class="kpi-main">${mainAmount}</div>
        <div class="kpi-sub-row">
          <span class="kpi-sub">${weight}</span>
          <span class="kpi-sub-dot">·</span>
          <span class="kpi-sub">${count}</span>
        </div>
        <div class="kpi-prev">전월: ${prevAmount}</div>
        ${sub ? `<div class="kpi-note">${sub}</div>` : ''}
      </div>
    `;
  }

  function filterQuery() {
    const params = new URLSearchParams();
    if (currentFactory) params.set('factory', currentFactory);
    if (currentCostCenter) params.set('cost_center', currentCostCenter);
    return params.toString();
  }

  async function loadDashboard(refDate) {
    const root = document.getElementById('dashboard-root');
    if (!root) return;
    root.innerHTML = `<div class="loading">대시보드 불러오는 중...</div>`;

    try {
      const refDatesRes = await API.fetch('/api/inventory/ref-dates');
      const refDates = refDatesRes.ref_dates || [];
      if (!refDate) refDate = refDates[0] || null;
      currentRefDate = refDate;

      if (!refDate) {
        root.innerHTML = `<div class="empty-state">업로드된 재고 데이터가 없습니다. 먼저 파일을 업로드하세요.</div>`;
        return;
      }

      const filterOpts = await API.fetch(`/api/inventory/filter-options?ref_date=${refDate}`);
      const fq = filterQuery();
      const kpi = await API.fetch(`/api/dashboard/kpi?ref_date=${refDate}&unit=${currentUnit}${fq ? '&' + fq : ''}`);
      const critical = await API.fetch(`/api/dashboard/critical-stock?ref_date=${refDate}&unit=${currentUnit}${fq ? '&' + fq : ''}`);

      const refDateOptions = refDates.map(
        (rd) => `<option value="${rd}" ${rd === refDate ? 'selected' : ''}>${FMT.date(rd)}</option>`
      ).join('');
      const factoryOptions = `<option value="">전체</option>` + (filterOpts.factories || []).map(
        (f) => `<option value="${f}" ${f === currentFactory ? 'selected' : ''}>${f}</option>`
      ).join('');
      const ccOptions = `<option value="">전체</option>` + (filterOpts.cost_centers || []).map(
        (c) => `<option value="${c.name}" ${c.name === currentCostCenter ? 'selected' : ''}>${c.name}</option>`
      ).join('');

      root.innerHTML = `
        <div class="dash-header">
          <div class="dash-controls">
            <label>기준일자
              <select id="ref-date-select">${refDateOptions}</select>
            </label>
            <label>공장
              <select id="factory-select">${factoryOptions}</select>
            </label>
            <label>원가중심점
              <select id="cc-select">${ccOptions}</select>
            </label>
            <label>금액단위
              <select id="unit-select">
                <option value="HM" ${currentUnit === 'HM' ? 'selected' : ''}>억원</option>
                <option value="MN" ${currentUnit === 'MN' ? 'selected' : ''}>백만원</option>
                <option value="KRW" ${currentUnit === 'KRW' ? 'selected' : ''}>원</option>
              </select>
            </label>
          </div>
        </div>

        <div class="critical-banner">
          <span class="badge-critical" style="font-size:13px; padding:4px 12px">⚠ 7개월이상 집중관리</span>
          <span class="critical-banner-text">
            ${Number(critical.amount).toFixed(2)}${FMT.unitLabel(currentUnit)}
            · ${FMT.weight(critical.weight_ton)} · ${FMT.count(critical.count)}
            — 7개월 이상 장기화된 재고는 우선적으로 소진계획을 검토해야 합니다.
          </span>
        </div>

        <div class="kpi-grid">
          ${kpiCard({
            title: '총 장기재고 금액',
            badgeColor: '#1560A8',
            mainAmount: FMT.amount(kpi.total.amount),
            weight: FMT.weight(kpi.total.weight_ton),
            count: FMT.count(kpi.total.count),
            prevAmount: FMT.amount(kpi.total.prev_amount),
          })}
          ${kpiCard({
            title: '당월 소진 예정',
            badgeColor: '#E97132',
            mainAmount: FMT.amount(kpi.plan_this_month.amount),
            weight: FMT.weight(kpi.plan_this_month.weight_ton),
            count: FMT.count(kpi.plan_this_month.count),
            prevAmount: FMT.amount(kpi.plan_this_month.prev_amount),
            sub: `${kpi.today_month} 계획기한 LOT 기준`,
          })}
          ${kpiCard({
            title: '당월계획분 미조치',
            badgeColor: '#C1001B',
            mainAmount: FMT.amount(kpi.uncompleted_this_month.amount),
            weight: FMT.weight(kpi.uncompleted_this_month.weight_ton),
            count: FMT.count(kpi.uncompleted_this_month.count),
            prevAmount: FMT.amount(kpi.uncompleted_this_month.prev_amount),
            sub: '당월계획 중 실적 미확인',
          })}
          ${kpiCard({
            title: '소진 완료',
            badgeColor: '#196B24',
            mainAmount: FMT.amount(kpi.completed.amount),
            weight: FMT.weight(kpi.completed.weight_ton),
            count: FMT.count(kpi.completed.count),
            prevAmount: FMT.amount(kpi.completed.prev_amount),
            sub: 'LOT단가 × 실적중량',
          })}
        </div>

        <div id="top20-section"></div>
        <div id="plan-type-section"></div>
        <div id="cost-center-section"></div>
      `;

      document.getElementById('ref-date-select').addEventListener('change', (e) => {
        loadDashboard(e.target.value);
      });
      document.getElementById('factory-select').addEventListener('change', (e) => {
        currentFactory = e.target.value;
        loadDashboard(currentRefDate);
      });
      document.getElementById('cc-select').addEventListener('change', (e) => {
        currentCostCenter = e.target.value;
        loadDashboard(currentRefDate);
      });
      document.getElementById('unit-select').addEventListener('change', (e) => {
        currentUnit = e.target.value;
        loadDashboard(currentRefDate);
      });

      loadTop20(refDate);
      loadPlanTypeSummary(refDate);
      loadCostCenterSummary(refDate);
    } catch (err) {
      root.innerHTML = `<div class="error-state">대시보드 오류: ${err.message}</div>`;
      console.error(err);
    }
  }

  async function loadTop20(refDate) {
    const el = document.getElementById('top20-section');
    if (!el) return;
    try {
      const fq = filterQuery();
      const data = await API.fetch(`/api/dashboard/top20?ref_date=${refDate}${fq ? '&' + fq : ''}`);
      const rows = (data.items || []).map((it, i) => `
        <tr class="${it.months_label === '7개월이상' ? 'row-critical' : ''}">
          <td>${i + 1}</td>
          <td>${it.factory || ''}</td>
          <td>${it.lot_no || ''}</td>
          <td>${it.item_name || ''}</td>
          <td>${it.months_label === '7개월이상' ? '<span class="badge-critical">⚠ 7개월이상</span>' : (it.months_label || '')}</td>
          <td class="num">${Number(it.amount).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원</td>
          <td>${it.plan_type || '-'}</td>
          <td class="${it.is_completed ? 'status-ok' : 'status-bad'}">${it.is_completed ? '조치' : '미조치'}</td>
        </tr>
      `).join('');
      el.innerHTML = `
        <h3 class="section-title">고액 상위 20건 (저장품 제외)</h3>
        <p class="hint">7개월이상 장기재고는 빨간 배지로 집중관리 표시됩니다.</p>
        <table class="data-table">
          <thead><tr><th>#</th><th>공장</th><th>LOT NO</th><th>품명</th><th>개월</th><th>금액</th><th>계획유형</th><th>조치여부</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="8">데이터 없음</td></tr>'}</tbody>
        </table>
      `;
    } catch (err) {
      el.innerHTML = `<div class="error-state">TOP20 로드 오류: ${err.message}</div>`;
    }
  }

  async function loadCostCenterSummary(refDate) {
    const el = document.getElementById('cost-center-section');
    if (!el) return;
    try {
      const fq = currentFactory ? `&factory=${encodeURIComponent(currentFactory)}` : '';
      const data = await API.fetch(`/api/dashboard/cost-center-summary?ref_date=${refDate}&unit=${currentUnit}${fq}`);
      const rows = (data.items || []).map((it) => `
        <tr>
          <td>${it.cc_name || '-'}</td>
          <td class="num">${it.item_count}</td>
          <td class="num">${Number(it.total_weight).toFixed(1)} ton</td>
          <td class="num">${Number(it.total_amount).toFixed(2)}${FMT.unitLabel(currentUnit)}</td>
          <td class="num">${it.plan_count}</td>
          <td class="num">${it.actual_count}</td>
        </tr>
      `).join('');
      el.innerHTML = `
        <h3 class="section-title">원가중심점별 현황 (저장품 제외)</h3>
        <table class="data-table">
          <thead><tr><th>원가중심점</th><th>건수</th><th>중량</th><th>금액</th><th>계획등록</th><th>실적확인</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6">데이터 없음</td></tr>'}</tbody>
        </table>
      `;
    } catch (err) {
      el.innerHTML = `<div class="error-state">원가중심점 요약 오류: ${err.message}</div>`;
    }
  }

  async function loadPlanTypeSummary(refDate) {
    const el = document.getElementById('plan-type-section');
    if (!el) return;
    try {
      const fq = currentFactory ? `&factory=${encodeURIComponent(currentFactory)}` : '';
      const data = await API.fetch(`/api/dashboard/cost-center-plan-type-summary?ref_date=${refDate}&unit=${currentUnit}${fq}`);
      const items = data.items || [];
      const rows = items.map((it) => `
        <tr>
          <td>${it.cc_name}</td>
          <td>${it.plan_type}</td>
          <td class="num">${it.plan_count}</td>
          <td class="num">${Number(it.plan_weight).toFixed(1)} ton</td>
          <td class="num">${Number(it.plan_amount).toFixed(2)}${FMT.unitLabel(currentUnit)}</td>
          <td class="num">${it.actual_count}</td>
          <td class="num">${Number(it.actual_weight).toFixed(1)} ton</td>
          <td class="num">${Number(it.actual_amount).toFixed(2)}${FMT.unitLabel(currentUnit)}</td>
        </tr>
      `).join('');
      el.innerHTML = `
        <h3 class="section-title">원가중심점별 소진계획방안 유형별 실적 (저장품 제외)</h3>
        <p class="hint">계획 기준(건수·중량·금액)과 실적 기준(건수·중량·금액)을 함께 비교합니다.
        실적유형이 'Sales'로 시작하면 전환판매 실적, 'WIP'로 시작하면 생산투입 실적으로 집계됩니다.</p>
        <table class="data-table">
          <thead>
            <tr>
              <th>원가중심점</th><th>소진계획방안</th>
              <th colspan="3" style="text-align:center">계획 기준</th>
              <th colspan="3" style="text-align:center">실적 기준</th>
            </tr>
          </thead>
          <thead>
            <tr><th></th><th></th><th>건수</th><th>중량</th><th>금액</th><th>건수</th><th>중량</th><th>금액</th></tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="8">데이터 없음</td></tr>'}</tbody>
        </table>
      `;
    } catch (err) {
      el.innerHTML = `<div class="error-state">소진계획방안 유형별 실적 로드 오류: ${err.message}</div>`;
    }
  }

  window.Dashboard = { load: loadDashboard };
})();
