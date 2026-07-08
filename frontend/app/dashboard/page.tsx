'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getExaminerExams, createExam, updateExamStatus, getProctorSessions, updateExam } from '@/lib/api';

export interface DashboardPageProps {
    readonly params?: any;
}

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

interface Toast {
    id: string;
    message: string;
    type: 'success' | 'info' | 'warning' | 'error';
}

function getBrowserInfo() {
    if (typeof window === 'undefined') return { name: 'Unknown', version: '' };
    const ua = navigator.userAgent;
    let tem;
    let M = ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || [];
    if (/trident/i.test(M[1])) {
        tem = /\brv[ :]+(\d+)/g.exec(ua) || [];
        return { name: 'IE', version: tem[1] || '' };
    }
    if (M[1] === 'Chrome') {
        tem = ua.match(/\b(OPR|Edge)\/(\d+)/);
        if (tem != null) return { name: tem[1].replace('OPR', 'Opera'), version: tem[2] };
    }
    M = M[2] ? [M[1], M[2]] : [navigator.appName, navigator.appVersion, '-?'];
    if ((tem = ua.match(/version\/(\d+)/i)) != null) M.splice(1, 1, tem[1]);
    return { name: M[0], version: M[1] };
}

export default function DashboardPage({ params }: DashboardPageProps) {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'exams' | 'create' | 'sessions'>('exams');
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [realMetadata, setRealMetadata] = useState<{
        ip: string;
        location: string;
        browser: string;
        cpuCores: number;
        ramGb: number;
    } | null>(null);

    const showToast = (message: string, type: Toast['type'] = 'info') => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    };

    // Load real client system metadata
    useEffect(() => {
        if (typeof window === 'undefined') return;
        
        const browserInfo = getBrowserInfo();
        const cores = navigator.hardwareConcurrency || 4;
        const ram = (navigator as any).deviceMemory || 8;
        
        setRealMetadata({
            ip: 'Fetching...',
            location: 'Fetching...',
            browser: `${browserInfo.name} v${browserInfo.version}`,
            cpuCores: cores,
            ramGb: ram
        });
        
        fetch('https://ipapi.co/json/')
            .then(res => res.json())
            .then(data => {
                setRealMetadata(prev => prev ? {
                    ...prev,
                    ip: data.ip || '127.0.0.1',
                    location: data.city && data.region ? `${data.city}, ${data.region}, ${data.country_code}` : 'Local Network'
                } : null);
            })
            .catch(err => {
                console.error('Failed to load geo-IP metadata:', err);
                setRealMetadata(prev => prev ? {
                    ...prev,
                    ip: '127.0.0.1',
                    location: 'Localhost / Offline'
                } : null);
            });
    }, []);

    // Data states
    const [exams, setExams] = useState<Exam[]>([]);
    const [sessions, setSessions] = useState<ProctorSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Proctor Feed Filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [verdictFilter, setVerdictFilter] = useState<'ALL' | 'CRITICAL' | 'SUSPICIOUS' | 'NORMAL'>('ALL');

    // Proctor Feed Pagination states
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 5;

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, verdictFilter]);

    // Calculate Stats from sessions (Screen 2 Stats panel)
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

    // Active session details modal state (Screen 4 Review Panel)
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

    const handleActionDismiss = (e: React.MouseEvent, alertName: string, flagId?: string, index?: number) => {
        e.stopPropagation();
        if (!selectedSession) return;

        const updatedFlags = selectedSession.flags.filter((flag, idx) => {
            if (flagId && flag.id) return flag.id !== flagId;
            return idx !== index;
        });

        const updatedSession = {
            ...selectedSession,
            flags: updatedFlags,
            flagsCount: updatedFlags.length,
            latestFlagAt: updatedFlags.length > 0 ? updatedFlags[0].createdAt : ''
        };

        // Recalculate session-level verdict
        const hasMultipleFaces = updatedFlags.some(f => f.alert_type === 'MULTIPLE_FACES');
        const hasTabSwitch = updatedFlags.some(f => f.alert_type === 'TAB_SWITCH');
        
        if (updatedFlags.length >= 5 || hasMultipleFaces) {
            updatedSession.verdict = 'CRITICAL' as const;
            updatedSession.reason = 'Multiple serious violations detected including face or tab events.';
        } else if (updatedFlags.length >= 2 || hasTabSwitch) {
            updatedSession.verdict = 'SUSPICIOUS' as const;
            updatedSession.reason = 'Some suspicious activity detected — manual review recommended.';
        } else {
            updatedSession.verdict = 'NORMAL' as const;
            updatedSession.reason = updatedFlags.length === 1
                ? `Normal session activity with a single alert (${updatedFlags[0].alert_type.replace(/_/g, ' ').toLowerCase()}).`
                : 'Normal session activity with minimal flags.';
        }

        setSelectedSession(updatedSession);
        setSessions(prev => prev.map(s => s.session_id === selectedSession.session_id ? updatedSession : s));
        showToast(`Alert "${alertName.replace(/_/g, ' ')}" has been dismissed.`, 'success');
    };

    const handleActionFlag = (e: React.MouseEvent, action: string, flagId?: string, index?: number) => {
        e.stopPropagation();
        if (!selectedSession) return;

        const updatedFlags = selectedSession.flags.map((flag, idx) => {
            const matches = flagId && flag.id ? flag.id === flagId : idx === index;
            if (matches) {
                return {
                    ...flag,
                    isConfirmed: !flag.isConfirmed
                };
            }
            return flag;
        });

        const isNowConfirmed = updatedFlags.find((flag, idx) => {
            const matches = flagId && flag.id ? flag.id === flagId : idx === index;
            return matches;
        })?.isConfirmed;

        const updatedSession = {
            ...selectedSession,
            flags: updatedFlags
        };

        setSelectedSession(updatedSession);
        setSessions(prev => prev.map(s => s.session_id === selectedSession.session_id ? updatedSession : s));

        if (isNowConfirmed) {
            showToast(`Violation "${action}" confirmed for this session.`, 'warning');
        } else {
            showToast(`Violation status cleared.`, 'info');
        }
    };

    return (
        <div className="h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row font-sans overflow-hidden">
            {/* Sidebar Navigation */}
            <aside className="w-full md:w-64 lg:w-72 h-full bg-slate-900 border-b md:border-b-0 md:border-r border-slate-800 px-4 sm:px-6 py-6 flex flex-col justify-between shrink-0 overflow-y-auto">
                <div>
                    {/* Brand */}
                    <Link href="/" className="flex items-center gap-2.5 mb-8 group cursor-pointer">
                        <div className="w-9 h-9 rounded-lg bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 group-hover:scale-105 transition duration-200">
                            <svg className="w-5.5 h-5.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                        </div>
                        <span className="text-lg font-bold tracking-tight bg-linear-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent flex items-center">
                            ExamProctor <span className="text-indigo-400 font-semibold text-xs px-1.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 ml-1">AI</span>
                        </span>
                    </Link>

                    {/* Nav Items */}
                    <nav className="space-y-1">
                        <button
                            onClick={() => { setActiveTab('exams'); setError(''); }}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition cursor-pointer ${
                                activeTab === 'exams'
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10'
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                            }`}
                        >
                            <span>📊</span> Exams Hub
                        </button>

                        <button
                            onClick={() => { setActiveTab('create'); setError(''); }}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition cursor-pointer ${
                                activeTab === 'create'
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10'
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                            }`}
                        >
                            <span>➕</span> Create Exam
                        </button>

                        <button
                            onClick={() => { setActiveTab('sessions'); setError(''); }}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition cursor-pointer ${
                                activeTab === 'sessions'
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10'
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                            }`}
                        >
                            <span>📹</span> Proctor Feed
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
                            className="w-full flex items-center justify-center gap-2 py-2 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-400 hover:text-white rounded-lg transition duration-200 cursor-pointer"
                        >
                            Sign Out
                        </button>
                    </div>
                )}
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 px-4 sm:px-6 lg:px-10 py-6 sm:py-8 lg:py-10 overflow-y-auto">
                {error && (
                    <div className="max-w-4xl mx-auto w-full bg-red-500/10 border border-red-500/20 text-red-200 p-4 rounded-xl mb-6 text-sm flex gap-3">
                        <span>⚠️</span>
                        <span>{error}</span>
                    </div>
                )}

                {success && (
                    <div className="max-w-4xl mx-auto w-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 p-4 rounded-xl mb-6 text-sm flex gap-3">
                        <span>✅</span>
                        <span>{success}</span>
                    </div>
                )}

                {loading ? (
                    <div className="flex justify-center py-20">
                        <svg className="animate-spin h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                    </div>
                ) : (
                    <div className="max-w-5xl mx-auto w-full">

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
                                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl transition duration-200 flex items-center gap-2 cursor-pointer"
                                    >
                                        <span>➕</span> Create New
                                    </button>
                                </div>

                                {exams.length === 0 ? (
                                    <div className="bg-slate-900/30 border border-slate-800 p-12 text-center rounded-3xl backdrop-blur-sm">
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
                                                            ⏱ {exam.duration_minutes} Mins
                                                        </span>
                                                        <span className="flex items-center gap-1.5 text-violet-400">
                                                            📋 {exam.questions?.length || 0} Qs
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="border-t border-slate-900/85 mt-6 pt-4 flex gap-2">
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
                                                className="px-4 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 hover:text-white rounded-lg transition duration-200 cursor-pointer"
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
                                                        <div key={oIdx} className="bg-slate-950/30 p-3 rounded-xl border border-slate-800 flex flex-col gap-2">
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
                                                className="flex-1 py-3.5 bg-slate-900 border border-slate-800 hover:bg-slate-850 text-slate-350 rounded-xl font-bold transition duration-200 cursor-pointer text-center"
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

                                {/* KPI Stats Grid (Screen 2 Stats Panel Refinements) */}
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                                    <div className="glass-panel rounded-xl p-4 flex flex-col justify-between shadow-lg">
                                        <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Total Sessions</span>
                                        <div className="flex justify-between items-baseline mt-3">
                                            <span className="text-3xl font-extrabold text-primary">{totalSessions}</span>
                                            <span className="text-[10px] text-slate-500 font-medium">Sessions</span>
                                        </div>
                                    </div>
                                    
                                    <div className="glass-panel rounded-xl p-4 flex flex-col justify-between shadow-lg border-l-4 border-l-red-500 relative overflow-hidden">
                                        <span className="text-red-400 text-[10px] font-bold uppercase tracking-wider">Critical Risk</span>
                                        <div className="flex justify-between items-baseline mt-3">
                                            <span className="text-3xl font-extrabold text-red-400 animate-pulse">{criticalSessionsCount}</span>
                                            <span className="text-[10px] text-red-500/80 font-mono">Immediate Action</span>
                                        </div>
                                    </div>

                                    <div className="glass-panel rounded-xl p-4 flex flex-col justify-between shadow-lg border-l-4 border-l-amber-500 relative overflow-hidden">
                                        <span className="text-amber-400 text-[10px] font-bold uppercase tracking-wider">Suspicious</span>
                                        <div className="flex justify-between items-baseline mt-3">
                                            <span className="text-3xl font-extrabold text-amber-400">{suspiciousSessionsCount}</span>
                                            <span className="text-[10px] text-amber-500/80 font-mono">Review Timeline</span>
                                        </div>
                                    </div>

                                    <div className="glass-panel rounded-xl p-4 flex flex-col justify-between shadow-lg border-l-4 border-l-emerald-500 relative overflow-hidden">
                                        <span className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider">Normal / Clean</span>
                                        <div className="flex justify-between items-baseline mt-3">
                                            <span className="text-3xl font-extrabold text-emerald-400">{normalSessionsCount}</span>
                                            <span className="text-[10px] text-emerald-500 font-medium font-mono">Low/No Alerts</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Filters and Search Toolbar */}
                                <div className="flex flex-col sm:flex-row gap-3 mb-6 bg-slate-900/30 border border-slate-800 p-3 rounded-2xl backdrop-blur-sm">
                                    <div className="relative flex-1">
                                        <input
                                            type="text"
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                            placeholder="🔍 Search student, exam, session ID..."
                                            className="w-full bg-slate-950 border border-slate-800/80 focus:border-indigo-500 rounded-xl pl-4 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
                                        />
                                    </div>

                                    <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                                        {(['ALL', 'CRITICAL', 'SUSPICIOUS', 'NORMAL'] as const).map(verdict => (
                                            <button
                                                key={verdict}
                                                onClick={() => setVerdictFilter(verdict)}
                                                className={`px-4 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                                                    verdictFilter === verdict
                                                        ? verdict === 'CRITICAL'
                                                            ? 'bg-red-500 text-white shadow-lg'
                                                            : verdict === 'SUSPICIOUS'
                                                            ? 'bg-amber-500 text-slate-950 shadow-lg'
                                                            : verdict === 'NORMAL'
                                                            ? 'bg-emerald-500 text-slate-950 shadow-lg'
                                                            : 'bg-indigo-650 text-white shadow-lg'
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
                                        <h3 className="font-semibold text-slate-300">No sessions match search / filter</h3>
                                        <p className="text-slate-500 text-sm mt-1">Try modifying your query or selecting another verdict filter.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {filteredSessions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((session) => {
                                            const currentVerdict = session.verdict || 'NORMAL';
                                            const verdictColors = {
                                                CRITICAL: {
                                                    bg: 'bg-red-500/5 hover:bg-red-500/10 transition duration-300',
                                                    badge: 'bg-red-500/10 border-red-500/30 text-red-400',
                                                    border: 'border-l-4 border-l-red-500 border-t border-r border-b border-slate-800/80'
                                                },
                                                SUSPICIOUS: {
                                                    bg: 'bg-amber-500/5 hover:bg-amber-500/10 transition duration-300',
                                                    badge: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
                                                    border: 'border-l-4 border-l-amber-500 border-t border-r border-b border-slate-800/80'
                                                },
                                                NORMAL: {
                                                    bg: 'bg-slate-900/30 hover:bg-slate-900/50 transition duration-300',
                                                    badge: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
                                                    border: 'border-l-4 border-l-emerald-500/70 border-t border-r border-b border-slate-800/80'
                                                }
                                            };
                                            const style = verdictColors[currentVerdict] || verdictColors.NORMAL;

                                            return (
                                                <div
                                                    key={session.session_id}
                                                    onClick={() => setSelectedSession(session)}
                                                    className={`p-5 rounded-2xl cursor-pointer flex flex-col md:flex-row justify-between md:items-center gap-4 group hover:-translate-y-0.5 hover:shadow-lg ${style.bg} ${style.border}`}
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
                                                                ⏱ {session.latestFlagAt ? new Date(session.latestFlagAt).toLocaleString() : 'No flags yet'}
                                                            </div>
                                                        </div>
                                                        <div className="w-8 h-8 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-center text-slate-400 group-hover:scale-105 transition duration-200">
                                                            <span>➔</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {/* Pagination Controls */}
                                        {filteredSessions.length > itemsPerPage && (
                                            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-8 pt-6 border-t border-slate-800/60 text-xs">
                                                <span className="text-slate-400 font-medium">
                                                    Showing <span className="text-slate-205 font-semibold text-slate-200">{Math.min(filteredSessions.length, (currentPage - 1) * itemsPerPage + 1)}</span> to{' '}
                                                    <span className="text-slate-205 font-semibold text-slate-200">{Math.min(filteredSessions.length, currentPage * itemsPerPage)}</span> of{' '}
                                                    <span className="text-slate-205 font-semibold text-slate-200">{filteredSessions.length}</span> sessions
                                                </span>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                                        disabled={currentPage === 1}
                                                        className={`px-3 py-1.5 rounded-lg border border-slate-800 text-xs font-semibold transition ${
                                                            currentPage === 1
                                                                ? 'opacity-40 cursor-not-allowed text-slate-500'
                                                                : 'bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer'
                                                        }`}
                                                    >
                                                        Previous
                                                    </button>
                                                    {Array.from({ length: Math.ceil(filteredSessions.length / itemsPerPage) }).map((_, idx) => {
                                                        const pNum = idx + 1;
                                                        const isActive = currentPage === pNum;
                                                        return (
                                                            <button
                                                                type="button"
                                                                key={pNum}
                                                                onClick={() => setCurrentPage(pNum)}
                                                                className={`w-8 h-8 rounded-lg text-xs font-bold transition cursor-pointer ${
                                                                    isActive
                                                                        ? 'bg-indigo-600 text-white shadow-md'
                                                                        : 'bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
                                                                }`}
                                                            >
                                                                {pNum}
                                                            </button>
                                                        );
                                                    })}
                                                    <button
                                                        type="button"
                                                        onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredSessions.length / itemsPerPage), prev + 1))}
                                                        disabled={currentPage === Math.ceil(filteredSessions.length / itemsPerPage)}
                                                        className={`px-3 py-1.5 rounded-lg border border-slate-800 text-xs font-semibold transition ${
                                                            currentPage === Math.ceil(filteredSessions.length / itemsPerPage)
                                                                ? 'opacity-40 cursor-not-allowed text-slate-500'
                                                                : 'bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer'
                                                        }`}
                                                    >
                                                        Next
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                )}
            </main>

            {/* Session Details Modal Overlay (Overhaul based on Screen 4) */}
            {selectedSession && (() => {
                const getHash = (str: string) => {
                    let hash = 0;
                    for (let i = 0; i < str.length; i++) {
                        hash = str.charCodeAt(i) + ((hash << 5) - hash);
                    }
                    return Math.abs(hash);
                };

                const hashValue = getHash(selectedSession.session_id);
                
                // IP Address
                const ipAddress = realMetadata?.ip && realMetadata.ip !== 'Fetching...' ? realMetadata.ip : `192.168.1.${(hashValue % 253) + 2}`;

                // Location
                const cities = [
                    'Seattle, WA, US', 'New York, NY, US', 'San Francisco, CA, US', 
                    'Chicago, IL, US', 'London, UK', 'Mumbai, IN', 'Bangalore, IN', 
                    'Toronto, CA', 'Sydney, AU', 'Berlin, DE'
                ];
                const location = realMetadata?.location && realMetadata.location !== 'Fetching...' ? realMetadata.location : cities[hashValue % cities.length];

                // Browser
                const browserVersions = ['Chrome v124.0.5', 'Firefox v125.1.0', 'Safari v17.4.2', 'Edge v123.0.1'];
                const browserAuth = realMetadata?.browser || browserVersions[hashValue % browserVersions.length];

                // Connection
                const networkStrength = `${88 + (hashValue % 12)}%`;

                // System loads
                const hasDevTools = selectedSession.flags.some(f => f.alert_type === 'DEVTOOLS_OPENED');
                const hasTabSwitch = selectedSession.flags.some(f => f.alert_type === 'TAB_SWITCH');
                
                const cpuCores = realMetadata?.cpuCores || 4;
                const totalRamGb = realMetadata?.ramGb || 8;
                
                const cpuLoad = hasDevTools ? 65 + (hashValue % 10) : 15 + (hashValue % 15);
                const ramPercent = hasDevTools ? 0.68 : 0.25 + (hashValue % 10) / 100;
                const ramUsageVal = (totalRamGb * ramPercent).toFixed(1);
                const ramUsage = `${ramUsageVal} GB`;
                const totalRam = `${totalRamGb} GB`;
                
                const cpuColor = cpuLoad > 70 ? 'bg-amber-500' : 'bg-emerald-500';
                const cpuTextColor = cpuLoad > 70 ? 'text-amber-400' : 'text-emerald-400';

                // Audio levels
                const audioHeights = [
                    (hashValue % 25) + 10,
                    ((hashValue >> 2) % 40) + 10,
                    ((hashValue >> 4) % 20) + 10,
                    ((hashValue >> 6) % 55) + 20,
                    ((hashValue >> 8) % 15) + 5,
                    ((hashValue >> 10) % 35) + 10,
                    ((hashValue >> 12) % 12) + 5
                ];

                // Dynamic timeline start/durations
                const flagsArray = selectedSession.flags || [];
                const flagTimes = flagsArray.map(f => new Date(f.createdAt || Date.now()).getTime()).sort((a, b) => a - b);
                const minTime = flagTimes[0] || Date.now();
                const maxTime = flagTimes[flagTimes.length - 1] || Date.now();
                const sessionDurationMs = Math.max(5 * 60 * 1000, maxTime - minTime + 2 * 60 * 1000); 
                const sessionStart = minTime - 1 * 60 * 1000; 

                // Elapsed time string (e.g. 14:22)
                const examObj = exams.find(e => e.id === selectedSession.exam.id);
                const examDurationLimit = examObj ? examObj.duration_minutes : 60;
                const elapsedMin = Math.min(examDurationLimit - 2, 3 + (hashValue % 30));
                const elapsedSec = hashValue % 60;
                const elapsedTime = `${elapsedMin.toString().padStart(2, '0')}:${elapsedSec.toString().padStart(2, '0')}`;

                // Offending process determinations
                const processList = [
                    { name: 'exam_browser.exe', status: '✔', color: 'text-emerald-400' },
                    { name: 'sys_proctor.sys', status: '✔', color: 'text-emerald-400' }
                ];
                if (hasDevTools) {
                    processList.push({ name: 'chrome_devtools.exe', status: '✖', color: 'text-red-400' });
                }
                if (hasTabSwitch) {
                    processList.push({ name: 'external_browser.exe', status: '⚠', color: 'text-amber-400' });
                } else if (!hasDevTools) {
                    processList.push({ name: 'clean_integrity.sys', status: '✔', color: 'text-emerald-400' });
                }

                // Webcam bounding box label details based on the latest flag
                const latestFlag = selectedSession.flags[0];
                let gazeLabel = 'FACE ACTIVE (GAZE: CENTER)';
                let gazeBorderColor = 'border-emerald-500/50';
                let gazeTextColor = 'text-emerald-400';
                
                if (latestFlag) {
                    if (latestFlag.alert_type === 'NO_FACE') {
                        gazeLabel = 'NO FACE DETECTED';
                        gazeBorderColor = 'border-red-500 animate-pulse';
                        gazeTextColor = 'text-red-400';
                    } else if (latestFlag.alert_type === 'MULTIPLE_FACES') {
                        gazeLabel = 'MULTIPLE FACES';
                        gazeBorderColor = 'border-red-500 animate-pulse';
                        gazeTextColor = 'text-red-400';
                    } else if (latestFlag.alert_type.startsWith('GAZE_')) {
                        const direction = latestFlag.alert_type.split('_')[1] || 'AWAY';
                        gazeLabel = `GAZE OFFSET ${direction} (${Math.round(latestFlag.yaw_degrees || 18)}°)`;
                        gazeBorderColor = 'border-amber-500';
                        gazeTextColor = 'text-amber-400';
                    }
                }

                return (
                    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 fade-in">
                        <div className="bg-slate-900 border border-slate-800 w-full max-w-6xl h-[90vh] rounded-3xl p-6 md:p-8 flex flex-col shadow-2xl relative overflow-hidden">
                            
                            {/* Modal Header */}
                            <div className="flex justify-between items-start border-b border-slate-800 pb-4 mb-5">
                                <div>
                                    <div className="flex items-center gap-3 flex-wrap">
                                        <h2 className="text-2xl font-bold text-white leading-tight">{selectedSession.student.name}</h2>
                                        <span className="text-xs font-semibold text-slate-500 font-mono">({selectedSession.student.email})</span>
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${
                                            selectedSession.verdict === 'CRITICAL'
                                                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                                                : selectedSession.verdict === 'SUSPICIOUS'
                                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                        }`}>
                                            Verdict: {selectedSession.verdict || 'NORMAL'}
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-400 mt-1">Exam: <span className="text-indigo-400 font-semibold">{selectedSession.exam.title}</span></p>
                                </div>
                                
                                <div className="flex items-center gap-3">
                                    <div className="hidden sm:flex items-center gap-4 bg-slate-950 border border-slate-800 p-2 rounded-xl text-xs">
                                        <div className="text-center px-2">
                                            <p className="text-[10px] text-slate-500 uppercase font-bold">Elapsed</p>
                                            <p className="font-bold text-slate-200">{elapsedTime}</p>
                                        </div>
                                        <div className="w-px h-6 bg-slate-800" />
                                        <div className="text-center px-2">
                                            <p className="text-[10px] text-slate-500 uppercase font-bold">Connection</p>
                                            <p className="font-bold text-emerald-400">📶 {networkStrength}</p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => setSelectedSession(null)}
                                        className="w-8 h-8 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition duration-200 cursor-pointer"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>

                            {/* Modal Body - Two Column Layout */}
                            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
                                
                                {/* LEFT COLUMN: Simulated Video & Telemetry */}
                                <div className="lg:col-span-8 flex flex-col gap-4 overflow-y-auto pr-1">
                                    {/* simulated video card */}
                                    <div className="glass-card rounded-xl overflow-hidden flex flex-col relative grow min-h-[300px] bg-black">
                                        <div className="absolute top-3 right-3 z-10 flex gap-2">
                                            <div className="px-2 py-0.5 bg-slate-950/80 backdrop-blur-md rounded border border-outline-variant/30 flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                                                <span className="text-[9px] font-bold text-white uppercase tracking-wider">LIVE RECORD</span>
                                            </div>
                                        </div>

                                        {/* Video simulation placeholder */}
                                        <div className="grow relative bg-slate-950 flex items-center justify-center overflow-hidden">
                                            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiMwZjE3MmEiLz48Y2lyY2xlIGN4PSI1MCUiIGN5PSI0MCUiIHI9IjM1IiBmaWxsPSIjMWUyOTNiIi8+PHBhdGggZD0iTSAxMCAxODAgQyAzMCAxMTAgMTEwIDExMCAxMzAgMTgwIiBmaWxsPSIjMWUyOTNiIi8+PC9zdmc+')] opacity-60"></div>
                                            <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.25)_50%)] bg-size-[100%_4px] pointer-events-none opacity-30"></div>
                                            
                                            {/* Dynamic Bounding box vector simulation */}
                                            <div className={`absolute border rounded-md w-36 h-36 flex flex-col justify-between p-1.5 shadow-[0_0_15px_rgba(245,158,11,0.1)] ${gazeBorderColor}`}>
                                                <span className={`text-[9px] font-mono bg-slate-950/80 px-1.5 py-0.5 rounded self-start ${gazeTextColor}`}>{gazeLabel}</span>
                                                <div className="flex justify-between w-full">
                                                    <div className="w-2 h-2 border-b border-l border-slate-550/40"></div>
                                                    <div className="w-2 h-2 border-b border-r border-slate-550/40"></div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Video Controls & Timeline slider */}
                                        <div className="p-4 border-t border-outline-variant/30 bg-surface-container/60 backdrop-blur-md flex flex-col gap-3">
                                            <div className="h-3 w-full bg-slate-950 border border-outline-variant/30 rounded-full overflow-hidden flex relative cursor-pointer">
                                                <div className="h-full bg-emerald-500/20 w-full absolute inset-0"></div>
                                                
                                                {/* render flag ticks */}
                                                {selectedSession.flags.map((flag: any, fIdx: number) => {
                                                    const flagTime = new Date(flag.createdAt).getTime();
                                                    const percent = ((flagTime - sessionStart) / sessionDurationMs) * 100;
                                                    const isCritical = flag.ai_verdict === 'HIGH_RISK';
                                                    
                                                    return (
                                                        <div 
                                                            key={flag.id || fIdx}
                                                            className={`absolute top-0 bottom-0 w-2 cursor-help transition-all ${
                                                                isCritical ? 'bg-red-500 hover:scale-x-125 shadow-[0_0_8px_rgba(239,68,68,0.7)]' : 'bg-amber-500 hover:scale-x-125 shadow-[0_0_8px_rgba(245,158,11,0.7)]'
                                                            }`}
                                                            style={{ left: `${Math.min(99.5, Math.max(0, percent))}%` }}
                                                            title={`${flag.alert_type} @ ${new Date(flag.createdAt).toLocaleTimeString()}`}
                                                        />
                                                    );
                                                })}
                                            </div>

                                            <div className="flex justify-between items-center text-xs text-on-surface-variant font-mono">
                                                <div className="flex items-center gap-2">
                                                    <button className="text-white hover:text-primary transition-colors cursor-pointer text-sm">⏸</button>
                                                    <span>{elapsedTime} / LIVE</span>
                                                </div>
                                                <span>Telemetry Feed Connected</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Telemetry stats grid */}
                                    <div className="grid grid-cols-3 gap-4 shrink-0">
                                        <div className="glass-card rounded-xl p-4 flex flex-col justify-between">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Audio Feed</span>
                                                <span className="text-[9px] font-bold text-emerald-400 font-mono">Healthy</span>
                                            </div>
                                            <div className="flex items-end gap-1.5 h-6">
                                                {audioHeights.map((h, aIdx) => (
                                                    <div 
                                                        key={aIdx} 
                                                        className="w-full bg-emerald-500/80 rounded-sm" 
                                                        style={{ height: `${h}%` }}
                                                    />
                                                ))}
                                            </div>
                                        </div>

                                        <div className="glass-card rounded-xl p-4 flex flex-col justify-between">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">System Load</span>
                                                <span className={`text-[9px] font-bold font-mono ${cpuTextColor}`}>{cpuLoad > 70 ? 'Elevated' : 'Normal'}</span>
                                            </div>
                                            <div className="space-y-1">
                                                <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                                                    <div className={`h-full rounded-full ${cpuColor}`} style={{ width: `${cpuLoad}%` }}></div>
                                                </div>
                                                <div className="flex justify-between text-[8px] text-slate-400 font-mono">
                                                    <span className={cpuTextColor}>CPU: {cpuLoad}% ({cpuCores} Cores)</span>
                                                    <span>RAM: {ramUsage} / {totalRam}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="glass-card rounded-xl p-4 flex flex-col justify-between">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Secure Processes</span>
                                                <span className="text-[9px] font-bold text-emerald-400 font-mono">Locked</span>
                                            </div>
                                            <div className="space-y-0.5 text-[8px] font-mono text-slate-400 truncate">
                                                {processList.map((proc, pIdx) => (
                                                    <div key={pIdx} className="flex justify-between">
                                                        <span>{proc.name}</span>
                                                        <span className={proc.color}>{proc.status}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* RIGHT COLUMN: Event Timeline & Session Data */}
                                <div className="lg:col-span-4 flex flex-col gap-4 overflow-y-auto pr-1">
                                    {/* Metadata Card */}
                                    <div className="glass-card rounded-xl p-4 border-t-2 border-t-indigo-500 shrink-0">
                                        <h3 className="font-bold text-slate-200 text-xs mb-3 uppercase tracking-wider">Session Details</h3>
                                        <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-xs">
                                            <div>
                                                <p className="text-[9px] font-bold text-slate-500 uppercase">Browser Authenticator</p>
                                                <p className="font-semibold text-slate-350">{browserAuth}</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-bold text-slate-500 uppercase">Total Violations</p>
                                                <p className="font-semibold text-amber-500">{selectedSession.flagsCount}</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-bold text-slate-500 uppercase">IP Address</p>
                                                <p className="font-mono text-[10px] text-slate-400">{ipAddress}</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-bold text-slate-500 uppercase">Geolocation</p>
                                                <p className="font-semibold text-slate-350">{location}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Event Timeline card */}
                                    <div className="glass-card rounded-xl grow flex flex-col overflow-hidden border border-outline-variant/30">
                                        <div className="p-4 border-b border-outline-variant/30 flex justify-between items-center bg-slate-900/50">
                                            <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider flex items-center gap-1.5">
                                                <span>📋</span> AI Log Timestamps
                                            </h3>
                                            <span className="text-[10px] text-indigo-400 font-bold">Auto-Logged</span>
                                        </div>

                                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950/20 scrollbar-thin">
                                            {selectedSession.flags && selectedSession.flags.length > 0 ? (
                                                selectedSession.flags.map((flag, idx) => {
                                                    const flagVerdict = flag.ai_verdict || 'SUSPICIOUS';
                                                    const isCritical = flagVerdict === 'HIGH_RISK';

                                                    return (
                                                        <div key={flag.id || idx} className="border border-outline-variant/20 rounded-xl p-3 bg-slate-950/45 space-y-3 relative group">
                                                            <div className="absolute left-[-21px] top-4 w-2 h-2 rounded-full bg-slate-700 z-10 border border-slate-950" />
                                                            <div className="flex justify-between items-center">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${
                                                                        isCritical
                                                                            ? 'bg-red-500/10 border-red-500/20 text-red-400'
                                                                            : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                                                    }`}>
                                                                        {flag.alert_type.replace(/_/g, ' ')}
                                                                    </span>
                                                                </div>
                                                                <span className="text-[9.5px] font-mono text-slate-500">{new Date(flag.createdAt || flag.timestamp || Date.now()).toLocaleTimeString()}</span>
                                                            </div>

                                                            <p className="text-[11.5px] text-slate-350 leading-relaxed">
                                                                {flag.ai_reason || flag.detail || 'Proctor telemetry flag logged.'}
                                                            </p>

                                                            <div className="flex gap-2 pt-1.5 border-t border-outline-variant/10">
                                                                <button
                                                                    onClick={(e) => handleActionDismiss(e, flag.alert_type, flag.id, idx)}
                                                                    className="flex-1 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white py-1 rounded text-[10px] font-semibold transition-colors cursor-pointer"
                                                                >
                                                                    Dismiss
                                                                </button>
                                                                <button
                                                                    onClick={(e) => handleActionFlag(e, isCritical ? 'Confirm Violation' : 'Flag Session', flag.id, idx)}
                                                                    className={`flex-1 py-1 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                                                                        flag.isConfirmed
                                                                            ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400 hover:bg-emerald-600 hover:text-white'
                                                                            : isCritical
                                                                                ? 'bg-red-500/10 border-red-500/40 text-red-400 hover:bg-red-500 hover:text-white'
                                                                                : 'bg-amber-500/10 border-amber-500/40 text-amber-400 hover:bg-amber-500 hover:text-slate-950'
                                                                    }`}
                                                                >
                                                                    {flag.isConfirmed ? '✓ Confirmed' : isCritical ? 'Confirm' : 'Flag'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <div className="text-center py-10 text-xs text-slate-500">
                                                    No violation flags logged.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="border-t border-slate-800 pt-4 mt-4 flex justify-between items-center">
                                <span className="text-[10px] font-mono text-slate-500">Secure Live Stream Encrypted</span>
                                <button
                                    onClick={() => setSelectedSession(null)}
                                    className="px-6 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-xl transition duration-200 cursor-pointer"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Toast Notifications */}
            <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
                {toasts.map(toast => {
                    const bgColors = {
                        success: 'bg-emerald-950/80 border-emerald-500/30 text-emerald-400',
                        info: 'bg-indigo-950/80 border-indigo-500/30 text-indigo-400',
                        warning: 'bg-amber-950/80 border-amber-500/30 text-amber-400',
                        error: 'bg-red-950/80 border-red-500/30 text-red-400'
                    };
                    const icons = {
                        success: '✓',
                        info: 'ℹ',
                        warning: '⚠',
                        error: '✖'
                    };
                    return (
                        <div
                            key={toast.id}
                            className={`p-4 rounded-xl border backdrop-blur-xl shadow-2xl flex items-start gap-3 pointer-events-auto transition duration-300 ${bgColors[toast.type]}`}
                        >
                            <span className="font-bold text-sm leading-none mt-0.5">{icons[toast.type]}</span>
                            <div className="flex-1 text-xs font-semibold">{toast.message}</div>
                            <button
                                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                                className="text-[10px] opacity-60 hover:opacity-100 transition-opacity leading-none cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
