import { useEffect, useMemo, useState } from "react";

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
type Subject = { id: string; name: string; createdAt: string; updatedAt: string; report: Report; dashboard: Dashboard };
type Question = { id: string; question: string; options: string[]; topic: string; difficulty: string };
type Quiz = { id: string; subjectId: string; subjectName: string; type: "short" | "long"; questions: Question[]; expiresAt: string };
type QuizResult = {
  score: number;
  total: number;
  percentage: number;
  topicResults: { topic: string; correct: number; total: number }[];
  review: { id: string; question: string; selectedOption: number | null; correctOption: number; options: string[]; explanation: string; topic: string; isCorrect: boolean }[];
  report: Report;
  dashboard: Dashboard;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: "Request failed." })) as { message?: string };
    throw new Error(body.message ?? "Request failed.");
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

function Icon({ name, className = "size-5" }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    arrow: <><path d="m9 18 6-6-6-6"/></>,
    back: <><path d="m15 18-6-6 6-6"/></>,
    spark: <><path d="m12 3-1.5 4.5L6 9l4.5 1.5L12 15l1.5-4.5L18 9l-4.5-1.5L12 3Z"/><path d="m5 16-.75 2.25L2 19l2.25.75L5 22l.75-2.25L8 19l-2.25-.75L5 16Z"/></>,
    bolt: <path d="m13 2-9 12h8l-1 8 9-12h-8l1-8Z"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    x: <><path d="m6 6 12 12M18 6 6 18"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></>,
    brain: <><path d="M9.5 4.5A3 3 0 0 0 5 7a3 3 0 0 0 0 6 3.5 3.5 0 0 0 4.5 5.5V4.5ZM14.5 4.5A3 3 0 0 1 19 7a3 3 0 0 1 0 6 3.5 3.5 0 0 1-4.5 5.5V4.5Z"/><path d="M9.5 9H7m2.5 5H7m7.5-5H17m-2.5 5H17"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const subjectColors = ["#e7674a", "#3e7c73", "#6962a8", "#c28b31", "#3d6b99", "#9b5c79"];

export default function App() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [newSubject, setNewSubject] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState("");
  const [error, setError] = useState("");
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null);

  const selected = subjects.find((subject) => subject.id === selectedId) ?? null;
  const totalQuizzes = subjects.reduce((sum, subject) => sum + subject.report.quizzesCompleted, 0);
  const averageScore = subjects.length ? Math.round(subjects.reduce((sum, subject) => sum + subject.dashboard.understandingScore, 0) / subjects.length) : 0;

  const loadSubjects = async () => {
    try { setSubjects(await api<Subject[]>("/api/subjects")); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load subjects."); }
  };

  useEffect(() => {
    void loadSubjects();
    api<{ ollama: boolean }>("/api/health").then((health) => setOllamaOnline(health.ollama)).catch(() => setOllamaOnline(false));
  }, []);

  const createSubject = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newSubject.trim()) return;
    setBusy(true); setError("");
    try {
      const created = await api<Subject>("/api/subjects", { method: "POST", body: JSON.stringify({ name: newSubject }) });
      setSubjects((current) => [created, ...current]);
      setNewSubject(""); setShowCreate(false); setSelectedId(created.id);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create subject."); }
    finally { setBusy(false); }
  };

  const renameSubject = async () => {
    if (!selected) return;
    const name = window.prompt("Rename subject", selected.name)?.trim();
    if (!name || name === selected.name) return;
    try {
      const updated = await api<Subject>(`/api/subjects/${selected.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      setSubjects((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (err) { setError(err instanceof Error ? err.message : "Could not rename subject."); }
  };

  const deleteSubject = async () => {
    if (!selected || !window.confirm(`Delete ${selected.name} and its learning report?`)) return;
    try {
      await api(`/api/subjects/${selected.id}`, { method: "DELETE" });
      setSubjects((current) => current.filter((item) => item.id !== selected.id));
      setSelectedId(null);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not delete subject."); }
  };

  const startQuiz = async (type: "short" | "long") => {
    if (!selected) return;
    setBusy(true); setBusyMessage(type === "short" ? "Crafting 10 questions…" : "Building your 50-question assessment…"); setError("");
    try {
      const created = await api<Quiz>(`/api/subjects/${selected.id}/quizzes`, { method: "POST", body: JSON.stringify({ type }) });
      setQuiz(created); setAnswers({}); setQuestionIndex(0); setResult(null);
    } catch (err) { setError(err instanceof Error ? err.message : "Quiz generation failed."); }
    finally { setBusy(false); setBusyMessage(""); }
  };

  const submitQuiz = async () => {
    if (!quiz || Object.keys(answers).length !== quiz.questions.length) return;
    setBusy(true); setBusyMessage("Reading the patterns in your answers…"); setError("");
    try {
      const completed = await api<QuizResult>(`/api/quizzes/${quiz.id}/submit`, {
        method: "POST",
        body: JSON.stringify({ answers: Object.entries(answers).map(([questionId, option]) => ({ questionId, option })) }),
      });
      setResult(completed);
      setSubjects((current) => current.map((item) => item.id === quiz.subjectId ? { ...item, report: completed.report, dashboard: completed.dashboard } : item));
    } catch (err) { setError(err instanceof Error ? err.message : "Could not submit quiz."); }
    finally { setBusy(false); setBusyMessage(""); }
  };

  const goHome = () => { setQuiz(null); setResult(null); setSelectedId(null); setAnswers({}); };
  const leaveQuiz = () => {
    if (quiz && !result && Object.keys(answers).length && !window.confirm("Leave this quiz? Your answers will be discarded.")) return;
    setQuiz(null); setResult(null); setAnswers({}); setQuestionIndex(0);
  };

  if (quiz && result) return <ResultView quiz={quiz} result={result} onBack={leaveQuiz} onHome={goHome} />;
  if (quiz) return <QuizView quiz={quiz} answers={answers} setAnswers={setAnswers} index={questionIndex} setIndex={setQuestionIndex} onSubmit={submitQuiz} onBack={leaveQuiz} />;

  return (
    <div className="min-h-screen bg-[#f5f4ef] text-[#24231f]">
      <Header ollamaOnline={ollamaOnline} onHome={goHome} />
      {error && <div className="fixed right-5 top-20 z-50 flex max-w-md items-start gap-3 rounded-2xl bg-[#3d302d] px-4 py-3 text-sm text-white shadow-xl"><span className="flex-1">{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><Icon name="x" className="size-4" /></button></div>}
      {busy && <LoadingOverlay message={busyMessage || "One moment…"} />}
      <main className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-14">
        {selected ? (
          <SubjectView subject={selected} onBack={() => setSelectedId(null)} onStart={startQuiz} onRename={renameSubject} onDelete={deleteSubject} />
        ) : (
          <>
            <section className="mb-12 grid items-end gap-8 md:grid-cols-[1fr_auto]">
              <div>
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-[#e7674a]"><Icon name="spark" className="size-4" /> Your learning space</p>
                <h1 className="max-w-3xl font-serif text-5xl leading-[1.06] tracking-[-0.035em] md:text-7xl">Learn what matters.<br/><span className="italic text-[#61726d]">Remember the progress.</span></h1>
                <p className="mt-6 max-w-2xl text-base leading-7 text-[#6c6a62] md:text-lg">Private, adaptive quizzes powered by your local AI. Questions disappear; understanding stays.</p>
              </div>
              <button onClick={() => setShowCreate(true)} className="group flex h-14 items-center justify-center gap-2 rounded-full bg-[#24231f] px-7 font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#e7674a]"><Icon name="plus" /> New subject</button>
            </section>

            <section className="mb-12 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat value={subjects.length} label="Subjects" />
              <Stat value={totalQuizzes} label="Quizzes completed" />
              <Stat value={`${averageScore}%`} label="Average understanding" />
              <Stat value={ollamaOnline ? "Local" : "Offline"} label="AI connection" accent={ollamaOnline === false} />
            </section>

            <section>
              <div className="mb-6 flex items-center justify-between"><h2 className="font-serif text-3xl">Your subjects</h2><span className="text-sm text-[#858278]">{subjects.length ? "Choose a subject to continue" : "Create your first learning space"}</span></div>
              {subjects.length ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {subjects.map((subject, index) => <SubjectCard key={subject.id} subject={subject} color={subjectColors[index % subjectColors.length]} onClick={() => setSelectedId(subject.id)} />)}
                  <button onClick={() => setShowCreate(true)} className="min-h-64 rounded-[1.7rem] border border-dashed border-[#c9c6bc] p-7 text-left text-[#77746b] transition hover:border-[#e7674a] hover:bg-white hover:text-[#e7674a]"><span className="mb-14 flex size-12 items-center justify-center rounded-full border border-current"><Icon name="plus" /></span><span className="block font-serif text-2xl">Add another subject</span><span className="mt-2 block text-sm">Keep each learning context separate.</span></button>
                </div>
              ) : (
                <button onClick={() => setShowCreate(true)} className="group flex min-h-72 w-full flex-col items-center justify-center rounded-[2rem] border border-dashed border-[#c9c6bc] bg-white/40 text-center transition hover:border-[#e7674a] hover:bg-white"><span className="mb-5 flex size-16 items-center justify-center rounded-full bg-[#ebe9e1] text-[#e7674a] transition group-hover:scale-110"><Icon name="plus" className="size-7" /></span><span className="font-serif text-3xl">Create your first subject</span><span className="mt-2 text-[#77746b]">Physics, history, mathematics—anything you want to understand.</span></button>
              )}
            </section>
          </>
        )}
      </main>
      <footer className="mx-auto flex max-w-7xl flex-col gap-3 border-t border-[#dedbd2] px-5 py-7 text-sm text-[#77746b] md:flex-row md:items-center md:justify-between md:px-8"><span>LoreLens AI · Your data stays on this device</span><span className="flex items-center gap-2"><Icon name="shield" className="size-4" /> Questions and answers are never saved</span></footer>
      {showCreate && <CreateModal value={newSubject} setValue={setNewSubject} onSubmit={createSubject} onClose={() => setShowCreate(false)} busy={busy} />}
    </div>
  );
}

function Header({ ollamaOnline, onHome }: { ollamaOnline: boolean | null; onHome: () => void }) {
  return <header className="sticky top-0 z-40 border-b border-[#dedbd2]/80 bg-[#f5f4ef]/90 backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-8"><button onClick={onHome} className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-[#24231f] text-white"><Icon name="brain" /></span><span className="font-serif text-xl font-semibold tracking-tight">LoreLens AI</span></button><div className="flex items-center gap-2 rounded-full border border-[#d8d5cc] bg-white/60 px-3 py-1.5 text-xs font-medium"><span className={`size-2 rounded-full ${ollamaOnline ? "bg-[#4d9a78]" : ollamaOnline === false ? "bg-[#d46a52]" : "bg-[#aaa79e]"}`} />{ollamaOnline ? "Ollama connected" : ollamaOnline === false ? "Ollama offline" : "Checking Ollama"}</div></div></header>;
}

function Stat({ value, label, accent = false }: { value: string | number; label: string; accent?: boolean }) {
  return <div className="rounded-2xl border border-[#dedbd2] bg-white/50 px-4 py-5 md:px-6"><div className={`font-serif text-3xl md:text-4xl ${accent ? "text-[#d46a52]" : "text-[#24231f]"}`}>{value}</div><div className="mt-1 text-xs leading-4 text-[#77746b] md:text-sm">{label}</div></div>;
}

function SubjectCard({ subject, color, onClick }: { subject: Subject; color: string; onClick: () => void }) {
  return <button onClick={onClick} className="group relative flex min-h-64 flex-col overflow-hidden rounded-[1.7rem] border border-[#dedbd2] bg-white p-7 text-left shadow-[0_3px_18px_rgba(50,45,35,0.04)] transition hover:-translate-y-1 hover:shadow-[0_14px_35px_rgba(50,45,35,0.1)]"><span className="absolute right-5 top-5 flex size-10 items-center justify-center rounded-full bg-[#f2f0ea] transition group-hover:bg-[#24231f] group-hover:text-white"><Icon name="arrow" /></span><span className="mb-10 flex size-12 shrink-0 items-center justify-center rounded-2xl text-white" style={{ backgroundColor: color }}><Icon name="book" /></span><h3 className="pr-8 font-serif text-2xl leading-tight">{subject.name}</h3><p className="mt-2 line-clamp-2 text-sm leading-6 text-[#77746b]">{subject.report.summary}</p><div className="mt-auto w-full pt-6"><div className="mb-2 flex justify-between gap-3 text-xs"><span>{subject.dashboard.level}</span><span className="text-right">{subject.dashboard.understandingScore}% understanding</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#eceae4]"><div className="h-full rounded-full transition-all" style={{ width: `${subject.dashboard.understandingScore}%`, backgroundColor: color }} /></div></div></button>;
}

function SubjectView({ subject, onBack, onStart, onRename, onDelete }: { subject: Subject; onBack: () => void; onStart: (type: "short" | "long") => void; onRename: () => void; onDelete: () => void }) {
  const topics = Object.entries(subject.report.topicScores).sort((a, b) => b[1] - a[1]);
  return <div>
    <button onClick={onBack} className="mb-8 flex items-center gap-2 text-sm text-[#6f6d65] hover:text-[#24231f]"><Icon name="back" className="size-4" /> All subjects</button>
    <section className="mb-7 overflow-hidden rounded-[2rem] bg-[#263b36] p-7 text-white md:p-10"><div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center"><div><p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#b8d2ca]">Subject workspace</p><h1 className="font-serif text-5xl tracking-tight md:text-6xl">{subject.name}</h1><p className="mt-4 max-w-2xl leading-7 text-[#cfddd8]">{subject.report.summary}</p><div className="mt-6 flex gap-3"><button onClick={onRename} className="flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm hover:bg-white/10"><Icon name="edit" className="size-4" /> Rename</button><button onClick={onDelete} className="flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm hover:border-[#f3aa98] hover:bg-[#f3aa98]/10 hover:text-[#ffd5ca]"><Icon name="trash" className="size-4" /> Delete</button></div></div><ScoreRing score={subject.dashboard.understandingScore} label={subject.dashboard.level} /></div></section>
    <div className="grid gap-7 lg:grid-cols-[1.05fr_.95fr]">
      <section className="rounded-[1.7rem] border border-[#dedbd2] bg-white p-6 md:p-8"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#e7674a]">Continue learning</p><h2 className="font-serif text-3xl">Choose your pace</h2><div className="mt-6 grid gap-4 sm:grid-cols-2"><QuizChoice type="short" count={10} time="~10 min" description="A quick, adaptive check-in focused on topics that need attention." icon="bolt" onClick={() => onStart("short")} /><QuizChoice type="long" count={50} time="~40 min" description="A deeper assessment for a richer, more accurate learning profile." icon="target" onClick={() => onStart("long")} /></div><div className="mt-5 flex items-start gap-3 rounded-2xl bg-[#f6f3ec] p-4 text-sm leading-6 text-[#69665e]"><Icon name="shield" className="mt-0.5 size-5 shrink-0 text-[#4e8075]" /><span>Every quiz is generated fresh. Questions and answers are erased after your report is updated.</span></div></section>
      <section className="rounded-[1.7rem] border border-[#dedbd2] bg-white p-6 md:p-8"><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#61726d]">Learning report</p><h2 className="font-serif text-3xl">Current picture</h2><div className="mt-6 grid grid-cols-3 gap-2"><MiniStat value={`${subject.dashboard.completionPercentage}%`} label="Completion"/><MiniStat value={subject.report.strengths.length} label="Strengths"/><MiniStat value={subject.report.weaknesses.length} label="Focus areas"/></div><div className="mt-6"><h3 className="mb-3 text-sm font-semibold">Recommended next step</h3><p className="rounded-2xl bg-[#edf3f0] p-4 text-sm leading-6 text-[#3d5d55]">{subject.dashboard.recommendedAction}</p></div></section>
    </div>
    <section className="mt-7 rounded-[1.7rem] border border-[#dedbd2] bg-white p-6 md:p-8"><div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#61726d]">Topic map</p><h2 className="font-serif text-3xl">What you understand</h2></div><span className="text-sm text-[#858278]">Updated after each quiz</span></div>{topics.length ? <div className="grid gap-x-10 gap-y-5 md:grid-cols-2">{topics.map(([topic, score]) => <div key={topic}><div className="mb-2 flex justify-between text-sm"><span className="font-medium">{topic}</span><span className="text-[#77746b]">{score}%</span></div><div className="h-2 rounded-full bg-[#efede7]"><div className={`h-full rounded-full ${score >= 75 ? "bg-[#4e8075]" : score < 50 ? "bg-[#e1785e]" : "bg-[#d0a34c]"}`} style={{ width: `${score}%` }}/></div></div>)}</div> : <div className="rounded-2xl border border-dashed border-[#d8d5cc] py-12 text-center text-[#77746b]"><Icon name="brain" className="mx-auto mb-3 size-8"/><p>Complete a quiz to reveal your topic map.</p></div>}</section>
  </div>;
}

function QuizChoice({ type, count, time, description, icon, onClick }: { type: string; count: number; time: string; description: string; icon: string; onClick: () => void }) {
  return <button onClick={onClick} className="group rounded-2xl border border-[#dedbd2] p-5 text-left transition hover:-translate-y-0.5 hover:border-[#e7674a] hover:shadow-lg"><span className="mb-5 flex size-11 items-center justify-center rounded-xl bg-[#f2eee6] text-[#e7674a] transition group-hover:bg-[#e7674a] group-hover:text-white"><Icon name={icon}/></span><span className="block font-serif text-2xl capitalize">{type} quiz</span><span className="mt-1 flex items-center gap-3 text-xs text-[#77746b]"><b className="font-medium text-[#24231f]">{count} questions</b><span className="flex items-center gap-1"><Icon name="clock" className="size-3"/>{time}</span></span><span className="mt-4 block text-sm leading-6 text-[#77746b]">{description}</span></button>;
}

function ScoreRing({ score, label }: { score: number; label: string }) { return <div className="relative flex size-40 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(#e78a70 ${score * 3.6}deg, rgba(255,255,255,.13) 0)` }}><div className="flex size-[8.6rem] flex-col items-center justify-center rounded-full bg-[#263b36]"><span className="font-serif text-4xl">{score}%</span><span className="mt-1 text-xs text-[#b8d2ca]">{label}</span></div></div>; }
function MiniStat({ value, label }: { value: string | number; label: string }) { return <div className="rounded-xl bg-[#f5f4ef] px-3 py-4 text-center"><div className="font-serif text-2xl">{value}</div><div className="mt-1 text-[11px] text-[#77746b]">{label}</div></div>; }

