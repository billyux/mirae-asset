아래는 프로젝트의 전체 파일 구조와 주요 코드입니다. 직접 수정·확인하실 수 있도록 전체 ZIP도 함께 첨부합니다.

investment_chatbot/
├── backend/
│   ├── app.py
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── App.jsx
    └── Questionnaire.jsx


---

backend/app.py

import os
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import tempfile

from langchain_community.chat_models import ChatClovaX
from langchain.embeddings import OpenAIEmbeddings
from langchain.document_loaders import PyPDFLoader, UnstructuredURLLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.vectorstores import FAISS
from langchain.chains import RetrievalQA

# 환경 변수 설정
# NCP_CLOVASTUDIO_API_KEY - HyperCLOVA LLM API key
# NCP_APIGW_API_KEY       - API Gateway key
# HYPER_CLOVA_MODEL_ID    - Model ID
# OPENAI_API_KEY          - OpenAI API key

llm = ChatClovaX(
    api_key=os.getenv("NCP_CLOVASTUDIO_API_KEY"),
    api_gw_key=os.getenv("NCP_APIGW_API_KEY"),
    model=os.getenv("HYPER_CLOVA_MODEL_ID", "hyperclova-x")
)

embeddings = OpenAIEmbeddings(
    model="text-embedding-3-large",
    openai_api_key=os.getenv("OPENAI_API_KEY")
)

splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
vectordb = None

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Questionnaire(BaseModel):
    q1: int
    q2: int
    q3: List[int]
    q3_period: int
    q4: int
    q5: int
    q6: int
    q8: Optional[int] = None
    q9: int
    q10: int
    q11: int

class UserProfile(BaseModel):
    risk_level: str
    investment_horizon: int

@app.post("/profile", response_model=UserProfile)
def compute_profile(answers: Questionnaire):
    scores = {
        1: {1:5, 2:3, 3:1},
        2: {1:1,2:2,3:3,4:4,5:5},
        3: {1:0,2:6,3:3,4:1},
        '3p': {1:1,2:3,3:5},
        4: {1:1,2:3,3:5},
        5: {1:1,2:3,3:4},
        6: {1:1,2:3,3:5,4:5},
        9: {1:1,2:3,3:5,4:2,5:1},
        10:{1:1,2:2,3:3,4:4,5:5},
        11:{1:1,2:2,3:3,4:4,5:5},
    }
    total = (
        scores[1][answers.q1] +
        scores[2][answers.q2] +
        max(scores[3][opt] for opt in answers.q3) +
        scores['3p'][answers.q3_period] +
        scores[4][answers.q4] +
        scores[5][answers.q5] +
        scores[6][answers.q6] +
        scores[9][answers.q9] +
        scores[10][answers.q10] +
        scores[11][answers.q11]
    )
    if total >= 30:
        t = "공격투자형"
    elif total >= 25:
        t = "적극투자형"
    elif total >= 20:
        t = "위험중립형"
    elif total >= 15:
        t = "안전추구형"
    else:
        t = "안정형"
    return UserProfile(risk_level=t, investment_horizon=answers.q10)

@app.post("/ingest-sources")
async def ingest_sources(
    pdfs: List[UploadFile] = File(default=[]),
    urls: List[str] = Form(default=[])
):
    global vectordb
    docs = []
    for pdf in pdfs:
        contents = await pdf.read()
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(contents)
            tmp_path = tmp.name
        docs.extend(PyPDFLoader(tmp_path).load())
    if urls:
        docs.extend(UnstructuredURLLoader(urls=urls).load())
    if not docs:
        raise HTTPException(status_code=400, detail="Provide at least one PDF or URL.")
    texts = splitter.split_documents(docs)
    vectordb = FAISS.from_documents(texts, embeddings)
    return {"status":"vectorstore updated","total_sources":len(pdfs)+len(urls),"docs_count":len(docs)}

@app.post("/recommend")
async def recommend(payload: dict = Body(...)):
    global vectordb
    if vectordb is None:
        raise HTTPException(status_code=400, detail="Call /ingest-sources first.")
    q = payload.get("q")
    profile_data = payload.get("profile")
    if not q or not profile_data:
        raise HTTPException(status_code=400, detail="Both 'q' and 'profile' fields are required.")
    profile = UserProfile(**profile_data)
    retriever = vectordb.as_retriever()
    qa_chain = RetrievalQA.from_chain_type(llm=llm, chain_type="stuff", retriever=retriever)
    prompt = f"당신은 {profile.risk_level} 투자자이며, 투자기간은 {profile.investment_horizon}년입니다.\n{q}"
    answer = qa_chain.run(prompt)
    return {"recommendation": answer}


---

backend/requirements.txt

fastapi
uvicorn[standard]
langchain
langchain-community
openai
faiss-cpu
pypdf
unstructured


---

backend/.env.example

# HyperCLOVA LLM
NCP_CLOVASTUDIO_API_KEY=your_llm_api_key
NCP_APIGW_API_KEY=your_api_gateway_key
HYPER_CLOVA_MODEL_ID=hyperclova-x

# OpenAI Embeddings
OPENAI_API_KEY=your_openai_api_key


---

frontend/App.jsx

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


---

frontend/Questionnaire.jsx

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
        const arr = prev.q3.includes(value)
          ? prev.q3.filter(v => v !== value)
          : [...prev.q3, value];
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
    const data = await res.json();
    onProfile(data);
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
  );
}


---

Download the full project ZIP

