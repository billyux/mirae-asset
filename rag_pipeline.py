import os
import json
import glob
import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse

from langchain.document_loaders import UnstructuredHTMLLoader, PyPDFLoader
from langchain.schema import Document
from langchain.vectorstores import Milvus
from pymilvus import connections, CollectionSchema, FieldSchema, DataType, Collection, utility
from langchain.chains import RetrievalQA, ConversationalRetrievalChain
from langchain.prompts import PromptTemplate
from langchain.memory import ConversationBufferMemory
from langchain.llms.base import LLM

# CLOVA Studio API client
class CLOVAClient:
    def __init__(self, api_key, gateway_key, region="kr-northwest-1"):
        self.api_key = api_key
        self.gateway_key = gateway_key
        self.region = region
        self.base_url = f"https://api-gateway-{region}.naver.com"
        self.headers = {
            "Content-Type": "application/json",
            "X-NCP-APIGW-API-KEY-ID": gateway_key,
            "X-NCP-APIGW-API-KEY": api_key,
        }

    def segment(self, text, segmentation_app_id, seg_cnt=5, min_size=200, max_size=500):
        url = f"{self.base_url}/clovastudio/v1/segmentation"
        payload = {
            "appId": segmentation_app_id,
            "text": text,
            "segCnt": seg_cnt,
            "postProcessMinSize": min_size,
            "postProcessMaxSize": max_size,
        }
        resp = requests.post(url, headers=self.headers, json=payload)
        resp.raise_for_status()
        return resp.json()["segments"]

    def embed(self, text_chunks, embedding_app_id, model="clir-emb-dolphin"):
        url = f"{self.base_url}/clovastudio/v1/embedding"
        payload = {"appId": embedding_app_id, "texts": text_chunks, "model": model}
        resp = requests.post(url, headers=self.headers, json=payload)
        resp.raise_for_status()
        return resp.json()["embeddings"]

    def chat_completion(self, prompt, model_id, max_tokens=512):
        url = f"{self.base_url}/clovastudio/v1/chat/{model_id}"
        payload = {"prompt": prompt, "maxTokens": max_tokens}
        resp = requests.post(url, headers=self.headers, json=payload)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]

# LangChain LLM wrapper
class ClovaLLM(LLM):
    @property
    def _llm_type(self):
        return "clovastudio"

    def __init__(self, clova_client, model_id, **kwargs):
        self.clova = clova_client
        self.model_id = model_id
        super().__init__(**kwargs)

    def _call(self, prompt: str, stop=None):
        return self.clova.chat_completion(prompt, self.model_id)

    def _identifying_params(self):
        return {"model_id": self.model_id}

# 1. Fetch pages and PDFs
def fetch_sources(url_list, pdf_paths, output_dir="data/docs"):
    os.makedirs(output_dir, exist_ok=True)
    url_map = {}
    # HTML
    for url in url_list:
        parsed = urlparse(url)
        filename = parsed.netloc.replace('.', '_') + parsed.path.replace('/', '_')
        if not filename.endswith('.html'):
            filename += '.html'
        file_path = os.path.join(output_dir, filename)
        resp = requests.get(url)
        resp.raise_for_status()
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(resp.text)
        url_map[file_path] = url
    # PDF
    for pdf in pdf_paths:
        filename = os.path.basename(pdf)
        dest = os.path.join(output_dir, filename)
        if not os.path.exists(dest):
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            os.replace(pdf, dest)
        url_map[dest] = pdf
    with open(os.path.join(output_dir, 'source_map.json'), 'w') as f:
        json.dump(url_map, f, indent=2)
    return list(url_map.keys()), url_map

# 2. Load Documents (HTML & PDF)
def load_documents(files, source_map):
    docs = []
    for path in files:
        if path.lower().endswith('.pdf'):
            loader = PyPDFLoader(path)
            pages = loader.load()
            for doc in pages:
                doc.metadata['source'] = source_map[path]
                docs.append(doc)
        elif path.lower().endswith('.html'):
            loader = UnstructuredHTMLLoader(path)
            for doc in loader.load():
                doc.metadata['source'] = source_map[path]
                docs.append(doc)
    return docs

# 3. Segment into chunks
def segment_documents(docs, clova, segmentation_app_id):
    segmented = []
    for doc in docs:
        segments = clova.segment(doc.page_content, segmentation_app_id)
        for seg in segments:
            segmented.append(Document(page_content=seg, metadata={"source": doc.metadata['source']}))
    return segmented

# 4. Embed & Milvus
def build_vectorstore(docs, clova, embedding_app_id, milvus_uri="127.0.0.1:19530", collection_name="clova_rag"):
    connections.connect(alias="default", uri=milvus_uri)
    if utility.has_collection(collection_name):
        Collection(collection_name).drop()
    fields = [
        FieldSchema(name="id", dtype=DataType.INT64, is_primary=True, auto_id=True),
        FieldSchema(name="source", dtype=DataType.VARCHAR, max_length=500),
        FieldSchema(name="text", dtype=DataType.VARCHAR, max_length=2000),
        FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=1024),
    ]
    schema = CollectionSchema(fields)
    collection = Collection(name=collection_name, schema=schema)
    index_params = {"index_type": "HNSW", "metric_type": "IP", "params": {"M": 8, "efConstruction": 200}}
    collection.create_index(field_name="embedding", index_params=index_params)
    collection.load()
    texts = [d.page_content for d in docs]
    embeddings = clova.embed(texts, embedding_app_id)
    sources = [d.metadata['source'] for d in docs]
    collection.insert([sources, texts, embeddings])
    return collection

# 5. Conversational Retrieval QA 생성
def create_conversational_chain(collection, clova, chat_model_id, k=5):
    retriever = Milvus(collection_name=collection.name, url=collection._connection._alias)
    memory = ConversationBufferMemory(memory_key="chat_history", return_messages=True)
    llm_wrapper = ClovaLLM(clova, chat_model_id)
    conv_chain = ConversationalRetrievalChain.from_llm(
        llm=llm_wrapper,
        retriever=retriever.as_retriever(search_kwargs={"k": k}),
        memory=memory
    )
    return conv_chain

if __name__ == "__main__":
    CLOVA_API_KEY = os.getenv("CLOVA_API_KEY")
    CLOVA_GATEWAY_KEY = os.getenv("CLOVA_GATEWAY_KEY")
    SEGMENT_APP_ID = os.getenv("CLOVA_SEGMENT_APP_ID")
    EMBEDDING_APP_ID = os.getenv("CLOVA_EMBEDDING_APP_ID")
    CHAT_MODEL_ID = os.getenv("CLOVA_CHAT_MODEL_ID")

    URL_LIST = [
        "https://www.ncloud-forums.com/topic/422/",
        "https://www.ncloud-forums.com/topic/428/",
        "https://www.ncloud-forums.com/topic/307/"
    ]
    PDF_PATHS = []

    files, source_map = fetch_sources(URL_LIST, PDF_PATHS)
    docs = load_documents(files, source_map)
    clova = CLOVAClient(CLOVA_API_KEY, CLOVA_GATEWAY_KEY)
    seg_docs = segment_documents(docs, clova, SEGMENT_APP_ID)
    collection = build_vectorstore(seg_docs, clova, EMBEDDING_APP_ID)
    conv_chain = create_conversational_chain(collection, clova, CHAT_MODEL_ID)

    print("PDF/HTML 기반 HyperCLOVA 챗봇, 'exit' 입력 시 종료")
    while True:
        user_input = input("You: ")
        if user_input.lower() == 'exit':
            break
        result = conv_chain.run({'question': user_input})
        print("Bot:", result)
