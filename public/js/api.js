/* api.js - API 서버 호출 공통 모듈 */
(function () {
  const RENDER_URL = window.RENDER_URL || '';

  if (!RENDER_URL) {
    console.error('[API] ❌ window.RENDER_URL 미설정! index.html을 수정하세요.');
  } else {
    console.log('[API] ✅ API 서버:', RENDER_URL);
  }

  async function apiFetch(path, options = {}) {
    const url = RENDER_URL + path;
    const opts = {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    };
    if (opts.body && typeof opts.body !== 'string' && !(opts.body instanceof FormData)) {
      opts.body = JSON.stringify(opts.body);
    }
    if (opts.body instanceof FormData) {
      delete opts.headers['Content-Type'];
    }

    let res;
    try {
      res = await fetch(url, opts);
    } catch (e) {
      throw new Error('서버 응답 없음 (네트워크 오류). Render 서버가 슬립 상태일 수 있습니다. /health로 깨워보세요.');
    }

    const contentType = res.headers.get('content-type') || '';

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      if (contentType.includes('application/json')) {
        try {
          const j = await res.json();
          detail = j.detail || JSON.stringify(j);
        } catch (e) {}
      } else {
        const text = await res.text();
        if (text.includes('<!DOCTYPE')) {
          throw new Error(`응답 파싱 오류: 서버가 HTML을 반환했습니다 (보통 서버 슬립 또는 라우팅 오류). HTTP ${res.status}`);
        }
        detail = text.slice(0, 200);
      }
      throw new Error(detail);
    }

    if (contentType.includes('application/json')) {
      return res.json();
    }
    // 파일 다운로드 (Excel/PPT) - blob 반환
    return res.blob();
  }

  async function apiDownload(path, filenameFallback) {
    const url = RENDER_URL + path;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`다운로드 실패: HTTP ${res.status} ${text.slice(0, 150)}`);
    }
    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition') || '';
    let filename = filenameFallback || 'download.xlsx';
    const m = disposition.match(/filename\*=UTF-8''([^;]+)/);
    if (m) filename = decodeURIComponent(m[1]);

    const a = document.createElement('a');
    const objUrl = URL.createObjectURL(blob);
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objUrl);
  }

  window.API = { fetch: apiFetch, download: apiDownload, base: RENDER_URL };
})();
