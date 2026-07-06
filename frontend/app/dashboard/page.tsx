'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getExaminerExams, createExam, updateExamStatus, getProctorSessions, updateExam } from '@/lib/api';

interface Question {
    question: string;
    options: string[];
    answer?: string;
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
    verdict?: 'CRITICAL' | 'SUSPICIOUS' | 'NORMAL';
    reason?: string;
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

    // Proctor Feed Filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [verdictFilter, setVerdictFilter] = useState<'ALL' | 'CRITICAL' | 'SUSPICIOUS' | 'NORMAL'>('ALL');

    // Calculate Stats from sessions
    const totalSessions = sessions.length;
    const criticalSessionsCount = sessions.filter(s => s.verdict === 'CRITICAL').length;
    const suspiciousSessionsCount = sessions.filter(s => s.verdict === 'SUSPICIOUS').length;
    const normalSessionsCount = sessions.filter(s => s.verdict === 'NORMAL' || !s.verdict).length;

    const filteredSessions = sessions.filter(session => {
        // Filter by verdict
        if (verdictFilter !== 'ALL') {
            const currentVerdict = session.verdict || 'NORMAL';
            if (currentVerdict !== verdictFilter) return false;
        }

        // Filter by search text
        if (searchTerm.trim() !== '') {
            const search = searchTerm.toLowerCase();
            const studentName = (session.student?.name || '').toLowerCase();
            const studentEmail = (session.student?.email || '').toLowerCase();
            const examTitle = (session.exam?.title || '').toLowerCase();
            const sId = (session.session_id || '').toLowerCase();

            return (
                studentName.includes(search) ||
                studentEmail.includes(search) ||
                examTitle.includes(search) ||
                sId.includes(search)
            );
        }

        return true;
    });

