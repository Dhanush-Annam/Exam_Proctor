'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getExaminerExams, createExam, updateExamStatus, getProctorSessions } from '@/lib/api';

interface Question {
    questionText: string;
    options: string[];
}

interface Exam {
    id: string;
    title: string;
    duration_minutes: number;
    questions: Question[];
    status: 'draft' | 'active' | 'closed';
    createdAt: string;
}

interface ProctorSession {
    session_id: string;
    student: {
        id: string;
        name: string;
        email: string;
    };
    exam: {
        id: string;
        title: string;
    };
    flagsCount: number;
    flags: any[];
    latestFlagAt: string;
}

export default function DashboardPage() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'exams' | 'create' | 'sessions'>('exams');

    // Data states
    const [exams, setExams] = useState<Exam[]>([]);
    const [sessions, setSessions] = useState<ProctorSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Create Exam Form state
    const [examTitle, setExamTitle] = useState('');
    const [examDuration, setExamDuration] = useState(60);
    const [formQuestions, setFormQuestions] = useState<Question[]>([
        { questionText: '', options: ['', '', '', ''] }
    ]);

    // Active session details modal state
    const [selectedSession, setSelectedSession] = useState<ProctorSession | null>(null);

    // Initial check & load
    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) {
            router.push('/login');
            return;
        }
        const parsedUser = JSON.parse(userData);
        if (parsedUser.role !== 'examiner') {
            router.push('/exam');
            return;
        }
        setUser(parsedUser);
        loadDashboardData();
    }, [router]);

    const loadDashboardData = async () => {
        setLoading(true);
        setError('');
        try {
            const [examsRes, sessionsRes] = await Promise.all([
                getExaminerExams(),
                getProctorSessions()
            ]);
            setExams(examsRes.data);
            setSessions(sessionsRes.data);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    };

    const handleToggleStatus = async (examId: string, currentStatus: string) => {
        let nextStatus: 'draft' | 'active' | 'closed' = 'active';
        if (currentStatus === 'active') nextStatus = 'closed';
        else if (currentStatus === 'closed') nextStatus = 'draft';

        try {
            await updateExamStatus(examId, nextStatus);
            setSuccess(`Exam status updated to ${nextStatus}!`);
            setTimeout(() => setSuccess(''), 3000);
            loadDashboardData();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to update exam status');
        }
    };

    // Question Form Actions
    const handleAddQuestion = () => {
        setFormQuestions([...formQuestions, { questionText: '', options: ['', '', '', ''] }]);
    };

    const handleRemoveQuestion = (idx: number) => {
        if (formQuestions.length <= 1) return;
        setFormQuestions(formQuestions.filter((_, qIdx) => qIdx !== idx));
    };

    const handleQuestionTextChange = (idx: number, text: string) => {
        const updated = [...formQuestions];
        updated[idx].questionText = text;
        setFormQuestions(updated);
    };

    const handleOptionTextChange = (qIdx: number, oIdx: number, text: string) => {
        const updated = [...formQuestions];
        updated[qIdx].options[oIdx] = text;
        setFormQuestions(updated);
    };

    const handleCreateExamSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        // Basic validations
        if (!examTitle.trim()) {
            setError('Please provide an exam title');
            return;
        }
        for (let i = 0; i < formQuestions.length; i++) {
            const q = formQuestions[i];
            if (!q.questionText.trim()) {
                setError(`Please enter text for Question ${i + 1}`);
                return;
            }
            if (q.options.some(o => !o.trim())) {
                setError(`Please fill in all options for Question ${i + 1}`);
                return;
            }
        }

        try {
            await createExam({
                title: examTitle,
                duration_minutes: examDuration,
                questions: formQuestions
            });

            setSuccess('Exam created successfully as Draft!');
            setExamTitle('');
            setExamDuration(60);
            setFormQuestions([{ questionText: '', options: ['', '', '', ''] }]);
            setActiveTab('exams');
            loadDashboardData();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to create exam');
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.push('/login');
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row font-sans">
            {/* Sidebar Navigation */}
            <aside className="w-full md:w-64 lg:w-72 bg-slate-900 border-b md:border-b-0 md:border-r border-slate-800 px-4 sm:px-6 py-6 flex flex-col justify-between shrink-0">
                <div>
                    {/* Brand */}
                    <div className="flex items-center gap-2.5 mb-8">
                        <div className="w-8 h-8 rounded-lg bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                        </div>
                        <span className="font-bold text-white tracking-tight">Proctor Admin</span>
                    </div>

                    {/* Nav Items */}
                    <nav className="space-y-1">
                        <button
                            onClick={() => { setActiveTab('exams'); setError(''); }}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${
                                activeTab === 'exams'
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10'
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                            }`}
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            Exams Hub
                        </button>

                        <button
                            onClick={() => { setActiveTab('create'); setError(''); }}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${
                                activeTab === 'create'
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10'
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                            }`}
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                            Create Exam
                        </button>

                        <button
                            onClick={() => { setActiveTab('sessions'); setError(''); }}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition ${
                                activeTab === 'sessions'
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10'
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                            }`}
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            Proctor Feed
                            {sessions.length > 0 && (
                                <span className="ml-auto bg-red-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                                    {sessions.length}
                                </span>
                            )}
                        </button>
                    </nav>
                </div>

                {/* User Card */}
                {user && (
                    <div className="border-t border-slate-800 pt-6 flex flex-col gap-3">
                        <div className="px-3 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-linear-to-tr from-indigo-500 to-violet-600 flex items-center justify-center font-bold text-sm text-white shrink-0">
                                {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="overflow-hidden">
                                <div className="text-sm font-semibold text-slate-200 truncate">{user.name}</div>
                                <div className="text-[10px] text-slate-500 truncate">Examiner</div>
                            </div>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center justify-center gap-2 py-2 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-400 hover:text-white rounded-lg transition duration-200"
                        >
                            Sign Out
                        </button>
                    </div>
                )}
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 px-4 sm:px-6 lg:px-10 py-6 sm:py-8 lg:py-10 overflow-y-auto">
                {/* Notifications */}
                {error && (
                    <div className="max-w-4xl mx-auto w-full bg-red-500/10 border border-red-500/20 text-red-200 p-4 rounded-xl mb-6 text-sm flex gap-3">
                        <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{error}</span>
                    </div>
                )}

                {success && (
                    <div className="max-w-4xl mx-auto w-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 p-4 rounded-xl mb-6 text-sm flex gap-3">
                        <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        <span>{success}</span>
                    </div>
                )}

                {/* Dashboard Loading */}
                {loading ? (
                    <div className="flex justify-center py-20">
                        <svg className="animate-spin h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                    </div>
                ) : (
                    <div className="max-w-4xl mx-auto w-full">

                        {/* TAB 1: EXAMS HUB */}
                        {activeTab === 'exams' && (
                            <div>
                                <div className="flex justify-between items-center mb-8">
                                    <div>
                                        <h1 className="text-3xl font-extrabold text-white">Exams Hub</h1>
                                        <p className="text-slate-400 text-sm mt-1">Manage and launch exams created under your account.</p>
                                    </div>
                                    <button
                                        onClick={() => setActiveTab('create')}
                                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl transition duration-200 flex items-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                        </svg>
                                        Create New
                                    </button>
                                </div>

                                {exams.length === 0 ? (
                                    <div className="bg-slate-900/30 border border-slate-800 p-12 text-center rounded-3xl backdrop-blur-sm">
                                        <svg className="w-10 h-10 text-slate-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                        </svg>
                                        <h3 className="font-semibold text-slate-300">No Exams Configured</h3>
                                        <p className="text-slate-500 text-sm mt-1">Create your first exam using the builder tab to host tests.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        {exams.map((exam) => (
                                            <div
                                                key={exam.id}
                                                className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl flex flex-col justify-between hover:border-slate-700/80 transition duration-300 relative overflow-hidden"
                                            >
                                                <div>
                                                    <div className="flex justify-between items-start mb-3 gap-2">
                                                        <h3 className="font-bold text-slate-200 text-lg line-clamp-1">{exam.title}</h3>
                                                        <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full shrink-0 border ${
                                                            exam.status === 'active'
                                                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                                                : exam.status === 'closed'
                                                                ? 'bg-red-500/10 border-red-500/20 text-red-400'
                                                                : 'bg-slate-800 border-slate-700 text-slate-400'
                                                        }`}>
                                                            {exam.status}
                                                        </span>
                                                    </div>

                                                    <div className="flex gap-4 mt-4 text-xs font-semibold uppercase text-slate-500 tracking-wider">
                                                        <span className="flex items-center gap-1.5 text-indigo-400">
                                                            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                            {exam.duration_minutes} Mins
                                                        </span>
                                                        <span className="flex items-center gap-1.5 text-violet-400">
                                                            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                            {exam.questions?.length || 0} Qs
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="border-t border-slate-900 mt-6 pt-4 flex gap-2">
                                                    <button
                                                        onClick={() => handleToggleStatus(exam.id, exam.status)}
                                                        className={`inline-flex items-center justify-center flex-1 text-center py-2 text-xs font-semibold rounded-lg border transition duration-200 cursor-pointer ${
                                                            exam.status === 'draft'
                                                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-transparent'
                                                                : exam.status === 'active'
                                                                ? 'bg-slate-950 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 text-slate-300 border-slate-800'
                                                                : 'bg-indigo-600 hover:bg-indigo-500 text-white border-transparent'
                                                        }`}
                                                    >
                                                        {exam.status === 'draft' && 'Activate Exam'}
                                                        {exam.status === 'active' && 'Close Exam'}
                                                        {exam.status === 'closed' && 'Set to Draft'}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* TAB 2: CREATE EXAM FORM */}
                        {activeTab === 'create' && (
                            <div>
                                <div className="mb-8">
                                    <h1 className="text-3xl font-extrabold text-white">Create New Exam</h1>
                                    <p className="text-slate-400 text-sm mt-1">Design questions and parameters for a proctored examination.</p>
                                </div>

                                <form onSubmit={handleCreateExamSubmit} className="space-y-6">
                                    {/* General config */}
                                    <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl space-y-4">
                                        <h3 className="font-bold text-slate-200 text-md uppercase tracking-wider mb-2">Exam Parameters</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                                                    Exam Title
                                                </label>
                                                <input
                                                    type="text"
                                                    value={examTitle}
                                                    onChange={e => setExamTitle(e.target.value)}
                                                    placeholder="e.g. Final Examination Math"
                                                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                    required
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                                                    Duration (Minutes)
                                                </label>
                                                <input
                                                    type="number"
                                                    value={examDuration}
                                                    onChange={e => setExamDuration(parseInt(e.target.value) || 60)}
                                                    min="5"
                                                    max="300"
                                                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                    required
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Questions Builder */}
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center">
                                            <h3 className="font-bold text-slate-200 text-md uppercase tracking-wider">Exam Questions ({formQuestions.length})</h3>
                                            <button
                                                type="button"
                                                onClick={handleAddQuestion}
                                                className="px-4 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 hover:text-white rounded-lg transition duration-200"
                                            >
                                                + Add Question
                                            </button>
                                        </div>

                                        {formQuestions.map((q, qIdx) => (
                                            <div
                                                key={qIdx}
                                                className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl relative space-y-4"
                                            >
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-sm font-semibold text-indigo-400">Question #{qIdx + 1}</span>
                                                    {formQuestions.length > 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveQuestion(qIdx)}
                                                            className="text-xs text-red-400 hover:text-red-300 font-semibold cursor-pointer"
                                                        >
                                                            Remove Question
                                                        </button>
                                                    )}
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                                                        Question Text
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={q.questionText}
                                                        onChange={e => handleQuestionTextChange(qIdx, e.target.value)}
                                                        placeholder="Enter the question query here..."
                                                        className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                        required
                                                    />
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    {q.options.map((option, oIdx) => (
                                                        <div key={oIdx}>
                                                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                                                                Option {String.fromCharCode(65 + oIdx)}
                                                            </label>
                                                            <input
                                                                type="text"
                                                                value={option}
                                                                onChange={e => handleOptionTextChange(qIdx, oIdx, e.target.value)}
                                                                placeholder={`Choice ${oIdx + 1}`}
                                                                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                                                                required
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <button
                                        type="submit"
                                        className="inline-flex items-center justify-center w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/20 hover:shadow-indigo-500/35 transition duration-200 cursor-pointer"
                                    >
                                        Save Exam Module
                                    </button>
                                </form>
                            </div>
                        )}

                        {/* TAB 3: PROCTOR FEED */}
                        {activeTab === 'sessions' && (
                            <div>
                                <div className="mb-8 flex justify-between items-center">
                                    <div>
                                        <h1 className="text-3xl font-extrabold text-white">AI Proctoring Feed</h1>
                                        <p className="text-slate-400 text-sm mt-1">Review live or completed flagged student proctoring sessions.</p>
                                    </div>
                                    <button
                                        onClick={loadDashboardData}
                                        className="inline-flex items-center justify-center px-4 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 hover:text-white rounded-lg transition duration-200 cursor-pointer"
                                    >
                                        Refresh Log Feed
                                    </button>
                                </div>

                                {sessions.length === 0 ? (
                                    <div className="bg-slate-900/30 border border-slate-800 p-12 text-center rounded-3xl backdrop-blur-sm">
                                        <svg className="w-10 h-10 text-slate-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                        </svg>
                                        <h3 className="font-semibold text-slate-300">No Flags Logged</h3>
                                        <p className="text-slate-500 text-sm mt-1">Students are taking exams without alerts. Keep monitoring.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {sessions.map((session) => (
                                            <div
                                                key={session.session_id}
                                                onClick={() => setSelectedSession(session)}
                                                className="bg-slate-900/40 border border-slate-800 p-5 rounded-2xl hover:border-slate-700/80 hover:bg-slate-900/60 transition duration-250 cursor-pointer flex justify-between items-center gap-4 group"
                                            >
                                                <div className="overflow-hidden">
                                                    <div className="flex items-center gap-3">
                                                        <span className="font-bold text-slate-200 group-hover:text-white transition">{session.student.name}</span>
                                                        <span className="text-[10px] font-mono text-slate-500 truncate hidden sm:inline">({session.student.email})</span>
                                                    </div>
                                                    <p className="text-xs text-slate-400 mt-1.5">Exam: <span className="text-indigo-400 font-semibold">{session.exam.title}</span></p>
                                                    <div className="text-[10px] text-slate-500 mt-1">Session: <span className="font-mono">{session.session_id}</span></div>
                                                </div>

                                                <div className="flex items-center gap-4 shrink-0">
                                                    <div className="text-right">
                                                        <span className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${
                                                            session.flagsCount >= 3
                                                                ? 'bg-red-500/10 border-red-500/20 text-red-400 animate-pulse'
                                                                : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
                                                        }`}>
                                                            <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                                                            {session.flagsCount} {session.flagsCount === 1 ? 'Alert' : 'Alerts'}
                                                        </span>
                                                        <div className="text-[9px] text-slate-500 mt-1">
                                                            {new Date(session.latestFlagAt).toLocaleTimeString()}
                                                        </div>
                                                    </div>
                                                    <div className="w-8 h-8 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-center text-slate-400 group-hover:scale-105 transition duration-200">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                                        </svg>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                )}
            </main>

            {/* Session Details Modal Overlay */}
            {selectedSession && (
                <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 fade-in">
                    <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-3xl p-5 sm:p-6 md:p-8 relative max-h-[85vh] flex flex-col shadow-2xl">
                        
                        {/* Modal Header */}
                        <div className="flex justify-between items-start border-b border-slate-800 pb-4 mb-6">
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h2 className="text-2xl font-bold text-white leading-tight">{selectedSession.student.name}</h2>
                                    <span className="text-xs font-semibold text-slate-500">({selectedSession.student.email})</span>
                                </div>
                                <p className="text-sm text-slate-400 mt-1">Attempting: <span className="text-indigo-400 font-semibold">{selectedSession.exam.title}</span></p>
                            </div>
                            <button
                                onClick={() => setSelectedSession(null)}
                                className="w-8 h-8 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition duration-200 cursor-pointer"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Modal Body (Scrollable Timeline) */}
                        <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
                            <div className="flex items-center justify-between bg-slate-950 border border-slate-800 p-4 rounded-2xl text-xs">
                                <div>
                                    <span className="text-slate-500 font-bold block">SESSION IDENTIFIER</span>
                                    <span className="font-mono text-indigo-400 font-semibold">{selectedSession.session_id}</span>
                                </div>
                                <div className="text-right">
                                    <span className="text-slate-500 font-bold block">TOTAL FLAGS</span>
                                    <span className={`font-bold ${selectedSession.flagsCount >= 3 ? 'text-red-400' : 'text-yellow-400'}`}>{selectedSession.flagsCount} alerts recorded</span>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Alert Timeline</h4>
                                {selectedSession.flags.map((flag, idx) => (
                                    <div
                                        key={flag.id || idx}
                                        className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-2xl flex gap-3.5 items-start text-xs hover:border-slate-800 transition duration-200"
                                    >
                                        <div className="w-8 h-8 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            </svg>
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-center font-bold">
                                                <span className="text-slate-200 text-sm uppercase">{flag.alert_type}</span>
                                                <span className="text-slate-500 font-medium font-mono">{new Date(flag.createdAt).toLocaleTimeString()}</span>
                                            </div>
                                            <p className="text-slate-400 mt-1.5 leading-relaxed">{flag.detail || 'Flag alert details'}</p>
                                            
                                            {/* AI Metrics values */}
                                            <div className="flex gap-4 mt-3 text-[10px] text-slate-500 font-mono">
                                                {flag.ear_value !== null && (
                                                    <div>EAR: <span className="text-slate-300">{flag.ear_value.toFixed(4)}</span></div>
                                                )}
                                                {flag.yaw_degrees !== null && (
                                                    <div>Head Yaw: <span className="text-slate-300">{flag.yaw_degrees.toFixed(1)}°</span></div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="border-t border-slate-800 pt-5 mt-6 flex justify-end">
                            <button
                                onClick={() => setSelectedSession(null)}
                                className="inline-flex items-center justify-center px-6 py-2.5 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-sm font-semibold rounded-xl transition duration-200 cursor-pointer"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
