#!/bin/bash
# Render API URL을 index.html에 적용하는 스크립트
# 사용법: ./update-api-url.sh https://your-app.onrender.com

API_URL=${1:-""}

if [ -z "$API_URL" ]; then
  echo "사용법: ./update-api-url.sh https://your-render-url.onrender.com"
  exit 1
fi

# index.html의 REPLACE_WITH_RENDER_URL 치환
sed -i "s|REPLACE_WITH_RENDER_URL|${API_URL}|g" public/index.html

echo "API URL 설정 완료: $API_URL"
echo "이제 git commit & push 후 Vercel 자동 배포됩니다."
