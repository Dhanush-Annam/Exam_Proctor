# ExamProctorAI

ExamProctorAI is a full-stack, microservices-based online examination proctoring platform designed to enforce academic integrity during remote assessments. It combines client-side browser lockdown mechanisms, real-time computer vision inference (face presence, eye aspect ratio blink tracking, and head/gaze estimation), live examiner telemetry streaming via WebSockets, and asynchronous post-exam incident reviews powered by Gemini 3.5 Flash Lite.

The platform is designed with a fallback-first architecture: it operates fully offline in local environments (using SQLite/local disk storage and in-memory caches) and scales into production with PostgreSQL, Redis, and Supabase Storage.

---

## Architecture

The system consists of three primary application tiers communicating via authenticated REST endpoints, WebSockets, and HMAC-signed webhook callbacks:

```mermaid
flowchart TD
    subgraph ClientLayer["Frontend Client (Next.js 16 / React 19)"]
        StudentUI["Student Exam Interface"]
        WebcamHandler["Webcam Frame Capture (2s interval)"]
        LockdownHandler["Browser Lockdown Listeners"]
        ExaminerDashboard["Examiner Live Dashboard"]
    end

    subgraph BackendLayer["Backend Orchestrator (Express 5 / Node.js)"]
        AuthRouter["Auth & Exam REST API"]
        ProctorProxy["Proctoring Proxy & Ingestion (/api/proctor)"]
        SocketServer["Socket.io Real-time Hub"]
        HMACValidator["HMAC-SHA256 Webhook Verifier"]
    end

    subgraph AIServiceLayer["AI Vision Service (FastAPI / Python)"]
        VisionPipeline["Vision Inference (Caffe SSD + MediaPipe)"]
        FlagEngine["Flag Generator & Cooldown Manager"]
        ReviewWorker["Post-Exam Review Pipeline (review.py)"]
    end

    subgraph StorageLayer["Data & Cloud Services"]
        PostgresDB[("PostgreSQL 15 (Sequelize ORM)")]
        RedisCache[("Redis 7 / In-Memory Fallback")]
        SnapshotStorage[("Supabase Storage / Local Disk")]
        GeminiAPI["Gemini 3.5 Flash Lite (google-genai SDK)"]
    end

    %% Frame flow
    WebcamHandler -->|"POST /api/proctor/analyze (JWT)"| ProctorProxy
    LockdownHandler -->|"POST /api/proctor/event"| ProctorProxy
    ProctorProxy -->|"POST /analyze (multipart)"| VisionPipeline

    %% Real-time alerts
    VisionPipeline -->|"Detection & Flag Metadata"| FlagEngine
    FlagEngine -->|"Alert Payload"| ProctorProxy
    ProctorProxy -->|"Insert Flag"| PostgresDB
    ProctorProxy -->|"Broadcast proctor_alert"| SocketServer
    SocketServer -->|"WebSocket Stream"| ExaminerDashboard

    %% Cache & Storage
    FlagEngine <-->|"Session State & EAR Counters"| RedisCache
    FlagEngine -->|"Save Flagged Snapshot"| SnapshotStorage

    %% Post-exam review flow
    StudentUI -->|"Submit Exam"| AuthRouter
    AuthRouter -->|"POST /session/{id}/end"| ReviewWorker
    ReviewWorker -->|"Telemetry + Snapshot"| GeminiAPI
    GeminiAPI -->|"Structured JSON Verdict"| ReviewWorker
    ReviewWorker -->|"POST /review-complete (HMAC Signature)"| HMACValidator
    HMACValidator -->|"Update Verdicts"| PostgresDB
    HMACValidator -->|"Broadcast review_complete"| SocketServer
```

### Service Breakdown

| Service               | Runtime & Framework                                 | Port     | Source Path               | Primary Role                                                                                            |
| --------------------- | --------------------------------------------------- | -------- | ------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Frontend**    | Next.js 16.2 (App Router), React 19, Tailwind CSS 4 | `3000` | [frontend/](frontend/)     | Student exam environment, browser lockdown listeners, webcam capture, examiner real-time dashboard      |
| **Backend API** | Node.js, Express 5.2, Sequelize 6.37, Socket.io 4.8 | `3001` | [backend/](backend/)       | Authentication (JWT), exam lifecycle management, frame proxying, rate limiting, HMAC webhook validation |
| **AI Service**  | Python 3.10+, FastAPI, OpenCV, MediaPipe            | `8000` | [ai-service/](ai-service/) | Real-time face/EAR/gaze computer vision analysis, snapshot persistence, Gemini post-exam audit          |
| **Database**    | PostgreSQL 15                                       | `5432` | —                        | Relational store for users, exams, submissions, and flag records                                        |
| **Cache**       | Redis 7 (optional)                                  | `6379` | —                        | Session cooldown management and EAR history (falls back to memory)                                      |

