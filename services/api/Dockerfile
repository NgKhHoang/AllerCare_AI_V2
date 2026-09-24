# syntax=docker/dockerfile:1

# ---------- Stage 1: builder — cài dependencies vào /opt/venv ----------
FROM python:3.12-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

# Copy chỉ file khai báo deps để tận dụng layer cache
COPY pyproject.toml ./

RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade pip \
    && /opt/venv/bin/pip install .

# Copy code nguồn (thay đổi thường xuyên → để sau cùng để cache tốt hơn)
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
# Lưu ý: thư mục data/ của dự án KHÔNG nằm trong build context này (nó ở gốc repo);
# nó được mount vào /srv/data qua docker-compose ở runtime.

# ---------- Stage 2: runtime — image nhỏ, không toolchain build ----------
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH"

# Tạo user không phải root
RUN groupadd -r allercare && useradd -r -g allercare -d /srv allercare

WORKDIR /srv

# Copy venv từ builder + mã nguồn
COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /build/app ./app
COPY --from=builder /build/alembic ./alembic
COPY --from=builder /build/alembic.ini ./
COPY entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh \
    # APK/migration cần ghi vào thư mục làm việc (sqlite fallback) — cấp quyền cho user
    && chown -R allercare:allercare /srv

USER allercare

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/v1/healthz', timeout=4).status==200 else 1)"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
