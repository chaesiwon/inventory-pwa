@echo off
:: Render API URL을 index.html에 적용
:: 사용법: update-api-url.bat https://your-app.onrender.com
set API_URL=%1
if "%API_URL%"=="" (
  echo 사용법: update-api-url.bat https://your-render-url.onrender.com
  exit /b 1
)
powershell -Command "(Get-Content public\index.html) -replace 'REPLACE_WITH_RENDER_URL', '%API_URL%' | Set-Content public\index.html"
echo API URL 설정 완료: %API_URL%