---

## Core Capabilities

### 1. Vision-Based Real-Time Proctoring

Webcam frames captured every 2 seconds by the frontend client are routed through the backend to the FastAPI vision service:

- **Face Count Detection**: Uses a Caffe SSD deep neural network detector (`res10_300x300_ssd_iter_140000`) to confirm single-candidate presence. Violations flag `NO_FACE` or `MULTIPLE_FACES`.
- **Blink & Fatigue Analysis**: MediaPipe Face Mesh calculates Eye Aspect Ratio (EAR) across 6 landmark pairs per eye. EAR sustained `< 0.15` for 8 consecutive frames triggers `EYES_CLOSED`.
- **Gaze & Head-Pose Estimation**: MediaPipe Iris tracks pupil displacement ratios relative to eye corner boundaries. Head yaw and pitch angles are computed from 3D facial landmarks. Yaw exceeding `±18°` or horizontal iris ratios outside `[0.43, 0.57]` trigger `GAZE_LEFT` or `GAZE_RIGHT`.
- **Incident Snapshotting**: When an alert fires, the AI service overlays candidate telemetry and an alert banner onto the frame, persisting the image locally (`ai-service/flags/`) or uploading it to Supabase Storage.

### 2. Browser Lockdown & Integrity Enforcement

The client exam interface intercepts disruptive or unauthorized navigation behaviors:

- **Window & Focus Monitoring**: Detects and logs `WINDOW_BLUR`, `TAB_SWITCH`, and `FULLSCREEN_EXIT`.
- **Screen Sharing Validation**: Mandates full-desktop display capture via `navigator.mediaDevices.getDisplayMedia`. Single-window or application-tab selections are rejected.
- **Input & Clipboard Suppression**: Blocks right-click context menus (`CLIPBOARD_ACTION`), copy/cut/paste actions, developer tools (`F12`, `Ctrl+Shift+I`), view-source shortcuts, and operating system modifier keys.

### 3. Automated Post-Exam Review (Gemini 3.5 Flash Lite)

When an assessment concludes, the backend signals the AI service to run an automated post-exam review:

- Evaluates flagged incident frames alongside raw sensor metrics (head yaw, pitch, EAR value, alert type) using Google's `gemini-3.5-flash-lite` model via the `google-genai` SDK.
- Classifies each violation into an authoritative verdict:
  - `HIGH_RISK`: Clear, deliberate cheating (e.g., secondary person visible, confirmed off-screen assistance).
  - `SUSPICIOUS`: Ambiguous posture or environmental obstruction requiring manual examiner intervention.
  - `FALSE_ALARM`: Benign action verified (e.g., natural blink, transient lighting reflection).
- Emits structured review findings and dispatches an HMAC-SHA256-signed callback to the backend API, updating database records and notifying examiner dashboards.

### 4. Security & Fault Tolerance

- **HMAC-SHA256 Webhook Verification**: AI-to-backend callbacks require an `x-webhook-signature` header generated over the raw payload buffer using a shared secret and validated using timing-safe comparisons (`crypto.timingSafeEqual`).
- **Endpoint Rate Limiting**: The frame analysis endpoint enforces rate limits (45 requests/minute per client) to prevent server exhaustion while accommodating regular 2-second capture intervals.
- **Signed URL Access**: Supabase storage assets are accessed exclusively through short-lived signed URLs generated on demand by the backend.
- **Graceful Degradation**: Operates with zero cloud dependencies out of the box — in-memory dictionary caching replaces Redis, and local filesystem directories replace cloud object stores when configuration keys are omitted.

---

## Prerequisites

| Requirement                | Minimum Version                               | Notes                                                          |
| -------------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| **Node.js**          | `>= 18.0.0` (LTS recommended)               | Required for Backend API and Frontend Next.js client           |
| **npm**              | `>= 9.0.0`                                  | Default package manager                                        |
| **Python**           | `>= 3.10`                                   | Required for the FastAPI AI Service and Gemini review pipeline |
| **PostgreSQL**       | `>= 14.0` (15 recommended)                  | Required for relational persistence (or cloud PostgreSQL)      |
| **Docker & Compose** | Docker Engine `>= 24.0`, Compose `>= 2.0` | Optional, for containerized local orchestration                |
| **Redis**            | `>= 7.0`                                    | Optional, used for distributed session and counter caching     |

---

## Configuration

Configuration is managed via environment files. A complete template is provided in [.env.example](.env.example).

### Backend Configuration (`backend/.env`)

