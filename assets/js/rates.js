/* ============================================================
   4대보험 요율 · 상하한액 설정 파일
   ------------------------------------------------------------
   ★ 요율이 바뀌면 이 파일만 고치면 됩니다. (계산 코드는 건드릴 필요 없음)

   - 국민연금 : 기준소득월액 상·하한액이 매년 7월에 바뀝니다.
   - 건강보험 : 요율이 보통 매년 1월에 바뀝니다.
   - 장기요양 : "건강보험료 × 요율" 방식이라 건강보험료에 곱합니다.
   - 고용보험 : 근로자는 실업급여분(0.9%)만 부담합니다.
   - 산재보험 : 사업주 전액 부담이라 실수령액 계산에는 넣지 않습니다.

   새 기간이 생기면 아래 배열 맨 앞에 항목을 하나 추가하세요.
   (배열은 effectiveFrom 최신순으로 정렬해 두고, 계산 시 오늘 날짜에
    맞는 항목을 자동으로 고릅니다.)
   ============================================================ */

window.RATE_PERIODS = [
  {
    id: '2026-2H',
    effectiveFrom: '2026-07-01',
    effectiveTo: '2027-06-30',
    label: '2026년 7월 ~ 2027년 6월 기준',

    // 국민연금: 총 9.5% 중 근로자 4.75%
    nationalPension: {
      employeeRate: 0.0475,
      totalRate: 0.095,
      baseMin: 410000,      // 기준소득월액 하한액
      baseMax: 6590000      // 기준소득월액 상한액
    },

    // 건강보험: 총 7.19% 중 근로자 3.595%
    healthInsurance: {
      employeeRate: 0.03595,
      totalRate: 0.0719
    },

    // 장기요양보험: 건강보험료 × 13.14% (소득 대비로는 약 0.9448%)
    longTermCare: {
      rateOfHealth: 0.1314
    },

    // 고용보험(실업급여): 근로자 0.9%
    employmentInsurance: {
      employeeRate: 0.009,
      // 사업주는 실업급여 0.9% + 고용안정·직업능력개발사업 0.25%~0.85%(규모별)
      employerRateBase: 0.009,
      employerStabilityRates: [
        { label: '150인 미만 기업', rate: 0.0025 },
        { label: '150인 이상 (우선지원 대상기업)', rate: 0.0045 },
        { label: '150인 이상 1,000인 미만 기업', rate: 0.0065 },
        { label: '1,000인 이상 기업·국가지자체', rate: 0.0085 }
      ]
    },

    // 지방소득세: 소득세의 10%
    localIncomeTax: { rateOfIncomeTax: 0.10 },

    // 이 기간에 적용할 근로소득 간이세액표
    withholdingTable: 2026
  },

  {
    id: '2026-1H',
    effectiveFrom: '2026-01-01',
    effectiveTo: '2026-06-30',
    label: '2026년 1월 ~ 2026년 6월 기준',
    nationalPension: {
      employeeRate: 0.0475,
      totalRate: 0.095,
      baseMin: 400000,
      baseMax: 6370000
    },
    healthInsurance: { employeeRate: 0.03595, totalRate: 0.0719 },
    longTermCare: { rateOfHealth: 0.1314 },
    employmentInsurance: {
      employeeRate: 0.009,
      employerRateBase: 0.009,
      employerStabilityRates: [
        { label: '150인 미만 기업', rate: 0.0025 },
        { label: '150인 이상 (우선지원 대상기업)', rate: 0.0045 },
        { label: '150인 이상 1,000인 미만 기업', rate: 0.0065 },
        { label: '1,000인 이상 기업·국가지자체', rate: 0.0085 }
      ]
    },
    localIncomeTax: { rateOfIncomeTax: 0.10 },
    withholdingTable: 2026
  }
];

/* 계산 공통 옵션 */
window.CALC_OPTIONS = {
  // 보험료·세액의 원 단위 처리: 10원 미만 절사 (실무 관행)
  roundUnit: 10,
  // 비과세 식대 한도 (월). 2023년부터 20만원.
  mealAllowanceLimit: 200000,
  // 최저임금 (월 209시간 기준) — 안내 문구용
  minimumWage: { year: 2026, hourly: 10320, monthly: 2156880 }
};
