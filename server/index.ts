import Fastify from "fastify";
import cors from "@fastify/cors";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const PORT = Number(process.env.PORT ?? 3001);
const OLLAMA_HOST = (process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434").replace(/\/$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "gemma3:4b-it-qat";
const QUIZ_TTL_MS = 2 * 60 * 60 * 1000;

type Difficulty = "easy" | "medium" | "hard";
type QuizQuestion = {
  id: string;
  question: string;
  options: [string, string, string, string];
  correctOption: number;
  topic: string;
  difficulty: Difficulty;
  explanation: string;
};
type Report = {
  overallUnderstanding: string;
  strengths: string[];
  weaknesses: string[];
  topicScores: Record<string, number>;
  recommendedFocus: string[];
  summary: string;
  completionPercentage: number;
  quizzesCompleted: number;
  lastUpdated: string | null;
};
type Dashboard = {
  understandingScore: number;
  completionPercentage: number;
  level: string;
  strongTopicsCount: number;
  weakTopicsCount: number;
  recommendedAction: string;
};
type Subject = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  report: Report;
  dashboard: Dashboard;
};
type QuizSession = {
  id: string;
  subjectId: string;
  subjectName: string;
  type: "short" | "long";
  questions: QuizQuestion[];
  createdAt: number;
};

const defaultReport = (): Report => ({
  overallUnderstanding: "Beginner",
  strengths: [],
  weaknesses: [],
  topicScores: {},
  recommendedFocus: ["Take your first quiz to build a learning profile."],
  summary: "No quiz data yet. Your report will grow as you practise.",
  completionPercentage: 0,
  quizzesCompleted: 0,
  lastUpdated: null,
});

const defaultDashboard = (): Dashboard => ({
  understandingScore: 0,
  completionPercentage: 0,
  level: "Beginner",
  strongTopicsCount: 0,
  weakTopicsCount: 0,
  recommendedAction: "Start with a short quiz.",
});

mkdirSync("data", { recursive: true });
const db = new DatabaseSync("data/quiz-app.db");
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    report_json TEXT NOT NULL,
    dashboard_json TEXT NOT NULL
  );
