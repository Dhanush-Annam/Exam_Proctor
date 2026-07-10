'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getExams, getMySubmissions } from '@/lib/api';
import Link from 'next/link';

export interface ExamListPageProps {
    readonly params?: any;
}

export default function ExamListPage({ params }: ExamListPageProps) {
    const router = useRouter();
    const [exams, setExams] = useState<any[]>([]);
    const [submissions, setSubmissions] = useState<any[]>([]);
    const [activeSubTab, setActiveSubTab] = useState<'available' | 'results'>('available');
    const [selectedSubmission, setSelectedSubmission] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        const stored = localStorage.getItem('user');
        if (!stored) {
            router.push('/login');
            return;
        }
        setTimeout(() => {
            setUser(JSON.parse(stored));
        }, 0);

        Promise.all([getExams(), getMySubmissions()])
            .then(([examsRes, submissionsRes]) => {
                setExams(examsRes.data);
                setSubmissions(submissionsRes.data);
            })
            .catch(() => router.push('/login'))
            .finally(() => setLoading(false));
    }, [router]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.push('/login');
    };

    if (loading) return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
                <svg className="animate-spin h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <p className="text-slate-400 font-medium text-sm">Loading available examinations...</p>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col relative overflow-hidden">
            {/* Background Glow Blobs */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-violet-600/10 blur-[120px] pointer-events-none" />

            {/* Top Navigation Header */}
            <header className="bg-slate-900/60 border-b border-slate-800/80 backdrop-blur-xl sticky top-0 z-50 px-6 h-16 flex justify-between items-center shrink-0">
                <Link href="/" className="flex items-center gap-3 group">
                    <div className="w-10 h-10 rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 group-hover:scale-105 transition duration-200">
                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                    </div>
                    <span className="text-xl font-bold tracking-tight bg-linear-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent flex items-center">
                        ExamProctor <span className="text-indigo-400 font-semibold text-sm px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 ml-1.5">AI</span>
                    </span>
                </Link>

                {user && (
                    <div className="flex items-center gap-4">
                        <div className="hidden sm:flex flex-col text-right">
                            <span className="text-xs font-semibold text-slate-200">{user.name}</span>
                            <span className="text-[10px] text-slate-500">{user.email}</span>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white px-3.5 py-1.5 rounded-xl border border-slate-800 text-xs font-semibold transition cursor-pointer"
                        >
                            Sign Out
                        </button>
                    </div>
                )}
            </header>

            {/* Main Content Area */}
            <main className="flex-1 p-6 md:p-12 relative z-10 max-w-4xl mx-auto w-full">
                
                {/* Sub Tab Switcher */}
                <div className="flex gap-2 mb-8 bg-slate-900/60 p-1.5 rounded-xl border border-slate-800 self-start">
                    <button
                        onClick={() => setActiveSubTab('available')}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                            activeSubTab === 'available'
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10'
                                : 'text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        Available Exams
                    </button>
                    <button
                        onClick={() => setActiveSubTab('results')}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                            activeSubTab === 'results'
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10'
                                : 'text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        My Results ({submissions.length})
                    </button>
                </div>

                {activeSubTab === 'available' ? (
                    <>
                        <div className="mb-10">
                            <h1 className="text-3xl font-extrabold text-white leading-tight">Available Examinations</h1>
                            <p className="text-slate-400 text-sm mt-1">Please select an active examination module below to begin.</p>
                        </div>

                        {exams.length === 0 ? (
                            <div className="glass-card rounded-2xl p-12 text-center border border-outline-variant/30 shadow-2xl">
                                <p className="text-slate-400 font-medium">No active examinations are currently available.</p>
                                <p className="text-slate-500 text-xs mt-1">Please contact your administrator or proctor to assign modules.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {exams.map((exam: any) => (
                                    <div
                                        key={exam.id}
                                        className="glass-card rounded-2xl p-6 border border-outline-variant/30 flex flex-col sm:flex-row justify-between sm:items-center gap-5 hover:border-outline-variant/50 hover:shadow-lg transition-all duration-300 border-l-4 border-l-primary"
                                    >
                                        <div className="space-y-1">
                                            <h2 className="font-bold text-slate-100 text-lg">
                                                {exam.title}
                                            </h2>
                                            <div className="flex gap-4 text-xs font-semibold uppercase text-slate-500 tracking-wider pt-1">
                                                <span className="text-primary flex items-center gap-1">
                                                    ⏱ {exam.duration_minutes} Mins
                                                </span>
                                                <span className="text-secondary flex items-center gap-1">
                                                    📋 {exam.questions?.length || 0} Questions
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => router.push(`/exam/${exam.id}`)}
                                            className="px-6 py-3 bg-primary text-slate-950 font-bold rounded-xl hover:opacity-90 hover:scale-[1.02] transition-all hover:shadow-[0_0_15px_rgba(192,193,255,0.3)] cursor-pointer text-center whitespace-nowrap self-start sm:self-auto w-full sm:w-auto"
                                        >
                                            Start Exam
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <div className="mb-10">
                            <h1 className="text-3xl font-extrabold text-white leading-tight">My Past Submissions</h1>
                            <p className="text-slate-400 text-sm mt-1">Review your results and details of past submitted examinations.</p>
                        </div>

                        {submissions.length === 0 ? (
                            <div className="glass-card rounded-2xl p-12 text-center border border-outline-variant/30 shadow-2xl">
                                <p className="text-slate-400 font-medium">You have not submitted any examinations yet.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {submissions.map((sub: any) => (
                                    <div
                                        key={sub.id}
                                        className="glass-card rounded-2xl p-6 border border-outline-variant/30 flex flex-col sm:flex-row justify-between sm:items-center gap-5 hover:border-outline-variant/50 hover:shadow-lg transition-all duration-300 border-l-4 border-l-emerald-500"
                                    >
                                        <div className="space-y-1">
                                            <h2 className="font-bold text-slate-100 text-lg">
                                                {sub.exam?.title || 'Unknown Exam'}
                                            </h2>
                                            <p className="text-xs text-slate-500">Submitted at: {new Date(sub.submitted_at || sub.createdAt).toLocaleString()}</p>
                                            <div className="flex gap-4 text-xs font-semibold uppercase text-slate-500 tracking-wider pt-2">
                                                <span className="text-indigo-400 font-bold">
                                                    Score: {sub.score?.toFixed(1)}%
                                                </span>
                                                <span className="text-violet-400">
                                                    Correct: {sub.correct_answers}/{sub.total_questions}
                                                </span>
                                                <span className={`${sub.total_flags > 0 ? 'text-red-400 animate-pulse' : 'text-slate-450'} font-bold`}>
                                                    Flags: {sub.total_flags}
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setSelectedSubmission(sub)}
                                            className="px-5 py-2.5 bg-slate-900 border border-slate-800 text-slate-350 font-bold rounded-xl hover:text-white hover:border-slate-700 transition cursor-pointer text-center whitespace-nowrap self-start sm:self-auto w-full sm:w-auto"
                                        >
                                            Inspect Answers
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </main>

            {/* Answer Inspection Modal for Students */}
            {selectedSubmission && (
                <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl h-[80vh] rounded-3xl p-6 md:p-8 flex flex-col shadow-2xl relative overflow-hidden">
                        
                        {/* Header */}
                        <div className="flex justify-between items-start border-b border-slate-800 pb-4 mb-5">
                            <div>
                                <h2 className="text-2xl font-bold text-white">{selectedSubmission.exam?.title || 'Exam'}</h2>
                                <p className="text-xs text-slate-400 mt-1">Submitted at {new Date(selectedSubmission.submitted_at).toLocaleString()}</p>
                                <p className="text-sm font-semibold text-indigo-400 mt-1">Final Score: {selectedSubmission.score?.toFixed(1)}% ({selectedSubmission.correct_answers}/{selectedSubmission.total_questions} correct)</p>
                            </div>
                            <button
                                onClick={() => setSelectedSubmission(null)}
                                className="w-8 h-8 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition duration-200 cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>

                        {/* List of questions with correct/incorrect markers */}
                        <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
                            {selectedSubmission.exam?.questions ? (
                                selectedSubmission.exam.questions.map((q: any, qIdx: number) => {
                                    const studentAnswer = selectedSubmission.answers[qIdx];
                                    const isCorrect = studentAnswer === q.answer;

                                    return (
                                        <div key={qIdx} className={`p-5 rounded-2xl border ${isCorrect ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
                                            <div className="flex justify-between items-start gap-3">
                                                <h3 className="font-bold text-slate-100 text-sm leading-snug">
                                                    Question {qIdx + 1}: {q.question || q.questionText}
                                                </h3>
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase shrink-0 ${isCorrect ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                                    {isCorrect ? 'Correct' : 'Incorrect'}
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                                                {q.options.map((opt: string, oIdx: number) => {
                                                    const isCorrectOpt = opt === q.answer;
                                                    const isSelectedOpt = opt === studentAnswer;

                                                    let cardStyle = 'border-slate-800/80 bg-slate-950/40 text-slate-400';
                                                    if (isCorrectOpt) {
                                                        cardStyle = 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-semibold';
                                                    } else if (isSelectedOpt) {
                                                        cardStyle = 'border-red-500/40 bg-red-500/10 text-red-300 font-semibold';
                                                    }

                                                    return (
                                                        <div key={oIdx} className={`p-3.5 rounded-xl border text-xs ${cardStyle} flex items-center justify-between`}>
                                                            <span>{String.fromCharCode(65 + oIdx)}. {opt}</span>
                                                            <div className="flex gap-1">
                                                                {isSelectedOpt && (
                                                                    <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-slate-950/60 text-slate-350">Selected</span>
                                                                )}
                                                                {isCorrectOpt && (
                                                                    <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Correct Answer</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <p className="text-center text-sm text-slate-500 py-10">No detailed question metadata available for this submission.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}