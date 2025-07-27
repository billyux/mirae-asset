import React, { useState, useEffect, useRef } from 'react';
import Questionnaire from './Questionnaire';

export default function App() {
  const [pdfFiles, setPdfFiles] = useState(null);
  const [uploaded, setUploaded] = useState(false);
  const [profile, setProfile] = useState(null);
  const [messages, setMessages] = useState([
    { sender: 'bot', text: '안녕하세요! 보고서(PDF)를 업로드해주세요.' }
  ]);
  const [input, setInput] = useState('');
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handlePdfUpload = async () => {
    if (!pdfFiles) {
      setMessages(msgs => [...msgs, { sender: 'bot', text: 'PDF 파일을 선택해주세요.' }]);
      return;
    }
    const form = new FormData();
    Array.from(pdfFiles).forEach(f => form.append('pdfs', f));
    const res = await fetch('/ingest-sources', { method: 'POST', body: form });
    if (res.ok) {
      const data = await res.json();
      setUploaded(true);
      setMessages(msgs => [
        ...msgs,
        { sender: 'bot', text: `PDF ${data.total_sources}개 로드 완료! 이제 투자 설문을 시작합니다.` }
      ]);
    } else {
      const err = await res.json();
      setMessages(msgs => [...msgs, { sender: 'bot', text: err.detail || '업로드 실패' }]);
    }
  };

  const handleProfile = data => {
    setProfile(data);
    setMessages(msgs => [
      ...msgs,
      {
        sender: 'bot',
        text: `프로필 생성 완료! 투자유형: ${data.risk_level}, 기간: ${data.investment_horizon}년. 이제 궁금한 사항을 질문해주세요.`
      }
    ]);
  };

  const handleSend = async e => {
    e.preventDefault();
    if (!input.trim()) return;
    setMessages(msgs => [...msgs, { sender: 'user', text: input }]);
    const userInput = input;
    setInput('');
    const res = await fetch('/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: userInput, profile })
    });
    if (res.ok) {
      const { recommendation } = await res.json();
      setMessages(msgs => [...msgs, { sender: 'bot', text: recommendation }]);
    } else {
      const err = await res.json();
      setMessages(msgs => [...msgs, { sender: 'bot', text: err.detail || '추천 요청 실패' }]);
    }
  };

  return (
    <div className="max-w-xl mx-auto h-screen flex flex-col p-4">
      {!uploaded ? (
        <div className="mb-4">
          <h2 className="text-xl mb-2">보고서(PDF) 업로드</h2>
          <input
            type="file"
            accept="application/pdf"
            multiple
            onChange={e => setPdfFiles(e.target.files)}
          />
          <button
            onClick={handlePdfUpload}
            className="mt-2 px-4 py-2 bg-green-500 text-white rounded"
          >
            업로드
          </button>
        </div>
      ) : !profile ? (
        <Questionnaire onProfile={handleProfile} />
      ) : (
        <div className="flex-1 flex flex-col">
          <div className="overflow-y-auto flex-1 p-2 space-y-2 bg-gray-100 rounded">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${
                  m.sender === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`inline-block px-4 py-2 rounded-lg max-w-[70%] ${
                    m.sender === 'user'
                      ? 'bg-blue-500 text-white'
                      : 'bg-white text-black'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={handleSend} className="mt-2 flex">
            <input
              className="flex-1 border p-2 rounded-l-lg"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="메시지를 입력하세요"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white rounded-r-lg"
            >
              전송
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