function QuizView({ quiz, answers, setAnswers, index, setIndex, onSubmit, onBack }: { quiz: Quiz; answers: Record<string, number>; setAnswers: React.Dispatch<React.SetStateAction<Record<string, number>>>; index: number; setIndex: React.Dispatch<React.SetStateAction<number>>; onSubmit: () => void; onBack: () => void }) {
  const question = quiz.questions[index];
  const answered = Object.keys(answers).length;
  const selected = answers[question.id];
  const complete = answered === quiz.questions.length;
  const markers = useMemo(() => quiz.questions.map((item) => answers[item.id] !== undefined), [quiz.questions, answers]);
  return <div className="min-h-screen bg-[#f5f4ef] text-[#24231f]"><header className="border-b border-[#dedbd2] bg-white/70"><div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5"><button onClick={onBack} className="flex items-center gap-2 text-sm"><Icon name="x" className="size-4"/> Exit quiz</button><div className="text-center"><div className="font-serif text-lg">{quiz.subjectName}</div><div className="text-[10px] uppercase tracking-[.16em] text-[#77746b]">{quiz.type} quiz</div></div><span className="text-sm tabular-nums text-[#77746b]">{answered}/{quiz.questions.length}</span></div><div className="h-1 bg-[#e8e5dd]"><div className="h-full bg-[#e7674a] transition-all" style={{ width: `${(answered / quiz.questions.length) * 100}%` }}/></div></header>
    <main className="mx-auto grid max-w-6xl gap-7 px-5 py-8 lg:grid-cols-[1fr_220px] lg:py-12"><section className="rounded-[2rem] border border-[#dedbd2] bg-white p-6 shadow-[0_10px_40px_rgba(50,45,35,.05)] md:p-10"><div className="mb-7 flex flex-wrap items-center gap-3"><span className="rounded-full bg-[#edf3f0] px-3 py-1 text-xs font-semibold text-[#467167]">{question.topic}</span><span className="rounded-full bg-[#f3f0e9] px-3 py-1 text-xs capitalize text-[#77746b]">{question.difficulty}</span><span className="ml-auto text-sm text-[#858278]">Question {index + 1} of {quiz.questions.length}</span></div><h1 className="max-w-3xl font-serif text-3xl leading-tight md:text-4xl">{question.question}</h1><div className="mt-8 grid gap-3">{question.options.map((option, optionIndex) => <button key={optionIndex} onClick={() => setAnswers((current) => ({ ...current, [question.id]: optionIndex }))} className={`flex items-start gap-4 rounded-2xl border p-4 text-left transition md:p-5 ${selected === optionIndex ? "border-[#e7674a] bg-[#fff5f1] shadow-[0_0_0_1px_#e7674a]" : "border-[#ddd9cf] hover:border-[#aaa69a] hover:bg-[#faf9f5]"}`}><span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${selected === optionIndex ? "bg-[#e7674a] text-white" : "bg-[#efede7] text-[#69665e]"}`}>{String.fromCharCode(65 + optionIndex)}</span><span className="pt-1 leading-6">{option}</span></button>)}</div><div className="mt-9 flex items-center justify-between"><button disabled={index === 0} onClick={() => setIndex(index - 1)} className="rounded-full border border-[#d8d5cc] px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-30">Previous</button>{index < quiz.questions.length - 1 ? <button onClick={() => setIndex(index + 1)} className="flex items-center gap-2 rounded-full bg-[#24231f] px-6 py-3 text-sm font-semibold text-white hover:bg-[#e7674a]">Next <Icon name="arrow" className="size-4"/></button> : <button disabled={!complete} onClick={onSubmit} className="flex items-center gap-2 rounded-full bg-[#e7674a] px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><Icon name="check" className="size-4"/> Submit quiz</button>}</div>{index === quiz.questions.length - 1 && !complete && <p className="mt-4 text-right text-xs text-[#a15b48]">Answer all questions before submitting.</p>}</section>
      <aside className="h-fit rounded-[1.5rem] border border-[#dedbd2] bg-white p-5"><h2 className="mb-4 text-sm font-semibold">Question map</h2><div className="grid grid-cols-5 gap-2 lg:grid-cols-4">{markers.map((done, markerIndex) => <button key={markerIndex} onClick={() => setIndex(markerIndex)} className={`aspect-square rounded-lg text-xs font-semibold transition ${markerIndex === index ? "bg-[#24231f] text-white" : done ? "bg-[#dceae5] text-[#356458]" : "bg-[#f0eee8] text-[#77746b] hover:bg-[#e4e1d8]"}`}>{markerIndex + 1}</button>)}</div><div className="mt-5 border-t border-[#e7e4dc] pt-4 text-xs leading-5 text-[#77746b]">Quiz content is temporary and will be discarded after submission.</div></aside></main>
  </div>;
}

function ResultView({ quiz, result, onBack, onHome }: { quiz: Quiz; result: QuizResult; onBack: () => void; onHome: () => void }) {
  const [showReview, setShowReview] = useState(false);
  return <div className="min-h-screen bg-[#f5f4ef] text-[#24231f]"><Header ollamaOnline={true} onHome={onHome}/><main className="mx-auto max-w-5xl px-5 py-10 md:py-14"><section className="overflow-hidden rounded-[2rem] bg-[#263b36] p-7 text-white md:p-10"><div className="grid items-center gap-8 md:grid-cols-[auto_1fr_auto]"><div className="flex size-32 flex-col items-center justify-center rounded-full border-[10px] border-[#e78a70] bg-white/5"><span className="font-serif text-4xl">{result.percentage}%</span><span className="text-xs text-[#c6d8d2]">{result.score}/{result.total}</span></div><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#b8d2ca]">Quiz complete</p><h1 className="mt-2 font-serif text-4xl md:text-5xl">{result.percentage >= 80 ? "Beautifully done." : result.percentage >= 55 ? "Good work—keep going." : "A useful starting point."}</h1><p className="mt-3 text-[#cfddd8]">Your {quiz.subjectName} learning profile has been updated. The quiz itself is already forgotten.</p></div><div className="flex gap-2 md:flex-col"><button onClick={onBack} className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#263b36]">Back to subject</button><button onClick={onHome} className="rounded-full border border-white/25 px-5 py-2.5 text-sm">Home</button></div></div></section>
    <div className="mt-7 grid gap-7 md:grid-cols-2"><section className="rounded-[1.7rem] border border-[#dedbd2] bg-white p-6"><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#e7674a]">Topic results</p><div className="mt-5 space-y-5">{result.topicResults.map((topic) => { const score = Math.round(topic.correct / topic.total * 100); return <div key={topic.topic}><div className="mb-2 flex justify-between text-sm"><span className="font-medium">{topic.topic}</span><span>{topic.correct}/{topic.total}</span></div><div className="h-2 rounded-full bg-[#efede7]"><div className={`h-full rounded-full ${score >= 70 ? "bg-[#4e8075]" : "bg-[#e1785e]"}`} style={{width:`${score}%`}}/></div></div>; })}</div></section><section className="rounded-[1.7rem] border border-[#dedbd2] bg-white p-6"><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#61726d]">Your updated picture</p><h2 className="mt-3 font-serif text-3xl">{result.report.overallUnderstanding}</h2><p className="mt-3 text-sm leading-6 text-[#69665e]">{result.report.summary}</p><div className="mt-5 rounded-2xl bg-[#edf3f0] p-4 text-sm leading-6 text-[#3d5d55]"><b className="block mb-1">Next step</b>{result.dashboard.recommendedAction}</div></section></div>
    <section className="mt-7 rounded-[1.7rem] border border-[#dedbd2] bg-white"><button onClick={() => setShowReview(!showReview)} className="flex w-full items-center justify-between p-6 text-left"><span><span className="block font-serif text-2xl">Review this quiz</span><span className="mt-1 block text-sm text-[#77746b]">Explanations are available until you leave this page.</span></span><Icon name="arrow" className={`size-5 transition ${showReview ? "rotate-90" : ""}`}/></button>{showReview && <div className="space-y-4 border-t border-[#e5e2da] p-6">{result.review.map((item, index) => <article key={item.id} className={`rounded-2xl border p-5 ${item.isCorrect ? "border-[#cfe1da] bg-[#f5faf8]" : "border-[#efd3ca] bg-[#fff8f5]"}`}><div className="flex items-start gap-3"><span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${item.isCorrect ? "bg-[#4e8075] text-white" : "bg-[#d86b52] text-white"}`}><Icon name={item.isCorrect ? "check" : "x"} className="size-4"/></span><div><p className="font-medium leading-6">{index + 1}. {item.question}</p><p className="mt-2 text-sm">Correct answer: <b>{item.options[item.correctOption]}</b></p>{!item.isCorrect && <p className="mt-1 text-sm text-[#8b5548]">Your answer: {item.selectedOption == null ? "Not answered" : item.options[item.selectedOption]}</p>}<p className="mt-3 text-sm leading-6 text-[#69665e]">{item.explanation}</p></div></div></article>)}</div>}</section>
  </main></div>;
}

