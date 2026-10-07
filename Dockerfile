FROM python:3.12-slim

# Thiết lập biến môi trường
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

WORKDIR /app

# Cài đặt thư viện Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Sao chép mã nguồn backend và frontend
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Mở cổng ứng dụng
EXPOSE 8000

# Khởi chạy uvicorn (tự động nhận biến $PORT nếu triển khai trên Render/Railway/Cloud Run)
CMD ["sh", "-c", "uvicorn main:app --app-dir backend --host 0.0.0.0 --port ${PORT:-8000}"]
