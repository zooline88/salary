# -*- coding: utf-8 -*-
"""
근로소득 간이세액표 PDF → 사이트용 JS 데이터 파일 변환기

[언제 쓰나]
  국세청이 간이세액표를 개정했을 때 (보통 세법 개정 시, 최근은 2026년 2월).

[준비]
  1) pip install pypdf
  2) 국가법령정보센터에서 "소득세법 시행령 [별표 2] 근로소득 간이세액표" PDF를 내려받는다.
     - https://www.law.go.kr 에서 '소득세법 시행령' → 별표/서식 → [별표 2]
     - 또는 홈택스 > 세금신고 > 원천세 신고 > 근로소득 간이세액표

[실행]
  python build_withholding_table.py "내려받은표.pdf" 2027
  → assets/data/withholding-2027.js 생성

  그다음 각 HTML의 <script src="assets/data/withholding-2026.js"> 를 새 파일로 바꾸고,
  assets/js/rates.js 의 withholdingTable 값을 새 연도로 바꾼다.

[주의]
  ★ 아래 overMax(월급여 1,000만원 초과 산식)는 PDF 마지막 페이지에 표로 적혀 있다.
    개정되면 이 부분도 눈으로 확인해서 손으로 고쳐야 한다. (자동 추출 안 함)
  ★ 자녀세액공제(childCredit)도 비고 3번에 있다. 개정되면 같이 고칠 것.
"""
import re
import os
import sys
import json

try:
    import pypdf
except ImportError:
    print('pypdf 가 없습니다. 먼저 실행하세요:  pip install pypdf')
    sys.exit(1)


def parse(pdf_path):
    reader = pypdf.PdfReader(pdf_path)
    tok = r'(-|[\d,]+)'
    row_pat = re.compile(r'^\s*([\d,]+)\s+([\d,]+)\s+' + r'\s+'.join([tok] * 11) + r'\s*$')
    last_pat = re.compile(r'^\s*10,000천원\s+' + r'\s+'.join([tok] * 11) + r'\s*$')

    rows, last_row = [], None
    for page in reader.pages:
        text = page.extract_text(extraction_mode='layout')
        for line in text.split('\n'):
            m = row_pat.match(line)
            if m:
                g = m.groups()
                rows.append((
                    int(g[0].replace(',', '')),
                    int(g[1].replace(',', '')),
                    [0 if v == '-' else int(v.replace(',', '')) for v in g[2:]],
                ))
                continue
            m2 = last_pat.match(line)
            if m2:
                last_row = [0 if v == '-' else int(v.replace(',', '')) for v in m2.groups()]

    if not rows:
        raise SystemExit('표를 한 줄도 못 읽었습니다. PDF가 별표2 원본이 맞는지 확인하세요.')
    if last_row is None:
        raise SystemExit("'10,000천원' 행을 못 찾았습니다. PDF 마지막 페이지를 확인하세요.")

    rows.sort(key=lambda x: x[0])
    for i in range(1, len(rows)):
        if rows[i][0] != rows[i - 1][1]:
            raise SystemExit('구간이 이어지지 않습니다: %s 다음이 %s' % (rows[i - 1], rows[i]))
    return rows, last_row


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    pdf_path, year = sys.argv[1], sys.argv[2]

    rows, last_row = parse(pdf_path)

    data = {
        "year": int(year),
        "source": "소득세법 시행령 [별표 2] 근로소득 간이세액표 (제189조제1항 관련)",
        "unit": "월급여액은 천원 단위, 세액은 원 단위",
        "minThousand": rows[0][0],
        "maxThousand": rows[-1][1],
        "rows": [[lo] + vals for lo, hi, vals in rows],
        "atMax": last_row,
        # ↓↓↓ 아래 두 항목은 PDF 비고를 보고 손으로 확인·수정할 것 ↓↓↓
        "childCredit": {"one": 20830, "two": 45830, "extraPerChild": 33330},
        "overMax": [
            {"limit": 14000000, "over": 10000000, "ratio": 0.98, "rate": 0.35, "base": 0,        "add": 25000},
            {"limit": 28000000, "over": 14000000, "ratio": 0.98, "rate": 0.38, "base": 1397000,  "add": 0},
            {"limit": 30000000, "over": 28000000, "ratio": 0.98, "rate": 0.40, "base": 6610600,  "add": 0},
            {"limit": 45000000, "over": 30000000, "ratio": 1.00, "rate": 0.40, "base": 7394600,  "add": 0},
            {"limit": 87000000, "over": 45000000, "ratio": 1.00, "rate": 0.42, "base": 13394600, "add": 0},
            {"limit": None,     "over": 87000000, "ratio": 1.00, "rate": 0.45, "base": 31034600, "add": 0},
        ],
    }

    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'data')
    out_dir = os.path.normpath(out_dir)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, 'withholding-%s.js' % year)

    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('// 근로소득 간이세액표 (build_withholding_table.py 가 자동 생성 — 직접 고치지 마세요)\n')
        f.write('// 출처: %s\n' % data['source'])
        f.write('window.WITHHOLDING_TABLE = %s;\n'
                % json.dumps(data, ensure_ascii=False, separators=(',', ':')))

    print('완료: %s' % out_path)
    print('  구간 수 : %d개 (%d천원 ~ %d천원)' % (len(rows), rows[0][0], rows[-1][1]))
    print('  파일 크기: %.1f KB' % (os.path.getsize(out_path) / 1024))
    print()
    print('※ childCredit(자녀세액공제)와 overMax(1,000만원 초과 산식)는 자동 추출하지 않습니다.')
    print('  PDF 비고 3번과 마지막 페이지를 눈으로 확인하고 이 스크립트 안의 값을 고치세요.')


if __name__ == '__main__':
    main()