| Variable            | Description                                         | Required | Default / Example                                               |
| ------------------- | --------------------------------------------------- | -------- | --------------------------------------------------------------- |
| `PORT`            | Express server port                                 | No       | `3001`                                                        |
| `JWT_SECRET`      | Secret key for signing JSON Web Tokens              | Yes      | `your_super_secret_key`                                       |
| `WEBHOOK_SECRET`  | Shared secret key for verifying AI service webhooks | Yes      | `your_webhook_secret_key_here`                                |
| `FRONTEND_URL`    | Allowed origin for CORS and Socket.io clients       | No       | `http://localhost:3000`                                       |
| `AI_SERVICE_URL`  | Target endpoint for forwarding analysis frames      | No       | `http://localhost:8000`                                       |
| `DATABASE_URL`    | Full PostgreSQL connection string (supports SSL)    | No       | `postgres://user:pass@host:5432/exam_proctor?sslmode=require` |
| `DB_HOST`         | Database host (used if `DATABASE_URL` is omitted) | No       | `localhost`                                                   |
| `DB_PORT`         | Database port                                       | No       | `5432`                                                        |
| `DB_NAME`         | Database schema name                                | No       | `exam_proctor`                                                |
| `DB_USER`         | Database username                                   | No       | `postgres`                                                    |
| `DB_PASSWORD`     | Database password                                   | No       | `your_db_password_here`                                       |
| `SUPABASE_URL`    | Supabase project URL for signed snapshot URLs       | No       | `https://your-project-id.supabase.co`                         |
| `SUPABASE_KEY`    | Supabase service role or API key                    | No       | `your_supabase_key`                                           |
| `SUPABASE_BUCKET` | Storage bucket name for incident snapshots          | No       | `proctor-screenshots`                                         |

### Frontend Configuration (`frontend/.env.local`)

| Variable                    | Description                                      | Required | Default / Example         |
| --------------------------- | ------------------------------------------------ | -------- | ------------------------- |
| `NEXT_PUBLIC_BACKEND_URL` | Base URL of the backend API and Socket.io server | Yes      | `http://localhost:3001` |

### AI Service Configuration (`ai-service/.env`)

| Variable            | Description                                              | Required | Default / Example                       |
| ------------------- | -------------------------------------------------------- | -------- | --------------------------------------- |
| `WEBHOOK_SECRET`  | Shared secret key used to sign review-complete callbacks | Yes      | `your_webhook_secret_key_here`        |
| `BACKEND_URL`     | Target backend URL for dispatching webhook events        | No       | `http://localhost:3001`               |
| `GEMINI_API_KEY`  | Google Gemini API key for post-exam review               | No       | `your_gemini_api_key_here`            |
| `REDIS_URL`       | Redis connection URL                                     | No       | `rediss://default:pass@host:6379`     |
| `REDIS_HOST`      | Redis host (used if `REDIS_URL` is omitted)            | No       | `localhost`                           |
| `REDIS_PORT`      | Redis port                                               | No       | `6379`                                |
| `SUPABASE_URL`    | Supabase project URL for snapshot uploads                | No       | `https://your-project-id.supabase.co` |
| `SUPABASE_KEY`    | Supabase service role or API key                         | No       | `your_supabase_key`                   |
| `SUPABASE_BUCKET` | Storage bucket name for incident snapshots               | No       | `proctor-screenshots`                 |

> [!NOTE]
> To run the platform in offline development mode, only `JWT_SECRET`, `WEBHOOK_SECRET`, and PostgreSQL credentials are required. Redis, Supabase, and Gemini will gracefully fall back to local components if left unset.

---

## Quickstart

### Option 1: Docker Compose

Docker Compose provisions PostgreSQL, Redis, the Express backend, and the FastAPI AI service in unified containers:

```bash
# 1. Start backend services and backing infrastructure
docker compose up --build -d

# 2. Run the Next.js frontend client locally
cd frontend
npm install
npm run dev
```