`);

const rowToSubject = (row: Record<string, unknown>): Subject => ({
  id: String(row.id),
  name: String(row.name),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  report: JSON.parse(String(row.report_json)) as Report,
  dashboard: JSON.parse(String(row.dashboard_json)) as Dashboard,
});

const getSubject = (id: string): Subject | null => {
  const row = db.prepare("SELECT * FROM subjects WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToSubject(row) : null;
};

const saveLearningProfile = (id: string, report: Report, dashboard: Dashboard) => {
  const now = new Date().toISOString();
  db.prepare("UPDATE subjects SET report_json = ?, dashboard_json = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(report), JSON.stringify(dashboard), now, id);
};

const quizSessions = new Map<string, QuizSession>();
setInterval(() => {
  const cutoff = Date.now() - QUIZ_TTL_MS;
  for (const [id, session] of quizSessions) {
    if (session.createdAt < cutoff) quizSessions.delete(id);
  }
}, 15 * 60 * 1000).unref();

const generatedQuestionSchema = z.object({
  question: z.string().min(5),
  options: z.array(z.string().min(1)).length(4),
  correctOption: z.number().int().min(0).max(3),
  topic: z.string().min(1),
  difficulty: z.enum(["easy", "medium", "hard"]),
  explanation: z.string().min(1),
});

const quizBatchSchema = z.object({ questions: z.array(generatedQuestionSchema) });
const reportSchema = z.object({
  overallUnderstanding: z.enum(["Beginner", "Basic", "Intermediate", "Advanced", "Expert"]),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  topicScores: z.record(z.string(), z.number().min(0).max(100)),
  recommendedFocus: z.array(z.string()),
  summary: z.string(),
  completionPercentage: z.number().min(0).max(100),
});

const quizJsonSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: { type: "array", minItems: 4, maxItems: 4, items: { type: "string" } },
          correctOption: { type: "integer", minimum: 0, maximum: 3 },
          topic: { type: "string" },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          explanation: { type: "string" },
        },
        required: ["question", "options", "correctOption", "topic", "difficulty", "explanation"],
      },
    },
  },
  required: ["questions"],
};

const reportJsonSchema = {
  type: "object",
  properties: {
    overallUnderstanding: { type: "string", enum: ["Beginner", "Basic", "Intermediate", "Advanced", "Expert"] },
    strengths: { type: "array", items: { type: "string" } },
    weaknesses: { type: "array", items: { type: "string" } },
    topicScores: { type: "object", additionalProperties: { type: "number" } },
    recommendedFocus: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
    completionPercentage: { type: "number", minimum: 0, maximum: 100 },
  },
  required: ["overallUnderstanding", "strengths", "weaknesses", "topicScores", "recommendedFocus", "summary", "completionPercentage"],
};

async function ollamaJson<T>(prompt: string, format: object, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      format,
      messages: [
        { role: "system", content: "Return only valid JSON matching the supplied schema. Be accurate, concise, and never include markdown fences." },
        { role: "user", content: prompt },
      ],
      options: { temperature: 0.35, num_ctx: 8192 },
    }),
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });
  if (!response.ok) throw new Error(`Ollama returned ${response.status}: ${await response.text()}`);
  const payload = await response.json() as { message?: { content?: string } };
  if (!payload.message?.content) throw new Error("Ollama returned an empty response.");
  return schema.parse(JSON.parse(payload.message.content));
}

async function generateQuiz(subject: Subject, count: number): Promise<QuizQuestion[]> {
  const questions: QuizQuestion[] = [];
  while (questions.length < count) {
    const batchSize = Math.min(10, count - questions.length);
    const prior = questions.map((q) => q.question).join(" | ");
    const prompt = `Generate exactly ${batchSize} distinct multiple-choice questions for the subject ${JSON.stringify(subject.name)}.
Use this learning report to adapt topic choice and difficulty: ${JSON.stringify(subject.report)}
Prioritize weak and untested topics while retaining some coverage of strengths. Every question must have exactly four plausible options and exactly one correct option. correctOption is a zero-based array index. Explanations must be educational.
Do not repeat these questions: ${prior || "none"}.`;
    const batch = await ollamaJson(prompt, quizJsonSchema, quizBatchSchema);
    if (batch.questions.length !== batchSize) throw new Error(`The model returned ${batch.questions.length} questions instead of ${batchSize}.`);
    questions.push(...batch.questions.map((q) => ({
      ...q,
      id: randomUUID(),
      options: q.options as [string, string, string, string],
    })));
  }
  return questions;
}

type TopicResult = { topic: string; correct: number; total: number; difficulties: Difficulty[] };

function fallbackReport(current: Report, results: TopicResult[]): Report {
  const scores = { ...current.topicScores };
  for (const result of results) {
    const recent = Math.round((result.correct / result.total) * 100);
    scores[result.topic] = Math.round(scores[result.topic] == null ? recent : scores[result.topic] * 0.7 + recent * 0.3);
  }
  const entries = Object.entries(scores);
  const average = entries.length ? Math.round(entries.reduce((sum, [, score]) => sum + score, 0) / entries.length) : 0;
  const level = average >= 90 ? "Expert" : average >= 75 ? "Advanced" : average >= 55 ? "Intermediate" : average >= 30 ? "Basic" : "Beginner";
  const strengths = entries.filter(([, score]) => score >= 75).map(([topic]) => topic);
  const weaknesses = entries.filter(([, score]) => score < 50).map(([topic]) => topic);
  return {
    overallUnderstanding: level,
    strengths,
    weaknesses,
    topicScores: scores,
    recommendedFocus: weaknesses.length ? weaknesses.slice(0, 3).map((topic) => `Review and practise ${topic}.`) : ["Keep building breadth with another quiz."],
    summary: `Current understanding is ${level.toLowerCase()} across ${entries.length} assessed topic${entries.length === 1 ? "" : "s"}.`,
    completionPercentage: Math.min(100, Math.max(current.completionPercentage, current.completionPercentage + Math.min(10, results.length * 2))),
    quizzesCompleted: current.quizzesCompleted + 1,
    lastUpdated: new Date().toISOString(),
  };
}

async function updateReport(subject: Subject, results: TopicResult[]): Promise<Report> {
  const fallback = fallbackReport(subject.report, results);
  try {
    const prompt = `Update the persistent learning report for ${JSON.stringify(subject.name)}.
