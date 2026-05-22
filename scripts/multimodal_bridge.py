from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import fitz
from fastapi import FastAPI, File, Form, HTTPException, UploadFile


BASE_DIR = Path(__file__).resolve().parent.parent
TOOLS_DIR = BASE_DIR / "tools"
WHISPER_DIR = TOOLS_DIR / "whisper" / "Release"
WHISPER_MODEL = TOOLS_DIR / "whisper" / "models" / "ggml-base.bin"
TESSERACT_EXE = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")
TESSDATA_DIR = TOOLS_DIR / "tessdata"
FFMPEG_EXE = Path(r"C:\ffmpeg\ffmpeg-8.0.1-essentials_build\bin\ffmpeg.exe")

app = FastAPI(title="AuditLens Multimodal Bridge")


def ensure_paths() -> None:
    missing = []
    for path in [WHISPER_DIR / "whisper-cli.exe", WHISPER_MODEL, TESSERACT_EXE, FFMPEG_EXE, TESSDATA_DIR / "chi_sim.traineddata"]:
        if not path.exists():
            missing.append(str(path))
    if missing:
        raise RuntimeError(f"Missing required local OCR/ASR dependency: {missing}")


def save_upload(upload: UploadFile, suffix: str = "") -> Path:
    name_suffix = suffix or Path(upload.filename or "upload").suffix
    fd, temp_path = tempfile.mkstemp(suffix=name_suffix)
    os.close(fd)
    path = Path(temp_path)
    with path.open("wb") as handle:
        shutil.copyfileobj(upload.file, handle)
    return path


def run_command(args: list[str]) -> None:
    subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def ocr_image(path: Path) -> str:
    result = subprocess.run(
        [
            str(TESSERACT_EXE),
            str(path),
            "stdout",
            "--tessdata-dir",
            str(TESSDATA_DIR),
            "-l",
            "chi_sim+eng",
        ],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="ignore",
    )
    return result.stdout.strip()


def ocr_pdf(path: Path) -> str:
    texts: list[str] = []
    with fitz.open(path) as document:
        for page_index in range(document.page_count):
            page = document.load_page(page_index)
            pixmap = page.get_pixmap(dpi=200)
            image_path = path.with_name(f"{path.stem}-page-{page_index + 1}.png")
            pixmap.save(image_path)
            try:
                page_text = ocr_image(image_path)
            finally:
                image_path.unlink(missing_ok=True)
            if page_text:
                texts.append(page_text)
    return "\n\n".join(texts).strip()


def transcribe_audio(path: Path) -> str:
    wav_path = path.with_suffix(".normalized.wav")
    run_command(
        [
            str(FFMPEG_EXE),
            "-y",
            "-i",
            str(path),
            "-ac",
            "1",
            "-ar",
            "16000",
            str(wav_path),
        ]
    )

    output_base = wav_path.parent / wav_path.stem
    run_command(
        [
            str(WHISPER_DIR / "whisper-cli.exe"),
            "-m",
            str(WHISPER_MODEL),
            "-f",
            str(wav_path),
            "-l",
            "zh",
            "-otxt",
            "-of",
            str(output_base),
            "-np",
        ]
    )

    transcript_path = Path(f"{output_base}.txt")
    text = transcript_path.read_text(encoding="utf-8", errors="ignore").strip()
    transcript_path.unlink(missing_ok=True)
    wav_path.unlink(missing_ok=True)
    return text


@app.get("/health")
def health() -> dict[str, str]:
    ensure_paths()
    return {"status": "ok"}


@app.post("/ocr")
async def ocr(
    file: UploadFile = File(...),
    provider: str = Form(default=""),
    mode: str = Form(default="ocr"),
    model: str = Form(default=""),
    prompt: str = Form(default=""),
) -> dict[str, str]:
    del provider, mode, model, prompt
    ensure_paths()
    temp_path = save_upload(file)
    try:
        suffix = temp_path.suffix.lower()
        if suffix == ".pdf":
            transcript_text = ocr_pdf(temp_path)
        else:
            transcript_text = ocr_image(temp_path)
        if not transcript_text:
            raise HTTPException(status_code=422, detail="OCR returned empty text")
        return {"transcript_text": transcript_text}
    except subprocess.CalledProcessError as error:
        raise HTTPException(status_code=500, detail=error.stderr.decode("utf-8", errors="ignore") if isinstance(error.stderr, bytes) else str(error.stderr)) from error
    finally:
        temp_path.unlink(missing_ok=True)


@app.post("/speech")
async def speech(
    file: UploadFile = File(...),
    provider: str = Form(default=""),
    mode: str = Form(default="speech"),
    model: str = Form(default=""),
    prompt: str = Form(default=""),
) -> dict[str, str]:
    del provider, mode, model, prompt
    ensure_paths()
    temp_path = save_upload(file)
    try:
        transcript_text = transcribe_audio(temp_path)
        if not transcript_text:
            raise HTTPException(status_code=422, detail="speech recognition returned empty text")
        return {"transcript_text": transcript_text}
    except subprocess.CalledProcessError as error:
        raise HTTPException(status_code=500, detail=error.stderr.decode("utf-8", errors="ignore") if isinstance(error.stderr, bytes) else str(error.stderr)) from error
    finally:
        temp_path.unlink(missing_ok=True)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8090)
