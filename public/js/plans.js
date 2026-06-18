/* plans.js - 소진계획 입력/관리 화면 */
(function () {
  let activeTab = 'no-plan';

  function render() {
    const root = document.getElementById('plans-root');
    if (!root) return;
    root.innerHTML = `
      <h2>소진계획 입력</h2>
      <div class="tabs">
        <button class="tab-btn ${activeTab === 'no-plan' ? 'active' : ''}" data-tab="no-plan">미등록 재고</button>
        <button class="tab-btn ${activeTab === 'registered' ? 'active' : ''}" data-tab="registered">등록 완료</button>
        <button class="tab-btn ${activeTab === 'bulk' ? 'active' : ''}" data-tab="bulk">일괄 입력</button>
      </div>
      <div id="plans-content"></div>
    `;
    root.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        render();
      });
    });
    if (activeTab === 'no-plan') renderNoPlan();
    else if (activeTab === 'registered') renderRegistered();
    else renderBulk();
  }

  async function renderNoPlan() {
    const el = document.getElementById('plans-content');
    el.innerHTML = `<div class="loading">불러오는 중...</div>`;
    try {
      const data = await API.fetch('/api/plans/no-plan?page_size=100');
      const rows = (data.items || []).map((it) => `
        <tr data-lot="${it.lot_no}">
          <td>${it.factory || ''}</td>
          <td>${it.lot_no}</td>
          <td>${it.item_name || ''}</td>
          <td class="num">${Number(it.amount).toLocaleString('ko-KR')}원</td>
          <td><button class="btn-small btn-plan-input">입력</button></td>
        </tr>
      `).join('');
      el.innerHTML = `
        <p class="hint">총 ${data.total}건의 미등록 재고가 있습니다.</p>
        <table class="data-table">
          <thead><tr><th>공장</th><th>LOT NO</th><th>품명</th><th>금액</th><th>액션</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="5">모든 재고에 계획이 등록되어 있습니다.</td></tr>'}</tbody>
        </table>
        <div id="plan-modal"></div>
      `;
      el.querySelectorAll('.btn-plan-input').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const lot = e.target.closest('tr').dataset.lot;
          openPlanModal(lot);
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
      const data = await API.fetch('/api/plans?page_size=100');
      const rows = (data.items || []).map((it) => `
        <tr>
          <td>${it.lot_no}</td>
          <td>${it.dept || ''}</td>
          <td>${it.plan_type || ''}</td>
          <td>${FMT.date(it.plan_date)}</td>
          <td>${it.detail_plan || ''}</td>
        </tr>
      `).join('');
      el.innerHTML = `
        <p class="hint">총 ${data.total}건 등록됨.
          <a href="#" id="download-template">템플릿 다운로드</a></p>
        <table class="data-table">
          <thead><tr><th>LOT NO</th><th>담당부서</th><th>소진계획방안</th><th>계획기한</th><th>세부계획</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="5">등록된 계획 없음</td></tr>'}</tbody>
        </table>
      `;
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
      <p class="hint">템플릿을 다운로드하여 작성한 뒤 업로드하면, LOT NO 기준으로 일괄 등록(upsert)됩니다.</p>
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

  function openPlanModal(lotNo) {
    const modal = document.getElementById('plan-modal');
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-box">
          <h3>소진계획 입력 - ${lotNo}</h3>
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
            <button id="m-save" class="btn-primary">저장</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('m-cancel').addEventListener('click', () => { modal.innerHTML = ''; });
    document.getElementById('m-save').addEventListener('click', async () => {
      try {
        await API.fetch(`/api/plans/${encodeURIComponent(lotNo)}`, {
          method: 'POST',
          body: {
            dept: document.getElementById('m-dept').value,
            reason: document.getElementById('m-reason').value,
            plan_type: document.getElementById('m-plan-type').value,
            plan_date: document.getElementById('m-plan-date').value,
            detail_plan: document.getElementById('m-detail').value,
          },
        });
        modal.innerHTML = '';
        renderNoPlan();
      } catch (err) {
        alert('저장 실패: ' + err.message);
      }
    });
  }

  window.Plans = { render };
})();
