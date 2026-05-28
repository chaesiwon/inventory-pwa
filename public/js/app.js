/* ================================================
   장기재고 소진계획 관리 시스템 - app.js
   수정: 로그인/업로드/다운로드 버그 전면 수정
   ================================================ */

// ── API 서버 URL 설정 ─────────────────────────
// index.html의 window.RENDER_URL 값을 읽음
// 로컬(localhost)이면 같은 서버 사용 (빈 문자열)
// Vercel 배포 시 window.RENDER_URL에 Render URL 필수 입력
const API_BASE = (() => {
  const configured = (window.RENDER_URL || '').trim().replace(/\/$/, '');

  // 로컬 개발 환경
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    console.log('[API] 로컬 모드: 상대경로 사용');
    return '';
  }

  // Render URL 미설정 체크
  if (!configured || configured.includes('RENDER_URL_HERE')) {
    console.error('[API] ❌ window.RENDER_URL 미설정! index.html을 수정하세요.');
    return '';
  }

  console.log('[API] ✅ API 서버:', configured);
  return configured;
})();

// ── 단위 설정 ────────────────────────────────
const Units = {
  amount: 'KRW', weight: 'ton',
  load() {
    this.amount = localStorage.getItem('u_amt') || 'KRW';
    this.weight = localStorage.getItem('u_wt')  || 'ton';
    const ea = document.getElementById('unit-amount');
    const ew = document.getElementById('unit-weight');
    if (ea) ea.value = this.amount;
    if (ew) ew.value = this.weight;
  },
  save() {
    this.amount = document.getElementById('unit-amount').value;
    this.weight = document.getElementById('unit-weight').value;
    localStorage.setItem('u_amt', this.amount);
    localStorage.setItem('u_wt',  this.weight);
    toast('표기 기준 변경됨', 'inf');
    const act = document.querySelector('.sidebar-menu li.active')?.dataset.page;
    if (act === 'dashboard') Dashboard.load();
    if (act === 'inventory') Inventory.load();
    if (act === 'plans')     Plans.refreshCurrent();
    if (act === 'compare')   Compare.search();
  },
  fmtAmt(v) {
    if (v == null || isNaN(v)) return '-';
    const n = Number(v);
    if (this.amount === 'MN') return (n/1e6).toLocaleString('ko-KR',{maximumFractionDigits:2}) + ' 백만원';
    if (this.amount === 'HM') return (n/1e8).toLocaleString('ko-KR',{maximumFractionDigits:2}) + ' 억원';
    return n.toLocaleString('ko-KR') + '원';
  },
  fmtAmtRaw(v) {
    const n = Number(v || 0);
    if (this.amount === 'MN') return +(n/1e6).toFixed(2);
    if (this.amount === 'HM') return +(n/1e8).toFixed(2);
    return Math.round(n);
  },
  amtLabel() { return this.amount==='MN'?'백만원':this.amount==='HM'?'억원':'원'; },
  fmtWt(v) {
    if (v == null || isNaN(v)) return '-';
    const n = Number(v);
    return this.weight === 'kg'
      ? (n*1000).toLocaleString('ko-KR',{maximumFractionDigits:1}) + ' kg'
      : n.toFixed(3) + ' ton';
  },
  fmtWtRaw(v) {
    const n = Number(v || 0);
    return this.weight === 'kg' ? +(n*1000).toFixed(1) : +n.toFixed(3);
  },
  wtLabel() { return this.weight; },
};

// ── 유틸 ─────────────────────────────────────
const num = v => (v == null ? '-' : Number(v).toLocaleString('ko-KR'));
const dt_ = v => (v ? String(v).slice(0,10) : '-');
const rd_ = v => {
  if (!v) return '-';
  const s = String(v);
  return s.length === 8 ? `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}` : s;
};

// ── 인증 저장소 (localStorage) ────────────────
function getAuth() {
  try { return JSON.parse(localStorage.getItem('_inv_auth') || 'null'); }
  catch { return null; }
}
function setAuth(user, token) {
  try { localStorage.setItem('_inv_auth', JSON.stringify({...user, token})); }
  catch(e) { console.warn('setAuth 실패:', e); }
}
function clearAuth() {
  try { localStorage.removeItem('_inv_auth'); } catch {}
}

// ── 인증 헤더 생성 ─────────────────────────────
// CORS allow_credentials=False 환경에서
// 쿠키 대신 헤더로 인증 정보 전달
function authHeaders(extra) {
  const auth = getAuth();
  const h = { ...(extra || {}) };
  if (auth && auth.id) {
    h['X-User-Id']    = String(auth.id);
    h['X-Auth-Token'] = auth.token || '';
  }
  return h;
}

// ── JSON API 호출 ────────────────────────────
async function api(path, opts = {}, _retry = 0) {
  const url = API_BASE + '/api' + path;
  const headers = authHeaders({ 'Content-Type': 'application/json' });

  let res;
  try {
    res = await fetch(url, {
      ...opts,
      headers: { ...headers, ...(opts.headers || {}) },
    });
  } catch (netErr) {
    console.error('[api] 네트워크 오류:', path, netErr.message);
    if (_retry === 0) {
      await new Promise(r => setTimeout(r, 5000));
      return api(path, opts, 1);
    }
    throw new Error('서버에 연결할 수 없습니다. Render 서버 상태를 확인하세요.');
  }

  // 응답을 텍스트로 먼저 읽기 (빈 응답 안전 처리)
  let text = '';
  try { text = await res.text(); } catch { text = ''; }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    if (text) {
      try { msg = JSON.parse(text).detail || msg; }
      catch { msg = text.slice(0, 120) || msg; }
    }
    if (res.status === 401 && path !== '/auth/me' && path !== '/auth/login') {
      clearAuth();
      msg = '로그인이 만료되었습니다. 새로고침 후 다시 로그인하세요.';
    }
    throw new Error(msg);
  }

  if (!text || !text.trim()) return {};
  try { return JSON.parse(text); }
  catch { throw new Error('서버 응답 파싱 오류'); }
}

// ── FormData 파일 업로드 전용 fetch ───────────
// ★ Content-Type 절대 직접 설정 금지
//   브라우저가 multipart/form-data + boundary 자동 설정함
async function uploadFile(path, formData, _retry = 0) {
  const url = API_BASE + '/api' + path;
  // Content-Type 제외한 헤더만 설정
  const headers = authHeaders();

  console.log('[upload] 요청:', url, '인증ID:', headers['X-User-Id']);

  let res;
  try {
    res = await fetch(url, { method: 'POST', body: formData, headers });
  } catch (netErr) {
    console.error('[upload] 네트워크 오류:', netErr.message);
    if (_retry === 0) {
      toast('⏳ 서버 연결 재시도 중...', 'inf');
      await new Promise(r => setTimeout(r, 8000));
      return uploadFile(path, formData, 1);
    }
    throw new Error('서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.');
  }

  console.log('[upload] 응답 상태:', res.status);

  let text = '';
  try { text = await res.text(); } catch { text = ''; }
  console.log('[upload] 응답 길이:', text.length, '앞80자:', text.slice(0,80));

  // 빈 응답 처리
  if (!text || !text.trim()) {
    if (res.status === 401) throw new Error('로그인이 만료되었습니다. 새로고침 후 다시 로그인하세요.');
    if (_retry === 0) {
      toast('⏳ 서버 응답 대기 중... 재시도합니다', 'inf');
      await new Promise(r => setTimeout(r, 6000));
      return uploadFile(path, formData, 1);
    }
    throw new Error(`서버 응답 없음 (HTTP ${res.status}). Render 대시보드 Logs 탭을 확인하세요.`);
  }

  // HTML 응답(502 등) 처리
  if (text.trim().startsWith('<')) {
    throw new Error(`서버 오류 (HTTP ${res.status}). Render 서버 재시작 중일 수 있습니다.`);
  }

  let d;
  try { d = JSON.parse(text); }
  catch { throw new Error('서버가 잘못된 응답을 반환했습니다: ' + text.slice(0, 100)); }

  if (!res.ok) throw new Error(d.detail || d.error || `HTTP ${res.status} 오류`);
  return d;
}