Existing report: ${JSON.stringify(subject.report)}
Latest aggregate topic results (no raw answers or quiz questions): ${JSON.stringify(results)}
Blend new evidence with prior scores instead of replacing history. Repeated weakness should matter, while genuine improvement should raise scores. Return a concise, actionable report.`;
    const update = await ollamaJson(prompt, reportJsonSchema, reportSchema);
    return {
      ...update,
      topicScores: Object.fromEntries(Object.entries(update.topicScores).map(([topic, score]) => [topic, Math.round(score)])),
      completionPercentage: Math.round(update.completionPercentage),
      quizzesCompleted: subject.report.quizzesCompleted + 1,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.warn("AI report update failed; using deterministic update:", error);
    return fallback;
  }
}

function dashboardFrom(report: Report): Dashboard {
  const values = Object.values(report.topicScores);
  const score = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  return {
    understandingScore: score,
    completionPercentage: report.completionPercentage,
    level: report.overallUnderstanding,
    strongTopicsCount: report.strengths.length,
    weakTopicsCount: report.weaknesses.length,
    recommendedAction: report.weaknesses.length
      ? `Take a short quiz focused on ${report.weaknesses.slice(0, 2).join(" and ")}.`
      : report.quizzesCompleted ? "Take another quiz to broaden your coverage." : "Start with a short quiz.",
  };
}

const app = Fastify({ logger: true });
await app.register(cors, { origin: ["http://localhost:5173", "http://127.0.0.1:5173"] });

app.get("/api/health", async () => {
  let ollama = false;
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(1500) });
    ollama = response.ok;
  } catch { /* Ollama is optional for non-generation routes. */ }
  return { ok: true, ollama, model: OLLAMA_MODEL, activeQuizSessions: quizSessions.size };
});

app.get("/api/subjects", async () => {
  const rows = db.prepare("SELECT * FROM subjects ORDER BY updated_at DESC").all() as Record<string, unknown>[];
  return rows.map(rowToSubject);
});

app.get<{ Params: { id: string } }>("/api/subjects/:id", async (request, reply) => {
  const subject = getSubject(request.params.id);
  if (!subject) return reply.code(404).send({ message: "Subject not found." });
  return subject;
});

app.post("/api/subjects", async (request, reply) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(80) }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ message: "Enter a subject name between 1 and 80 characters." });
  const id = randomUUID();
  const now = new Date().toISOString();
  try {
    db.prepare("INSERT INTO subjects (id, name, created_at, updated_at, report_json, dashboard_json) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, parsed.data.name, now, now, JSON.stringify(defaultReport()), JSON.stringify(defaultDashboard()));
  } catch {
    return reply.code(409).send({ message: "A subject with that name already exists." });
  }
  return reply.code(201).send(getSubject(id));
});

app.patch<{ Params: { id: string } }>("/api/subjects/:id", async (request, reply) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(80) }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ message: "Enter a valid subject name." });
  if (!getSubject(request.params.id)) return reply.code(404).send({ message: "Subject not found." });
  try {
    db.prepare("UPDATE subjects SET name = ?, updated_at = ? WHERE id = ?")
      .run(parsed.data.name, new Date().toISOString(), request.params.id);
  } catch {
    return reply.code(409).send({ message: "A subject with that name already exists." });
  }
  return getSubject(request.params.id);
});

app.delete<{ Params: { id: string } }>("/api/subjects/:id", async (request, reply) => {
  const result = db.prepare("DELETE FROM subjects WHERE id = ?").run(request.params.id);
  for (const [id, session] of quizSessions) if (session.subjectId === request.params.id) quizSessions.delete(id);
  if (result.changes === 0) return reply.code(404).send({ message: "Subject not found." });
  return reply.code(204).send();
});

app.post<{ Params: { id: string } }>("/api/subjects/:id/quizzes", async (request, reply) => {
  const parsed = z.object({ type: z.enum(["short", "long"]) }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ message: "Quiz type must be short or long." });
  const subject = getSubject(request.params.id);
  if (!subject) return reply.code(404).send({ message: "Subject not found." });
  const count = parsed.data.type === "short" ? 10 : 50;
  try {
    const questions = await generateQuiz(subject, count);
    const session: QuizSession = { id: randomUUID(), subjectId: subject.id, subjectName: subject.name, type: parsed.data.type, questions, createdAt: Date.now() };
    quizSessions.set(session.id, session);
    return reply.code(201).send({
      id: session.id,
      subjectId: session.subjectId,
      subjectName: session.subjectName,
      type: session.type,
      expiresAt: new Date(session.createdAt + QUIZ_TTL_MS).toISOString(),
      questions: questions.map(({ correctOption: _correct, explanation: _explanation, ...safe }) => safe),
    });
  } catch (error) {
    request.log.error(error);
    return reply.code(503).send({ message: `Quiz generation failed. Make sure Ollama is running with ${OLLAMA_MODEL}.` });
  }
});

app.post<{ Params: { id: string } }>("/api/quizzes/:id/submit", async (request, reply) => {
  const parsed = z.object({ answers: z.array(z.object({ questionId: z.string(), option: z.number().int().min(0).max(3) })) }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ message: "Answers are invalid." });
  const session = quizSessions.get(request.params.id);
  if (!session) return reply.code(404).send({ message: "This quiz has expired or was already submitted." });
  if (Date.now() - session.createdAt > QUIZ_TTL_MS) {
    quizSessions.delete(session.id);
    return reply.code(410).send({ message: "This quiz has expired." });
  }
  const answerMap = new Map(parsed.data.answers.map((answer) => [answer.questionId, answer.option]));
  const topicMap = new Map<string, TopicResult>();
  let correct = 0;
  const review = session.questions.map((question) => {
    const selectedOption = answerMap.get(question.id);
    const isCorrect = selectedOption === question.correctOption;
    if (isCorrect) correct += 1;
    const topic = topicMap.get(question.topic) ?? { topic: question.topic, correct: 0, total: 0, difficulties: [] };
    topic.total += 1;
    if (isCorrect) topic.correct += 1;
    topic.difficulties.push(question.difficulty);
    topicMap.set(question.topic, topic);
    return {
      id: question.id,
      question: question.question,
      selectedOption: selectedOption ?? null,
      correctOption: question.correctOption,
      options: question.options,
      explanation: question.explanation,
      topic: question.topic,
      isCorrect,
    };
  });
  const topicResults = [...topicMap.values()];
  quizSessions.delete(session.id);
  const subject = getSubject(session.subjectId);
  if (!subject) return reply.code(404).send({ message: "The subject no longer exists." });
  const report = await updateReport(subject, topicResults);
  const dashboard = dashboardFrom(report);
  saveLearningProfile(subject.id, report, dashboard);
  return {
    score: correct,
    total: session.questions.length,
    percentage: Math.round((correct / session.questions.length) * 100),
    topicResults,
    review,
    report,
    dashboard,
  };
});

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  reply.code(500).send({ message: "Something went wrong. Please try again." });
});

await app.listen({ port: PORT, host: "127.0.0.1" });
