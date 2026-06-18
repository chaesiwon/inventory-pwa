/* users.js - 사용자 관리 화면 (관리자 전용) */
(function () {
  async function render() {
    const root = document.getElementById('users-root');
    if (!root) return;
    root.innerHTML = `<div class="loading">불러오는 중...</div>`;
    try {
      const data = await API.fetch('/api/users');
      const rows = (data.users || []).map((u) => `
        <tr data-id="${u.id}">
          <td>${u.username}</td>
          <td>${u.display_name || ''}</td>
          <td>${u.role === 'admin' ? '관리자' : '일반사용자'}</td>
          <td>${u.department || '-'}</td>
          <td>${u.is_active ? '활성' : '비활성'}</td>
          <td>${u.last_login || '-'}</td>
          <td>
            <button class="btn-small btn-edit-user">수정</button>
          </td>
        </tr>
      `).join('');

      root.innerHTML = `
        <h2>사용자 관리</h2>
        <p class="hint">일반사용자(user) 권한은 대시보드 · 소진계획 입력 · 계획/실적 비교만 볼 수 있습니다.
        관리자(admin) 권한은 파일 업로드, 사용자 관리를 포함한 모든 화면에 접근합니다.</p>
        <button id="btn-add-user" class="btn-primary" style="margin-bottom:16px">+ 사용자 추가</button>
        <table class="data-table">
          <thead><tr><th>아이디</th><th>이름</th><th>권한</th><th>부서</th><th>상태</th><th>최근로그인</th><th>액션</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="7">등록된 사용자 없음</td></tr>'}</tbody>
        </table>
        <div id="user-modal"></div>
      `;

      document.getElementById('btn-add-user').addEventListener('click', () => openUserModal(null, data.users));
      root.querySelectorAll('.btn-edit-user').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const id = Number(e.target.closest('tr').dataset.id);
          const u = data.users.find((x) => x.id === id);
          openUserModal(u, data.users);
        });
      });
    } catch (err) {
      root.innerHTML = `<div class="error-state">사용자 목록 로드 오류: ${err.message}
        ${err.message.includes('403') || err.message.includes('권한') ? '<br>관리자 계정으로 로그인해야 접근 가능합니다.' : ''}</div>`;
    }
  }

  function openUserModal(user, allUsers) {
    const modal = document.getElementById('user-modal');
    const isEdit = !!user;
    modal.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-box">
          <h3>${isEdit ? `사용자 수정 - ${user.username}` : '사용자 추가'}</h3>
          ${!isEdit ? `<label>아이디 <input type="text" id="u-username" required></label>` : ''}
          <label>이름 <input type="text" id="u-display-name" value="${isEdit ? (user.display_name || '') : ''}" required></label>
          <label>${isEdit ? '비밀번호 변경 (비워두면 유지)' : '비밀번호'}
            <input type="password" id="u-password" ${isEdit ? '' : 'required'}>
          </label>
          <label>권한
            <select id="u-role">
              <option value="user" ${isEdit && user.role === 'user' ? 'selected' : ''}>일반사용자 (대시보드/계획입력/비교만)</option>
              <option value="admin" ${isEdit && user.role === 'admin' ? 'selected' : ''}>관리자 (전체 접근)</option>
            </select>
          </label>
          <label>부서 <input type="text" id="u-department" value="${isEdit ? (user.department || '') : ''}"></label>
          ${isEdit ? `
          <label>상태
            <select id="u-active">
              <option value="1" ${user.is_active ? 'selected' : ''}>활성</option>
              <option value="0" ${!user.is_active ? 'selected' : ''}>비활성</option>
            </select>
          </label>` : ''}
          <div class="modal-actions">
            <button id="u-cancel" class="btn-secondary">취소</button>
            <button id="u-save" class="btn-primary">저장</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('u-cancel').addEventListener('click', () => { modal.innerHTML = ''; });
    document.getElementById('u-save').addEventListener('click', async () => {
      try {
        if (isEdit) {
          const body = {
            display_name: document.getElementById('u-display-name').value,
            role: document.getElementById('u-role').value,
            department: document.getElementById('u-department').value || null,
            is_active: Number(document.getElementById('u-active').value),
          };
          const pw = document.getElementById('u-password').value;
          if (pw) body.password = pw;
          await API.fetch(`/api/users/${user.id}`, { method: 'PUT', body });
        } else {
          const username = document.getElementById('u-username').value.trim();
          const password = document.getElementById('u-password').value;
          if (!username || !password) { alert('아이디와 비밀번호는 필수입니다.'); return; }
          await API.fetch('/api/users', {
            method: 'POST',
            body: {
              username,
              password,
              display_name: document.getElementById('u-display-name').value,
              role: document.getElementById('u-role').value,
              department: document.getElementById('u-department').value || null,
            },
          });
        }
        modal.innerHTML = '';
        render();
      } catch (err) {
        alert('저장 실패: ' + err.message);
      }
    });
  }

  window.Users = { render };
})();
