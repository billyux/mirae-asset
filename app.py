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
        10: {1:1,2:2,3:3,4:4,5:5},
        11: {1:1,2:2,3:3,4:4,5:5},
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
