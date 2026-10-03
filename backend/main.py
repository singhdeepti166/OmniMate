import os
import re
import logging

from dotenv import load_dotenv
from fastapi import (
    FastAPI,
    HTTPException,
    Request,
    UploadFile,
    File,
    Form,
    Header,
)
from fastapi.responses import (
    JSONResponse,
    Response,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from ai_service import ask_ai, clear_conversation
from safety import safety_check, prompt_abuse_check
from database import (
    init_database,
    create_chat,
    add_message,
    get_all_chats,
    get_chat,
    update_chat_title,
    delete_chat,
    delete_all_chats,
    get_message_image,
    create_user,
    get_user_by_username,
)
from tts_service import generate_tts_audio
from document_service import extract_text_from_document
from search_service import web_search, format_search_context
from weather_service import get_weather
from maps_service import maps_helper
from auth_service import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
)

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)

SUPPORTED_EXTENSIONS = (".pdf", ".docx", ".txt", ".md", ".markdown", ".csv")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# Modes where live weather/maps context should be checked.
CONTEXT_AWARE_MODES = ("general", "study")

app = FastAPI(
    title="My AI Assistant Backend",
    version="1.0.0",
)

app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        FRONTEND_URL,
        "https://omnimate-ai.netlify.app",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def validate_username(username: str) -> str:
    username = (username or "").strip().lower()
    if len(username) < 3 or len(username) > 30:
        raise HTTPException(status_code=400, detail="Username must be 3-30 characters.")
    if not re.fullmatch(r"[a-z0-9_]+", username):
        raise HTTPException(
            status_code=400,
            detail="Username can only contain letters, numbers, and underscore.",
        )
    return username


def validate_password(password: str) -> str:
    password = password or ""
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    if len(password) > 72:
        raise HTTPException(status_code=400, detail="Password too long.")
    return password


def get_user_id_from_auth(authorization: str | None):
    if not authorization:
        return None
    token = authorization.replace("Bearer ", "").strip()
    if not token:
        return None
    payload = decode_access_token(token)
    if not payload:
        return None
    return payload.get("user_id")


def require_user_id(authorization: str | None) -> int:
    """
    Security helper: resolves the user_id from the auth header and
    raises 401 if there isn't a valid one. Use this on any endpoint
    that reads or modifies user-owned data.
    """
    user_id = get_user_id_from_auth(authorization)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return user_id


def extract_city_for_weather(text: str):
    if not text:
        return None

    lower = text.lower()
    if not any(w in lower for w in ["weather", "mausam", "temperature", "tapman"]):
        return None

    match = re.search(
        r"\b([A-Za-z][A-Za-z\s]{0,30}?)\s+(?:weather|mausam|temperature|tapman)\b",
        text,
        flags=re.I,
    )
    if match:
        city = match.group(1).strip(" ?.!,")
        city = re.sub(
            r"\b(what|is|the|ka|ki|ke|kaisa|kaisi|kaise|batao|bata|please)\b",
            "",
            city,
            flags=re.I,
        ).strip()
        if city and len(city) < 40:
            return city

    match = re.search(
        r"(?:weather|mausam|temperature|tapman)\s+(?:in|at|of|for)?\s*([A-Za-z][A-Za-z\s]{0,30})",
        text,
        flags=re.I,
    )
    if match:
        city = match.group(1).strip(" ?.!,")
        city = re.sub(
            r"\b(what|is|the|ka|ki|ke|kaisa|kaisi|kaise|batao|bata|please|hai)\b",
            "",
            city,
            flags=re.I,
        ).strip()
        if city and len(city) < 40:
            return city

    return "Delhi"


@app.on_event("startup")
def startup_event():
    try:
        init_database()
        logger.info("Database initialized successfully.")
    except Exception:
        logger.exception("Database initialization failed.")
        raise


@app.get("/")
def home():
    return {
        "message": "AI Assistant backend is running!",
        "status": "success",
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "AI Assistant Backend",
    }


