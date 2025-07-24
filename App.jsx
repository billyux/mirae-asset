import React, { useState } from 'react';
import Questionnaire from './Questionnaire';

export default function App() {
  const [profile, setProfile] = useState(null);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState('');

  const ask = async () => {
    const res = await fetch('/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, profile })
    });
    const data = await res.json();
    setResult(data.recommendation);
  };

  return (
    <div className="p-4 space-y-6">
      {!profile ? (
        <Questionnaire onProfile={setProfile} />
      ) : (
        <>
          <div>
            <p>투자유형: <strong>{profile.risk_level}</strong></p>
            <p>투자기간: <strong>{profile.investment_horizon}년</strong></p>
          </div>
          <textarea
            className="w-full h-24 border p-2"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="투자 관련 질문을 입력하세요"
          />
          <button onClick={ask} className="mt-2 px-4 py-2 bg-blue-500 text-white rounded">
            추천받기
          </button>
          {result && (
            <div className="mt-4 p-4 bg-gray-100">
              <h3 className="font-semibold">추천 결과</h3>
              <p>{result}</p>
            </div>
          )}
        </>
      )}
    </div>
);
}
