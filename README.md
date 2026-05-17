# ImpactAlphaSwarm - Complete Local Setup Guide

A step-by-step guide to run the entire AlphaSwarm stack locally (backend + frontend).

## Prerequisites

### System Requirements
- **Python**: 3.12 or higher
- **Node.js**: v18 or higher
- **npm**: Included with Node.js

### Required Accounts & API Keys
- **Supabase Account**: https://supabase.com
- **Groq API Key**: https://console.groq.com
- **Optional**: LangSmith for tracing: https://smith.langchain.com

---

## Project Structure

```
ImpactAlphaSwarm/
├── backend/
│   ├── src/
│   │   ├── api.py                    # FastAPI endpoints
│   │   ├── agents/                   # AI agent implementations
│   │   ├── orchestration/            # LangGraph orchestrator
│   │   └── utils/                    # Supabase & utility functions
│   ├── main.py                       # Entry point
│   ├── requirements.txt              # Python dependencies
│   └── .env                          # Environment variables (create this)
├── frontend/
│   ├── src/
│   │   ├── components/               # React components
│   │   ├── hooks/                    # Custom React hooks
│   │   ├── pages/                    # Page components
│   │   ├── services/                 # API services
│   │   └── App.tsx                   # Main app component
│   ├── package.json                  # Node dependencies
│   ├── vite.config.ts                # Vite configuration
│   └── .env                          # Environment variables (create this)
└── README.md
```

---

## Phase 1: Supabase Setup

### Step 1.1: Get Credentials

From your Supabase project:

1. **Project URL**: Go to Settings → API → Project URL
   - Save this as `SUPABASE_URL`

2. **Service Role Key**: Go to Settings → API → Service Role (under "API Keys")
   - Save this as `SUPABASE_SERVICE_ROLE_KEY`

3. **Anon Key**: Go to Settings → API → Anon public (under "API Keys")
   - Save this as `VITE_SUPABASE_ANON_KEY`

4. **Get Groq API Key** from https://console.groq.com
   - Save this as `GROQ_API_KEY`

---

## Phase 2: Backend Setup

### Step 2.1: Navigate to Backend Directory

```bash
cd backend
```

### Step 2.2: Create Python Virtual Environment

```bash
python -m venv venv
```

Activate the virtual environment:

**macOS/Linux:**
```bash
source venv/bin/activate
```

**Windows:**
```bash
venv\Scripts\activate
```

### Step 2.3: Install Python Dependencies

```bash
pip install -r requirements.txt
```

This installs:
- FastAPI & Uvicorn (web server)
- LangGraph & LangChain (AI orchestration)
- Supabase Python client
- Data science libraries (pandas, numpy, yfinance, scikit-learn)
- LLM providers (groq, transformers, torch)
- And more...

### Step 2.4: Create Backend Environment File

Create a `.env` file in the backend directory (look at the .env.example for structure):

```env
# === Supabase Configuration ===
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# === LLM Provider ===
GROQ_API_KEY=your_groq_api_key_here

# === CORS Configuration ===
API_CORS_ORIGINS=http://localhost:5173

# === Optional: LangSmith Tracing ===
LANGSMITH_API_KEY=your_langsmith_key
LANGSMITH_PROJECT=your_project_name
```

**Replace the placeholder values with your actual credentials.**

---

## Phase 3: Frontend Setup

### Step 3.1: Navigate to Frontend Directory

From the project root (open a **new terminal**):

```bash
cd frontend
```

### Step 3.2: Install Node Dependencies

```bash
npm install
```

This installs React, Vite, TypeScript, Tailwind CSS, and all frontend dependencies.

### Step 3.3: Create Frontend Environment File

Create a `.env` file in the frontend directory (use the .env.example for the structure):

```env
# === Supabase Configuration ===
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here

# === Backend API Configuration ===
VITE_API_URL=http://localhost:8000
```

**Use the same Supabase URL as the backend.**

---

## Phase 4: Running the Application

### Step 4.1: Start Backend Server

In **Terminal 1**, from the backend directory:

```bash
# Ensure virtual environment is activated
source venv/bin/activate  # macOS/Linux
# or
venv\Scripts\activate  # Windows

# Start the FastAPI server
uvicorn src.api:app --reload --port 8000
```

Expected output:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete
```

✓ API is now running at `http://localhost:8000`
✓ Interactive API docs at `http://localhost:8000/docs`

### Step 4.2: Start Frontend Development Server

In **Terminal 2**, from the frontend directory:

```bash
npm run dev
```

Expected output:
```
  VITE v8.0.10  ready in XXX ms

  ➜  Local:   http://localhost:5173/
```

✓ Frontend is now running at `http://localhost:5173`

---

## Phase 5: Verify Everything Works

1. **Open Frontend**: http://localhost:5173
2. **View API Docs**: http://localhost:8000/docs
3. **Check Console**: Look for any errors in terminal or browser console
4. **Test API Endpoint**:
   ```bash
   curl http://localhost:8000/docs
   ```

---

## Environment Variables Quick Reference

### Backend `.env` (required)
```
SUPABASE_URL                    → Supabase project URL
SUPABASE_SERVICE_ROLE_KEY       → Supabase service role key
GROQ_API_KEY                    → Your Groq API key
API_CORS_ORIGINS                → Frontend URL (localhost:5173)
LANGSMITH_API_KEY               → (Optional) LangSmith API key
LANGSMITH_PROJECT               → (Optional) LangSmith project name
```

### Frontend `.env` (required)
```
VITE_SUPABASE_URL               → Supabase project URL (same as backend)
VITE_SUPABASE_ANON_KEY          → Supabase anon key
VITE_API_URL                    → Backend URL (localhost:8000)
```

---

**Last Updated**: May 17, 2026  
**Project**: ImpactAlphaSwarm - Information Systems Honours Project  
**Stack**: Python FastAPI + React + TypeScript + Supabase