// ── 다운로드 URL 생성 ─────────────────────────
// 인증 토큰을 쿼리스트링으로 포함 (GET 다운로드용)
function dlUrl(path) {
  const auth = getAuth();
  const sep = path.includes('?') ? '&' : '?';
  const tok = auth ? `${sep}_uid=${auth.id}&_tok=${encodeURIComponent(auth.token || '')}` : '';
  return API_BASE + '/api' + path + tok;
}

// ── Toast 알림 ────────────────────────────────
function toast(msg, type = 'suc') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast ' + type;
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 4000);
}

// ── 페이지네이션 ──────────────────────────────
function paging(wId, total, page, size, fn) {
  const el = document.getElementById(wId);
  if (!el) return;
  const pages = Math.ceil(total / size);
  if (pages <= 1) { el.innerHTML = ''; return; }
  const s = Math.max(1, page-3), e = Math.min(pages, page+3);
  let h = page > 1 ? `<button onclick="${fn}(${page-1})">‹</button>` : '';
  for (let i = s; i <= e; i++) {
    h += `<button class="${i===page?'on':''}" onclick="${fn}(${i})">${i}</button>`;
  }
  if (page < pages) h += `<button onclick="${fn}(${page+1})">›</button>`;
  el.innerHTML = h;
}

// ── 기준일 드롭다운 로드 ─────────────────────
async function loadRefDates() {
  try {
    const d = await api('/inventory/ref-dates');
    const ids = ['dash-ref','top20-ref','inv-ref','noplan-ref','plan-ref','cmp-ref','bulk-inv-ref'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const cur = el.value;
      el.innerHTML = '<option value="">최신</option>';
      (d.ref_dates || []).forEach(r => {
        el.innerHTML += `<option ${r===cur?'selected':''} value="${r}">${rd_(r)}</option>`;
      });
    });
  } catch(e) { console.warn('기준일 로드 실패:', e.message); }
}

