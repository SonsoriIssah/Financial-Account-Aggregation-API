FROM python:3.12-slim
WORKDIR /srv
RUN pip install --no-cache-dir "fastapi>=0.111" "uvicorn>=0.30"
COPY app.py /srv/mockbank/app.py
COPY __init__.py /srv/mockbank/__init__.py
EXPOSE 9000
CMD ["uvicorn", "mockbank.app:app", "--host", "0.0.0.0", "--port", "9000"]
