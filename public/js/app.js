/* app.js - 메인 앱 셸: 로그인, 탭 라우팅, 권한별 메뉴 제한
   [권한 정책]
   - admin: 대시보드, 파일 업로드, 소진계획 입력, 계획/실적 비교, 사용자 관리 - 전체 접근
   - user : 대시보드, 소진계획 입력, 계획/실적 비교만 접근 (파일 업로드/사용자 관리는 숨김 + 서버에서도 거부됨)
*/
(function () {
  let currentUser = null;
  let currentTab = 'dashboard';

  const ALL_TABS = [
    { id: 'dashboard', label: '대시보드', roles: ['admin', 'user'] },
    { id: 'inventory', label: '장기재고현황 조회', roles: ['admin', 'user'] },
    { id: 'upload',    label: '파일 업로드', roles: ['admin'] },
    { id: 'plans',     label: '소진계획 입력', roles: ['admin', 'user'] },
    { id: 'compare',   label: '계획/실적 비교', roles: ['admin', 'user'] },
    { id: 'users',     label: '사용자 관리', roles: ['admin'] },
  ];

  function visibleTabs() {
    const role = currentUser ? currentUser.role : 'user';
    return ALL_TABS.filter((t) => t.roles.includes(role));
  }

  async function init() {
    try {
      const me = await API.fetch('/api/auth/me');
      console.log('[AUTH] /api/auth/me 응답:', me);
      if (me.logged_in && me.user) {
        currentUser = me.user;
        renderApp();
      } else {
        currentUser = null;
        renderLogin();
      }
    } catch (err) {
      console.error('[AUTH] /api/auth/me 오류:', err);
      currentUser = null;
      renderLogin(err.message);
    }
  }

  function renderLogin(errorMsg) {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="login-screen">
        <div class="login-box">
          <h1>장기재고 소진계획 관리</h1>
          ${errorMsg ? `<div class="error-state">${errorMsg}</div>` : ''}
          <form id="login-form">
            <label>아이디 <input type="text" id="login-username" required></label>
            <label>비밀번호 <input type="password" id="login-password" required></label>
            <button type="submit" class="btn-primary">로그인</button>
          </form>
        </div>
      </div>
    `;
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value;
      const password = document.getElementById('login-password').value;
      try {
        const res = await API.fetch('/api/auth/login', { method: 'POST', body: { username, password } });
        console.log('[AUTH] 로그인 응답:', res);
        if (!res.user) {
          renderLogin('로그인 응답에 사용자 정보가 없습니다. 서버 로그를 확인하세요.');
          return;
        }
        currentUser = res.user;
        currentTab = 'dashboard';
        renderApp();
      } catch (err) {
        console.error('[AUTH] 로그인 오류:', err);
        renderLogin(err.message);
      }
    });
  }

  function renderApp() {
    if (!currentUser) {
      console.error('[APP] currentUser가 비어있어 로그인 화면으로 돌아갑니다.');
      renderLogin('세션 정보를 불러오지 못했습니다. 다시 로그인해주세요.');
      return;
    }

    // 현재 탭이 권한상 보이지 않는 탭이면 대시보드로 강제 이동 (예: user가 새로고침으로 upload에 남아있던 경우)
    const tabs = visibleTabs();
    if (!tabs.find((t) => t.id === currentTab)) {
      currentTab = 'dashboard';
    }

    const app = document.getElementById('app');
    const tabButtons = tabs.map(
      (t) => `<button class="tab-btn ${currentTab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`
    ).join('');

    app.innerHTML = `
      <header class="topbar">
        <h1>장기재고 소진계획 관리</h1>
        <div class="topbar-right">
          <span>${currentUser.display_name || currentUser.username || '사용자'}
            <em class="role-badge">${currentUser.role === 'admin' ? '관리자' : '일반사용자'}</em>
          </span>
          <button id="logout-btn" class="btn-small">로그아웃</button>
        </div>
      </header>
      <nav class="tabs main-tabs">${tabButtons}</nav>
      <main id="main-content">
        <div id="dashboard-root" style="${currentTab === 'dashboard' ? '' : 'display:none'}"></div>
        <div id="inventory-root" style="${currentTab === 'inventory' ? '' : 'display:none'}"></div>
        <div id="upload-root" style="${currentTab === 'upload' ? '' : 'display:none'}"></div>
        <div id="plans-root" style="${currentTab === 'plans' ? '' : 'display:none'}"></div>
        <div id="compare-root" style="${currentTab === 'compare' ? '' : 'display:none'}"></div>
        <div id="users-root" style="${currentTab === 'users' ? '' : 'display:none'}"></div>
      </main>
    `;

    document.getElementById('logout-btn').addEventListener('click', async () => {
      await API.fetch('/api/auth/logout', { method: 'POST' });
      currentUser = null;
      renderLogin();
    });

    document.querySelectorAll('.main-tabs .tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentTab = btn.dataset.tab;
        renderApp();
        loadActiveTab();
      });
    });

    loadActiveTab();
  }

  function loadActiveTab() {
    if (currentTab === 'dashboard') Dashboard.load();
    else if (currentTab === 'inventory') InventoryView.render();
    else if (currentTab === 'upload') Upload.render();
    else if (currentTab === 'plans') Plans.render();
    else if (currentTab === 'compare') Compare.render();
    else if (currentTab === 'users') Users.render();
  }

  window.addEventListener('DOMContentLoaded', init);
})();