// ═══════════════════════════════════════════
// App - 앱 초기화 및 라우팅
// ═══════════════════════════════════════════
const App = {
  async init() {
    Units.load();
    this._bindAll();

    // 1. /auth/me 로 세션 확인
    try {
      const d = await api('/auth/me');
      if (d.logged_in && d.user) {
        setAuth(d.user, getAuth()?.token || '');
        this.showApp(d.user);
        return;
      }
    } catch(e) {
      console.warn('/auth/me 실패:', e.message);
    }

    // 2. localStorage 인증 복원
    const saved = getAuth();
    if (saved && saved.id && saved.token) {
      // 헤더 인증으로 재확인
      try {
        const d2 = await api('/auth/me');
        if (d2.logged_in) { this.showApp(d2.user); return; }
      } catch {}
      // 확인 실패해도 저장된 정보로 진입 (헤더 인증이 주 방식)
      if (saved.username) { this.showApp(saved); return; }
    }

    // 3. 로그인 화면 표시
    document.getElementById('login-screen').style.display = '';
  },

  showApp(user) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = '';
    document.getElementById('sidebar-user').textContent = '👤 ' + (user.display_name || user.username);

    const mu = document.getElementById('menu-users');
    if (mu) mu.style.display = user.role === 'admin' ? '' : 'none';

    document.querySelectorAll('.sidebar-menu li[data-page]').forEach(li => {
      li.onclick = () => {
        if (li.dataset.page === 'users' && user.role !== 'admin') {
          toast('관리자만 접근 가능합니다.', 'err'); return;
        }
        document.querySelectorAll('.sidebar-menu li').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => {
          p.classList.add('hidden'); p.classList.remove('active');
        });
        li.classList.add('active');
        const pg = document.getElementById('page-' + li.dataset.page);
        if (pg) { pg.classList.remove('hidden'); pg.classList.add('active'); }
        if (li.dataset.page === 'dashboard') Dashboard.load();
        if (li.dataset.page === 'inventory') Inventory.search();
        if (li.dataset.page === 'plans')     Plans.init();
        if (li.dataset.page === 'compare')   Compare.init();
        if (li.dataset.page === 'upload')    Upload.loadHist();
        if (li.dataset.page === 'users')     Users.load();
      };
    });

    loadRefDates().then(() => Dashboard.load());
  },

  async login() {
    const errEl = document.getElementById('login-err');
    errEl.textContent = '';

    // Render URL 미설정 경고 (로컬 제외)
    if (!API_BASE && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      errEl.textContent = '⚠️ API 서버 URL이 설정되지 않았습니다. index.html의 window.RENDER_URL을 수정하세요.';
      return;
    }

    const username = (document.getElementById('login-user').value || '').trim();
    const password = document.getElementById('login-pw').value || '';
    if (!username || !password) { errEl.textContent = '아이디와 비밀번호를 입력하세요.'; return; }

    const btn = document.getElementById('login-btn');
    btn.textContent = '로그인 중...'; btn.disabled = true;

    try {
      const d = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setAuth(d.user, d.token || '');
      this.showApp(d.user);
    } catch(e) {
      errEl.textContent = e.message || '로그인 실패';
    } finally {
      btn.textContent = '로그인'; btn.disabled = false;
    }
  },

  async logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    clearAuth();
    location.reload();
  },

  _bindAll() {
    // 로그인
    document.getElementById('login-btn').addEventListener('click', () => this.login());
    document.getElementById('logout-btn').addEventListener('click', () => this.logout());
    ['login-user', 'login-pw'].forEach(id =>
      document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') this.login(); })
    );
    // ESC
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { Modal.close(); AModal.close(); Users.closeModal(); }
    });
    // 모달 버튼
    document.getElementById('modal-close-btn')?.addEventListener('click', () => Modal.close());
    document.getElementById('modal-cancel-btn')?.addEventListener('click', () => Modal.close());
    document.getElementById('modal-save-btn')?.addEventListener('click', () => Modal.save());
    document.getElementById('amodal-close-btn')?.addEventListener('click', () => AModal.close());
    document.getElementById('amodal-cancel-btn')?.addEventListener('click', () => AModal.close());
    document.getElementById('amodal-save-btn')?.addEventListener('click', () => AModal.save());
    document.getElementById('umodal-close-btn')?.addEventListener('click', () => Users.closeModal());
    document.getElementById('umodal-cancel-btn')?.addEventListener('click', () => Users.closeModal());
    document.getElementById('umodal-save-btn')?.addEventListener('click', () => Users.save());
    document.getElementById('user-add-btn')?.addEventListener('click', () => Users.openCreateModal());
    // 업로드 영역
    const upFile = document.getElementById('up-file');
    const zone   = document.getElementById('upload-zone');
    zone?.addEventListener('click', () => upFile.click());
    zone?.addEventListener('dragover', e => e.preventDefault());
    zone?.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files[0]) Upload.do(e.dataTransfer.files[0]); });
    upFile?.addEventListener('change', function() { if (this.files[0]) Upload.do(this.files[0]); this.value=''; });
    document.getElementById('del-all-btn')?.addEventListener('click', () => Upload.deleteAll());
    // 재고현황
    document.getElementById('inv-excel-btn')?.addEventListener('click', () => Inventory.exportExcel());
    document.getElementById('inv-search-btn')?.addEventListener('click', () => Inventory.search());
    document.getElementById('inv-reset-btn')?.addEventListener('click', () => Inventory.reset());
    ['inv-ref','inv-fac','inv-type','inv-dept'].forEach(id =>
      document.getElementById(id)?.addEventListener('change', () => Inventory.search()));
    ['inv-lot','inv-iname','inv-cc'].forEach(id => {
      const el = document.getElementById(id);
      el?.addEventListener('input', () => { clearTimeout(el._t); el._t = setTimeout(() => Inventory.search(), 400); });
    });
    // 소진계획
    document.getElementById('plan-tmpl-btn')?.addEventListener('click', () => Plans.downloadTemplate());
    document.getElementById('plan-excel-file')?.addEventListener('change', function() {
      if (this.files[0]) Plans.excelUpload(this.files[0]); this.value='';
    });
    document.getElementById('noplan-search-btn')?.addEventListener('click', () => Plans.loadNoPlan());
    document.getElementById('bulk-clear-btn')?.addEventListener('click', () => Plans.bulkClear());
    document.getElementById('bulk-save-btn')?.addEventListener('click', () => Plans.bulkSave());
    document.getElementById('bulk-select-all-btn')?.addEventListener('click', () => Plans.selectAllBulk());
    document.getElementById('bulk-clear-sel-btn')?.addEventListener('click', () => Plans.clearBulkSel());
    document.getElementById('bulk-inv-ref')?.addEventListener('change', () => { Plans._resetBulk(); Plans.loadBulkInv(); });
    ['bulk-inv-lot','bulk-inv-cc','bulk-inv-iname'].forEach(id => {
      const el = document.getElementById(id);
      el?.addEventListener('input', () => { clearTimeout(el._t); el._t = setTimeout(() => { Plans._resetBulk(); Plans.loadBulkInv(); }, 400); });
    });
    ['noplan-ref','noplan-fac'].forEach(id => document.getElementById(id)?.addEventListener('change', () => Plans.loadNoPlan()));
    ['noplan-iname','noplan-cc','noplan-lot'].forEach(id => {
      const el = document.getElementById(id);
      el?.addEventListener('input', () => { clearTimeout(el._t); el._t = setTimeout(() => Plans.loadNoPlan(), 400); });
    });
    ['plan-ref','plan-fac','plan-dept','plan-type'].forEach(id =>
      document.getElementById(id)?.addEventListener('change', () => Plans.loadRegistered()));
    ['plan-lot','plan-cc'].forEach(id => {
      const el = document.getElementById(id);
      el?.addEventListener('input', () => { clearTimeout(el._t); el._t = setTimeout(() => Plans.loadRegistered(), 400); });
    });
    // 비교
    document.getElementById('cmp-excel-btn')?.addEventListener('click', () => Compare.exportExcel());
    document.getElementById('cmp-ppt-btn')?.addEventListener('click', () => Compare.exportPpt());
    document.getElementById('cmp-search-btn')?.addEventListener('click', () => Compare.search());
    ['cmp-ref','cmp-fac','cmp-dept'].forEach(id =>
      document.getElementById(id)?.addEventListener('change', () => Compare.search()));
    // 대시보드
    document.getElementById('dash-ref')?.addEventListener('change', () => Dashboard.load());
    document.getElementById('dash-compare-mode')?.addEventListener('change', () => Dashboard.loadCompare());
    document.getElementById('top20-ref')?.addEventListener('change', () => Dashboard.loadTop20());
    // 탭
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab; if (!tab) return;
        const page = btn.closest('.page');
        page?.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (tab.startsWith('cmp-')) {
          document.getElementById('tab-cmp-summary')?.classList.toggle('hidden', tab !== 'cmp-summary');
          document.getElementById('tab-cmp-list')?.classList.toggle('hidden',    tab !== 'cmp-list');
          Compare.search();
        } else {
          ['noplan','registered','bulk'].forEach(t =>
            document.getElementById('tab-'+t)?.classList.toggle('hidden', tab !== t));
          Plans._resetBulk();
          Plans.currentTab = tab;
          if (tab === 'noplan')     Plans.loadNoPlan();
          if (tab === 'registered') Plans.loadRegistered();
          if (tab === 'bulk')       Plans.loadBulkInv();
        }
      });
    });
  },
};

