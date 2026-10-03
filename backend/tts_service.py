import io
import logging
import edge_tts

logger = logging.getLogger(__name__)

# =========================================================
# AVAILABLE VOICES
# =========================================================

VOICE_MAP = {
    # Hindi
    "Madhur": "hi-IN-MadhurNeural",
    "Swara": "hi-IN-SwaraNeural",

    # English (India)
    "Neerja": "en-IN-NeerjaNeural",
    "Prabhat": "en-IN-PrabhatNeural",

    # English (US)
    "Jenny": "en-US-JennyNeural",
    "Guy": "en-US-GuyNeural",
    "Aria": "en-US-AriaNeural",

    # Japanese
    "Nanami": "ja-JP-NanamiNeural",
    "Keita": "ja-JP-KeitaNeural",

    # Chinese
    "Xiaoxiao": "zh-CN-XiaoxiaoNeural",
    "Yunxi": "zh-CN-YunxiNeural",
}

DEFAULT_VOICE = "Madhur"


# =========================================================
# GENERATE TTS AUDIO (ASYNC)
# =========================================================

async def generate_tts_audio(text: str, voice: str = "Madhur") -> bytes:
    """
    Generate TTS audio using Edge-TTS.
    Returns MP3 bytes.
    """

    if not text or not text.strip():
        raise RuntimeError("TTS_EMPTY_TEXT")

    text = text.strip()

    if len(text) > 5000:
        text = text[:5000]

    edge_voice = VOICE_MAP.get(voice, VOICE_MAP[DEFAULT_VOICE])

    try:
        communicate = edge_tts.Communicate(text, edge_voice)
        audio_buffer = io.BytesIO()

        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_buffer.write(chunk["data"])

        audio_bytes = audio_buffer.getvalue()

        if not audio_bytes:
            raise RuntimeError("TTS_NO_AUDIO")

        return audio_bytes

    except Exception as e:
        logger.exception("Edge-TTS generation failed.")
        raise RuntimeError(f"TTS_GENERATION_ERROR: {str(e)}") from e