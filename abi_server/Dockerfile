FROM python:3.11.6-slim

RUN apt update && apt install -y git
RUN pip install fastapi uvicorn psycopg2-binary multicall-py
RUN pip install git+https://github.com/jsvisa/multicall.py@upgrade-eth-abi
RUN pip install git+https://github.com/jsvisa/eth-abi@decode-less-strict

COPY . /tmp/app/

RUN true && \
    pip install /tmp/app && \
    rm -rf /tmp/app && \
    true

WORKDIR /app

CMD ["abi-server"]
