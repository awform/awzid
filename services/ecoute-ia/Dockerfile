# Awzid — A5 « l'IA qui écoute la récitation » : service d'écoute (CPU), interne au réseau Docker.
# Le modèle n'est PAS dans l'image : il est monté en lecture seule (/model), avec sa licence (LICENCES.md).
# Aucun volume d'écriture : système de fichiers en lecture seule (compose), l'audio ne vit qu'en mémoire.
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    OMP_NUM_THREADS=4 MKL_NUM_THREADS=4 HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libsndfile1 build-essential \
    && rm -rf /var/lib/apt/lists/*
RUN pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
RUN pip install "nemo_toolkit[asr]" transformers "fastapi>=0.115" "uvicorn>=0.30" pytest httpx
RUN useradd -r -u 10050 ecoute

# service : code seulement (l'évaluation utilise la cible « base » avec ses propres scripts montés)
FROM base AS service
WORKDIR /srv
COPY ecoute.py asr.py /srv/
COPY tests /srv/tests
USER ecoute
EXPOSE 8000
CMD ["uvicorn", "ecoute:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