    // Create Exam Form state
    const [examTitle, setExamTitle] = useState('');
    const [examDuration, setExamDuration] = useState(60);
    const [formQuestions, setFormQuestions] = useState<Question[]>([
        { question: '', options: ['', '', '', ''], answer: '' }
    ]);
    const [editingExamId, setEditingExamId] = useState<string | null>(null);

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
        setFormQuestions([...formQuestions, { question: '', options: ['', '', '', ''], answer: '' }]);
    };

    const handleRemoveQuestion = (idx: number) => {
        if (formQuestions.length <= 1) return;
        setFormQuestions(formQuestions.filter((_, qIdx) => qIdx !== idx));
    };

    const handleQuestionTextChange = (idx: number, text: string) => {
        const updated = [...formQuestions];
        updated[idx].question = text;
        setFormQuestions(updated);
    };

    const handleOptionTextChange = (qIdx: number, oIdx: number, text: string) => {
        const updated = [...formQuestions];
        const oldVal = updated[qIdx].options[oIdx];
        updated[qIdx].options[oIdx] = text;
        if (updated[qIdx].answer === oldVal) {
            updated[qIdx].answer = text;
        }
        setFormQuestions(updated);
    };

    const handleStartEditExam = (exam: Exam) => {
        setEditingExamId(exam.id);
        setExamTitle(exam.title);
        setExamDuration(exam.duration_minutes);
        
        const mappedQuestions = exam.questions.map((q: any) => ({
            question: q.question || q.questionText || '',
            options: q.options || ['', '', '', ''],
            answer: q.answer || ''
        }));
        
        setFormQuestions(mappedQuestions);
        setActiveTab('create');
        setError('');
        setSuccess('');
    };

    const handleCancelEdit = () => {
        setEditingExamId(null);
        setExamTitle('');
        setExamDuration(60);
        setFormQuestions([{ question: '', options: ['', '', '', ''], answer: '' }]);
        setActiveTab('exams');
        setError('');
        setSuccess('');
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
            if (!q.question.trim()) {
                setError(`Please enter text for Question ${i + 1}`);
                return;
            }
            if (q.options.some(o => !o.trim())) {
                setError(`Please fill in all options for Question ${i + 1}`);
                return;
            }
            if (!q.answer || !q.answer.trim()) {
                setError(`Please select the correct answer for Question ${i + 1}`);
                return;
            }
        }

        try {
            if (editingExamId) {
                await updateExam(editingExamId, {
                    title: examTitle,
                    duration_minutes: examDuration,
                    questions: formQuestions
                });
                setSuccess('Exam updated successfully!');
            } else {
                await createExam({
                    title: examTitle,
                    duration_minutes: examDuration,
                    questions: formQuestions
                });
                setSuccess('Exam created successfully as Draft!');
            }

            setEditingExamId(null);
            setExamTitle('');
            setExamDuration(60);
            setFormQuestions([{ question: '', options: ['', '', '', ''], answer: '' }]);
            setActiveTab('exams');
            loadDashboardData();
        } catch (err: any) {
            setError(err.response?.data?.error || `Failed to ${editingExamId ? 'update' : 'create'} exam`);
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
                                                    <button
                                                        onClick={() => handleStartEditExam(exam)}
                                                        className="px-3 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 hover:text-white rounded-lg transition duration-200 cursor-pointer"
                                                    >
                                                        Edit
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
                                <div className="mb-8 flex justify-between items-center">
                                    <div>
                                        <h1 className="text-3xl font-extrabold text-white">
                                            {editingExamId ? 'Edit Exam' : 'Create New Exam'}
                                        </h1>
                                        <p className="text-slate-400 text-sm mt-1">
                                            {editingExamId ? 'Modify questions and parameters for this examination.' : 'Design questions and parameters for a proctored examination.'}
                                        </p>
                                    </div>
                                    {editingExamId && (
                                        <button
                                            type="button"
                                            onClick={handleCancelEdit}
                                            className="px-4 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-red-400 hover:text-red-300 rounded-xl transition duration-200 cursor-pointer"
                                        >
                                            Cancel Edit
                                        </button>
                                    )}
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
                                                        value={q.question}
                                                        onChange={e => handleQuestionTextChange(qIdx, e.target.value)}
                                                        placeholder="Enter the question query here..."
                                                        className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                        required
                                                    />
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {q.options.map((option, oIdx) => (
                                                        <div key={oIdx} className="bg-slate-950/30 p-3 rounded-xl border border-slate-850 flex flex-col gap-2">
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-[10px] font-bold text-slate-500 uppercase">
                                                                    Option {String.fromCharCode(65 + oIdx)}
                                                                </span>
                                                                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                                                    <input
                                                                        type="radio"
                                                                        name={`correct_ans_${qIdx}`}
                                                                        checked={q.answer === option && option !== ''}
                                                                        onChange={() => {
                                                                            const updated = [...formQuestions];
                                                                            updated[qIdx].answer = option;
                                                                            setFormQuestions(updated);
                                                                        }}
                                                                        className="w-3.5 h-3.5 text-indigo-650 focus:ring-indigo-500 bg-slate-950 border-slate-800"
                                                                    />
                                                                    <span className="text-[10px] text-slate-400 font-medium">Mark Correct</span>
                                                                </label>
                                                            </div>
                                                            <input
                                                                type="text"
                                                                value={option}
                                                                onChange={e => handleOptionTextChange(qIdx, oIdx, e.target.value)}
                                                                placeholder={`Choice ${oIdx + 1}`}
                                                                className="w-full bg-slate-950 border border-slate-800/80 focus:border-indigo-500 rounded-lg px-3 py-1.5 text-slate-100 placeholder-slate-600 focus:outline-none text-sm"
                                                                required
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex gap-4 pt-2">
                                        {editingExamId && (
                                            <button
                                                type="button"
                                                onClick={handleCancelEdit}
                                                className="flex-1 py-3.5 bg-slate-900 border border-slate-850 hover:bg-slate-850 text-slate-300 rounded-xl font-bold transition duration-200 cursor-pointer text-center"
                                            >
                                                Cancel Edit
                                            </button>
                                        )}
                                        <button
                                            type="submit"
                                            className="inline-flex items-center justify-center flex-2 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/20 hover:shadow-indigo-500/35 transition duration-200 cursor-pointer"
                                        >
                                            {editingExamId ? 'Save Changes' : 'Save Exam Module'}
                                        </button>
                                    </div>
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

                                {/* KPI Stats Grid */}
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                    <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl flex flex-col justify-between backdrop-blur-sm shadow-md hover:border-slate-700 transition duration-300">
                                        <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Total Flagged</span>
                                        <div className="flex justify-between items-baseline mt-2">
                                            <span className="text-2xl font-black text-white">{totalSessions}</span>
                                            <span className="text-[10px] text-slate-500 font-medium">Sessions</span>
                                        </div>
                                    </div>
                                    
                                    <div className="bg-red-950/20 border border-red-900/30 p-4 rounded-2xl flex flex-col justify-between backdrop-blur-sm shadow-md hover:border-red-900/50 transition duration-300 relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 w-16 h-16 bg-red-500/5 rounded-full blur-xl group-hover:bg-red-500/10 transition duration-300"></div>
                                        <span className="text-red-400 text-xs font-semibold uppercase tracking-wider">Critical Risk</span>
                                        <div className="flex justify-between items-baseline mt-2">
                                            <span className="text-2xl font-black text-red-400">{criticalSessionsCount}</span>
                                            <span className="text-[10px] text-red-500/80 font-medium font-mono">Immediate Action</span>
                                        </div>
                                    </div>

                                    <div className="bg-amber-950/20 border border-amber-900/30 p-4 rounded-2xl flex flex-col justify-between backdrop-blur-sm shadow-md hover:border-amber-900/50 transition duration-300 relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/5 rounded-full blur-xl group-hover:bg-amber-500/10 transition duration-300"></div>
                                        <span className="text-amber-400 text-xs font-semibold uppercase tracking-wider">Suspicious</span>
                                        <div className="flex justify-between items-baseline mt-2">
                                            <span className="text-2xl font-black text-amber-400">{suspiciousSessionsCount}</span>
                                            <span className="text-[10px] text-amber-500/80 font-medium font-mono">Review Timeline</span>
                                        </div>
                                    </div>

                                    <div className="bg-emerald-950/20 border border-emerald-900/30 p-4 rounded-2xl flex flex-col justify-between backdrop-blur-sm shadow-md hover:border-emerald-900/50 transition duration-300 relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-full blur-xl group-hover:bg-emerald-500/10 transition duration-300"></div>
                                        <span className="text-emerald-400 text-xs font-semibold uppercase tracking-wider">Normal / Clean</span>
                                        <div className="flex justify-between items-baseline mt-2">
                                            <span className="text-2xl font-black text-emerald-400">{normalSessionsCount}</span>
                                            <span className="text-[10px] text-emerald-500 font-medium font-mono">Low/No Alerts</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Filters and Search Toolbar */}
                                <div className="flex flex-col sm:flex-row gap-3 mb-6 bg-slate-900/30 border border-slate-800 p-3 rounded-2xl backdrop-blur-sm">
                                    <div className="relative flex-1">
                                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                        </div>
                                        <input
                                            type="text"
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                            placeholder="Search student, exam, session ID..."
                                            className="w-full bg-slate-950 border border-slate-800/80 focus:border-indigo-500 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
                                        />
                                    </div>

                                    <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                                        {(['ALL', 'CRITICAL', 'SUSPICIOUS', 'NORMAL'] as const).map(verdict => (
                                            <button
                                                key={verdict}
                                                onClick={() => setVerdictFilter(verdict)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                                                    verdictFilter === verdict
                                                        ? verdict === 'CRITICAL'
                                                            ? 'bg-red-500 text-white shadow-lg shadow-red-500/20'
                                                            : verdict === 'SUSPICIOUS'
                                                            ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                                                            : verdict === 'NORMAL'
                                                            ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                                                            : 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                                                        : 'bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800/80'
                                                }`}
                                            >
                                                {verdict === 'ALL' ? 'All' : verdict}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {filteredSessions.length === 0 ? (
                                    <div className="bg-slate-900/30 border border-slate-800 p-12 text-center rounded-3xl backdrop-blur-sm">
                                        <svg className="w-10 h-10 text-slate-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                        </svg>
                                        <h3 className="font-semibold text-slate-300">No sessions match search / filter</h3>
                                        <p className="text-slate-500 text-sm mt-1">Try modifying your query or selecting another verdict filter.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {filteredSessions.map((session) => {
                                            const currentVerdict = session.verdict || 'NORMAL';
                                            const verdictColors = {
                                                CRITICAL: {
                                                    bg: 'bg-red-500/5 hover:bg-red-500/10 transition',
                                                    badge: 'bg-red-500/10 border-red-500/30 text-red-400',
                                                    border: 'border-l-4 border-l-red-500 border-t border-r border-b border-slate-800/80'
                                                },
                                                SUSPICIOUS: {
                                                    bg: 'bg-amber-500/5 hover:bg-amber-500/10 transition',
                                                    badge: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
                                                    border: 'border-l-4 border-l-amber-500 border-t border-r border-b border-slate-800/80'
                                                },
                                                NORMAL: {
                                                    bg: 'bg-slate-900/30 hover:bg-slate-900/50 transition',
                                                    badge: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
                                                    border: 'border-l-4 border-l-emerald-500/70 border-t border-r border-b border-slate-800/80'
                                                }
                                            };
                                            const style = verdictColors[currentVerdict] || verdictColors.NORMAL;

                                            return (
                                                <div
                                                    key={session.session_id}
                                                    onClick={() => setSelectedSession(session)}
                                                    className={`p-5 rounded-2xl cursor-pointer flex flex-col md:flex-row justify-between md:items-center gap-4 group ${style.bg} ${style.border}`}
                                                >
                                                    <div className="overflow-hidden flex-1">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-bold text-slate-100 group-hover:text-indigo-400 transition">{session.student.name}</span>
                                                            <span className="text-[10px] font-mono text-slate-500 truncate">({session.student.email})</span>
                                                        </div>
                                                        <p className="text-xs text-slate-400 mt-1.5">Exam: <span className="text-slate-300 font-semibold">{session.exam.title}</span></p>
                                                        
                                                        <div className="text-xs text-slate-400 mt-2 bg-slate-950/40 border border-slate-800/40 p-2.5 rounded-xl line-clamp-2">
                                                            <span className="font-semibold text-indigo-400 uppercase text-[9px] tracking-wide block mb-0.5">AI Summary</span>
                                                            {session.reason || 'Normal test sessions and activity flags logged.'}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center justify-between md:justify-end gap-4 shrink-0 mt-3 md:mt-0 border-t border-slate-800/40 md:border-t-0 pt-3 md:pt-0">
                                                        <div className="text-left md:text-right">
                                                            <div className="flex items-center md:justify-end gap-2">
                                                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold tracking-wider uppercase border ${style.badge}`}>
                                                                    AI: {currentVerdict}
                                                                </span>
                                                                <span className="bg-slate-950 border border-slate-800 text-slate-350 text-xs px-2 py-0.5 rounded-md font-mono">
                                                                    {session.flagsCount} {session.flagsCount === 1 ? 'alert' : 'alerts'}
                                                                </span>
                                                            </div>
                                                            <div className="text-[10px] text-slate-500 mt-1.5 flex items-center gap-1 md:justify-end">
                                                                <svg className="w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                </svg>
                                                                {new Date(session.latestFlagAt).toLocaleString()}
                                                            </div>
                                                        </div>
                                                        <div className="w-8 h-8 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-center text-slate-400 group-hover:scale-105 transition duration-200">
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                                            </svg>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
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
                        <div className="flex justify-between items-start border-b border-slate-800 pb-4 mb-5">
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h2 className="text-2xl font-bold text-white leading-tight">{selectedSession.student.name}</h2>
                                    <span className="text-xs font-semibold text-slate-500 font-mono">({selectedSession.student.email})</span>
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

                        {/* Modal Body */}
                        <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
                            
                            {/* Glassmorphic AI Verdict Header Card */}
                            {(() => {
                                const currentVerdict = selectedSession.verdict || 'NORMAL';
                                const verdictStyleMap = {
                                    CRITICAL: {
                                        bg: 'bg-red-500/10 border-red-500/20 text-red-200',
                                        badge: 'bg-red-500/20 border-red-500/30 text-red-400',
                                        icon: '⚠️',
                                        title: 'Critical Risk Flagged'
                                    },
                                    SUSPICIOUS: {
                                        bg: 'bg-amber-500/10 border-amber-500/20 text-amber-200',
                                        badge: 'bg-amber-500/20 border-amber-500/30 text-amber-400',
                                        icon: '🔍',
                                        title: 'Suspicious Activity Detected'
                                    },
                                    NORMAL: {
                                        bg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200',
                                        badge: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400',
                                        icon: '✅',
                                        title: 'Clean / Low Risk'
                                    }
                                };
                                const vStyle = verdictStyleMap[currentVerdict] || verdictStyleMap.NORMAL;

                                return (
                                    <div className={`border p-5 rounded-2xl shadow-lg relative overflow-hidden ${vStyle.bg}`}>
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="text-xl">{vStyle.icon}</span>
                                            <h3 className="font-extrabold text-sm uppercase tracking-wider text-slate-100">{vStyle.title}</h3>
                                            <span className={`ml-auto px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${vStyle.badge}`}>
                                                {currentVerdict}
                                            </span>
                                        </div>
                                        <p className="text-xs leading-relaxed text-slate-200 mt-2 font-medium">
                                            {selectedSession.reason || 'No alerts triggered. The student is behaving within constraints.'}
                                        </p>
                                    </div>
                                );
                            })()}

                            {/* Session Identification Info */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-950 border border-slate-800 p-4 rounded-2xl text-xs">
                                <div>
                                    <span className="text-slate-500 font-bold block mb-0.5 uppercase tracking-wider text-[9px]">SESSION IDENTIFIER</span>
                                    <span className="font-mono text-indigo-400 font-semibold">{selectedSession.session_id}</span>
                                </div>
                                <div className="text-left sm:text-right border-t border-slate-800/40 sm:border-t-0 pt-2 sm:pt-0">
                                    <span className="text-slate-500 font-bold block mb-0.5 uppercase tracking-wider text-[9px]">TIMELINE SUMMARY</span>
                                    <span className="font-bold text-slate-300">{selectedSession.flagsCount} alerts logged</span>
                                </div>
                            </div>

                            {/* Timeline section */}
                            <div className="space-y-4 pt-2">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Flag Alert Timeline</h4>
                                <div className="relative pl-4 border-l border-slate-800 space-y-4">
                                    {selectedSession.flags.map((flag, idx) => {
                                        const flagVerdict = flag.ai_verdict || 'LOW_RISK';
                                        
                                        const flagSeverityStyle = {
                                            HIGH_RISK: {
                                                bullet: 'bg-red-500 border-red-950 shadow-red-500/20',
                                                card: 'bg-red-950/10 border-red-900/30 text-red-200',
                                                badge: 'bg-red-500/10 border-red-500/20 text-red-400'
                                            },
                                            SUSPICIOUS: {
                                                bullet: 'bg-amber-500 border-amber-950 shadow-amber-500/20',
                                                card: 'bg-amber-950/10 border-amber-900/30 text-amber-200',
                                                badge: 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                            },
                                            LOW_RISK: {
                                                bullet: 'bg-emerald-500 border-emerald-950 shadow-emerald-500/20',
                                                card: 'bg-slate-900/40 border-slate-800 text-slate-300',
                                                badge: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                            }
                                        };
                                        const fStyle = flagSeverityStyle[flagVerdict as 'HIGH_RISK'|'SUSPICIOUS'|'LOW_RISK'] || flagSeverityStyle.LOW_RISK;

                                        return (
                                            <div key={flag.id || idx} className="relative group">
                                                {/* Timeline Bullet Point */}
                                                <div className={`absolute left-[-22.5px] top-1.5 w-3 h-3 rounded-full border-2 shadow-sm transition duration-200 group-hover:scale-125 ${fStyle.bullet}`}></div>
                                                
                                                {/* Timeline Card */}
                                                <div className={`p-4 rounded-xl border flex flex-col gap-2.5 transition duration-200 hover:border-slate-700/80 ${fStyle.card}`}>
                                                    <div className="flex justify-between items-center flex-wrap gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-extrabold text-sm uppercase tracking-wide text-slate-200">{flag.alert_type.replace(/_/g, ' ')}</span>
                                                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${fStyle.badge}`}>
                                                                {flagVerdict}
                                                            </span>
                                                        </div>
                                                        <span className="text-slate-500 font-mono text-[10px]">{new Date(flag.createdAt || flag.timestamp).toLocaleTimeString()}</span>
                                                    </div>

                                                    <p className="text-xs text-slate-300 leading-relaxed">
                                                        {flag.ai_reason || flag.detail || 'suspicious activity logs'}
                                                    </p>

                                                    {/* Details info */}
                                                    {flag.detail && flag.detail !== 'Student switched tabs during exam' && (
                                                        <div className="text-[10px] text-slate-500 font-mono bg-slate-950/40 p-2 rounded-lg border border-slate-850 mt-1">
                                                            <span className="font-bold text-slate-400">Technical Details:</span> {flag.detail}
                                                        </div>
                                                    )}

                                                    {/* AI Metrics values */}
                                                    {(flag.ear_value !== null || flag.yaw_degrees !== null) && (
                                                        <div className="flex gap-4 text-[10px] text-slate-500 font-mono">
                                                            {flag.ear_value !== null && (
                                                                <div>EAR (Eye Aspect Ratio): <span className="text-slate-300">{Number(flag.ear_value).toFixed(3)}</span></div>
                                                            )}
                                                            {flag.yaw_degrees !== null && (
                                                                <div>Head Yaw Angle: <span className="text-slate-300">{Number(flag.yaw_degrees).toFixed(1)}°</span></div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="border-t border-slate-800 pt-5 mt-5 flex justify-end">
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
