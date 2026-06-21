# LoreLens AI - Personal Local Quiz App

LoreLens AI is a private, local-first quiz application powered by Ollama. It generates adaptive multiple-choice quizzes, tracks understanding by topic, and maintains a separate learning profile for every subject.

Generated questions, answer keys, and raw answers are temporary. Only the resulting learning analytics are saved locally.

## Features

- Separate, isolated workspaces for every subject
- 10-question short quizzes and 50-question long assessments
- Adaptive questions based on strengths, weaknesses, and prior progress
- Topic scores, recommendations, and an understanding dashboard
- Local AI through Ollama with no external AI API
- Local SQLite storage
- No permanent storage of quiz questions or raw answers

## Technology

- React, TypeScript, Vite, and Tailwind CSS
- Node.js and Fastify
- Node's built-in SQLite support
- Ollama with `gemma3:4b-it-qat`

## Prerequisites

Install the following before running LoreLens AI:

- [Node.js](https://nodejs.org/) 24 or newer
- [Ollama](https://ollama.com/download)
- Git, if cloning the repository

Windows is the currently tested platform. Ollama and Node.js also support macOS and Linux, but the setup commands may differ.

## Quick start

### 1. Clone and enter the project

```powershell
git clone <repository-url>
cd lorelens-ai
```

If you downloaded a ZIP instead, extract it and open PowerShell in the extracted folder.

### 2. Install application dependencies

```powershell
npm.cmd install
```

On macOS or Linux, use `npm install`.

### 3. Download the Ollama model

Make sure Ollama is running, then execute:

```powershell
ollama pull gemma3:4b-it-qat
```

Confirm that the model is available:

```powershell
ollama list
```

### 4. Start LoreLens AI

```powershell
npm.cmd run dev
```

Open [http://localhost:5173](http://localhost:5173) in a browser. The local API runs at `http://127.0.0.1:3001`.

Keep Ollama running while using the application.

## Optional: store Ollama models on another drive

Ollama normally stores models in the current user's profile. On Windows, you can use a different drive by setting `OLLAMA_MODELS` before downloading the model.

Example using `D:\LLM`:

```powershell
New-Item -ItemType Directory -Force -Path "D:\LLM"
[Environment]::SetEnvironmentVariable("OLLAMA_MODELS", "D:\LLM", "User")
```

Fully quit and restart Ollama after setting the variable. Then run:

```powershell
ollama pull gemma3:4b-it-qat
```

Verify the external location contains `blobs` and `manifests`:

```powershell
Get-ChildItem "D:\LLM" -Force
```

The drive must remain connected and retain the same drive letter whenever Ollama is used.

## Configuration

The application uses these defaults:

| Variable | Default | Purpose |
| --- | --- | --- |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama API address |
| `OLLAMA_MODEL` | `gemma3:4b-it-qat` | Model used for quizzes and reports |
| `PORT` | `3001` | Local API port |

Set a variable in the PowerShell session before starting the app when you need to override a default:

```powershell
$env:OLLAMA_MODEL = "gemma3:4b-it-qat"
npm.cmd run dev
```

See `.env.example` for the available values. The project does not commit personal `.env` files.

## Local data and privacy

LoreLens AI stores its database at `data/quiz-app.db`. The `data` directory is excluded from Git.

Persisted locally:

- Subject names
- Topic scores and understanding levels
- Strengths, weaknesses, and recommendations
- Completion percentage and dashboard values

Kept only in server memory:

- Generated quiz questions
- Correct options and explanations
- Raw user answers

An active quiz expires after two hours. Its questions and answers are deleted immediately after submission. Each subject's report is isolated and is never included in another subject's AI prompt.

## Production build

Create an optimized frontend build with:

```powershell
npm.cmd run build
```

## Troubleshooting

### PowerShell says npm scripts are disabled

Use `npm.cmd` instead of `npm`:

```powershell
npm.cmd run dev
```

### The app reports that Ollama is offline

Check the Ollama server and installed model:

```powershell
ollama list
ollama serve
```

Only one Ollama server can use port `11434` at a time. If the desktop application is already running, you do not need to run `ollama serve` separately.

### Quiz generation takes time

The first request may take longer while Ollama loads the model into memory. Long quizzes are generated in multiple batches and naturally take longer than short quizzes.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm.cmd run dev` | Start the web app and API in development mode |
| `npm.cmd run build` | Type-check and build the frontend |
| `npm.cmd run dev:web` | Start only the frontend |
| `npm.cmd run dev:server` | Start only the API |

## License

No license has been selected yet. Add a license before inviting unrestricted reuse or contributions.
