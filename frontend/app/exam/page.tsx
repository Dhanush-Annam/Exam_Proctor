'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getExams, getMySubmissions } from '@/lib/api';
import Navbar from '@/components/Navbar';
import { Clock, FileText, CheckCircle2, AlertTriangle, X, ChevronRight, Loader2 } from 'lucide-react';

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

    useEffect(() => {
        const stored = localStorage.getItem('user');
        if (!stored) {
            router.push('/login');
            return;
        }

        Promise.all([getExams(), getMySubmissions()])
            .then(([examsRes, submissionsRes]) => {
                setExams(examsRes.data);
                setSubmissions(submissionsRes.data);
            })
            .catch(() => router.push('/login'))
            .finally(() => setLoading(false));
    }, [router]);

    if (loading) {
        return (
            <div className="min-h-screen bg-canvas flex flex-col items-center justify-center text-muted-text gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-primary-text" strokeWidth={1.5} />
                <span className="text-xs font-mono">Loading examination registry...</span>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-canvas text-primary-text flex flex-col">
            <Navbar showTelemetry={true} />

            {/* Main Content */}
            <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10">
                {/* Segmented Tab Switcher */}
                <div className="inline-flex p-1 rounded-md bg-card border border-white/8 mb-8">
                    <button
                        type="button"
                        onClick={() => setActiveSubTab('available')}
                        className={`px-3.5 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                            activeSubTab === 'available'
                                ? 'bg-raised text-primary-text shadow-xs'
                                : 'text-muted-text hover:text-primary-text'
                        }`}
                    >
                        Available exams
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveSubTab('results')}
                        className={`px-3.5 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                            activeSubTab === 'results'
                                ? 'bg-raised text-primary-text shadow-xs'
                                : 'text-muted-text hover:text-primary-text'
                        }`}
                    >
                        <span>Completed assessments</span>
                        <span className="text-[10px] font-mono text-muted-text bg-canvas px-1.5 py-0.2 rounded">
                            {submissions.length}
                        </span>
                    </button>
                </div>

                {activeSubTab === 'available' ? (
                    <div>
                        <div className="mb-6">
                            <h1 className="text-2xl font-medium tracking-tight text-primary-text">
                                Scheduled assessments
                            </h1>
                            <p className="text-xs text-secondary-text mt-1">
                                Active modules ready for proctored candidate verification
                            </p>
                        </div>

                        {exams.length === 0 ? (
                            <div className="rounded-lg p-12 text-center border border-white/8 bg-card">
                                <p className="text-sm text-primary-text font-medium">No active examinations assigned</p>
                                <p className="text-xs text-muted-text mt-1">Contact your course proctor or institution administrator</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {exams.map((exam: any) => (
                                    <div
                                        key={exam.id}
                                        className="rounded-lg p-5 border border-white/8 bg-card hover:border-white/20 transition-colors flex flex-col sm:flex-row justify-between sm:items-center gap-4"
                                    >
                                        <div className="space-y-2">
                                            <h2 className="text-sm font-medium text-primary-text">
                                                {exam.title}
                                            </h2>
                                            <div className="flex items-center gap-4 text-xs font-mono text-muted-text">
                                                <span className="flex items-center gap-1.5 text-secondary-text">
                                                    <Clock className="w-3.5 h-3.5 text-muted-text" strokeWidth={1.5} />
                                                    <span className="tabular-nums">{exam.duration_minutes}m duration</span>
                                                </span>
                                                <span className="flex items-center gap-1.5 text-secondary-text">
                                                    <FileText className="w-3.5 h-3.5 text-muted-text" strokeWidth={1.5} />
                                                    <span className="tabular-nums">{exam.questions?.length || 0} questions</span>
                                                </span>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => router.push(`/exam/${exam.id}`)}
                                            className="h-9 px-4 rounded-md bg-primary-text hover:bg-white text-canvas text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0"
                                        >
                                            <span>Enter session</span>
                                            <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div>
                        <div className="mb-6">
                            <h1 className="text-2xl font-medium tracking-tight text-primary-text">
                                Assessment archive
                            </h1>
                            <p className="text-xs text-secondary-text mt-1">
                                Historical test results, incident counts, and telemetry verifications
                            </p>
                        </div>

                        {submissions.length === 0 ? (
                            <div className="rounded-lg p-12 text-center border border-white/8 bg-card">
                                <p className="text-sm text-primary-text font-medium">No past submissions recorded</p>
                                <p className="text-xs text-muted-text mt-1">Completed tests and grade breakdowns will appear here</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {submissions.map((sub: any) => (
                                    <div
                                        key={sub.id}
                                        className="rounded-lg p-5 border border-white/8 bg-card hover:border-white/20 transition-colors flex flex-col sm:flex-row justify-between sm:items-center gap-4"
                                    >
                                        <div className="space-y-1.5">
                                            <h2 className="text-sm font-medium text-primary-text">
                                                {sub.exam?.title || 'Examination Session'}
                                            </h2>
                                            <p className="text-[11px] font-mono text-muted-text">
                                                Recorded: {new Date(sub.submitted_at || sub.createdAt).toLocaleString()}
                                            </p>
                                            <div className="flex items-center gap-4 text-xs font-mono pt-1">
                                                <span className="text-primary-text font-medium tabular-nums">
                                                    Score: {sub.score?.toFixed(1)}%
                                                </span>
                                                <span className="text-secondary-text tabular-nums">
                                                    {sub.correct_answers}/{sub.total_questions} correct
                                                </span>
                                                <span className={`tabular-nums ${sub.total_flags > 0 ? 'text-semantic-negative' : 'text-semantic-positive'}`}>
                                                    {sub.total_flags} flags
                                                </span>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => setSelectedSubmission(sub)}
                                            className="h-9 px-4 rounded-md border border-white/8 bg-raised hover:bg-white/10 text-primary-text text-xs font-medium transition-colors cursor-pointer shrink-0"
                                        >
                                            Inspect responses
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Answer Inspection Modal */}
            {selectedSubmission && (
                <div className="fixed inset-0 z-50 bg-deep/80 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-card border border-white/8 w-full max-w-3xl max-h-[85vh] rounded-xl p-6 flex flex-col shadow-2xl">
                        {/* Modal Header */}
                        <div className="flex justify-between items-start border-b border-white/8 pb-4 mb-5">
                            <div>
                                <h2 className="text-base font-medium text-primary-text">
                                    {selectedSubmission.exam?.title || 'Examination Review'}
                                </h2>
                                <p className="text-xs font-mono text-muted-text mt-1">
                                    Submitted {new Date(selectedSubmission.submitted_at).toLocaleString()} • Score: {selectedSubmission.score?.toFixed(1)}% ({selectedSubmission.correct_answers}/{selectedSubmission.total_questions})
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedSubmission(null)}
                                className="p-1 rounded hover:bg-raised text-muted-text hover:text-primary-text transition-colors cursor-pointer"
                            >
                                <X className="w-4 h-4" strokeWidth={1.5} />
                            </button>
                        </div>

                        {/* Question Breakdown List */}
                        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                            {selectedSubmission.exam?.questions ? (
                                selectedSubmission.exam.questions.map((q: any, qIdx: number) => {
                                    const studentAnswer = selectedSubmission.answers[qIdx];
                                    const isCorrect = studentAnswer === q.answer;

                                    return (
                                        <div
                                            key={qIdx}
                                            className="p-4 rounded-lg border border-white/8 bg-canvas space-y-3"
                                        >
                                            <div className="flex justify-between items-start gap-3">
                                                <div className="text-xs font-medium text-primary-text">
                                                    <span className="font-mono text-muted-text mr-2">Q{qIdx + 1}.</span>
                                                    {q.question || q.questionText}
                                                </div>
                                                <span
                                                    className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider shrink-0 ${
                                                        isCorrect
                                                            ? 'bg-semantic-positive/10 text-semantic-positive border border-semantic-positive/20'
                                                            : 'bg-semantic-negative/10 text-semantic-negative border border-semantic-negative/20'
                                                    }`}
                                                >
                                                    {isCorrect ? 'Correct' : 'Incorrect'}
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                                {q.options.map((opt: string, oIdx: number) => {
                                                    const isCorrectOpt = opt === q.answer;
                                                    const isSelectedOpt = opt === studentAnswer;

                                                    let itemStyle = 'border-white/6 bg-card text-secondary-text';
                                                    if (isCorrectOpt) {
                                                        itemStyle = 'border-semantic-positive/30 bg-semantic-positive/10 text-semantic-positive font-medium';
                                                    } else if (isSelectedOpt) {
                                                        itemStyle = 'border-semantic-negative/30 bg-semantic-negative/10 text-semantic-negative font-medium';
                                                    }

                                                    return (
                                                        <div
                                                            key={oIdx}
                                                            className={`p-2.5 rounded border text-xs flex items-center justify-between ${itemStyle}`}
                                                        >
                                                            <span>
                                                                <span className="font-mono text-[11px] opacity-70 mr-1.5">
                                                                    {String.fromCharCode(65 + oIdx)}.
                                                                </span>
                                                                {opt}
                                                            </span>
                                                            <div className="flex gap-1 text-[9px] font-mono uppercase">
                                                                {isSelectedOpt && <span>Selected</span>}
                                                                {isCorrectOpt && <span>Key</span>}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <p className="text-center text-xs text-muted-text py-8">
                                    No question metadata returned for this archive.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
