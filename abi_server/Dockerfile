FROM python:3.11-alpine AS builder

RUN apk add --no-cache git gcc musl-dev postgresql-dev libffi-dev

COPY . /tmp/app/

RUN pip install --no-cache-dir \
    fastapi uvicorn psycopg2 multicall-py \
    git+https://github.com/jsvisa/multicall.py@upgrade-eth-abi \
    git+https://github.com/jsvisa/eth-abi@decode-less-strict && \
    pip install --no-cache-dir /tmp/app

FROM python:3.11-alpine

RUN apk add --no-cache libpq

COPY --from=builder /usr/local/lib/python3.11/site-packages/ /usr/local/lib/python3.11/site-packages/
COPY --from=builder /usr/local/bin/abi-server /usr/local/bin/abi-server

WORKDIR /app

CMD ["abi-server"]
