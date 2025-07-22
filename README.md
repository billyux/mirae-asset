# HyperCLOVA PDF/HTML 기반 챗봇

이 프로젝트는 네이버 클라우드의 HyperCLOVA X 모델을 사용하여 PDF 및 HTML 문서를 기반으로 질의응답 및 대화를 수행하는 RAG 챗봇입니다.

## 파일 목록

- `rag_pipeline.py`: 메인 스크립트. PDF/HTML 문서 로드, 청크 분할, 임베딩, Milvus 벡터 스토어 구축, 대화형 RAG 체인 구성.
- `requirements.txt`: 필요한 패키지 목록.
- `.gitignore`: 무시할 파일/폴더 설정.

## 설치

```bash
git clone <repository_url>
cd <repository>
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## 환경 변수 설정

다음 환경 변수들을 설정해주세요:

- `CLOVA_API_KEY`
- `CLOVA_GATEWAY_KEY`
- `CLOVA_SEGMENT_APP_ID`
- `CLOVA_EMBEDDING_APP_ID`
- `CLOVA_CHAT_MODEL_ID`

## 사용법

```bash
python rag_pipeline.py
```

실행 시 `URL_LIST`와 `PDF_PATHS`에 원하는 HTML URL 목록과 PDF 파일 경로를 설정한 뒤, 터미널에서 질문을 입력하세요. `exit` 입력 시 종료됩니다.
