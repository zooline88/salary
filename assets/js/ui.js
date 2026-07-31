/* ============================================================
   공통 UI 도우미
   - 금액 입력칸 자동 콤마
   - 입력값 ↔ 주소창 쿼리스트링 동기화 (결과 공유용)
   - 결과 표 렌더링
   ============================================================ */

window.UI = (function () {
  'use strict';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 300);
    };
  }

  /* 금액 입력칸: 숫자만 남기고 3자리 콤마 자동 삽입 */
  function attachMoneyInput(el, onChange) {
    function format() {
      var caretFromEnd = el.value.length - el.selectionStart;
      var raw = el.value.replace(/[^\d]/g, '');
      if (raw.length > 15) raw = raw.slice(0, 15);
      el.value = raw ? Number(raw).toLocaleString('ko-KR') : '';
      var pos = Math.max(0, el.value.length - caretFromEnd);
      try { el.setSelectionRange(pos, pos); } catch (e) { /* number 타입 등 */ }
    }
    el.addEventListener('input', function () {
      format();
      if (onChange) onChange();
    });
    el.addEventListener('blur', format);
    format();
  }

  /* 주소창 쿼리 읽기/쓰기 */
  function readQuery() {
    var out = {};
    var q = location.search.replace(/^\?/, '');
    if (!q) return out;
    q.split('&').forEach(function (pair) {
      if (!pair) return;
      var i = pair.indexOf('=');
      var k = decodeURIComponent(i < 0 ? pair : pair.slice(0, i));
      var v = i < 0 ? '' : decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
      out[k] = v;
    });
    return out;
  }

  function writeQuery(obj) {
    var parts = [];
    Object.keys(obj).forEach(function (k) {
      if (obj[k] === '' || obj[k] === null || obj[k] === undefined) return;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]));
    });
    var url = location.pathname + (parts.length ? '?' + parts.join('&') : '');
    history.replaceState(null, '', url);
  }

  /* 결과 공유(주소 복사) */
  function attachShare(btn, msgEl) {
    if (!btn) return;
    btn.addEventListener('click', function () {
      var url = location.href;
      function done() {
        if (msgEl) {
          msgEl.textContent = '주소가 복사되었습니다.';
          setTimeout(function () { msgEl.textContent = ''; }, 2500);
        }
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, fallback);
      } else { fallback(); }

      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { prompt('아래 주소를 복사하세요', url); }
        document.body.removeChild(ta);
      }
    });
  }

  /* 공제 내역 표 그리기 (실수령액 계산기 공용) */
  function renderBreakdown(el, r) {
    var W = Calc.won;
    var rows = [
      ['국민연금', r.pension, '과세대상 급여의 4.75%' +
        (r.pensionCapped ? ' <span class="sub-label">상한액(659만원) 적용</span>'
          : r.pensionFloored ? ' <span class="sub-label">하한액(41만원) 적용</span>' : '')],
      ['건강보험', r.health, '과세대상 급여의 3.595%'],
      ['장기요양보험', r.care, '건강보험료의 13.14%'],
      ['고용보험', r.employment, '과세대상 급여의 0.9%'],
      ['__sum__', r.insuranceTotal, '4대보험 합계'],
      ['소득세', r.incomeTax, '근로소득 간이세액표 기준'],
      ['지방소득세', r.localIncomeTax, '소득세의 10%'],
      ['__sum__', r.taxTotal, '세금 합계']
    ];

    var html = '<table class="kv"><tbody>';
    rows.forEach(function (row) {
      if (row[0] === '__sum__') {
        html += '<tr class="sum"><th>' + row[2] + '</th><td class="num">' + W(row[1]) + '원</td></tr>';
      } else {
        html += '<tr><th>' + row[0] + '<span class="sub-label">' + row[2] + '</span></th>' +
          '<td class="num">' + W(row[1]) + '원</td></tr>';
      }
    });
    html += '<tr class="total"><th>공제 합계</th><td class="num">' + W(r.deductionTotal) + '원</td></tr>';
    html += '</tbody></table>';
    el.innerHTML = html;
  }

  /* 요율 기준 시점 표기 */
  function stampRates() {
    var p = Calc.currentPeriod();
    $$('.js-rate-stamp').forEach(function (el) { el.textContent = p.label; });
  }

  /* 현재 연도 표기 */
  function stampYear() {
    var y = new Date().getFullYear();
    $$('.js-year').forEach(function (el) { el.textContent = y; });
  }

  document.addEventListener('DOMContentLoaded', function () {
    stampRates();
    stampYear();
  });

  return {
    $: $, $$: $$,
    debounce: debounce,
    attachMoneyInput: attachMoneyInput,
    readQuery: readQuery,
    writeQuery: writeQuery,
    attachShare: attachShare,
    renderBreakdown: renderBreakdown
  };
})();
