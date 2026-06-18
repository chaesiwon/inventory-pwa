/* app.js - 메인 앱 셸: 로그인, 탭 라우팅 */
(function () {
  let currentUser = null;
  let currentTab = 'dashboard';

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
    const app = document.getElementById('app');
    app.innerHTML = `
      <header class="topbar">
        <h1>장기재고 소진계획 관리</h1>
        <div class="topbar-right">
          <span>${currentUser.display_name || currentUser.username || '사용자'}</span>
          <button id="logout-btn" class="btn-small">로그아웃</button>
        </div>
      </header>
      <nav class="tabs main-tabs">
        <button class="tab-btn ${currentTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard">대시보드</button>
        <button class="tab-btn ${currentTab === 'upload' ? 'active' : ''}" data-tab="upload">파일 업로드</button>
        <button class="tab-btn ${currentTab === 'plans' ? 'active' : ''}" data-tab="plans">소진계획 입력</button>
        <button class="tab-btn ${currentTab === 'compare' ? 'active' : ''}" data-tab="compare">계획/실적 비교</button>
      </nav>
      <main id="main-content">
        <div id="dashboard-root" style="${currentTab === 'dashboard' ? '' : 'display:none'}"></div>
        <div id="upload-root" style="${currentTab === 'upload' ? '' : 'display:none'}"></div>
        <div id="plans-root" style="${currentTab === 'plans' ? '' : 'display:none'}"></div>
        <div id="compare-root" style="${currentTab === 'compare' ? '' : 'display:none'}"></div>
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
    else if (currentTab === 'upload') Upload.render();
    else if (currentTab === 'plans') Plans.render();
    else if (currentTab === 'compare') Compare.render();
  }

  window.addEventListener('DOMContentLoaded', init);
})();
