import os
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Body
from pydantic import BaseModel
from typing import List
import tempfile

from langchain_community.chat_models import ChatClovaX
from langchain.embeddings import OpenAIEmbeddings
from langchain.document_loaders import PyPDFLoader, UnstructuredURLLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.vectorstores import FAISS
from langchain.chains import RetrievalQA

# Environment variables
#   NCP_CLOVASTUDIO_API_KEY - HyperCLOVA LLM API key
#   NCP_APIGW_API_KEY       - API Gateway key for both LLM and embeddings
#   HYPER_CLOVA_MODEL_ID    - Model ID (e.g., hyperclova-x)
#   OPENAI_API_KEY          - OpenAI API key for embeddings

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

@app.post("/ingest-sources")
async def ingest_sources(
    pdfs: List[UploadFile] = File(default=[]),
    urls: List[str] = Form(default=[])
):
    global vectordb
    docs = []

    # Load PDFs
    for pdf in pdfs:
        contents = await pdf.read()
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(contents)
            tmp_path = tmp.name
        loader = PyPDFLoader(tmp_path)
        docs.extend(loader.load())

    # Load URLs
    if urls:
        url_loader = UnstructuredURLLoader(urls=urls)
        docs.extend(url_loader.load())

    if not docs:
        raise HTTPException(status_code=400, detail="Provide at least one PDF or URL.")

    # Split and index
    texts = splitter.split_documents(docs)
    vectordb = FAISS.from_documents(texts, embeddings)
    return {
        "status": "vectorstore updated",
        "total_sources": len(pdfs) + len(urls),
        "docs_count": len(docs)
    }

class UserProfile(BaseModel):
    risk_level: str
    investment_horizon: int

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
    qa_chain = RetrievalQA.from_chain_type(
        llm=llm, chain_type="stuff", retriever=retriever
    )
    prompt = f"당신은 {profile.risk_level} 투자자이고, 투자기간은 {profile.investment_horizon}년입니다.\n{q}"
    answer = qa_chain.run(prompt)
    return {"recommendation": answer}