function CreateModal({ value, setValue, onSubmit, onClose, busy }: { value: string; setValue: (value: string) => void; onSubmit: (event: React.FormEvent) => void; onClose: () => void; busy: boolean }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#24231f]/35 p-5 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form onSubmit={onSubmit} className="w-full max-w-md rounded-[2rem] bg-[#fbfaf7] p-7 shadow-2xl"><div className="mb-7 flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#e7674a]">New learning space</p><h2 className="mt-2 font-serif text-3xl">What are you studying?</h2></div><button type="button" onClick={onClose} className="flex size-9 items-center justify-center rounded-full bg-[#efede7]"><Icon name="x" className="size-4"/></button></div><label className="mb-2 block text-sm font-semibold" htmlFor="subject-name">Subject name</label><input autoFocus id="subject-name" value={value} onChange={(event) => setValue(event.target.value)} placeholder="e.g. Physics" maxLength={80} className="w-full rounded-2xl border border-[#d8d5cc] bg-white px-4 py-3.5 outline-none transition placeholder:text-[#aaa79e] focus:border-[#e7674a] focus:ring-2 focus:ring-[#e7674a]/15"/><p className="mt-3 text-xs leading-5 text-[#77746b]">This subject gets its own isolated report, dashboard, and AI context.</p><button disabled={busy || !value.trim()} className="mt-7 flex w-full items-center justify-center gap-2 rounded-full bg-[#24231f] py-3.5 font-semibold text-white disabled:opacity-40">Create subject <Icon name="arrow" className="size-4"/></button></form></div>;
}

function LoadingOverlay({ message }: { message: string }) { return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#f5f4ef]/80 p-5 backdrop-blur-md"><div className="text-center"><span className="mx-auto mb-6 flex size-16 animate-pulse items-center justify-center rounded-2xl bg-[#263b36] text-white"><Icon name="spark" className="size-7"/></span><h2 className="font-serif text-3xl">{message}</h2><p className="mt-2 text-sm text-[#77746b]">The local model may need a moment to think.</p><div className="mx-auto mt-6 h-1.5 w-48 overflow-hidden rounded-full bg-[#ddd9cf]"><div className="loading-bar h-full w-1/3 rounded-full bg-[#e7674a]"/></div></div></div>; }