@app.post("/register")
@limiter.limit("5/minute")
def register(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
):
    username = validate_username(username)
    password = validate_password(password)

    existing = get_user_by_username(username)
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists.")

    user_id = create_user(username, hash_password(password))
    token = create_access_token(user_id, username)

    return {
        "status": "success",
        "token": token,
        "username": username,
        "user_id": user_id,
    }


@app.post("/login")
@limiter.limit("10/minute")
def login(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
):
    username = validate_username(username)
    password = validate_password(password)

    user = get_user_by_username(username)
    if not user or not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    token = create_access_token(user["id"], user["username"])
    return {
        "status": "success",
        "token": token,
        "username": user["username"],
        "user_id": user["id"],
    }


@app.post("/new-chat")
def new_chat(
    title: str = Form(default="New Chat"),
    authorization: str | None = Header(default=None),
):
    try:
        user_id = require_user_id(authorization)
        clear_conversation()
        clean_title = title.strip() or "New Chat"
        if len(clean_title) > 100:
            clean_title = clean_title[:100]

        chat_id = create_chat(clean_title, user_id=user_id)

        return {
            "status": "success",
            "chat_id": chat_id,
            "title": clean_title,
            "message": "New chat started successfully.",
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error while starting new chat.")
        raise HTTPException(status_code=500, detail="Could not start new chat.")


@app.post("/chat")
@limiter.limit("10/minute")
async def chat(
    request: Request,
    message: str = Form(default=""),
    chat_id: int | None = Form(default=None),
    mode: str = Form(default="general"),
    image: UploadFile | None = File(default=None),
    file: UploadFile | None = File(default=None),
    web_search_enabled: str = Form(default="false"),
    explain_level: str = Form(default="normal"),
    authorization: str | None = Header(default=None),
):
    try:
        user_id = require_user_id(authorization)
        message = (message or "").strip()

        if not message and image is None and file is None:
            return {
                "status": "blocked",
                "message": "Please enter a message or upload a file.",
            }

        image_bytes = None
        image_mime_type = None
        image_filename = None
        document_text = None
        file_filename = None

        if image is not None:
            filename = (image.filename or "").lower()
            content_type = image.content_type or ""
            file_bytes = await image.read()

            if len(file_bytes) > 15 * 1024 * 1024:
                raise HTTPException(status_code=413, detail="File must be smaller than 15 MB.")

            if filename.endswith(SUPPORTED_EXTENSIONS):
                try:
                    document_text = extract_text_from_document(file_bytes, filename)
                    if not document_text:
                        return {
                            "status": "blocked",
                            "message": "Could not extract any text from this document.",
                        }
                    file_filename = image.filename or "document"
                except Exception:
                    logger.exception("Document extraction failed.")
                    raise HTTPException(status_code=400, detail="Failed to read document.")
            elif content_type.startswith("image/"):
                if len(file_bytes) > 10 * 1024 * 1024:
                    raise HTTPException(status_code=413, detail="Image must be smaller than 10 MB.")
                image_bytes = file_bytes
                image_mime_type = content_type
                image_filename = image.filename or "image"
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Supported files: Images, PDF, DOCX, TXT, MD, CSV",
                )

        if file is not None:
            file_filename = file.filename or "document"
            filename_lower = file_filename.lower()
            file_bytes = await file.read()

            if len(file_bytes) > 15 * 1024 * 1024:
                raise HTTPException(status_code=413, detail="File must be smaller than 15 MB.")

            if filename_lower.endswith(SUPPORTED_EXTENSIONS):
                try:
                    document_text = extract_text_from_document(file_bytes, filename_lower)
                    if not document_text:
                        return {
                            "status": "blocked",
                            "message": "Could not extract any text from this document.",
                        }
                except Exception:
                    logger.exception("Document extraction failed.")
                    raise HTTPException(status_code=400, detail="Failed to read document.")
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Supported files: PDF, DOCX, TXT, MD, CSV",
                )

        if message:
            if not safety_check(message):
                return {"status": "blocked", "message": "I can't process this request."}
            if not prompt_abuse_check(message):
                return {
                    "status": "blocked",
                    "message": "I can't follow requests that attempt to override or reveal system instructions.",
                }

        if chat_id is None:
            chat_id = create_chat("New Chat", user_id=user_id)
        else:
            existing_chat = get_chat(chat_id, user_id=user_id)
            if existing_chat is None:
                raise HTTPException(status_code=404, detail="Chat not found.")

        final_message = message

        if document_text:
            final_message = (
                "Here is the content of the uploaded document:\n\n"
                f"{document_text}\n\n"
                "-------------------------\n\n"
                f"User Question: {message if message else 'Please summarize this document.'}"
            )

        search_enabled = str(web_search_enabled).lower() in ("1", "true", "yes", "on")
        if search_enabled and message:
            search_results = web_search(message, max_results=5)
            search_context = format_search_context(message, search_results)

            if document_text:
                final_message = (
                    f"{search_context}\n\n"
                    "-------------------------\n\n"
                    f"{final_message}"
                )
            else:
                final_message = (
                    f"{search_context}\n\n"
                    "-------------------------\n\n"
                    f"User Question: {message}"
                )

        if mode in CONTEXT_AWARE_MODES:
            city = extract_city_for_weather(message)
            if city:
                weather_context = get_weather(city)
                final_message = (
                    f"{final_message}\n\n"
                    "-------------------------\n\n"
                    "LIVE WEATHER DATA:\n"
                    f"{weather_context}"
                )

            maps_context = maps_helper(message)
            if maps_context:
                final_message = (
                    f"{final_message}\n\n"
                    "-------------------------\n\n"
                    "LIVE MAPS DATA:\n"
                    f"{maps_context}"
                )

        database_user_message = message
        if image_bytes is not None:
            database_user_message = f"Image attached\n\n{message}" if message else "Image attached"
        elif document_text is not None:
            database_user_message = (
                f"Document attached: {file_filename}\n\n{message}"
                if message
                else f"Document attached: {file_filename}"
            )
        elif search_enabled:
            database_user_message = f"[Web Search] {message}"

        user_message_id = add_message(
            chat_id=chat_id,
            role="user",
            text=database_user_message,
            image_bytes=image_bytes,
            image_mime_type=image_mime_type,
            image_filename=image_filename,
        )

        try:
            answer = ask_ai(
                message=final_message,
                image_bytes=image_bytes,
                image_mime_type=image_mime_type,
                mode=mode,
                explain_level=explain_level,
            )
        except RuntimeError:
            add_message(
                chat_id=chat_id,
                role="assistant",
                text="Sorry, I couldn't process that request right now. Please try again.",
            )
            raise

        assistant_message_id = add_message(
            chat_id=chat_id,
            role="assistant",
            text=answer,
        )

        current_chat = get_chat(chat_id, user_id=user_id)
        if current_chat and current_chat["title"] == "New Chat":
            if message:
                title = message.strip()
            elif document_text is not None:
                title = f"Doc: {file_filename}"
            elif image_bytes is not None:
                title = "Image Chat"
            else:
                title = "New Chat"

            if len(title) > 30:
                title = title[:30] + "..."
            update_chat_title(chat_id, title)

        attachment = None
        if image_bytes is not None:
            attachment = {
                "name": image_filename or "image",
                "type": image_mime_type,
                "mime_type": image_mime_type,
                "isImage": True,
                "is_image": True,
                "url": f"/messages/{user_message_id}/image",
            }
        elif document_text is not None:
            attachment = {
                "name": file_filename,
                "type": "document",
                "mime_type": "document",
                "isImage": False,
                "is_image": False,
            }

        return {
            "status": "success",
            "chat_id": chat_id,
            "user_message_id": user_message_id,
            "assistant_message_id": assistant_message_id,
            "user_message": database_user_message,
            "assistant_response": answer,
            "attachment": attachment,
            "mode": mode,
        }

    except RuntimeError as e:
        error_code = str(e)
        if "AI_QUOTA_EXCEEDED" in error_code:
            raise HTTPException(status_code=429, detail="AI quota has been exceeded. Please try again later.")
        if "AI_SERVICE_UNAVAILABLE" in error_code:
            raise HTTPException(status_code=503, detail="AI service is temporarily unavailable.")
        if "AI_CLIENT_ERROR" in error_code:
            raise HTTPException(status_code=502, detail="AI service could not process the request.")
        if "AI_SERVER_ERROR" in error_code:
            raise HTTPException(status_code=503, detail="AI service encountered a server error.")
        logger.exception("Unknown AI runtime error.")
        raise HTTPException(status_code=500, detail="Something went wrong while processing your request.")

    except HTTPException:
        raise
    except Exception:
        logger.exception("Error while processing /chat.")
        raise HTTPException(status_code=500, detail="Something went wrong while processing your request.")


