import sqlite3
from pathlib import Path
from datetime import datetime


BASE_DIR = Path(__file__).resolve().parent
DATABASE_FILE = BASE_DIR / "chat_history.db"


def get_connection():
    connection = sqlite3.connect(DATABASE_FILE)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def get_current_time():
    return datetime.now().isoformat()


def init_database():
    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS chats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL DEFAULT 'New Chat',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                user_id INTEGER
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id INTEGER NOT NULL,
                role TEXT NOT NULL,
                text TEXT NOT NULL,
                created_at TEXT NOT NULL,
                image_data BLOB,
                image_mime_type TEXT,
                image_filename TEXT,
                FOREIGN KEY (chat_id)
                    REFERENCES chats(id)
                    ON DELETE CASCADE
            )
            """
        )

        # Migration for messages image columns
        cursor.execute("PRAGMA table_info(messages)")
        existing_columns = {row["name"] for row in cursor.fetchall()}

        if "image_data" not in existing_columns:
            cursor.execute("ALTER TABLE messages ADD COLUMN image_data BLOB")

        if "image_mime_type" not in existing_columns:
            cursor.execute("ALTER TABLE messages ADD COLUMN image_mime_type TEXT")

        if "image_filename" not in existing_columns:
            cursor.execute("ALTER TABLE messages ADD COLUMN image_filename TEXT")

        # Migration for chats.user_id
        cursor.execute("PRAGMA table_info(chats)")
        chat_columns = {row["name"] for row in cursor.fetchall()}

        if "user_id" not in chat_columns:
            cursor.execute("ALTER TABLE chats ADD COLUMN user_id INTEGER")

        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_messages_chat_id
            ON messages(chat_id)
            """
        )

        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_chats_user_id
            ON chats(user_id)
            """
        )

        connection.commit()
    finally:
        connection.close()


def create_chat(title="New Chat", user_id=None):
    connection = get_connection()
    cursor = connection.cursor()

    try:
        now = get_current_time()
        clean_title = title.strip() if title else "New Chat"
        if not clean_title:
            clean_title = "New Chat"

        cursor.execute(
            """
            INSERT INTO chats (title, created_at, updated_at, user_id)
            VALUES (?, ?, ?, ?)
            """,
            (clean_title, now, now, user_id),
        )

        chat_id = cursor.lastrowid
        connection.commit()
        return chat_id
    finally:
        connection.close()


def chat_exists(chat_id):
    connection = get_connection()
    cursor = connection.cursor()
    try:
        cursor.execute("SELECT id FROM chats WHERE id = ?", (chat_id,))
        return cursor.fetchone() is not None
    finally:
        connection.close()


def add_message(
    chat_id,
    role,
    text,
    image_bytes=None,
    image_mime_type=None,
    image_filename=None,
):
    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute("SELECT id FROM chats WHERE id = ?", (chat_id,))
        if cursor.fetchone() is None:
            raise ValueError("Chat does not exist.")

        if role not in ("user", "assistant"):
            raise ValueError("Invalid message role.")

        if text is None:
            text = ""
        text = str(text)
        now = get_current_time()

        cursor.execute(
            """
            INSERT INTO messages (
                chat_id, role, text, created_at,
                image_data, image_mime_type, image_filename
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                chat_id,
                role,
                text,
                now,
                image_bytes,
                image_mime_type,
                image_filename,
            ),
        )

        message_id = cursor.lastrowid

        cursor.execute(
            """
            UPDATE chats
            SET updated_at = ?
            WHERE id = ?
            """,
            (now, chat_id),
        )

        connection.commit()
        return message_id
    finally:
        connection.close()


