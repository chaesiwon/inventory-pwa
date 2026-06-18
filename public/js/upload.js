/* upload.js - 장기재고현황 파일 업로드
   [중요] 같은 조회기준일이라도 공장이 다르면 데이터가 서로 보존됩니다(백엔드 v6.1 수정).
   업로드 이력에 공장 정보를 함께 보여주고, 각 업로드 건을 삭제할 수 있는 버튼을 제공합니다.
*/
(function () {
  function render() {
    const root = document.getElementById('upload-root');
    if (!root) return;
    root.innerHTML = `
      <h2>장기재고현황 파일 업로드</h2>
      <p class="hint">엑셀 파일(.xlsx)을 끌어다 놓거나 선택하세요. 저장품은 자동으로 제외되며,
      파일 안에 여러 조회기준일이 섞여 있으면 각각 별도로 저장됩니다.
      <strong>같은 조회기준일이라도 공장이 다른 파일은 서로 영향을 주지 않고 모두 보존됩니다.</strong></p>
      <div id="drop-zone" class="drop-zone">
        <p>여기에 파일을 끌어다 놓거나 클릭하여 선택 (여러 파일을 순서대로 올려도 됩니다)</p>
        <input type="file" id="file-input" accept=".xlsx" hidden>
      </div>
      <div id="upload-result"></div>
      <h3 class="section-title">업로드 이력 (전체 ${'-'} 건)</h3>
      <p class="hint">아래 목록은 지금까지 업로드한 모든 파일입니다. 같은 공장·같은 기준일을 다시 올리면 그 건만 갱신되고, 다른 건은 그대로 유지됩니다.</p>
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
      if (e.dataTransfer.files.length) handleMultipleUpload(Array.from(e.dataTransfer.files));
    });
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) handleMultipleUpload(Array.from(e.target.files));
    });

    loadHistory();
  }

  async function handleMultipleUpload(files) {
    const resultEl = document.getElementById('upload-result');
    resultEl.innerHTML = '';
    for (const file of files) {
      await handleUpload(file, resultEl);
    }
    loadHistory();
  }

  async function handleUpload(file, resultEl) {
    const box = document.createElement('div');
    box.className = 'loading';
    box.textContent = `업로드 중... (${file.name})`;
    resultEl.appendChild(box);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await API.fetch('/api/upload', { method: 'POST', body: formData });

      const warningsHtml = (res.warnings || []).map((w) => `<li>${w}</li>`).join('');
      box.outerHTML = `
        <div class="success-box">
          <strong>✅ ${file.name} 업로드 완료</strong>
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
    } catch (err) {
      box.outerHTML = `<div class="error-state">${file.name} 업로드 실패: ${err.message}</div>`;
    }
  }

  async function loadHistory() {
    const el = document.getElementById('upload-history');
    if (!el) return;
    try {
      const data = await API.fetch('/api/upload-history');
      const history = data.history || [];
      const rows = history.map((h) => `
        <tr data-upload-id="${h.upload_id}">
          <td>${h.filename}</td>
          <td>${FMT.date(h.ref_date)}</td>
          <td class="num">${h.inv_count}</td>
          <td class="num">${h.wip_count}</td>
          <td class="num">${h.act_count}</td>
          <td>${h.uploaded_by}</td>
          <td>${h.created_at}</td>
          <td><button class="btn-small btn-delete-upload" style="background:#C1001B">삭제</button></td>
        </tr>
      `).join('');
      const sectionTitle = document.querySelector('.section-title');
      if (sectionTitle) sectionTitle.textContent = `업로드 이력 (전체 ${history.length} 건)`;
      el.innerHTML = `
        <table class="data-table">
          <thead><tr><th>파일명</th><th>기준일</th><th>재고</th><th>재공</th><th>실적</th><th>업로더</th><th>시간</th><th>액션</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="8">이력 없음</td></tr>'}</tbody>
        </table>
      `;
      el.querySelectorAll('.btn-delete-upload').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          const uploadId = e.target.closest('tr').dataset.uploadId;
          if (!confirm('이 업로드 건의 데이터를 삭제하시겠습니까? 해당 기준일·공장의 재고/실적 데이터가 모두 삭제됩니다.')) return;
          try {
            await API.fetch(`/api/upload/${uploadId}`, { method: 'DELETE' });
            loadHistory();
          } catch (err) {
            alert('삭제 실패: ' + err.message);
          }
        });
      });
    } catch (err) {
      el.innerHTML = `<div class="error-state">이력 로드 오류: ${err.message}</div>`;
    }
  }

  window.Upload = { render };
})();
