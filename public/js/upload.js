/* upload.js - 장기재고현황 파일 업로드 */
(function () {
  function render() {
    const root = document.getElementById('upload-root');
    if (!root) return;
    root.innerHTML = `
      <h2>장기재고현황 파일 업로드</h2>
      <p class="hint">엑셀 파일(.xlsx)을 끌어다 놓거나 선택하세요. 저장품은 자동으로 제외되며,
      파일 안에 여러 조회기준일이 섞여 있으면 각각 별도로 저장됩니다.</p>
      <div id="drop-zone" class="drop-zone">
        <p>여기에 파일을 끌어다 놓거나 클릭하여 선택</p>
        <input type="file" id="file-input" accept=".xlsx" hidden>
      </div>
      <div id="upload-result"></div>
      <h3 class="section-title">업로드 이력</h3>
      <div id="upload-history"></div>
    `;

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) handleUpload(e.target.files[0]);
    });

    loadHistory();
  }

  async function handleUpload(file) {
    const resultEl = document.getElementById('upload-result');
    resultEl.innerHTML = `<div class="loading">업로드 중... (${file.name})</div>`;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await API.fetch('/api/upload', { method: 'POST', body: formData });

      const warningsHtml = (res.warnings || []).map((w) => `<li>${w}</li>`).join('');
      resultEl.innerHTML = `
        <div class="success-box">
          <strong>✅ 업로드 완료</strong>
          <ul>
            <li>재고: ${res.inv_count}건</li>
            <li>재공: ${res.wip_count}건</li>
            <li>실적(상세시트): ${res.act_count}건</li>
            <li>제외된 저장품: ${res.excluded_count}건</li>
            <li>인식된 조회기준일: ${(res.all_ref_dates || []).join(', ')}</li>
          </ul>
          ${warningsHtml ? `<ul class="warning-list">${warningsHtml}</ul>` : ''}
        </div>
      `;
      loadHistory();
    } catch (err) {
      resultEl.innerHTML = `<div class="error-state">업로드 실패: ${err.message}</div>`;
    }
  }

  async function loadHistory() {
    const el = document.getElementById('upload-history');
    if (!el) return;
    try {
      const data = await API.fetch('/api/upload-history');
      const rows = (data.history || []).map((h) => `
        <tr>
          <td>${h.filename}</td>
          <td>${FMT.date(h.ref_date)}</td>
          <td class="num">${h.inv_count}</td>
          <td class="num">${h.wip_count}</td>
          <td class="num">${h.act_count}</td>
          <td>${h.uploaded_by}</td>
          <td>${h.created_at}</td>
        </tr>
      `).join('');
      el.innerHTML = `
        <table class="data-table">
          <thead><tr><th>파일명</th><th>기준일</th><th>재고</th><th>재공</th><th>실적</th><th>업로더</th><th>시간</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="7">이력 없음</td></tr>'}</tbody>
        </table>
      `;
    } catch (err) {
      el.innerHTML = `<div class="error-state">이력 로드 오류: ${err.message}</div>`;
    }
  }

  window.Upload = { render };
})();
