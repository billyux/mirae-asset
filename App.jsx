import React, { useState } from 'react';
import Questionnaire from './Questionnaire';

export default function App() {
  const [profile, setProfile] = useState(null);
  const [uploaded, setUploaded] = useState(false);
  const [pdfFiles, setPdfFiles] = useState(null);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState('');

  const handlePdfUpload = async () => {
    if (!pdfFiles) return alert('PDF 파일을 선택하세요.');
    const form = new FormData();
    Array.from(pdfFiles).forEach(f => form.append('pdfs', f));
    const res = await fetch('/ingest-sources', { method: 'POST', body: form });
    if (res.ok) {
      const data = await res.json();
      alert(`PDF ${data.total_sources}개 로드 완료`);
      setUploaded(true);
    } else {
      const err = await res.json();
      alert(err.detail || '업로드 실패');
    }
  };

  const ask = async () => {
    if (!uploaded) return alert('먼저 PDF를 업로드해주세요.');
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
      <div>
        <h2 className="text-xl mb-2">보고서(PDF) 업로드</h2>
        <input
          type="file"
          accept="application/pdf"
          multiple
          onChange={e => setPdfFiles(e.target.files)}
          className="mb-2"
        />
        <button
          onClick={handlePdfUpload}
          className="px-4 py-2 bg-green-500 text-white rounded"
        >
          업로드
        </button>
      </div>

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
            onChange={e => setQuery(e.target.value)}
            placeholder="투자 관련 질문을 입력하세요"
          />
          <button
            onClick={ask}
            className="mt-2 px-4 py-2 bg-blue-500 text-white rounded"
          >
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
