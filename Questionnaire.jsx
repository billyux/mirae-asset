import React, { useState } from 'react';

const questions = [
  { id: 'q1', text: '① 향후 수입 예상', options: ['유지/증가','감소/불안정','현금 주수입'] },
  { id: 'q2', text: '② 금융자산 비중', options: ['5% 이하','10% 이하','20% 이하','30% 이하','30% 초과'] },
  { id: 'q3', text: '③ 투자경험(복수)', options: ['무경험','하이리스크 상품','주식·펀드·일임','채권·신탁'] },
  { id: 'q3_period', text: '③ 기간', options: ['1년미만','1~3년미만','3년이상'] },
  { id: 'q4', text: '④ 투자목적', options: ['원금보존','수익추구(안정)','고수익추구'] },
  { id: 'q5', text: '⑤ 감내 손실', options: ['소액 손실','중간 손실','고수익+고위험'] },
  { id: 'q6', text: '⑥ 금융지식 수준', options: ['예적금만','설명 후 결정','일반상품 이해','파생상품 포함 이해'] },
  { id: 'q8', text: '⑦ 금융취약 확인', options: ['취약','해당없음'] },
  { id: 'q9', text: '⑧ 나이', options: ['20세 미만','20~35','35~50','50~60','65 이상'] },
  { id: 'q10', text: '⑨ 투자예정기간', options: ['1년미만','1~2년','2~3년','3~5년','5년이상'] },
  { id: 'q11', text: '⑩ 연소득', options: ['<2천','2~5천','5~7천','7~1억','1억+'] },
];

export default function Questionnaire({ onProfile }) {
  const [answers, setAnswers] = useState({ q3: [] });

  const handleChange = (id, value) => {
    if (id === 'q3') {
      setAnswers(prev => {
        const arr = prev.q3.includes(value) ? prev.q3.filter(v => v !== value) : [...prev.q3, value];
        return { ...prev, q3: arr };
      });
    } else {
      setAnswers(prev => ({ ...prev, [id]: value }));
    }
  };

  const submit = async () => {
    const res = await fetch('/profile', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(answers)
    });
    const data = await res.json()
    onProfile(data)
  };

  return (
    <div>
      {questions.map(({id, text, options}) => (
        <div key={id} className="mb-4">
          <p>{text}</p>
          {options.map((opt, i) => (
            <label key={i} className="mr-4">
              <input
                type={id==='q3' ? 'checkbox' : 'radio'}
                name={id}
                value={i+1}
                onChange={() => handleChange(id, i+1)}
              /> {opt}
            </label>
          ))}
        </div>
      ))}
      <button onClick={submit} className="mt-2 px-4 py-2 bg-indigo-600 text-white rounded">
        프로필 생성
      </button>
    </div>
)
}