/* plans.js - 소진계획 입력/관리 화면
   탭: 미등록 재고(검색필터 + 체크박스 다중선택 일괄입력 + 개별입력) / 등록 완료 / 엑셀 일괄 업로드

   [요구사항 3] 검색 기능: 원가중심점/LOT NO/품명/품목코드 중 하나 이상을 부분일치로 검색.
   여러 조건을 동시에 넣으면 AND로 결합되어 좁혀진다 (예: 원가중심점=PCT + 품명=Plug).
   [요구사항 6] "개월"(장기재고 월령)과 "중량(ton)" 컬럼을 표에 추가.
*/
(function () {
  let activeTab = 'no-plan';
  let selectedLots = new Set();
  let searchFilters = { cost_center: '', lot_no: '', item_name: '', item_code: '' };

  function render() {
    const root = document.getElementById('plans-root');
    if (!root) return;
    root.innerHTML = `
      <h2>소진계획 입력</h2>
      <div class="tabs">
        <button class="tab-btn ${activeTab === 'no-plan' ? 'active' : ''}" data-tab="no-plan">미등록 재고</button>
        <button class="tab-btn ${activeTab === 'registered' ? 'active' : ''}" data-tab="registered">등록 완료</button>
        <button class="tab-btn ${activeTab === 'bulk' ? 'active' : ''}" data-tab="bulk">엑셀 일괄 업로드</button>
      </div>
      <div id="plans-content"></div>
    `;
    root.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        selectedLots = new Set();
        render();
      });
    });
    if (activeTab === 'no-plan') renderNoPlan();
    else if (activeTab === 'registered') renderRegistered();
    else renderBulk();
  }

  function monthsBadge(label) {
    if (label === '7개월이상') return `<span class="badge-critical">⚠ 7개월이상</span>`;
    return label || '';
  }

  function searchBar() {
    return `
      <div class="filter-bar">
        <label>원가중심점 <input type="text" id="s-cost-center" placeholder="예: PCT (부분일치)" value="${searchFilters.cost_center}"></label>
        <label>LOT NO <input type="text" id="s-lot-no" placeholder="LOT 검색" value="${searchFilters.lot_no}"></label>
        <label>품명 <input type="text" id="s-item-name" placeholder="품명 검색" value="${searchFilters.item_name}"></label>
        <label>품목코드 <input type="text" id="s-item-code" placeholder="품목코드 검색" value="${searchFilters.item_code}"></label>
        <button id="s-search-btn" class="btn-primary">검색</button>
        <button id="s-reset-btn" class="btn-secondary">초기화</button>
      </div>
    `;
  }

  function bindSearchBar(container, onSearch) {
    container.querySelector('#s-search-btn').addEventListener('click', () => {
      searchFilters = {
        cost_center: container.querySelector('#s-cost-center').value.trim(),
        lot_no: container.querySelector('#s-lot-no').value.trim(),
        item_name: container.querySelector('#s-item-name').value.trim(),
        item_code: container.querySelector('#s-item-code').value.trim(),
      };
      onSearch();
    });
    container.querySelector('#s-reset-btn').addEventListener('click', () => {
      searchFilters = { cost_center: '', lot_no: '', item_name: '', item_code: '' };
      onSearch();
    });
  }

  function buildSearchQuery() {
    const params = new URLSearchParams();
    params.set('page_size', '200');
    if (searchFilters.cost_center) params.set('cost_center', searchFilters.cost_center);
    if (searchFilters.lot_no) params.set('lot_no', searchFilters.lot_no);
    if (searchFilters.item_name) params.set('item_name', searchFilters.item_name);
    if (searchFilters.item_code) params.set('item_code', searchFilters.item_code);
    return params.toString();
  }

  async function renderNoPlan() {
    const el = document.getElementById('plans-content');
    el.innerHTML = `<div class="loading">불러오는 중...</div>`;
    try {
      const data = await API.fetch(`/api/plans/no-plan?${buildSearchQuery()}`);
      const rows = (data.items || []).map((it) => `
        <tr data-lot="${it.lot_no}" class="${it.months_label === '7개월이상' ? 'row-critical' : ''}">
          <td><input type="checkbox" class="row-check" value="${it.lot_no}"></td>
          <td>${it.factory || ''}</td>
          <td>${it.lot_no}</td>
          <td>${it.item_code || ''}</td>
          <td>${it.item_name || ''}</td>
          <td>${it.cc_name || '-'}</td>
          <td class="num">${Number(it.weight_ton).toFixed(2)} ton</td>
          <td>${monthsBadge(it.months_label)}</td>
          <td class="num">${Number(it.amount).toLocaleString('ko-KR')}원</td>
          <td><button class="btn-small btn-plan-input">개별입력</button></td>
        </tr>
      `).join('');
      el.innerHTML = `
        ${searchBar()}
        <p class="hint">총 ${data.total}건의 미등록 재고가 있습니다. 체크박스로 여러 건을 선택하면 같은 계획정보를 한 번에 입력할 수 있습니다.</p>
        <div class="bulk-action-bar">
          <button id="select-all" class="btn-secondary">전체 선택</button>
          <button id="clear-select" class="btn-secondary">선택 해제</button>
          <span id="selected-count" class="hint" style="margin:0 12px">0건 선택됨</span>
          <button id="bulk-input-btn" class="btn-primary" disabled>선택 항목 일괄입력</button>
        </div>
        <table class="data-table">
          <thead><tr><th></th><th>공장</th><th>LOT NO</th><th>품목코드</th><th>품명</th><th>원가중심점</th><th>중량</th><th>개월</th><th>금액</th><th>액션</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="10">조건에 맞는 미등록 재고가 없습니다.</td></tr>'}</tbody>
        </table>
        <div id="plan-modal"></div>
      `;

      bindSearchBar(el, renderNoPlan);

      const updateSelectedCount = () => {
        document.getElementById('selected-count').textContent = `${selectedLots.size}건 선택됨`;
        document.getElementById('bulk-input-btn').disabled = selectedLots.size === 0;
      };

      el.querySelectorAll('.row-check').forEach((cb) => {
        cb.checked = selectedLots.has(cb.value);
        cb.addEventListener('change', (e) => {
          if (e.target.checked) selectedLots.add(e.target.value);
          else selectedLots.delete(e.target.value);
          updateSelectedCount();
        });
      });

      document.getElementById('select-all').addEventListener('click', () => {
        el.querySelectorAll('.row-check').forEach((cb) => { cb.checked = true; selectedLots.add(cb.value); });
        updateSelectedCount();
      });
      document.getElementById('clear-select').addEventListener('click', () => {
        el.querySelectorAll('.row-check').forEach((cb) => { cb.checked = false; });
        selectedLots = new Set();
        updateSelectedCount();
      });
      document.getElementById('bulk-input-btn').addEventListener('click', () => {
        openPlanModal(Array.from(selectedLots));
      });

      el.querySelectorAll('.btn-plan-input').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const lot = e.target.closest('tr').dataset.lot;
          openPlanModal([lot]);
        });
      });
    } catch (err) {
      el.innerHTML = `<div class="error-state">로드 오류: ${err.message}</div>`;
    }
  }

  async function renderRegistered() {
    const el = document.getElementById('plans-content');
    el.innerHTML = `<div class="loading">불러오는 중...</div>`;
    try {
      const data = await API.fetch(`/api/plans?${buildSearchQuery()}`);
      const rows = (data.items || []).map((it) => `
        <tr class="${it.months_label === '7개월이상' ? 'row-critical' : ''}">
          <td>${it.lot_no}</td>
          <td>${it.item_name || ''}</td>
          <td>${it.cc_name || '-'}</td>
          <td class="num">${Number(it.weight_ton).toFixed(2)} ton</td>
          <td>${it.dept || ''}</td>
          <td>${it.plan_type || ''}</td>
          <td>${FMT.date(it.plan_date)}</td>
          <td>${monthsBadge(it.months_label)}</td>
          <td>${it.detail_plan || ''}</td>
        </tr>
      `).join('');
      el.innerHTML = `
        ${searchBar()}
        <p class="hint">총 ${data.total}건 등록됨.
          <a href="#" id="download-template">템플릿 다운로드</a></p>
        <table class="data-table">
          <thead><tr><th>LOT NO</th><th>품명</th><th>원가중심점</th><th>중량</th><th>담당부서</th><th>소진계획방안</th><th>계획기한</th><th>개월</th><th>세부계획</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="9">조건에 맞는 등록된 계획이 없습니다.</td></tr>'}</tbody>
        </table>
      `;
      bindSearchBar(el, renderRegistered);
      document.getElementById('download-template').addEventListener('click', async (e) => {
        e.preventDefault();
        await API.download('/api/plans/export-template', '소진계획입력템플릿.xlsx');
      });
    } catch (err) {
      el.innerHTML = `<div class="error-state">로드 오류: ${err.message}</div>`;
    }
  }

  function renderBulk() {
    const el = document.getElementById('plans-content');
    el.innerHTML = `
      <p class="hint">템플릿을 다운로드하여 작성한 뒤 업로드하면, LOT NO 기준으로 일괄 등록(upsert)됩니다.
      여러 건을 화면에서 검색해 선택 입력하려면 "미등록 재고" 탭을 이용하세요.</p>
      <button id="dl-template-bulk" class="btn-secondary">템플릿 다운로드</button>
      <div id="bulk-drop" class="drop-zone" style="margin-top:16px">
        <p>여기에 작성된 엑셀 파일을 끌어다 놓으세요</p>
        <input type="file" id="bulk-file-input" accept=".xlsx" hidden>
      </div>
      <div id="bulk-result"></div>
    `;
    document.getElementById('dl-template-bulk').addEventListener('click', async () => {
      await API.download('/api/plans/export-template', '소진계획입력템플릿.xlsx');
    });
    const dz = document.getElementById('bulk-drop');
    const fi = document.getElementById('bulk-file-input');
    dz.addEventListener('click', () => fi.click());
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault(); dz.classList.remove('drag-over');
      if (e.dataTransfer.files.length) handleBulkUpload(e.dataTransfer.files[0]);
    });
    fi.addEventListener('change', (e) => {
      if (e.target.files.length) handleBulkUpload(e.target.files[0]);
    });
  }

  async function handleBulkUpload(file) {
    const resultEl = document.getElementById('bulk-result');
    resultEl.innerHTML = `<div class="loading">업로드 중...</div>`;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await API.fetch('/api/plans/bulk-upload', { method: 'POST', body: formData });
      resultEl.innerHTML = `
        <div class="success-box">
          <strong>✅ 처리 완료</strong>: 성공 ${res.success}건, 실패 ${res.fail}건
          ${res.errors.length ? `<ul class="warning-list">${res.errors.map((e) => `<li>${e}</li>`).join('')}</ul>` : ''}
        </div>
      `;
    } catch (err) {
      resultEl.innerHTML = `<div class="error-state">업로드 실패: ${err.message}</div>`;
    }
  }

  function openPlanModal(lotNos) {
    const modal = document.getElementById('plan-modal');
    const isBulk = lotNos.length > 1;
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-box">
          <h3>소진계획 입력 ${isBulk ? `- 선택한 ${lotNos.length}건 일괄 적용` : `- ${lotNos[0]}`}</h3>
          ${isBulk ? `<p class="hint">아래 입력값이 선택된 ${lotNos.length}개 LOT 전체에 동일하게 적용됩니다.</p>` : ''}
          <label>담당부서
            <select id="m-dept">
              <option value="생산">생산</option>
              <option value="영업">영업</option>
              <option value="구매">구매</option>
            </select>
          </label>
          <label>장기재고사유
            <select id="m-reason">
              <option value="주문 변경">주문 변경</option>
              <option value="주문 취소">주문 취소</option>
              <option value="납품 후 잔량">납품 후 잔량</option>
              <option value="기타">기타</option>
            </select>
          </label>
          <label>소진계획방안
            <select id="m-plan-type">
              <option value="생산투입">생산투입</option>
              <option value="전환 판매">전환 판매</option>
              <option value="폐기">폐기</option>
              <option value="기타">기타</option>
            </select>
          </label>
          <label>소진계획기한 <input type="date" id="m-plan-date"></label>
          <label>세부계획 <textarea id="m-detail"></textarea></label>
          <div class="modal-actions">
            <button id="m-cancel" class="btn-secondary">취소</button>
            <button id="m-save" class="btn-primary">${isBulk ? `${lotNos.length}건 저장` : '저장'}</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('m-cancel').addEventListener('click', () => { modal.innerHTML = ''; });
    document.getElementById('m-save').addEventListener('click', async () => {
      const body = {
        dept: document.getElementById('m-dept').value,
        reason: document.getElementById('m-reason').value,
        plan_type: document.getElementById('m-plan-type').value,
        plan_date: document.getElementById('m-plan-date').value,
        detail_plan: document.getElementById('m-detail').value,
      };
      const saveBtn = document.getElementById('m-save');
      saveBtn.disabled = true;
      saveBtn.textContent = '저장 중...';
      let ok = 0, fail = 0;
      for (const lot of lotNos) {
        try {
          await API.fetch(`/api/plans/${encodeURIComponent(lot)}`, { method: 'POST', body });
          ok++;
        } catch (err) {
          fail++;
          console.error(`저장 실패 (${lot}):`, err.message);
        }
      }
      modal.innerHTML = '';
      selectedLots = new Set();
      if (fail > 0) alert(`${ok}건 저장 완료, ${fail}건 실패했습니다.`);
      renderNoPlan();
    });
  }

  window.Plans = { render };
})();
