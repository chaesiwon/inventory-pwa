# 장기재고 소진계획 관리 시스템 - PWA 프론트엔드

URL 접속 + PWA 설치 방식의 프론트엔드입니다.
백엔드(Python FastAPI)는 별도 저장소에서 Render에 배포됩니다.

## 구조

```
inventory-pwa/          ← 이 저장소 (Vercel 배포)
  public/
    index.html          기존 UI 100% 유지
    css/style.css       기존 스타일 100% 유지
    js/app.js           기존 기능 100% 유지 + API URL 환경변수화
    manifest.json       PWA 설치 설정
    sw.js               Service Worker (오프라인 캐싱)
    icons/              앱 아이콘
  vercel.json           Vercel 배포 설정

inventory-api/          ← 별도 저장소 (Render 배포)
  backend/
  main.py
  requirements.txt
```

## 배포 방법

### 1단계: API URL 설정
```bash
# Render 배포 후 받은 URL로 치환
./update-api-url.sh https://your-app.onrender.com
```
(Windows: `update-api-url.bat https://your-app.onrender.com`)

### 2단계: GitHub 업로드
```bash
git init
git add .
git commit -m "Initial PWA deployment"
git remote add origin https://github.com/your-id/inventory-pwa.git
git push -u origin main
```

### 3단계: Vercel 배포
1. https://vercel.com 접속 → GitHub로 로그인
2. "New Project" → inventory-pwa 저장소 선택
3. Framework: **Other**
4. Root Directory: `.`
5. Deploy 클릭