// ═══════════════════════════════════════════
// Dashboard
// ═══════════════════════════════════════════
const Dashboard = {
  charts: {},
  async load() {
    const rd = document.getElementById('dash-ref')?.value || '';
    const qs = rd ? '?ref_date=' + rd : '';
    try {
      const [kpi, trend, pw, cc] = await Promise.all([
        api('/dashboard/kpi' + qs),
        api('/dashboard/monthly-trend'),
        api('/dashboard/plan-weight-trend'),
        api('/dashboard/cost-center-summary' + qs),
      ]);
      this._renderKpi(kpi);
      this._renderTrend(trend.trend || []);
      this._renderPlanWt(pw.trend || []);
      this._renderCC(cc.items || []);
      this.loadTop20();
      this.loadCompare();
    } catch(e) { toast('대시보드 오류: ' + e.message, 'err'); }
  },
  _renderKpi(d) {
    document.getElementById('kpi-grid').innerHTML = `
      <div class="kpi c1"><div class="kpi-label">총 장기재고 금액</div>
        <div class="kpi-value">${Units.fmtAmt(d.total_amount)}</div>
        <div class="kpi-sub">${num(d.total_count)}건 | ${Units.fmtWt(d.total_weight_ton)}</div></div>
      <div class="kpi c2"><div class="kpi-label">당월 소진 예정</div>
        <div class="kpi-value">${Units.fmtAmt(d.plan_this_month)}</div>
        <div class="kpi-sub">이번달 소진계획</div></div>
      <div class="kpi c3"><div class="kpi-label">미조치 (계획미등록)</div>
        <div class="kpi-value">${Units.fmtAmt(d.uncompleted_amount)}</div>
        <div class="kpi-sub">계획 미등록 금액</div></div>
      <div class="kpi c4"><div class="kpi-label">소진 완료</div>
        <div class="kpi-value">${Units.fmtAmt(d.completed_amount)}</div>
        <div class="kpi-sub">계획+실적 확인됨</div></div>
      <div class="kpi c5"><div class="kpi-label">소진금액 (전월대비)</div>
        <div class="kpi-value">${Units.fmtAmt(d.total_consumed_amount)}</div>
        <div class="kpi-sub">LOT 수량 감소분</div></div>`;
  },
  _ch(id, cfg) {
    if (this.charts[id]) this.charts[id].destroy();
    const el = document.getElementById(id);
    if (el) this.charts[id] = new Chart(el.getContext('2d'), cfg);
  },
  _renderTrend(t) {
    this._ch('chart-trend', { type:'line', data: {
      labels: t.map(r => rd_(r.ref_date)),
      datasets: [
        { label:`장기재고(${Units.amtLabel()})`, tension:.3, fill:true,
          borderColor:'#1a56db', backgroundColor:'rgba(26,86,219,.08)',
          data: t.map(r => Units.fmtAmtRaw(r.total_amount)) },
        { label:`소진금액(${Units.amtLabel()})`, type:'bar',
          backgroundColor:'rgba(5,150,105,.5)',
          data: t.map(r => Units.fmtAmtRaw(r.total_consumed)) },
      ]
    }, options:{responsive:true,plugins:{legend:{position:'top'}}} });
  },
  _renderPlanWt(t) {
    const b = document.getElementById('plan-wt-badge'); if (b) b.textContent = Units.wtLabel();
    this._ch('chart-plan-wt', { type:'bar', data: {
      labels: t.map(r => r.plan_month || '-'),
      datasets: [
        { label:`계획중량(${Units.wtLabel()})`, backgroundColor:'rgba(26,86,219,.65)',
          data: t.map(r => Units.fmtWtRaw(r.plan_weight_ton)) },
        { label:'계획건수', type:'line', yAxisID:'y2', tension:.3,
          borderColor:'#d97706', data: t.map(r => r.plan_count) },
      ]
    }, options:{responsive:true,
      scales:{y:{title:{display:true,text:Units.wtLabel()}},
               y2:{position:'right',grid:{drawOnChartArea:false}}}} });
  },
  _renderCC(items) {
    document.getElementById('cc-body').innerHTML = items.map(r => `<tr>
      <td>${r.cc_name||'-'}</td><td class="num">${num(r.item_count)}</td>
      <td class="num">${Units.fmtWt(r.total_weight)}</td>
      <td class="num">${Units.fmtAmt(r.total_amount)}</td>
      <td class="num">${Units.fmtAmt(r.consumed_amount)}</td>
      <td class="num">${num(r.plan_count)}</td>
      <td class="num">${num(r.actual_count)}</td>
      <td class="num">${r.item_count ? ((r.actual_count/r.item_count)*100).toFixed(1)+'%' : '0%'}</td>
    </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;padding:20px;color:#9ca3af">데이터 없음</td></tr>';
  },
  async loadTop20() {
    const rd = document.getElementById('top20-ref')?.value || '';
    try {
      const d = await api('/dashboard/top20' + (rd ? '?ref_date=' + rd : ''));
      const rows = (d.items||[]).map((r,i) => `<tr>
        <td>${i+1}</td><td>${r.factory}</td><td>${r.item_type}</td>
        <td title="${r.item_name}">${(r.item_name||'').slice(0,18)}</td>
        <td>${r.cc_name||r.cost_center||'-'}</td><td>${r.lot_no}</td>
        <td class="num">${Units.fmtWt(r.weight_ton)}</td>
        <td class="num">${Units.fmtAmt(r.amount)}</td>
        <td class="num">${Units.fmtAmt(r.amount_consumed)}</td>
        <td>${rd_(r.base_date)}</td><td>${r.plan_type||'-'}</td>
        <td><span class="badge ${r.is_completed?'b-ok':'b-warn'}">${r.is_completed?'완료':'미완료'}</span></td>
        <td><button class="btn btn-xs btn-outline"
          onclick="Modal.open('${r.lot_no}','${(r.item_name||'').replace(/'/g,"\\'")}',${r.amount||0},${r.weight_ton||0})">계획입력</button></td>
      </tr>`).join('');
      document.getElementById('top20-wrap').innerHTML = `<table class="data-table"><thead><tr>
        <th>순위</th><th>공장</th><th>품목구분</th><th>품명</th><th>원가중심점</th>
        <th>LOT NO</th><th>중량</th><th>금액</th><th>소진금액</th><th>기준일자</th>
        <th>소진계획</th><th>완료여부</th><th>편집</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
    } catch(e) { console.warn('TOP20 오류:', e.message); }
  },
  async loadCompare() {
    const rd   = document.getElementById('dash-ref')?.value || '';
    const mode = document.getElementById('dash-compare-mode')?.value || 'month';
    try {
      const d = await api('/dashboard/period-compare?' + new URLSearchParams({ref_date:rd,mode}));
      const cur=d.current, prv=d.previous, lbl=d.mode_label||'전월';
      if (!cur) { document.getElementById('compare-cards').innerHTML=''; return; }
      document.getElementById('compare-cards').innerHTML = [
        {label:`총 금액 (${lbl} 대비)`, cur:Units.fmtAmt(cur.total_amount),   prev:prv?Units.fmtAmt(prv.total_amount):'이전 없음'},
        {label:`조치 금액 (${lbl} 대비)`, cur:Units.fmtAmt(cur.action_amount), prev:prv?Units.fmtAmt(prv.action_amount):'이전 없음'},
        {label:`소진 금액 (${lbl} 대비)`, cur:Units.fmtAmt(cur.consumed_amount),prev:prv?Units.fmtAmt(prv.consumed_amount):'이전 없음'},
      ].map(c => `<div class="cmp-card">
        <div class="cmp-card-title">${c.label}</div>
        <div class="cmp-card-value">${c.cur}</div>
        <div style="color:#6b7280;font-size:12px;margin-top:4px">전기: ${c.prev}</div>
      </div>`).join('');
    } catch(e) { console.warn('비교 로드 오류:', e.message); }
  },
};