def get_all_chats(user_id=None):
    # Security fix (Bug 8): user_id=None used to mean "no filter at all",
    # returning every user's chats. It must mean "no access" instead —
    # an unauthenticated or invalid-token request should see nothing.
    if user_id is None:
        return []

    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            SELECT id, title, created_at, updated_at, user_id
            FROM chats
            WHERE user_id = ?
            ORDER BY updated_at DESC
            """,
            (user_id,),
        )
        return [dict(row) for row in cursor.fetchall()]
    finally:
        connection.close()


def get_chat_messages(chat_id):
    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            SELECT
                id, role, text, created_at,
                image_mime_type, image_filename
            FROM messages
            WHERE chat_id = ?
            ORDER BY id ASC
            """,
            (chat_id,),
        )

        messages = []
        for row in cursor.fetchall():
            message = dict(row)
            mime_type = message.pop("image_mime_type", None)
            filename = message.pop("image_filename", None)

            if mime_type:
                message["attachment"] = {
                    "name": filename or "Attachment",
                    "type": mime_type,
                    "mime_type": mime_type,
                    "isImage": mime_type.startswith("image/"),
                    "is_image": mime_type.startswith("image/"),
                    "url": f"/messages/{message['id']}/image",
                }
            else:
                message["attachment"] = None

            messages.append(message)

        return messages
    finally:
        connection.close()


def get_message_image(message_id):
    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            SELECT image_data, image_mime_type, image_filename
            FROM messages
            WHERE id = ?
            """,
            (message_id,),
        )

        row = cursor.fetchone()
        if row is None or row["image_data"] is None:
            return None

        return {
            "image_data": row["image_data"],
            "mime_type": row["image_mime_type"] or "application/octet-stream",
            "filename": row["image_filename"] or "image",
        }
    finally:
        connection.close()


def get_chat(chat_id, user_id=None):
    # Security fix (Bug 8): same as above — no user_id means no access,
    # not "return any chat regardless of owner".
    if user_id is None:
        return None

    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            SELECT id, title, created_at, updated_at, user_id
            FROM chats
            WHERE id = ? AND user_id = ?
            """,
            (chat_id, user_id),
        )

        chat = cursor.fetchone()
        if not chat:
            return None

        chat_data = dict(chat)
    finally:
        connection.close()

    chat_data["messages"] = get_chat_messages(chat_id)
    return chat_data


def update_chat_title(chat_id, title):
    connection = get_connection()
    cursor = connection.cursor()

    try:
        clean_title = title.strip() if title else "New Chat"
        if not clean_title:
            clean_title = "New Chat"

        now = get_current_time()
        cursor.execute(
            """
            UPDATE chats
            SET title = ?, updated_at = ?
            WHERE id = ?
            """,
            (clean_title, now, chat_id),
        )
        connection.commit()
    finally:
        connection.close()


def delete_chat(chat_id, user_id=None):
    # Security fix (Bug 8): require a matching user_id before deleting —
    # previously user_id=None deleted the chat with no ownership check.
    if user_id is None:
        return

    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            "DELETE FROM chats WHERE id = ? AND user_id = ?",
            (chat_id, user_id),
        )
        connection.commit()
    finally:
        connection.close()


def delete_all_chats(user_id=None):
    # Security fix (Bug 8): previously user_id=None wiped every chat for
    # every user in the database. Now it's a strict no-op without a
    # real user_id.
    if user_id is None:
        return

    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            DELETE FROM messages
            WHERE chat_id IN (
                SELECT id FROM chats WHERE user_id = ?
            )
            """,
            (user_id,),
        )
        cursor.execute("DELETE FROM chats WHERE user_id = ?", (user_id,))
        connection.commit()
    finally:
        connection.close()


def get_chat_count(user_id=None):
    if user_id is None:
        return 0

    connection = get_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            "SELECT COUNT(*) AS count FROM chats WHERE user_id = ?",
            (user_id,),
        )
        result = cursor.fetchone()
        return result["count"]
    finally:
        connection.close()


def create_user(username, password_hash):
    connection = get_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO users (username, password_hash, created_at)
            VALUES (?, ?, ?)
            """,
            (username, password_hash, get_current_time()),
        )
        connection.commit()
        return cursor.lastrowid
    finally:
        connection.close()


def get_user_by_username(username):
    connection = get_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            "SELECT * FROM users WHERE username = ?",
            (username,),
        )
        row = cursor.fetchone()
        return dict(row) if row else None
    finally:
        connection.close()