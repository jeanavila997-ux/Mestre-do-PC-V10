"""Motor de áudio do Mestre do PC: grava do microfone padrão e transcreve com faster-whisper.

Uso (chamado pelo audio-transcriber.js):
  python whisper_engine.py record <segundos> <saida.wav>
  python whisper_engine.py transcribe <audio.wav> <idioma> <modelo>

Cada comando imprime uma linha JSON na saída padrão.
"""

import json
import sys
import time


def record(seconds, out_path):
    import sounddevice as sd
    import soundfile as sf

    rate = 16000
    frames = sd.rec(int(seconds * rate), samplerate=rate, channels=1, dtype="float32")
    sd.wait()
    sf.write(out_path, frames, rate, subtype="PCM_16")
    return {"audioPath": out_path, "duration": seconds}


def transcribe(audio_path, language, model_name):
    from faster_whisper import WhisperModel

    started = time.time()
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, info = model.transcribe(audio_path, language=language or None, beam_size=5)
    text = " ".join(segment.text.strip() for segment in segments).strip()
    return {
        "text": text,
        "language": info.language,
        "languageProbability": round(info.language_probability, 2),
        "elapsedSeconds": round(time.time() - started, 1),
    }


def main(argv):
    if len(argv) < 2:
        raise SystemExit("uso: whisper_engine.py record|transcribe ...")
    command = argv[1]
    if command == "record":
        result = record(float(argv[2]), argv[3])
    elif command == "transcribe":
        result = transcribe(argv[2], argv[3] if len(argv) > 3 else "pt", argv[4] if len(argv) > 4 else "base")
    else:
        raise SystemExit(f"comando desconhecido: {command}")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv)
