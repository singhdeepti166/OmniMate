# OmniMate

**OmniMate** is a personal all-rounder AI assistant designed to bring intelligent interaction, productivity, and automation into one place.

## Overview

OmniMate combines a Python-based backend with a modern web frontend to provide an integrated AI assistant experience.

## Tech Stack

### Backend
- Python
- FastAPI
- Uvicorn
- SQLite
- ONNX Runtime

### Frontend
- React
- Vite
- JavaScript
- CSS

### AI / Voice
- ONNX-based speech model
- Piper TTS
- Edge TTS
- Google AI services

## Project Structure

```text
AI APP/
+-- backend/
|   +-- ai_service.py
|   +-- auth_service.py
|   +-- database.py
|   +-- document_service.py
|   +-- main.py
|   +-- maps_service.py
|   +-- safety.py
|   +-- search_service.py
|   +-- tts_service.py
|   +-- weather_service.py
|   +-- requirements.txt
+-- frontend/
|   +-- public/
|   +-- src/
|       +-- assets/
|       +-- App.jsx
|       +-- App.css
|       +-- index.css
|       +-- main.jsx
+-- .gitignore
+-- package-lock.json
+-- README.md
```

## Getting Started

### Backend Setup

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend Setup

```powershell
cd frontend
npm install
npm run dev
```

## Privacy & Security

OmniMate is designed with user control and privacy in mind.

Sensitive configuration files, virtual environments, local databases, and other development-specific files are excluded from version control through .gitignore.

## Developer

**Deepti Singh**