@app.post("/regenerate")
@limiter.limit("10/minute")
async def regenerate(
    request: Request,
    chat_id: int = Form(...),
    message: str = Form(...),
    mode: str = Form(default="general"),
    explain_level: str = Form(default="normal"),
    web_search_enabled: str = Form(default="false"),
    existing_attachment_url: str | None = Form(default=None),
    authorization: str | None = Header(default=None),
):
    try:
        user_id = require_user_id(authorization)
        message = (message or "").strip()
        if not message:
            raise HTTPException(status_code=400, detail="Message cannot be empty.")

        existing_chat = get_chat(chat_id, user_id=user_id)
        if existing_chat is None:
            raise HTTPException(status_code=404, detail="Chat not found.")

        if not safety_check(message):
            return {"status": "blocked", "message": "I can't process this request."}
        if not prompt_abuse_check(message):
            return {
                "status": "blocked",
                "message": "I can't follow requests that attempt to override or reveal system instructions.",
            }

        final_message = message

        search_enabled = str(web_search_enabled).lower() in ("1", "true", "yes", "on")
        if search_enabled:
            search_results = web_search(message, max_results=5)
            search_context = format_search_context(message, search_results)
            final_message = (
                f"{search_context}\n\n"
                "-------------------------\n\n"
                f"User Question: {message}"
            )

        if mode in CONTEXT_AWARE_MODES:
            city = extract_city_for_weather(message)
            if city:
                weather_context = get_weather(city)
                final_message = (
                    f"{final_message}\n\n"
                    "-------------------------\n\n"
                    "LIVE WEATHER DATA:\n"
                    f"{weather_context}"
                )

            maps_context = maps_helper(message)
            if maps_context:
                final_message = (
                    f"{final_message}\n\n"
                    "-------------------------\n\n"
                    "LIVE MAPS DATA:\n"
                    f"{maps_context}"
                )

        answer = ask_ai(
            message=final_message,
            mode=mode,
            explain_level=explain_level,
        )

        assistant_message_id = add_message(
            chat_id=chat_id,
            role="assistant",
            text=answer,
        )

        return {
            "status": "success",
            "chat_id": chat_id,
            "assistant_message_id": assistant_message_id,
            "assistant_response": answer,
        }

    except RuntimeError as e:
        error_code = str(e)
        if "AI_QUOTA_EXCEEDED" in error_code:
            raise HTTPException(status_code=429, detail="AI quota has been exceeded. Please try again later.")
        if "AI_SERVICE_UNAVAILABLE" in error_code:
            raise HTTPException(status_code=503, detail="AI service is temporarily unavailable.")
        if "AI_CLIENT_ERROR" in error_code:
            raise HTTPException(status_code=502, detail="AI service could not process the request.")
        if "AI_SERVER_ERROR" in error_code:
            raise HTTPException(status_code=503, detail="AI service encountered a server error.")
        logger.exception("Unknown AI runtime error during regenerate.")
        raise HTTPException(status_code=500, detail="Something went wrong while regenerating.")
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error while regenerating response.")
        raise HTTPException(status_code=500, detail="Could not regenerate.")


