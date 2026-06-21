# LoreLens AI - Agent Handoff and Project Plan

This document gives future developers and coding agents the context needed to run, maintain, and extend LoreLens AI without reconstructing earlier decisions.

## Project summary

LoreLens AI is a personal, local-first quiz application. It uses a locally running Ollama model to generate adaptive quizzes for separate subjects and to maintain an evolving learning report for each subject.

The core product principle is:

> Remember learning progress, not quizzes.

Quiz questions, correct answers, explanations, and raw user answers are temporary. The application permanently stores only subject-level learning analytics such as topic scores, strengths, weaknesses, recommendations, and dashboard values.

## Product name and repository

- Product name: LoreLens AI
- Repository: `https://github.com/sapiensujee/LoreLens-AI.git`
- Default branch: `main`

## Core requirements

### Subjects

- A user can create, open, rename, and delete subjects.
- Every subject is a completely isolated learning context.
- Each subject has exactly one evolving report and one dashboard.
- No subject report or dashboard data may be included in another subject's AI prompt.

### Quizzes

- A short quiz contains 10 questions.
- A long quiz contains 50 questions.
- Quizzes are generated dynamically by the local Ollama model.
- Questions should adapt to the selected subject's report, strengths, weaknesses, topic scores, and untested areas.
- The current MVP generates multiple-choice questions with four options and one correct option.
- Each question includes a topic, difficulty, and educational explanation.

### Quiz lifecycle and privacy

- Generated questions must not be written to the database.
- Correct answers and explanations must not be written to the database.
- Raw user answers and full attempt history must not be written to the database.
- Active quiz sessions live only in backend memory.
- Active sessions expire after two hours.
- A session is deleted immediately after its answers are reduced to aggregate topic results.
- Only aggregate learning analytics may be passed into the report-update step.

### Reports and dashboards

- Each subject has one report that is updated after every submitted quiz.
- New evidence should be blended with existing performance rather than replacing all history.
- Reports include understanding level, strengths, weaknesses, topic scores, recommendations, summary, completion percentage, quiz count, and last-updated time.
- Dashboards include overall score, completion, level, strength/weakness counts, and a recommended action.
- Supported levels are Beginner, Basic, Intermediate, Advanced, and Expert.

### Local-first behavior

- The application must work with a locally running Ollama server.
- No external AI API is required.
- Learning data stays on the user's device.
- The current local database is excluded from Git.

## Implemented technology stack

- Frontend: React, TypeScript, and Vite
- Styling: Tailwind CSS with a small global stylesheet
- Backend: Node.js and Fastify
- Validation: Zod
- Database: Node's built-in SQLite API
- AI runtime: Ollama REST API
- Model: `gemma3:4b-it-qat`
- Development orchestration: `concurrently`

## Important source files

- `src/App.tsx`: Main interface, subject management, quiz flow, results, report, and dashboard views
- `src/styles.css`: Tailwind import and global visual/accessibility rules
- `server/index.ts`: Fastify API, SQLite access, Ollama integration, in-memory quiz sessions, evaluation, and report updates
- `vite.config.ts`: Vite configuration and `/api` development proxy
- `.env.example`: Supported runtime variables
- `.gitignore`: Excludes dependencies, builds, local databases, environment files, and logs
- `README.md`: End-user installation, run, configuration, and troubleshooting guide

## Local environment established during development

The initial Windows development environment used:

- Node.js 24
- npm 11
- Ollama 0.30.10
- NVIDIA GeForce RTX 4050 Laptop GPU with 6 GB VRAM
- Model storage path: `D:\LLM`

The Ollama logs showed that CUDA inference selected the NVIDIA GPU. A warning about an older AMD integrated-graphics driver was present but did not prevent Ollama from selecting the NVIDIA GPU.

## Ollama model storage setup

The user requested that model files be stored on the external `D:` drive rather than in the default user profile.

The persistent Windows user environment variable is:

```text
OLLAMA_MODELS=D:\LLM
```

It was configured in PowerShell with:

```powershell
New-Item -ItemType Directory -Force -Path "D:\LLM"
[Environment]::SetEnvironmentVariable("OLLAMA_MODELS", "D:\LLM", "User")
```

Ollama must be fully stopped and restarted after changing this variable because the running server keeps the environment it had when it started.

The model was downloaded with:

```powershell
ollama pull gemma3:4b-it-qat
```

The final storage layout was verified to contain:

```text
D:\LLM\blobs
D:\LLM\manifests
```

The model was also verified with:

```powershell
ollama list
```

The external drive must remain connected and retain the `D:` drive letter whenever Ollama or LoreLens AI is used.

## How to run the project locally

### 1. Start or verify Ollama

The Ollama desktop application normally starts the local server automatically. If it is not running:

```powershell
ollama serve
```

Do not start a second server if another Ollama process is already listening on port `11434`.

Verify the model:

```powershell
ollama list
```

The list must include `gemma3:4b-it-qat`.

### 2. Install dependencies

From the project root:

```powershell
npm.cmd install
```

`npm.cmd` is intentionally used on Windows because the PowerShell execution policy may block the `npm.ps1` shim.

### 3. Start the development application

```powershell
npm.cmd run dev
```

Open:

```text
http://localhost:5173
```

The frontend proxies `/api` requests to the backend at:

```text
http://127.0.0.1:3001
```

### 4. Build the application

```powershell
npm.cmd run build
```

The build performs TypeScript project checks and creates the optimized frontend in `dist/`.

## Runtime configuration