// ═══════════════════════════════════════════
// Inventory
// ═══════════════════════════════════════════
const Inventory = {
  pg: 1,
  get p() {
    return {
      ref_date:    document.getElementById('inv-ref')?.value   || '',
      factory:     document.getElementById('inv-fac')?.value   || '',
      item_type:   document.getElementById('inv-type')?.value  || '',
      lot_no:      (document.getElementById('inv-lot')?.value  || '').trim(),
      item_name:   (document.getElementById('inv-iname')?.value|| '').trim(),
      cost_center: (document.getElementById('inv-cc')?.value   || '').trim(),
      dept:        document.getElementById('inv-dept')?.value  || '',
    };
  },
  search() { this.pg = 1; this.load(); },
  reset() {
    ['inv-ref','inv-fac','inv-type','inv-dept'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    ['inv-lot','inv-iname','inv-cc'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    this.search();
  },
  async load() {
    try {
      const qs = new URLSearchParams({...this.p, page:this.pg, page_size:50});
      const d  = await api('/inventory?' + qs);
      document.getElementById('inv-info').innerHTML =
        `<b>총 ${num(d.total)}건</b> · 기준일: <b>${rd_(d.ref_date)}</b>`;
      document.getElementById('inv-tbody').innerHTML = (d.items||[]).map(r => `<tr>
        <td>${r.factory}</td><td>${r.item_type}</td><td>${r.item_code}</td>
        <td title="${r.item_name}">${(r.item_name||'').slice(0,22)}</td>
        <td>${r.cc_name||r.cost_center||'-'}</td><td>${r.lot_no}</td>
        <td class="num">${Units.fmtWt(r.weight_ton)}</td>
        <td class="num">${Units.fmtAmt(r.amount)}</td>
        <td class="num">${Units.fmtAmt(r.amount_consumed)}</td>
        <td>${rd_(r.base_date)}</td><td>${r.months_label||'-'}</td>
        <td><span class="badge ${r.is_new?'b-new':'b-old'}">${r.is_new?'신규':'기존'}</span></td>
        <td>${r.dept||'-'}</td><td>${r.plan_type||'-'}</td><td>${r.plan_date||'-'}</td>
        <td><span class="badge ${r.has_actual?'b-ok':'b-warn'}">${r.has_actual?'있음':'없음'}</span></td>
      </tr>`).join('') || '<tr><td colspan="16" style="text-align:center;padding:24px;color:#9ca3af">결과 없음</td></tr>';
      paging('inv-page', d.total, d.page, 50, 'Inventory.goPage');
    } catch(e) { toast('재고 조회 오류: ' + e.message, 'err'); }
  },
  goPage(p) { this.pg = p; this.load(); },
  exportExcel() { window.open(dlUrl('/inventory/export?' + new URLSearchParams(this.p))); },
};

// ═══════════════════════════════════════════
// Plans
// ═══════════════════════════════════════════
const Plans = {
  currentTab: 'noplan', noplanPg:1, regPg:1, bulkInvPg:1,
  bulkSel: new Set(),
  init() { this.loadNoPlan(); },
  refreshCurrent() {
    if (this.currentTab==='noplan')     this.loadNoPlan();
    if (this.currentTab==='registered') this.loadRegistered();
    if (this.currentTab==='bulk')       this.loadBulkInv();
  },
  _resetBulk() {
    this.bulkSel.clear();
    document.querySelectorAll('.bulk-chk').forEach(cb => cb.checked = false);
    const ta = document.getElementById('bulk-lots'); if (ta) ta.value = '';
  },

  async loadNoPlan() {
    const qs = new URLSearchParams({
      ref_date:    document.getElementById('noplan-ref')?.value   || '',
      factory:     document.getElementById('noplan-fac')?.value   || '',
      item_name:   (document.getElementById('noplan-iname')?.value|| '').trim(),
      cost_center: (document.getElementById('noplan-cc')?.value   || '').trim(),
      lot_no:      (document.getElementById('noplan-lot')?.value  || '').trim(),
      page: this.noplanPg, page_size: 50,
    });
    try {
      const d = await api('/plans/no-plan?' + qs);
      const b = document.getElementById('noplan-cnt'); if (b) b.textContent = d.total || '';
      document.getElementById('noplan-info').innerHTML = `<b>소진계획 미등록: ${num(d.total)}건</b>`;
      document.getElementById('noplan-tbody').innerHTML = (d.items||[]).map(r => `<tr>
        <td>${r.factory}</td><td>${r.item_type}</td><td>${r.item_code}</td>
        <td title="${r.item_name}">${(r.item_name||'').slice(0,22)}</td>
        <td>${r.cc_name||'-'}</td><td>${r.lot_no}</td>
        <td class="num">${Units.fmtWt(r.weight_ton)}</td>
        <td class="num">${Units.fmtAmt(r.amount)}</td>
        <td>${rd_(r.base_date)}</td>
        <td><span class="badge ${r.is_new?'b-new':'b-old'}">${r.is_new?'신규':'기존'}</span></td>
        <td><button class="btn btn-xs btn-primary"
          onclick="Modal.open('${r.lot_no}','${(r.item_name||'').replace(/'/g,"\\'")}',${r.amount||0},${r.weight_ton||0})">입력</button></td>
      </tr>`).join('') || '<tr><td colspan="11" style="text-align:center;padding:24px;color:#9ca3af">미등록 재고 없음 ✅</td></tr>';
      paging('noplan-page', d.total, d.page, 50, 'Plans.noplanGoPage');
    } catch(e) { toast('조회 오류: ' + e.message, 'err'); }
  },
  noplanGoPage(p) { this.noplanPg = p; this.loadNoPlan(); },

  async loadRegistered() {
    const qs = new URLSearchParams({
      ref_date:    document.getElementById('plan-ref')?.value   || '',
      factory:     document.getElementById('plan-fac')?.value   || '',
      dept:        document.getElementById('plan-dept')?.value  || '',
      plan_type:   document.getElementById('plan-type')?.value  || '',
      lot_no:      (document.getElementById('plan-lot')?.value  || '').trim(),
      cost_center: (document.getElementById('plan-cc')?.value   || '').trim(),
      page: this.regPg, page_size: 50,
    });
    try {
      const d = await api('/plans?' + qs);
      document.getElementById('plan-info').innerHTML = `<b>등록 완료: ${num(d.total)}건</b>`;
      document.getElementById('plan-tbody').innerHTML = (d.items||[]).map(r => `<tr>
        <td>${r.factory}</td><td>${r.item_type}</td><td>${r.item_code}</td>
        <td title="${r.item_name}">${(r.item_name||'').slice(0,22)}</td>
        <td>${r.cc_name||'-'}</td><td>${r.lot_no}</td>
        <td class="num">${Units.fmtWt(r.weight_ton)}</td>
        <td class="num">${Units.fmtAmt(r.amount)}</td>
        <td>${rd_(r.base_date)}</td>
        <td>${r.dept||'-'}</td><td>${r.reason||'-'}</td>
        <td>${r.plan_type||'-'}</td><td>${r.plan_date||'-'}</td>
        <td title="${r.detail_plan||''}">${(r.detail_plan||'').slice(0,12)||'-'}</td>
        <td>${r.created_by_name||r.created_by||'-'}</td>
        <td>${r.plan_created_at?r.plan_created_at.slice(0,16):'-'}</td>
        <td style="display:flex;gap:3px">
          <button class="btn btn-xs btn-outline"
            onclick="Modal.open('${r.lot_no}','${(r.item_name||'').replace(/'/g,"\\'")}',${r.amount||0},${r.weight_ton||0})">수정</button>
          <button class="btn btn-xs btn-danger" onclick="Plans.deletePlan('${r.lot_no}')">삭제</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="17" style="text-align:center;padding:24px;color:#9ca3af">결과 없음</td></tr>';
      paging('plan-page', d.total, d.page, 50, 'Plans.regGoPage');
    } catch(e) { toast('조회 오류: ' + e.message, 'err'); }
  },
  regGoPage(p) { this.regPg = p; this.loadRegistered(); },

  async deletePlan(lot_no) {
    if (!confirm(`LOT NO: ${lot_no}\n소진계획을 삭제하시겠습니까?`)) return;
    try {
      await api('/plans/' + encodeURIComponent(lot_no), {method:'DELETE'});
      toast('삭제 완료'); this.loadRegistered(); this.loadNoPlan();
    } catch(e) { toast('삭제 오류: ' + e.message, 'err'); }
  },

  async loadBulkInv() {
    this._resetBulk();
    const qs = new URLSearchParams({
      ref_date:    document.getElementById('bulk-inv-ref')?.value   || '',
      lot_no:      (document.getElementById('bulk-inv-lot')?.value  || '').trim(),
      cost_center: (document.getElementById('bulk-inv-cc')?.value   || '').trim(),
      item_name:   (document.getElementById('bulk-inv-iname')?.value|| '').trim(),
      page: this.bulkInvPg, page_size: 50,
    });
    try {
      const d = await api('/inventory?' + qs);
      document.getElementById('bulk-inv-tbody').innerHTML = (d.items||[]).map(r => `<tr>
        <td><input type="checkbox" class="bulk-chk" value="${r.lot_no}"
          onchange="Plans._toggleBulk('${r.lot_no}',this.checked)"></td>
        <td>${r.factory}</td><td>${r.item_code}</td>
        <td title="${r.item_name}">${(r.item_name||'').slice(0,20)}</td>
        <td>${r.cc_name||'-'}</td><td>${r.lot_no}</td>
        <td class="num">${Units.fmtWt(r.weight_ton)}</td>
        <td class="num">${Units.fmtAmt(r.amount)}</td>
        <td>${rd_(r.base_date)}</td>
      </tr>`).join('') || '<tr><td colspan="9" style="text-align:center;padding:20px;color:#9ca3af">데이터 없음</td></tr>';
      paging('bulk-inv-page', d.total, d.page, 50, 'Plans.bulkInvGoPage');
    } catch(e) { toast('재고 로드 오류: ' + e.message, 'err'); }
  },
  bulkInvGoPage(p) { this.bulkInvPg = p; this.loadBulkInv(); },
  _toggleBulk(lot, checked) {
    checked ? this.bulkSel.add(lot) : this.bulkSel.delete(lot);
    this._syncLots();
  },
  _syncLots() {
    const ta = document.getElementById('bulk-lots');
    const ex = ta.value.split('\n').map(s=>s.trim()).filter(Boolean);
    ta.value = [...new Set([...ex, ...this.bulkSel])].join('\n');
  },
  selectAllBulk() {
    this._resetBulk();
    document.querySelectorAll('.bulk-chk').forEach(cb => { cb.checked=true; this.bulkSel.add(cb.value); });
    this._syncLots();
  },
  clearBulkSel() { this._resetBulk(); },

  async bulkSave() {
    const dept   = document.getElementById('bulk-dept')?.value   || '';
    const reason = document.getElementById('bulk-reason')?.value || '';
    const ptype  = document.getElementById('bulk-ptype')?.value  || '';
    const pdate  = document.getElementById('bulk-date')?.value   || '';
    const detail = document.getElementById('bulk-detail')?.value || '';
    const lots   = (document.getElementById('bulk-lots')?.value || '').split('\n').map(s=>s.trim()).filter(Boolean);
    if (!dept||!reason||!ptype||!pdate) { toast('필수 항목을 모두 입력하세요.','err'); return; }
    if (!lots.length) { toast('LOT NO를 입력하거나 목록에서 선택하세요.','err'); return; }
    const res = document.getElementById('bulk-result');
    res.className='inf'; res.textContent=`⏳ ${lots.length}건 저장 중...`; res.classList.remove('hidden');
    let ok=0, fail=0, errors=[];
    for (const lot of lots) {
      try {
        await api('/plans/'+encodeURIComponent(lot), {method:'POST', body:JSON.stringify({dept,reason,plan_type:ptype,plan_date:pdate,detail_plan:detail})});
        ok++;
      } catch(e) { fail++; errors.push(`${lot}: ${e.message}`); }
    }
    res.className = fail===0 ? 'suc' : 'err';
    res.innerHTML = `${fail===0?'✅':'⚠️'} 완료 — 성공 <b>${ok}건</b>, 실패 <b>${fail}건</b>` +
      (errors.length ? '<br><small>' + errors.slice(0,3).join('<br>') + '</small>' : '');
    if (ok>0) { toast(`${ok}건 저장 완료`); this.loadNoPlan(); }
  },
  bulkClear() {
    ['bulk-dept','bulk-reason','bulk-ptype'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    const bd=document.getElementById('bulk-date'); if(bd) bd.value='';
    const bdt=document.getElementById('bulk-detail'); if(bdt) bdt.value='';
    this._resetBulk();
    const r=document.getElementById('bulk-result'); if(r) r.classList.add('hidden');
  },
  downloadTemplate() {
    const rd = document.getElementById('plan-ref')?.value || '';
    window.open(dlUrl('/plans/export-template' + (rd ? '?ref_date='+rd : '')));
  },
  async excelUpload(file) {
    const fd = new FormData(); fd.append('file', file);
    try {
      const d = await uploadFile('/plans/bulk-upload', fd);
      toast(`✅ 업로드 완료: 성공 ${d.success}건${d.fail?', 실패 '+d.fail+'건':''}`);
      this.loadRegistered(); this.loadNoPlan();
    } catch(e) { toast('❌ ' + e.message, 'err'); }
  },
};

// ═══════════════════════════════════════════
// Upload
// ═══════════════════════════════════════════
const Upload = {
  async do(file) {
    const resEl = document.getElementById('up-result');
    resEl.className = 'inf';
    resEl.textContent = '⏳ 서버 연결 확인 중...';
    resEl.classList.remove('hidden');

    // cold start 대응: /health ping 먼저
    try {
      const hRes = await fetch(API_BASE + '/health', {
        signal: AbortSignal.timeout(12000)
      });
      if (hRes.ok) {
        resEl.textContent = '⏳ 업로드 처리 중...';
      } else {
        resEl.textContent = '⏳ 서버 시작 중... 잠시 기다려주세요';
        await new Promise(r => setTimeout(r, 5000));
      }
    } catch {
      resEl.textContent = '⏳ 서버 연결 중... (최초 접속 시 30초 소요)';
      await new Promise(r => setTimeout(r, 8000));
    }

    const fd = new FormData(); fd.append('file', file);
    try {
      const d = await uploadFile('/upload', fd);
      resEl.className = 'suc';
      resEl.innerHTML = `✅ <b>업로드 완료!</b><br>
        기준일: <b>${rd_(d.ref_date)}</b><br>
        재고: <b>${d.inv_count}건</b> | 재공: <b>${d.wip_count}건</b> | 실적: <b>${d.act_count}건</b><br>
        총 금액: <b>${Units.fmtAmt(d.total_amount)}</b>`;
      toast('✅ 업로드 완료!');
      loadRefDates();
      this.loadHist();
    } catch(e) {
      resEl.className = 'err';
      resEl.innerHTML = '❌ ' + e.message;
      toast('❌ ' + e.message, 'err');
    }
  },

  async deleteOne(uid, fn) {
    if (!confirm(`파일: ${fn}\n이 업로드 데이터를 삭제하시겠습니까?`)) return;
    try {
      await api('/upload/'+uid, {method:'DELETE'});
      toast('삭제 완료'); loadRefDates(); this.loadHist();
    } catch(e) { toast('삭제 오류: ' + e.message, 'err'); }
  },
  async deleteAll() {
    if (!confirm('⚠️ 전체 업로드 데이터를 삭제합니다.\n소진계획은 유지됩니다.')) return;
    try {
      await api('/upload/all/data', {method:'DELETE'});
      toast('전체 삭제 완료'); loadRefDates(); this.loadHist();
    } catch(e) { toast('삭제 오류: ' + e.message, 'err'); }
  },
  async loadHist() {
    try {
      const d = await api('/upload-history');
      document.getElementById('hist-tbody').innerHTML = (d.history||[]).map(r => `<tr>
        <td title="${r.filename}">${(r.filename||'').slice(0,28)}</td>
        <td>${rd_(r.ref_date)}</td>
        <td class="num">${num(r.inv_count)}</td>
        <td class="num">${num(r.wip_count)}</td>
        <td class="num">${num(r.act_count)}</td>
        <td class="num">${Units.fmtAmt(r.total_amount)}</td>
        <td>${r.uploaded_by||'-'}</td>
        <td>${r.created_at||'-'}</td>
        <td><button class="btn btn-xs btn-danger"
          onclick="Upload.deleteOne('${r.upload_id}','${(r.filename||'').replace(/'/g,"\\'")}')">삭제</button></td>
      </tr>`).join('') || '<tr><td colspan="9" style="text-align:center;padding:20px;color:#9ca3af">이력 없음</td></tr>';
    } catch(e) { console.warn('이력 로드 오류:', e.message); }
  },
};

// ═══════════════════════════════════════════
// Compare
// ═══════════════════════════════════════════
const Compare = {
  pg:1, charts:{},
  init() { this.search(); },
  search() { this.pg=1; this.load(); },
  get p() {
    return {
      ref_date: document.getElementById('cmp-ref')?.value  || '',
      factory:  document.getElementById('cmp-fac')?.value  || '',
      dept:     document.getElementById('cmp-dept')?.value || '',
    };
  },
  _ch(id,cfg) {
    if(this.charts[id]) this.charts[id].destroy();
    const el=document.getElementById(id); if(el) this.charts[id]=new Chart(el.getContext('2d'),cfg);
  },
  async load() {
    try {
      const isSummary = !document.getElementById('tab-cmp-summary')?.classList.contains('hidden');
      if (isSummary) await this._loadSummary();
      else           await this._loadList();
    } catch(e) { toast('비교 오류: ' + e.message, 'err'); }
  },
  async _loadSummary() {
    const [s, pw] = await Promise.all([
      api('/compare/summary?' + new URLSearchParams(this.p)),
      api('/dashboard/plan-weight-trend'),
    ]);
    const pt=s.plan_total||1, ac=s.action_count||0, nc=s.no_action_count||0;
    document.getElementById('cmp-kpi').innerHTML = `
      <div class="kpi c4"><div class="kpi-label">달성률</div>
        <div class="kpi-value">${(ac/pt*100).toFixed(1)}%</div>
        <div class="kpi-sub">조치 ${num(ac)} / 전체 ${num(pt)}</div></div>
      <div class="kpi c3"><div class="kpi-label">미조치 건수</div>
        <div class="kpi-value">${num(nc)}건</div>
        <div class="kpi-sub">${Units.fmtWt(s.no_action_weight)}</div></div>
      <div class="kpi c3" style="border-top-color:#9333ea"><div class="kpi-label">미조치 금액</div>
        <div class="kpi-value">${Units.fmtAmt(s.no_action_amount)}</div></div>
      <div class="kpi c1"><div class="kpi-label">조치 금액</div>
        <div class="kpi-value">${Units.fmtAmt(s.action_amount)}</div>
        <div class="kpi-sub">${Units.fmtWt(s.action_weight)}</div></div>
      <div class="kpi c5"><div class="kpi-label">소진금액</div>
        <div class="kpi-value">${Units.fmtAmt(s.consumed_amount)}</div></div>`;
    const allT=[...new Set([...(s.plan_by_type||[]).map(r=>r.plan_type||'미등록'),...(s.actual_by_type||[]).map(r=>r.actual_type||'기타')])];
    const pM=Object.fromEntries((s.plan_by_type||[]).map(r=>[r.plan_type||'미등록',r]));
    const aM=Object.fromEntries((s.actual_by_type||[]).map(r=>[r.actual_type||'기타',r]));
    this._ch('chart-cmp-count',{type:'bar',data:{labels:allT,datasets:[
      {label:'계획 건수',backgroundColor:'rgba(26,86,219,.7)',data:allT.map(t=>pM[t]?.plan_count||0)},
      {label:'실적 건수',backgroundColor:'rgba(5,150,105,.7)',data:allT.map(t=>aM[t]?.actual_count||0)},
    ]},options:{responsive:true,plugins:{legend:{position:'top'}}}});
    this._ch('chart-cmp-wt',{type:'bar',data:{labels:allT,datasets:[
      {label:`계획(${Units.wtLabel()})`,backgroundColor:'rgba(26,86,219,.7)',data:allT.map(t=>Units.fmtWtRaw(pM[t]?.plan_weight||0))},
      {label:`실적(${Units.wtLabel()})`,backgroundColor:'rgba(5,150,105,.7)',data:allT.map(t=>Units.fmtWtRaw(aM[t]?.actual_weight||0))},
    ]},options:{responsive:true,plugins:{legend:{position:'top'}}}});
    const p=pw.trend||[];
    this._ch('chart-plan-monthly',{type:'bar',data:{
      labels:p.map(r=>r.plan_month||'-'),
      datasets:[{label:`계획중량(${Units.wtLabel()})`,backgroundColor:'rgba(26,86,219,.6)',data:p.map(r=>Units.fmtWtRaw(r.plan_weight_ton))}]
    },options:{responsive:true,scales:{y:{beginAtZero:true}}}});
  },
  async _loadList() {
    const qs = new URLSearchParams({...this.p, page:this.pg, page_size:50});
    const d  = await api('/compare?' + qs);
    document.getElementById('cmp-info').innerHTML = `<b>총 ${num(d.total)}건</b> (계획 등록 LOT 기준)`;
    document.getElementById('cmp-tbody').innerHTML = (d.items||[]).map(r => {
      const match = r.type_match==null ? '<span class="badge b-old">-</span>'
        : r.type_match ? '<span class="badge b-blue">일치</span>'
                       : '<span class="badge b-mismatch">불일치</span>';
      const act = r.action_status==='조치'
        ? '<span class="badge b-action">조치</span>'
        : '<span class="badge b-noaction">미조치</span>';
      return `<tr>
        <td>${r.factory}</td><td>${r.item_type}</td><td>${r.item_code}</td>
        <td title="${r.item_name}">${(r.item_name||'').slice(0,20)}</td>
        <td>${r.cc_name||r.cost_center||'-'}</td><td>${r.lot_no}</td>
        <td class="num">${Units.fmtWt(r.weight_ton)}</td>
        <td class="num">${Units.fmtAmt(r.amount)}</td>
        <td class="num">${Units.fmtAmt(r.amount_consumed)}</td>
        <td>${rd_(r.base_date)}</td><td>${r.dept||'-'}</td>
        <td>${r.plan_type||'-'}</td><td>${r.plan_date||'-'}</td>
        <td>${r.actual_type_manual||r.actual_type||'-'}</td>
        <td>${dt_(r.process_date)}</td>
        <td>${match}</td><td>${act}</td>
        <td>${r.actual_id
          ? `<button class="btn btn-xs btn-outline" onclick="AModal.open(${r.actual_id},'${r.actual_type_manual||r.actual_type||'기타'}')">수정</button>`
          : '-'}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="18" style="text-align:center;padding:24px;color:#9ca3af">결과 없음</td></tr>';
    paging('cmp-page', d.total, d.page, 50, 'Compare.goPage');
  },
  goPage(p) { this.pg=p; this.load(); },
  exportExcel() { window.open(dlUrl('/compare/export?' + new URLSearchParams(this.p))); },
  exportPpt()   { window.open(dlUrl('/compare/export-ppt?' + new URLSearchParams(this.p))); },
};

// ═══════════════════════════════════════════
// Modal / AModal / Users
// ═══════════════════════════════════════════
const Modal = {
  lot: null,
  async open(lot_no, item_name, amount, wt) {
    this.lot = lot_no;
    document.getElementById('modal-info').innerHTML =
      `<b>LOT NO:</b> ${lot_no}<br><b>품명:</b> ${item_name}<br>` +
      `<b>금액:</b> ${Units.fmtAmt(amount)} &nbsp; <b>중량:</b> ${Units.fmtWt(wt)}`;
    try {
      const d = await api('/plans?lot_no_exact=' + encodeURIComponent(lot_no));
      const ex = (d.items||[])[0];
      document.getElementById('f-dept').value   = ex?.dept||'';
      document.getElementById('f-reason').value = ex?.reason||'';
      document.getElementById('f-ptype').value  = ex?.plan_type||'';
      document.getElementById('f-date').value   = ex?.plan_date||'';
      document.getElementById('f-detail').value = ex?.detail_plan||'';
    } catch {}
    document.getElementById('modal').classList.remove('hidden');
  },
  close() { document.getElementById('modal').classList.add('hidden'); },
  async save() {
    const body = {
      dept:        document.getElementById('f-dept').value,
      reason:      document.getElementById('f-reason').value,
      plan_type:   document.getElementById('f-ptype').value,
      plan_date:   document.getElementById('f-date').value,
      detail_plan: document.getElementById('f-detail').value,
    };
    if (!body.dept||!body.reason||!body.plan_type||!body.plan_date) {
      toast('필수 항목을 모두 입력하세요.','err'); return;
    }
    try {
      await api('/plans/'+encodeURIComponent(this.lot), {method:'POST', body:JSON.stringify(body)});
      toast('저장 완료!'); this.close();
      const act = document.querySelector('.sidebar-menu li.active')?.dataset.page;
      if (act==='dashboard') Dashboard.load();
      if (act==='plans')     Plans.refreshCurrent();
      if (act==='compare')   Compare.search();
    } catch(e) { toast('저장 오류: ' + e.message,'err'); }
  },
};

const AModal = {
  id: null,
  open(id, cur) {
    this.id = id;
    document.getElementById('af-type').value = cur || '기타';
    document.getElementById('amodal').classList.remove('hidden');
  },
  close() { document.getElementById('amodal').classList.add('hidden'); },
  async save() {
    try {
      await api('/actuals/'+this.id+'/type', {method:'PATCH',
        body:JSON.stringify({actual_type_manual: document.getElementById('af-type').value})});
      toast('수정 완료!'); this.close(); Compare.search();
    } catch(e) { toast('수정 오류: ' + e.message, 'err'); }
  },
};

const Users = {
  async load() {
    try {
      const d = await api('/users');
      const rL = {admin:'관리자', user:'일반사용자'};
      document.getElementById('users-tbody').innerHTML = (d.users||[]).map(u => `<tr>
        <td>${u.id}</td><td><b>${u.username}</b></td><td>${u.display_name||'-'}</td>
        <td><span class="badge ${u.role==='admin'?'b-blue':'b-old'}">${rL[u.role]||u.role}</span></td>
        <td>${u.department||'-'}</td>
        <td><span class="badge ${u.is_active?'b-ok':'b-warn'}">${u.is_active?'활성':'비활성'}</span></td>
        <td>${u.last_login?u.last_login.slice(0,16):'-'}</td>
        <td style="display:flex;gap:3px">
          <button class="btn btn-xs btn-outline" onclick="Users.openEditModal(${JSON.stringify(u).replace(/"/g,'&quot;')})">수정</button>
          <button class="btn btn-xs ${u.is_active?'btn-danger':'btn-outline'}"
            onclick="Users.toggleActive(${u.id},${u.is_active})">${u.is_active?'비활성화':'활성화'}</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;padding:20px;color:#9ca3af">없음</td></tr>';
    } catch(e) { toast('사용자 목록 오류: ' + e.message, 'err'); }
  },
  openCreateModal() {
    document.getElementById('umodal-title').textContent = '사용자 추가';
    document.getElementById('u-id').value = '';
    document.getElementById('u-username').value = ''; document.getElementById('u-username').disabled = false;
    document.getElementById('u-dname').value = ''; document.getElementById('u-pw').value = '';
    document.getElementById('u-pw-req').textContent = '*';
    document.getElementById('u-role').value = 'user';
    document.getElementById('u-dept').value = ''; document.getElementById('u-active').value = '1';
    document.getElementById('umodal').classList.remove('hidden');
  },
  openEditModal(u) {
    document.getElementById('umodal-title').textContent = '사용자 수정';
    document.getElementById('u-id').value = u.id;
    document.getElementById('u-username').value = u.username; document.getElementById('u-username').disabled = true;
    document.getElementById('u-dname').value = u.display_name||''; document.getElementById('u-pw').value = '';
    document.getElementById('u-pw-req').textContent = '(비워두면 변경 안함)';
    document.getElementById('u-role').value = u.role||'user';
    document.getElementById('u-dept').value = u.department||''; document.getElementById('u-active').value = u.is_active??1;
    document.getElementById('umodal').classList.remove('hidden');
  },
  closeModal() { document.getElementById('umodal').classList.add('hidden'); },
  async save() {
    const uid = document.getElementById('u-id').value;
    const isEdit = !!uid;
    const body = {
      display_name: document.getElementById('u-dname').value,
      role:         document.getElementById('u-role').value,
      department:   document.getElementById('u-dept').value,
      is_active:    parseInt(document.getElementById('u-active').value),
    };
    const pw = document.getElementById('u-pw').value;
    if (pw) body.password = pw;
    try {
      if (isEdit) {
        await api('/users/'+uid, {method:'PUT', body:JSON.stringify(body)});
        toast('수정 완료');
      } else {
        const username = document.getElementById('u-username').value.trim();
        const dname   = document.getElementById('u-dname').value.trim();
        if (!username) { toast('아이디를 입력하세요.','err'); return; }
        if (!pw)       { toast('비밀번호를 입력하세요.','err'); return; }
        if (!dname)    { toast('이름을 입력하세요.','err'); return; }
        await api('/users', {method:'POST', body:JSON.stringify({...body,username,password:pw,display_name:dname})});
        toast('사용자 추가 완료');
      }
      this.closeModal(); this.load();
    } catch(e) { toast('저장 실패: ' + e.message,'err'); }
  },
  async toggleActive(id, cur) {
    if (!confirm(`사용자를 ${cur?'비활성화':'활성화'}하시겠습니까?`)) return;
    try {
      await api('/users/'+id, {method:'PUT', body:JSON.stringify({is_active:cur?0:1})});
      toast('변경 완료'); this.load();
    } catch(e) { toast('변경 실패: ' + e.message,'err'); }
  },
};

// ── 앱 시작
App.init();