@app.get("/chats")
def chats(authorization: str | None = Header(default=None)):
    try:
        user_id = require_user_id(authorization)
        history = get_all_chats(user_id=user_id)
        return {"status": "success", "chats": history}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error while getting chat history.")
        raise HTTPException(status_code=500, detail="Could not load chat history.")


@app.get("/chats/{chat_id}")
def get_single_chat(
    chat_id: int,
    authorization: str | None = Header(default=None),
):
    try:
        user_id = require_user_id(authorization)
        chat_data = get_chat(chat_id, user_id=user_id)
        if chat_data is None:
            raise HTTPException(status_code=404, detail="Chat not found.")
        return {"status": "success", "chat": chat_data}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error while loading chat.")
        raise HTTPException(status_code=500, detail="Could not load chat.")


@app.get("/messages/{message_id}/image")
def get_message_image_endpoint(message_id: int):
    try:
        image = get_message_image(message_id)
        if image is None:
            raise HTTPException(status_code=404, detail="Image not found.")
        return Response(
            content=image["image_data"],
            media_type=image["mime_type"],
            headers={
                "Cache-Control": "public, max-age=3600",
                "Content-Disposition": f'inline; filename="{image["filename"]}"',
            },
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error while loading message image.")
        raise HTTPException(status_code=500, detail="Could not load image.")


@app.put("/chats/{chat_id}")
def rename_chat(
    chat_id: int,
    title: str = Form(...),
    authorization: str | None = Header(default=None),
):
    try:
        user_id = require_user_id(authorization)
        existing_chat = get_chat(chat_id, user_id=user_id)
        if existing_chat is None:
            raise HTTPException(status_code=404, detail="Chat not found.")

        clean_title = title.strip()
        if not clean_title:
            raise HTTPException(status_code=400, detail="Chat title cannot be empty.")
        if len(clean_title) > 100:
            clean_title = clean_title[:100]

        update_chat_title(chat_id, clean_title)
        return {
            "status": "success",
            "message": "Chat renamed successfully.",
            "chat_id": chat_id,
            "title": clean_title,
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error while renaming chat.")
        raise HTTPException(status_code=500, detail="Could not rename chat.")


@app.delete("/chats/{chat_id}")
def remove_chat(
    chat_id: int,
    authorization: str | None = Header(default=None),
):
    try:
        user_id = require_user_id(authorization)
        existing_chat = get_chat(chat_id, user_id=user_id)
        if existing_chat is None:
            raise HTTPException(status_code=404, detail="Chat not found.")
        delete_chat(chat_id, user_id=user_id)
        return {
            "status": "success",
            "message": "Chat deleted successfully.",
            "chat_id": chat_id,
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error while deleting chat.")
        raise HTTPException(status_code=500, detail="Could not delete chat.")


@app.delete("/chats")
def remove_all_chats(authorization: str | None = Header(default=None)):
    try:
        user_id = require_user_id(authorization)
        delete_all_chats(user_id=user_id)
        clear_conversation()
        return {"status": "success", "message": "All chat history deleted."}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error while deleting all chats.")
        raise HTTPException(status_code=500, detail="Could not delete chat history.")


class TTSRequest(BaseModel):
    text: str
    voice: str = "Madhur"


@app.post("/tts")
@limiter.limit("10/minute")
async def text_to_speech(request: Request, body: TTSRequest):
    logger.info("TTS request received. chars=%s", len(body.text))
    try:
        text = body.text.strip()
        if not text:
            raise HTTPException(status_code=400, detail="TTS text cannot be empty.")
        if len(text) > 5000:
            raise HTTPException(status_code=400, detail="TTS text is too long. Maximum 5000 characters.")

        audio_bytes = await generate_tts_audio(text=text, voice=body.voice)

        if not audio_bytes:
            raise HTTPException(status_code=500, detail="TTS returned empty audio.")

        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={
                "Cache-Control": "no-store",
                "Content-Disposition": 'inline; filename="tts.mp3"',
            },
        )
    except RuntimeError as e:
        logger.error("TTS RuntimeError: %s", str(e))
        raise HTTPException(status_code=500, detail=str(e))
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error while generating TTS.")
        raise HTTPException(status_code=500, detail="Could not generate AI voice.")


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={
            "status": "blocked",
            "message": "Too many requests. Please wait and try again.",
        },
    )