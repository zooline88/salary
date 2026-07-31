/* ============================================================
   실수령액 계산 로직 (공통 모듈)
   ------------------------------------------------------------
   의존: rates.js (window.RATE_PERIODS, window.CALC_OPTIONS)
         assets/data/withholding-2026.js (window.WITHHOLDING_TABLE)

   외부에서 쓰는 함수
     Calc.netSalary(input)      실수령액 계산 (핵심)
     Calc.fourInsurance(input)  4대보험료만 계산 (근로자/사업주)
     Calc.severancePay(input)   퇴직금 계산
     Calc.currentPeriod()       오늘 날짜에 맞는 요율 기간
     Calc.won(n) / Calc.parseWon(s)  금액 표기·해석 도우미
   ============================================================ */

window.Calc = (function () {
  'use strict';

  var OPT = window.CALC_OPTIONS;

  /* ── 숫자 도우미 ─────────────────────────────────── */

  // 10원 미만 절사 (4대보험료·세액 실무 관행)
  // ★ 그냥 곱하면 2,800,000 × 0.009 가 25,199.999... 로 나와 25,190원이 되는
  //   부동소수점 오차가 생긴다. 절사 전에 미세 오차를 먼저 제거한다.
  function floorTo(n, unit) {
    unit = unit || OPT.roundUnit;
    n = Math.round(n * 1e6) / 1e6;
    return Math.floor(n / unit) * unit;
  }

  function clamp(n, lo, hi) {
    return Math.min(Math.max(n, lo), hi);
  }

  // 1234567 -> "1,234,567"
  function won(n) {
    if (n === null || n === undefined || isNaN(n)) return '-';
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // "1,234,567원" -> 1234567
  function parseWon(s) {
    if (typeof s === 'number') return s;
    var v = String(s == null ? '' : s).replace(/[^\d.-]/g, '');
    var n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  // 12345678 -> "1,234만 5,678원" 같은 읽기 쉬운 표기
  function wonKorean(n) {
    n = Math.round(n);
    if (n < 10000) return won(n) + '원';
    var man = Math.floor(n / 10000);
    var rest = n % 10000;
    return won(man) + '만' + (rest ? ' ' + won(rest) : '') + '원';
  }

  /* ── 요율 기간 선택 ──────────────────────────────── */

  function currentPeriod(dateStr) {
    var today = dateStr || new Date().toISOString().slice(0, 10);
    var list = window.RATE_PERIODS;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (today >= p.effectiveFrom && (!p.effectiveTo || today <= p.effectiveTo)) return p;
    }
    // 오늘이 어느 기간에도 안 맞으면(설정 갱신 전) 가장 최신 기간 사용
    return list[0];
  }

  /* ── 근로소득 간이세액표 조회 ────────────────────── */

  /**
   * 월 과세대상 급여(비과세·학자금 제외)와 공제대상가족 수로 소득세를 구한다.
   * @param {number} taxableMonthly 과세대상 월급여(원)
   * @param {number} family         공제대상가족 수(본인 포함, 1 이상)
   * @returns {number} 간이세액표상 소득세(원, 자녀공제 적용 전)
   */
  function withholdingBase(taxableMonthly, family) {
    var T = window.WITHHOLDING_TABLE;
    if (!T) throw new Error('간이세액표 데이터(withholding-2026.js)가 로드되지 않았습니다.');

    family = Math.max(1, Math.floor(family || 1));
    var th = taxableMonthly / 1000;               // 표는 천원 단위

    // 표의 시작 구간보다 적으면 세액 없음
    if (th < T.minThousand) return 0;

    // 공제대상가족 11명 초과 → 별표2 비고 4번 산식
    if (family > 11) {
      var v11 = pickRow(th, 11);
      var v10 = pickRow(th, 10);
      return Math.max(0, v11 - (v10 - v11) * (family - 11));
    }
    return pickRow(th, family);

    function pickRow(thousand, fam) {
      var idx = fam; // rows = [하한, 가족1, 가족2, ... 가족11] 이므로 인덱스가 곧 가족수
      if (thousand < T.maxThousand) {
        var rows = T.rows;
        // 이진 탐색: rows[i][0] <= thousand < rows[i+1][0]
        var lo = 0, hi = rows.length - 1, mid, ans = 0;
        while (lo <= hi) {
          mid = (lo + hi) >> 1;
          if (rows[mid][0] <= thousand) { ans = mid; lo = mid + 1; }
          else { hi = mid - 1; }
        }
        return rows[ans][idx];
      }
      // 월급여 1,000만원 이상
      var atMax = T.atMax[fam - 1];
      if (thousand === T.maxThousand) return atMax;

      // 1,000만원 초과 구간 산식 (별표2 비고 6 하단)
      var amount = thousand * 1000;               // 원 단위로 환산
      var br = T.overMax;
      for (var i = 0; i < br.length; i++) {
        var b = br[i];
        if (b.limit === null || amount <= b.limit) {
          return atMax + b.base + b.add +
            (amount - b.over) * b.ratio * b.rate;
        }
      }
      return atMax;
    }
  }

  /**
   * 8세 이상 20세 이하 자녀 세액공제 (별표2 비고 3번)
   */
  function childTaxCredit(children) {
    var C = window.WITHHOLDING_TABLE.childCredit;
    children = Math.max(0, Math.floor(children || 0));
    if (children === 0) return 0;
    if (children === 1) return C.one;
    if (children === 2) return C.two;
    return C.two + (children - 2) * C.extraPerChild;
  }

  /**
   * 소득세(원천징수액) 최종 계산
   * @param {number} ratio 원천징수세액 조정비율 (0.8 / 1.0 / 1.2)
   */
  function incomeTax(taxableMonthly, family, children, ratio) {
    var base = withholdingBase(taxableMonthly, family);
    var afterChild = Math.max(0, base - childTaxCredit(children));
    return floorTo(afterChild * (ratio || 1));
  }

  /* ── 4대보험 (근로자 부담) ───────────────────────── */

  function employeeInsurance(taxableMonthly, period) {
    // 과세대상 소득이 0이면 보험료도 0.
    // (국민연금 하한액은 소득이 있는 가입자에게 적용되는 것이라, 소득 0에까지
    //  하한액을 씌우면 급여가 없는데 보험료가 나오는 이상한 결과가 된다.)
    if (!(taxableMonthly > 0)) {
      return {
        pension: 0, health: 0, care: 0, employment: 0, total: 0,
        pensionBase: 0, pensionCapped: false, pensionFloored: false
      };
    }

    var np = period.nationalPension;
    var hi = period.healthInsurance;
    var lt = period.longTermCare;
    var ei = period.employmentInsurance;

    // 국민연금만 기준소득월액 상·하한액을 적용
    var pensionBase = clamp(taxableMonthly, np.baseMin, np.baseMax);
    var pension = floorTo(pensionBase * np.employeeRate);
    var health = floorTo(taxableMonthly * hi.employeeRate);
    var care = floorTo(health * lt.rateOfHealth);       // ★ 건강보험료에 곱함
    var employment = floorTo(taxableMonthly * ei.employeeRate);

    return {
      pension: pension,
      health: health,
      care: care,
      employment: employment,
      total: pension + health + care + employment,
      pensionBase: pensionBase,
      pensionCapped: taxableMonthly > np.baseMax,
      pensionFloored: taxableMonthly < np.baseMin
    };
  }

  /* ── 핵심: 실수령액 계산 ────────────────────────── */

  /**
   * @param {object} o
   *   o.mode          'annual' | 'monthly'   (연봉 입력 / 월급 입력)
   *   o.amount        연봉 또는 월급(세전, 원)
   *   o.severanceIncluded  연봉에 퇴직금이 포함되어 있는지(true면 13으로 나눔)
   *   o.nonTaxable    월 비과세액(원) — 식대 등
   *   o.family        공제대상가족 수(본인 포함)
   *   o.children      그중 8~20세 자녀 수
   *   o.taxRatio      원천징수세액 조정비율 0.8 / 1.0 / 1.2
   *   o.date          기준일 'YYYY-MM-DD' (생략 시 오늘)
   */
  function netSalary(o) {
    var period = currentPeriod(o.date);

    var monthlyGross;
    var annualGross;
    if (o.mode === 'annual') {
      annualGross = Math.max(0, o.amount || 0);
      monthlyGross = annualGross / (o.severanceIncluded ? 13 : 12);
    } else {
      monthlyGross = Math.max(0, o.amount || 0);
      annualGross = monthlyGross * 12;
    }
    monthlyGross = Math.round(monthlyGross);

    var nonTaxable = clamp(Math.round(o.nonTaxable || 0), 0, monthlyGross);
    var taxable = monthlyGross - nonTaxable;

    var family = Math.max(1, Math.floor(o.family || 1));
    var children = clamp(Math.floor(o.children || 0), 0, Math.max(0, family - 1));

    var ins = employeeInsurance(taxable, period);
    var tax = incomeTax(taxable, family, children, o.taxRatio);
    var local = floorTo(tax * period.localIncomeTax.rateOfIncomeTax);

    var deductionTotal = ins.total + tax + local;
    var net = monthlyGross - deductionTotal;

    return {
      period: period,
      monthlyGross: monthlyGross,
      annualGross: Math.round(annualGross),
      nonTaxable: nonTaxable,
      taxable: taxable,
      family: family,
      children: children,
      pension: ins.pension,
      health: ins.health,
      care: ins.care,
      employment: ins.employment,
      insuranceTotal: ins.total,
      incomeTax: tax,
      localIncomeTax: local,
      taxTotal: tax + local,
      deductionTotal: deductionTotal,
      monthlyNet: net,
      annualNet: net * 12,
      deductionRate: monthlyGross > 0 ? deductionTotal / monthlyGross : 0,
      pensionCapped: ins.pensionCapped,
      pensionFloored: ins.pensionFloored
    };
  }

  /* ── 4대보험 계산기용 (근로자 + 사업주) ─────────── */

  function fourInsurance(o) {
    var period = currentPeriod(o.date);
    var pay = Math.max(0, Math.round(o.monthlyPay || 0));   // 보수월액(과세 기준)
    var np = period.nationalPension;
    var hi = period.healthInsurance;
    var lt = period.longTermCare;
    var ei = period.employmentInsurance;

    var emp = employeeInsurance(pay, period);

    var pensionBase = clamp(pay, np.baseMin, np.baseMax);
    var erPension = floorTo(pensionBase * np.employeeRate);   // 사업주도 같은 요율
    var erHealth = floorTo(pay * hi.employeeRate);
    var erCare = floorTo(erHealth * lt.rateOfHealth);

    var stability = ei.employerStabilityRates[o.companySize || 0];
    var erEmployment = floorTo(pay * (ei.employerRateBase + stability.rate));

    return {
      period: period,
      monthlyPay: pay,
      employee: emp,
      employer: {
        pension: erPension,
        health: erHealth,
        care: erCare,
        employment: erEmployment,
        total: erPension + erHealth + erCare + erEmployment,
        stabilityLabel: stability.label,
        stabilityRate: stability.rate
      },
      grandTotal: emp.total + erPension + erHealth + erCare + erEmployment
    };
  }

  /* ── 퇴직금 계산 ─────────────────────────────────── */

  // 'YYYY-MM-DD' → UTC 기준 Date. (시간대에 따라 하루씩 밀리는 것을 막기 위해 직접 파싱)
  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  }

  function fmtDate(d) {
    return d.toISOString().slice(0, 10);
  }

  function daysBetween(a, b) {
    return Math.round((b - a) / 86400000);
  }

  // n개월 전 날짜. 3월 31일에서 1개월 전은 2월 31일이 없으므로 2월 말일로 맞춘다.
  function monthsBefore(date, n) {
    var y = date.getUTCFullYear(), m = date.getUTCMonth(), d = date.getUTCDate();
    var tm = m - n;
    var ty = y + Math.floor(tm / 12);
    tm = ((tm % 12) + 12) % 12;
    var lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
    return new Date(Date.UTC(ty, tm, Math.min(d, lastDay)));
  }

  /**
   * 퇴직금 = 1일 평균임금 × 30일 × (재직일수 ÷ 365)
   * 평균임금 = (퇴직 전 3개월 임금총액 + 상여금×3/12 + 연차수당×3/12) ÷ 3개월 총일수
   * (1일 통상임금이 더 크면 통상임금으로 계산 — 근로기준법 제2조)
   */
  function severancePay(o) {
    var joinDate = parseDate(o.joinDate);
    var leaveDate = parseDate(o.leaveDate);            // 마지막 근무일의 다음 날
    if (!joinDate || !leaveDate) return null;

    var serviceDays = daysBetween(joinDate, leaveDate);
    if (serviceDays < 0) return { error: '퇴사일이 입사일보다 빠릅니다.' };
    if (serviceDays < 365) {
      return {
        error: '계속 근로기간이 1년(365일) 미만이면 법정 퇴직금 지급 대상이 아닙니다.',
        serviceDays: serviceDays
      };
    }

    // 퇴직 전 3개월의 실제 일수 (퇴사일 3개월 전 ~ 퇴사일 전날)
    var start = monthsBefore(leaveDate, 3);
    var periodDays = daysBetween(start, leaveDate);

    var wageSum = (o.pay1 || 0) + (o.pay2 || 0) + (o.pay3 || 0);
    var bonusPart = (o.annualBonus || 0) * 3 / 12;
    var leavePart = (o.annualLeavePay || 0) * 3 / 12;
    var totalWage = wageSum + bonusPart + leavePart;

    var avgDaily = periodDays > 0 ? totalWage / periodDays : 0;
    var ordinaryDaily = o.ordinaryDaily || 0;          // 1일 통상임금(선택 입력)
    var usedDaily = Math.max(avgDaily, ordinaryDaily);
    var usedBasis = ordinaryDaily > avgDaily ? '통상임금' : '평균임금';

    var pay = usedDaily * 30 * (serviceDays / 365);

    return {
      serviceDays: serviceDays,
      serviceYears: Math.floor(serviceDays / 365),
      serviceRestDays: serviceDays % 365,
      periodDays: periodDays,
      periodStart: fmtDate(start),
      wageSum: wageSum,
      bonusPart: Math.round(bonusPart),
      leavePart: Math.round(leavePart),
      totalWage: Math.round(totalWage),
      avgDaily: Math.round(avgDaily),
      ordinaryDaily: Math.round(ordinaryDaily),
      usedDaily: Math.round(usedDaily),
      usedBasis: usedBasis,
      severance: Math.round(pay)
    };
  }

  return {
    netSalary: netSalary,
    fourInsurance: fourInsurance,
    severancePay: severancePay,
    employeeInsurance: employeeInsurance,
    incomeTax: incomeTax,
    withholdingBase: withholdingBase,
    childTaxCredit: childTaxCredit,
    currentPeriod: currentPeriod,
    floorTo: floorTo,
    won: won,
    wonKorean: wonKorean,
    parseWon: parseWon
  };
})();