The frontend client is available at [http://localhost:3000](http://localhost:3000).

### Option 2: Manual Local Setup

#### Step 1: Database Setup

Create a local PostgreSQL database named `exam_proctor`:

```bash
createdb exam_proctor
```

#### Step 2: Backend API

```bash
cd backend
npm install
cp ../.env.example .env
# Edit .env to set JWT_SECRET, WEBHOOK_SECRET, and your database credentials
npm run dev
```

The backend initializes Sequelize models on boot and listens at [http://localhost:3001](http://localhost:3001).

#### Step 3: AI Vision Service

In a separate terminal:

```bash
cd ai-service

# Create and activate a Python virtual environment
# On Linux / macOS:
python3 -m venv venv
source venv/bin/activate

# On Windows (PowerShell):
python -m venv venv
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt
cp ../.env.example .env
# Edit .env to set WEBHOOK_SECRET and GEMINI_API_KEY (optional)

# Start FastAPI server
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

The AI service starts with health checks available at [http://localhost:8000/health](http://localhost:8000/health).

#### Step 4: Frontend Client

In a separate terminal:

```bash
cd frontend
npm install
echo "NEXT_PUBLIC_BACKEND_URL=http://localhost:3001" > .env.local
npm run dev
```

Access the client application at [http://localhost:3000](http://localhost:3000).

---

## Available Commands

### Frontend (`frontend/`)

| Command           | Purpose                                                          | Verification Status            |
| ----------------- | ---------------------------------------------------------------- | ------------------------------ |
| `npm run dev`   | Starts Next.js development server on port 3000                   | Verified in `package.json`   |
| `npm run build` | Compiles production-optimized client build                       | Verified in `package.json`   |
| `npm run start` | Launches built production server                                 | Verified in `package.json`   |
| `npm run lint`  | Runs ESLint analysis across `app`, `components`, and `lib` | Executed successfully (code 0) |

### Backend (`backend/`)

| Command         | Purpose                                                                          | Verification Status                       |
| --------------- | -------------------------------------------------------------------------------- | ----------------------------------------- |
| `npm run dev` | Runs Express server with nodemon auto-reload                                     | Verified in `package.json`              |
| `npm start`   | Runs Express server in standard Node runtime                                     | Verified in `package.json`              |
| `npm test`    | Executes Jest test suites (`tests/proctor`, `tests/security`, `tests/e2e`) | Executed successfully (code 0, 44 passed) |

### AI Service (`ai-service/`)

| Command                                                 | Purpose                                                     | Verification Status                       |
| ------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------- |
| `uvicorn app:app --host 0.0.0.0 --port 8000 --reload` | Runs FastAPI proctoring inference server                    | Verified through manifest                 |
| `pytest`                                              | Runs Python unit and integration test suite                 | Executed successfully (code 0, 12 passed) |
| `python review.py`                                    | Standalone script to audit flag directories with Gemini API | Verified in `review.py`                 |
| `python review.py --dry-run`                          | Validates session structure without executing API calls     | Verified in `review.py`                 |

---

## Testing

The repository contains test suites covering vision algorithms, security validations, and end-to-end proctoring lifecycles.

### AI Service Tests (Pytest)

Executes 12 test cases covering API routes, EAR threshold calculations, gaze landmarks, cooldown flag logic, and post-exam review serialization:

```bash
# Run from repository root (using pytest.ini)
pytest

# Or execute from within the ai-service directory
cd ai-service && pytest
```

### Backend Integration & Security Tests (Jest + Supertest)

Executes 44 tests across 3 suites verifying HMAC webhook signature verification, rate-limiting policies, token authorization, proctoring events, and end-to-end exam flows:

```bash
cd backend && npm test
```

### Frontend Code Quality (ESLint)

Checks TypeScript and React components for syntax conformity:

```bash
cd frontend && npm run lint
```

---

## Project Structure

```
Exam_Proctor/
├── frontend/                     # Next.js 16 (App Router) client application
│   ├── app/
│   │   ├── exam/                 # Student exam environment & lockdown view
│   │   ├── dashboard/            # Examiner live monitoring & audit interface
│   │   ├── login/ & register/    # Authentication views
│   ├── components/               # React UI components (WebcamProctor, alerts)
│   └── lib/                      # API client, WebSocket handlers, and token utilities
├── backend/                      # Express 5 API orchestrator
│   ├── middleware/               # JWT authentication, multer upload, rate limiters
│   ├── models/                   # Sequelize data models (User, Exam, Submission, Flag)
│   ├── routes/                   # auth, exam, and proctoring endpoints
│   ├── tests/                    # Jest suites: proctor.test.js, security.test.js, e2e.test.js
│   ├── server.js                 # Server entry point & Sequelize initialization
│   └── socket.js                 # Socket.io real-time broadcast hub
├── ai-service/                   # FastAPI computer vision microservice
│   ├── core/
│   │   ├── detector.py           # Caffe SSD face detection wrapper
│   │   ├── ear.py                # Eye Aspect Ratio calculation logic
│   │   ├── gaze.py               # MediaPipe Iris landmark & 3D pose estimation
│   │   └── flagging.py           # Cooldown enforcement, screenshot annotator & storage
│   ├── models/                   # Pre-trained Caffe SSD detector weights and prototxt
│   ├── tests/                    # Pytest test cases (API, EAR, Gaze, Review, Flagging)
│   ├── app.py                    # FastAPI application routes & background review scheduler
│   └── review.py                 # Gemini 3.5 Flash Lite automated audit worker
├── docker-compose.yml            # Local container orchestration definition
├── pytest.ini                    # Root test runner configuration for ai-service
└── .env.example                  # Environment variable reference template
```

---

## License

This project is licensed under the [ISC License](backend/package.json).