The backend reads the following environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama API base URL |
| `OLLAMA_MODEL` | `gemma3:4b-it-qat` | Model used for quiz and report generation |
| `PORT` | `3001` | Fastify API port |

The application does not currently load `.env` files automatically. Set overrides in the shell before running the development command, for example:

```powershell
$env:OLLAMA_MODEL = "gemma3:4b-it-qat"
npm.cmd run dev
```

## Database and persistence

The SQLite database is created automatically at:

```text
data\quiz-app.db
```

SQLite WAL mode is enabled. The `data/` directory and database sidecar files are excluded from Git.

The current schema uses one `subjects` table containing:

- Subject ID and name
- Created and updated timestamps
- One report JSON object
- One dashboard JSON object

This intentionally enforces the one-report-per-subject model without storing quiz attempts.

## API overview

### Health

- `GET /api/health`: API status, Ollama status, selected model, and active in-memory session count

### Subjects

- `GET /api/subjects`: List all subjects
- `GET /api/subjects/:id`: Get one subject
- `POST /api/subjects`: Create a subject
- `PATCH /api/subjects/:id`: Rename a subject
- `DELETE /api/subjects/:id`: Delete a subject and any active in-memory quiz session for it

### Quizzes

- `POST /api/subjects/:id/quizzes`: Generate a short or long quiz
- `POST /api/quizzes/:id/submit`: Evaluate answers, discard the session, and update the report/dashboard

## AI behavior

Quiz generation uses Ollama's `/api/chat` endpoint with a JSON schema. Zod validates the response before any question is shown.

Long quizzes are generated in batches of at most 10 questions. This makes a 50-question request more reliable than asking a 4B model to emit all questions in one response.

The backend removes `correctOption` and `explanation` before sending active questions to the browser. Those fields remain only in server memory until submission or expiry.

After submission, the backend deterministically computes correctness and aggregate topic performance. It deletes the quiz session before asking the model to update the persistent learning profile.

If the AI report-update call fails, a deterministic fallback updates topic scores and recommendations so a completed quiz does not corrupt or lose the user's learning progress.

## UI work completed

- Product branding changed from the temporary name StudyKind to LoreLens AI.
- Home screen includes subject cards, statistics, Ollama connection state, and subject creation.
- Subject screen includes short/long quiz choices, report summary, score ring, topic map, rename, and delete actions.
- Quiz screen includes progress, question navigation, answer selection, and an in-memory privacy notice.
- Results screen includes score, topic results, updated learning profile, and temporary question explanations.
- The subject-card layout was corrected to prevent report text from overlapping the understanding progress bar. The card now uses vertical flex layout rather than an absolutely positioned footer.
- The UI includes keyboard focus states and reduced-motion support.

## Verification completed

- Production TypeScript/Vite build passes.
- Subject create, list, rename, and delete behavior was exercised against the running API.
- SQLite persistence and cleanup behavior were verified during the CRUD test.
- The Ollama health endpoint correctly reported offline before setup and the model/server were subsequently installed and started by the user.
- The in-app automated browser connection was unavailable during the initial verification because of an environment integration error, so visual inspection was also performed manually by the user.

## Git history and repository preparation

- Git was initialized with the `main` branch.
- `.gitignore` excludes `node_modules`, `dist`, `data`, database files, logs, personal environment files, editor metadata, and generated TypeScript build metadata.
- The README was expanded into a full local installation and troubleshooting guide.
- GitHub initially rejected the first push because the configured commit email was private.
- The repository-local Git email was changed to `sapiensujee@users.noreply.github.com`.
- The initial commit was amended and pushed successfully.

## Current constraints and known gaps

- The application is currently a local web application, not a packaged Windows desktop executable.
- Production frontend assets are built into `dist/`, but the current `start` command starts the API only; development should use `npm.cmd run dev` until production static serving or desktop packaging is added.
- Automated unit and end-to-end test suites have not yet been added. Current verification consists of type/build checks and direct API smoke testing.
- Quiz generation has been designed for the model but should receive further real-world testing for malformed or low-quality 50-question outputs.
- Completion percentage is an AI-informed estimate because the MVP has no imported syllabus or canonical topic list.
- Multiple local user profiles are not implemented.
- No license has been selected for the repository.

## Recommended next development steps

1. Add automated backend tests for subject isolation, in-memory session expiry, submission cleanup, and deterministic report fallback.
2. Add frontend component and end-to-end tests for subject creation, quiz navigation, submission, and report rendering.
3. Run repeated short and long quiz trials against `gemma3:4b-it-qat` and capture response-quality failures without persisting quiz content.
4. Add retry/repair handling for malformed Ollama structured responses.
5. Add production static serving or package the application as a Windows desktop app.
6. Add optional syllabus/topic imports so completion percentage has a defined denominator.
7. Add export of the learning report without exporting quiz questions or raw answers.
8. Select a repository license.

## Non-negotiable rules for future agents

- Never persist generated questions, correct answers, explanations, or raw user answers.
- Never add full quiz-attempt history unless the product owner explicitly changes the privacy requirement.
- Never mix report, dashboard, or prompt context between subjects.
- Preserve exactly one evolving report and dashboard per subject.
- Validate all model-generated JSON before using it.
- Keep an AI-independent fallback for report updates.
- Do not commit `data/`, `.env`, model files, logs, `node_modules`, or build output.
- Keep the application usable without cloud services other than the optional act of downloading dependencies and the Ollama model.
- Treat `D:\LLM` as the configured model location for the original Windows environment, while keeping the application configurable for other machines.
