FROM python:3.12-slim
WORKDIR /srv/jobagent
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV TZ=America/Toronto
EXPOSE 8000
# bind 0.0.0.0 only behind HTTPS and with DASHBOARD_TOKEN set
CMD ["python", "-m", "app.cli", "serve", "--host", "0.0.0.0", "--port", "8000"]
