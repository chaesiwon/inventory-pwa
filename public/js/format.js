/* format.js - 금액/중량 포맷 표시 헬퍼
   백엔드의 fmt_amount()와 동일한 규칙을 프론트에서도 일관되게 적용.
   - KRW(원): 소수점 없음, 정수
   - MN(백만원), HM(억원): 소수점 둘째자리까지
*/
(function () {
  const UNIT_LABEL = { KRW: '원', MN: '백만원', HM: '억원' };

  function formatAmount(amountObj) {
    // amountObj: {value, raw, unit} (백엔드 fmt_amount 결과)
    if (amountObj == null) return '-';
    const { value, unit } = amountObj;
    const label = UNIT_LABEL[unit] || '';
    if (unit === 'KRW') {
      return `${Number(value).toLocaleString('ko-KR')}${label}`;
    }
    // MN, HM: 소수점 둘째자리 고정 표시
    return `${Number(value).toFixed(2)}${label}`;
  }

  function formatWeight(ton) {
    if (ton == null) return '-';
    return `${Number(ton).toLocaleString('ko-KR', { maximumFractionDigits: 1 })} ton`;
  }

  function formatCount(n) {
    if (n == null) return '-';
    return `${Number(n).toLocaleString('ko-KR')}건`;
  }

  function formatDate(ymd) {
    // '20260531' -> '2026-05-31'
    if (!ymd) return '-';
    const s = String(ymd);
    if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    return s;
  }

  function unitLabel(unit) {
    return UNIT_LABEL[unit] || '';
  }

  window.FMT = { amount: formatAmount, weight: formatWeight, count: formatCount, date: formatDate, unitLabel };
})();
