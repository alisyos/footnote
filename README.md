# 문서 각주 생성 시스템

OpenAI API를 활용하여 문서에서 선택한 단어에 대한 각주를 자동으로 생성하는 시스템입니다.

## 주요 기능

- **문서 업로드**: DOCX, PDF, TXT 파일 지원
- **직접 입력**: 텍스트 직접 입력 가능
- **단어 선택**: 드래그로 단어 선택
- **자동 정의 생성**: GPT-4를 사용한 맥락 기반 단어 정의
- **각주 삽입**: 선택 가능한 정의로 각주 생성
- **좌우 분할 UI**: 원본 문서와 정의를 동시에 확인

## 기술 스택

- **Frontend**: Next.js 14, React, TypeScript
- **Styling**: Tailwind CSS
- **AI**: OpenAI GPT-4 API
- **파일 처리**: mammoth (DOCX), pdf-parse (PDF)
- **배포**: Vercel

## 설치 및 실행

### 1. 프로젝트 클론

```bash
git clone <repository-url>
cd footnote
```

### 2. 의존성 설치

```bash
npm install
```

### 3. 환경변수 설정

`.env.local` 파일을 생성하고 OpenAI API 키를 설정하세요:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

### 4. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인하세요.

## 사용 방법

1. **문서 업로드**: 파일을 드래그하거나 직접 텍스트를 입력합니다.
2. **단어 선택**: 좌측 문서에서 궁금한 단어를 드래그로 선택합니다.
3. **정의 생성**: "정의 생성" 버튼을 클릭합니다.
4. **정의 선택**: 우측에서 원하는 정의를 체크박스로 선택합니다.
5. **각주 삽입**: "각주 삽입" 버튼을 클릭하여 문서에 각주를 추가합니다.

## Vercel 배포

### 1. Vercel CLI 설치

```bash
npm i -g vercel
```

### 2. 배포

```bash
vercel
```

### 3. 환경변수 설정

Vercel 대시보드에서 환경변수를 설정하세요:
- `OPENAI_API_KEY`: OpenAI API 키

## API 엔드포인트

### POST /api/generate-definition

문맥을 기반으로 단어의 정의를 생성합니다.

**요청 본문:**
```json
{
  "text": "맥락 텍스트 (7문장)",
  "word": "정의할 단어"
}
```

**응답:**
```json
{
  "word": "단어",
  "definition": ["의미1", "의미2"],
  "example": "예시 문장"
}
```

### POST /api/parse-document

업로드된 문서에서 텍스트를 추출합니다.

**요청**: FormData with 'file' field

**응답:**
```json
{
  "text": "추출된 텍스트"
}
```

## 라이센스

MIT License
