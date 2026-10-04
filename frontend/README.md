# OmniMate 🤖

**OmniMate** is a personal all-rounder AI assistant designed to bring intelligent interaction, productivity, and automation into one place.

## ✨ Overview

OmniMate combines a Python-based backend with a modern web frontend to provide an integrated AI assistant experience.

## 🛠️ Tech Stack

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

## 📁 Project Structure

```text
AI APP/
├── backend/
│   ├── ai_service.py
│   ├── auth_service.py
│   ├── database.py
│   ├── document_service.py
│   ├── main.py
│   ├── maps_service.py
│   ├── safety.py
│   ├── search_service.py
│   ├── tts_service.py
│   ├── weather_service.py
│   ├── requirements.txt
│   └── ...
│
├── frontend/
│   ├── public/
│   └── src/
│       ├── assets/
│       ├── App.jsx
│       ├── App.css
│       ├── index.css
│       └── main.jsx
│
├── .gitignore
├── package-lock.json
├── README.md
└── ...
```

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/singhdeepti166/OmniMate.git
cd OmniMate
```

### 2. Backend Setup

Create a Python virtual environment:

```powershell
cd backend
python -m venv .venv
```

Activate the virtual environment:

```powershell
.venv\Scripts\Activate.ps1
```

Install the required dependencies:

```powershell
pip install -r requirements.txt
```

Start the FastAPI backend:

```powershell
uvicorn main:app --reload
```

### 3. Frontend Setup

Open a new terminal in the project directory and run:

```powershell
cd frontend
npm install
```

Start the frontend:

```powershell
npm run dev
```

## 🔐 Privacy & Security

OmniMate is designed with user control and privacy in mind.

Sensitive configuration files, virtual environments, local databases, and other development-specific files are excluded from version control through `.gitignore`.

## 👩‍💻 Developer

**Deepti Singh**