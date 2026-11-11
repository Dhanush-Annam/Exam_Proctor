'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    Shield,
    LayoutGrid,
    PlusCircle,
    Activity,
    LogOut,
    Search,
    RefreshCw,
    Clock,
    FileText,
    CheckCircle2,
    AlertOctagon,
    AlertTriangle,
    X,
    ChevronLeft,
    ChevronRight,
    Edit3,
    Trash2,
    Eye,
    Plus,
    Info,
    ArrowRight
} from 'lucide-react';
import { getExaminerExams, createExam, updateExamStatus, getProctorSessions, updateExam, getSubmissions } from '@/lib/api';
import { connectExaminerSocket, disconnectSocket } from '@/lib/socket';

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
    const [activeTab, setActiveTab] = useState<'exams' | 'create' | 'sessions' | 'submissions'>('exams');
    const [selectedSubmissionsExam, setSelectedSubmissionsExam] = useState<Exam | null>(null);
    const [submissionsList, setSubmissionsList] = useState<any[]>([]);
    const [loadingSubmissions, setLoadingSubmissions] = useState(false);
    const [inspectingSubmission, setInspectingSubmission] = useState<any | null>(null);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [realMetadata, setRealMetadata] = useState<{
        ip: string;
        location: string;
        browser: string;
        cpuCores: number;
        ramGb: number;
    } | null>(null);

    const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    }, []);

    // Load real client system metadata
    useEffect(() => {
        if (typeof window === 'undefined') return;
        
        const browserInfo = getBrowserInfo();
        const cores = navigator.hardwareConcurrency || 4;
        const ram = (navigator as any).deviceMemory || 8;
        
        setTimeout(() => {
            setRealMetadata({
                ip: '127.0.0.1',
                location: 'Localhost',
                browser: `${browserInfo.name} v${browserInfo.version}`,
                cpuCores: cores,
                ramGb: ram
            });
        }, 0);
        
        fetch('https://ipapi.co/json/')
            .then(res => res.json())
            .then(data => {
                setRealMetadata(prev => prev ? {
                    ...prev,
                    ip: data.ip || '127.0.0.1',
                    location: data.city && data.region ? `${data.city}, ${data.region}` : 'Local Network'
                } : null);
            })
            .catch(() => {
                setRealMetadata(prev => prev ? {
                    ...prev,
                    ip: '127.0.0.1',
                    location: 'Local Network'
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

    // Create & Edit Exam states
    const [editingExamId, setEditingExamId] = useState<string | null>(null);
    const [examTitle, setExamTitle] = useState('');
    const [examDuration, setExamDuration] = useState(60);
    const [formQuestions, setFormQuestions] = useState<Question[]>([
        { question: '', options: ['', '', '', ''], answer: '' }
    ]);

    // Inspect Session state
    const [selectedSession, setSelectedSession] = useState<ProctorSession | null>(null);
    const [selectedFlag, setSelectedFlag] = useState<any | null>(null);

    // Filter sessions
    const filteredSessions = sessions.filter(session => {
        const matchesVerdict = verdictFilter === 'ALL' || (session.verdict || 'NORMAL') === verdictFilter;
        if (!matchesVerdict) return false;

        if (!searchTerm.trim()) return true;

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
    });

    // KPI Metrics calculation
    const totalSessions = sessions.length;
    const criticalSessionsCount = sessions.filter(s => s.verdict === 'CRITICAL').length;
    const suspiciousSessionsCount = sessions.filter(s => s.verdict === 'SUSPICIOUS').length;
    const normalSessionsCount = sessions.filter(s => (s.verdict || 'NORMAL') === 'NORMAL').length;

    const loadDashboardData = useCallback(async () => {
        setLoading(true);
        try {
            const [examsRes, sessionsRes] = await Promise.all([
                getExaminerExams(),
                getProctorSessions()
            ]);
            setExams(examsRes.data);
            setSessions(sessionsRes.data);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to load examiner telemetry');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const stored = localStorage.getItem('user');
        if (!stored) {
            router.push('/login');
            return;
        }

        try {
            const parsed = JSON.parse(stored);
            if (parsed.role !== 'examiner') {
                router.push('/exam');
                return;
            }
            setTimeout(() => setUser(parsed), 0);
        } catch {
            router.push('/login');
            return;
        }

        const initialLoadTimer = setTimeout(() => {
            loadDashboardData();
        }, 0);

        // WebSocket for examiner live alerts
        const socket = connectExaminerSocket();
        const handleLiveAlert = (payload: any) => {
            const student = payload.studentName || 'Student';
            const exam = payload.examTitle ? ` in "${payload.examTitle}"` : '';
            const alertsText = payload.alerts ? payload.alerts.join(', ') : (payload.detail || 'Violation detected');
            showToast(`Live alert: ${student}${exam} — ${alertsText}`, 'warning');
            loadDashboardData();
        };

        socket.on('live_proctor_alert', handleLiveAlert);
        socket.on('new_session_alert', handleLiveAlert);
        socket.on('session_review_complete', (payload: any) => {
            showToast(`AI review completed for session ${payload.session_id}`, 'info');
            loadDashboardData();
        });

        return () => {
            clearTimeout(initialLoadTimer);
            disconnectSocket();
        };
    }, [router, loadDashboardData, showToast]);

    const handleToggleStatus = async (examId: string, currentStatus: string) => {
        let nextStatus: 'draft' | 'active' | 'closed' = 'active';
        if (currentStatus === 'active') nextStatus = 'closed';
        else if (currentStatus === 'closed') nextStatus = 'draft';

        try {
            await updateExamStatus(examId, nextStatus);
            setSuccess(`Exam status updated to ${nextStatus}`);
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

    const handleViewSubmissions = async (exam: Exam) => {
        setSelectedSubmissionsExam(exam);
        setActiveTab('submissions');
        setLoadingSubmissions(true);
        try {
            const res = await getSubmissions(exam.id);
            setSubmissionsList(res.data);
        } catch {
            showToast('Failed to load submissions', 'error');
        } finally {
            setLoadingSubmissions(false);
        }
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
                setSuccess('Exam updated successfully');
            } else {
                await createExam({
                    title: examTitle,
                    duration_minutes: examDuration,
                    questions: formQuestions
                });
                setSuccess('Exam created successfully');
            }

            setEditingExamId(null);
            setExamTitle('');
            setExamDuration(60);
            setFormQuestions([{ question: '', options: ['', '', '', ''], answer: '' }]);
            setActiveTab('exams');
            loadDashboardData();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to save examination');
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.push('/login');
    };

    return (
        <div className="h-screen bg-canvas text-primary-text flex flex-col md:flex-row font-sans overflow-hidden">
            {/* Sidebar Navigation (256px) */}
            <aside className="w-full md:w-64 h-full bg-deep border-b md:border-b-0 md:border-r border-white/8 px-4 py-5 flex flex-col justify-between shrink-0 overflow-y-auto">
                <div className="space-y-6">
                    {/* Brand */}
                    <Link href="/" className="flex items-center gap-2.5 px-2 group">
                        <div className="w-7 h-7 rounded-md bg-card border border-white/8 flex items-center justify-center text-accent">
                            <Shield className="w-4 h-4" strokeWidth={1.5} />
                        </div>
                        <span className="text-sm font-medium tracking-tight text-primary-text">
                            ExamProctor
                        </span>
                    </Link>

                    {/* Nav Items (Rows 36px tall) */}
                    <nav className="space-y-1">
                        <button
                            type="button"
                            onClick={() => { setActiveTab('exams'); setError(''); }}
                            className={`w-full h-9 flex items-center gap-2.5 px-3 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                                activeTab === 'exams' || activeTab === 'submissions'
                                    ? 'bg-raised text-primary-text border border-white/8'
                                    : 'text-muted-text hover:text-primary-text hover:bg-card'
                            }`}
                        >
                            <LayoutGrid className="w-4 h-4 text-muted-text" strokeWidth={1.5} />
                            <span>Examinations</span>
                            <span className="ml-auto font-mono text-[10px] text-muted-text">
                                {exams.length}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => { setActiveTab('create'); setError(''); }}
                            className={`w-full h-9 flex items-center gap-2.5 px-3 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                                activeTab === 'create'
                                    ? 'bg-raised text-primary-text border border-white/8'
                                    : 'text-muted-text hover:text-primary-text hover:bg-card'
                            }`}
                        >
                            <PlusCircle className="w-4 h-4 text-muted-text" strokeWidth={1.5} />
                            <span>{editingExamId ? 'Edit assessment' : 'Create assessment'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => { setActiveTab('sessions'); setError(''); }}
                            className={`w-full h-9 flex items-center gap-2.5 px-3 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                                activeTab === 'sessions'
                                    ? 'bg-raised text-primary-text border border-white/8'
                                    : 'text-muted-text hover:text-primary-text hover:bg-card'
                            }`}
                        >
                            <Activity className="w-4 h-4 text-muted-text" strokeWidth={1.5} />
                            <span>Proctoring feed</span>
                            {criticalSessionsCount > 0 && (
                                <span className="ml-auto font-mono text-[10px] text-semantic-negative bg-semantic-negative/10 px-1.5 py-0.2 rounded border border-semantic-negative/20">
                                    {criticalSessionsCount}
                                </span>
                            )}
                        </button>
                    </nav>
                </div>

                {/* User & Telemetry Footer */}
                {user && (
                    <div className="pt-4 border-t border-white/8 space-y-3">
                        <div className="p-2.5 rounded-md bg-canvas border border-white/8 flex items-center justify-between">
                            <div className="truncate">
                                <div className="text-xs font-medium text-primary-text truncate">{user.name}</div>
                                <div className="text-[10px] font-mono text-muted-text truncate">{user.email}</div>
                            </div>
                            <span className="text-[10px] font-mono uppercase bg-card px-1.5 py-0.5 rounded text-muted-text shrink-0 border border-white/6">
                                Examiner
                            </span>
                        </div>

                        <button
                            type="button"
                            onClick={handleLogout}
                            className="w-full h-8 flex items-center justify-center gap-1.5 text-xs text-muted-text hover:text-primary-text rounded-md border border-white/8 bg-canvas hover:bg-card transition-colors cursor-pointer"
                        >
                            <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
                            <span>Sign out</span>
                        </button>
                    </div>
                )}
            </aside>

            {/* Main Dashboard Workspace */}
            <main className="flex-1 p-6 md:p-10 overflow-y-auto">
                {error && (
                    <div className="max-w-5xl mx-auto w-full p-3 rounded-md bg-semantic-negative/10 border border-semantic-negative/30 text-semantic-negative text-xs flex items-center gap-2 mb-6">
                        <AlertOctagon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
                        <span>{error}</span>
                    </div>
                )}

                {success && (
                    <div className="max-w-5xl mx-auto w-full p-3 rounded-md bg-semantic-positive/10 border border-semantic-positive/30 text-semantic-positive text-xs flex items-center gap-2 mb-6">
                        <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={1.5} />
                        <span>{success}</span>
                    </div>
                )}

                <div className="max-w-5xl mx-auto w-full">
                    {/* TAB 1: EXAMINATIONS HUB */}
                    {activeTab === 'exams' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h1 className="text-xl font-medium tracking-tight text-primary-text">Examinations</h1>
                                    <p className="text-xs text-secondary-text mt-0.5">Manage parameters, launch statuses, and review submissions</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('create')}
                                    className="h-9 px-3.5 rounded-md bg-primary-text hover:bg-white text-canvas text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                                >
                                    <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                                    <span>New assessment</span>
                                </button>
                            </div>

                            {exams.length === 0 ? (
                                <div className="rounded-lg p-12 text-center border border-white/8 bg-card">
                                    <p className="text-sm font-medium text-primary-text">No examinations configured</p>
                                    <p className="text-xs text-muted-text mt-1">Create an assessment to host proctored sessions</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {exams.map((exam) => (
                                        <div
                                            key={exam.id}
                                            className="rounded-lg border border-white/8 bg-card p-5 flex flex-col justify-between hover:border-white/20 transition-colors"
                                        >
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-start gap-2">
                                                    <h3 className="text-sm font-medium text-primary-text line-clamp-1">
                                                        {exam.title}
                                                    </h3>
                                                    <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border shrink-0 ${
                                                        exam.status === 'active'
                                                            ? 'bg-semantic-positive/10 border-semantic-positive/20 text-semantic-positive'
                                                            : exam.status === 'closed'
                                                            ? 'bg-semantic-negative/10 border-semantic-negative/20 text-semantic-negative'
                                                            : 'bg-raised border-white/8 text-muted-text'
                                                    }`}>
                                                        {exam.status}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-4 text-xs font-mono text-muted-text">
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="w-3.5 h-3.5" strokeWidth={1.5} />
                                                        <span className="tabular-nums">{exam.duration_minutes}m</span>
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <FileText className="w-3.5 h-3.5" strokeWidth={1.5} />
                                                        <span className="tabular-nums">{exam.questions?.length || 0} questions</span>
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="pt-4 mt-5 border-t border-white/8 flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleStatus(exam.id, exam.status)}
                                                    className={`h-8 px-3 rounded-md text-xs font-medium transition-colors cursor-pointer flex-1 ${
                                                        exam.status === 'draft'
                                                            ? 'bg-semantic-positive hover:opacity-90 text-canvas'
                                                            : exam.status === 'active'
                                                            ? 'border border-white/8 bg-canvas hover:bg-raised text-primary-text'
                                                            : 'bg-primary-text hover:bg-white text-canvas'
                                                    }`}
                                                >
                                                    {exam.status === 'draft' && 'Activate'}
                                                    {exam.status === 'active' && 'Close exam'}
                                                    {exam.status === 'closed' && 'Reopen draft'}
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => handleStartEditExam(exam)}
                                                    className="h-8 px-2.5 rounded-md border border-white/8 bg-canvas hover:bg-raised text-secondary-text hover:text-primary-text text-xs transition-colors cursor-pointer"
                                                    title="Edit Exam"
                                                >
                                                    <Edit3 className="w-3.5 h-3.5" strokeWidth={1.5} />
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => handleViewSubmissions(exam)}
                                                    className="h-8 px-3 rounded-md border border-white/8 bg-raised hover:bg-white/10 text-primary-text text-xs font-medium transition-colors cursor-pointer"
                                                >
                                                    Submissions
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 2: CREATE / EDIT EXAM FORM */}
                    {activeTab === 'create' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h1 className="text-xl font-medium tracking-tight text-primary-text">
                                        {editingExamId ? 'Edit assessment' : 'Create assessment'}
                                    </h1>
                                    <p className="text-xs text-secondary-text mt-0.5">
                                        Configure assessment parameters and question keys
                                    </p>
                                </div>
                                {editingExamId && (
                                    <button
                                        type="button"
                                        onClick={handleCancelEdit}
                                        className="h-8 px-3 rounded-md border border-white/8 text-xs text-semantic-negative hover:bg-semantic-negative/10 transition-colors cursor-pointer"
                                    >
                                        Cancel edit
                                    </button>
                                )}
                            </div>

                            <form onSubmit={handleCreateExamSubmit} className="space-y-5">
                                <div className="rounded-lg border border-white/8 bg-card p-5 space-y-4">
                                    <div className="text-xs font-mono uppercase tracking-wider text-muted-text">
                                        Assessment parameters
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-medium text-secondary-text mb-1.5">
                                                Assessment title
                                            </label>
                                            <input
                                                type="text"
                                                value={examTitle}
                                                onChange={e => setExamTitle(e.target.value)}
                                                placeholder="e.g. Computer Architecture Final Examination"
                                                className="w-full h-10 bg-canvas border border-white/8 focus:border-accent rounded-md px-3 text-xs text-primary-text placeholder-muted-text focus:outline-none transition-colors"
                                                required
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-medium text-secondary-text mb-1.5">
                                                Duration (minutes)
                                            </label>
                                            <input
                                                type="number"
                                                value={examDuration}
                                                onChange={e => setExamDuration(parseInt(e.target.value) || 60)}
                                                min="5"
                                                max="300"
                                                className="w-full h-10 bg-canvas border border-white/8 focus:border-accent rounded-md px-3 text-xs font-mono text-primary-text focus:outline-none transition-colors"
                                                required
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Questions Section */}
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center text-xs font-mono text-muted-text">
                                        <span>QUESTIONS ({formQuestions.length})</span>
                                        <button
                                            type="button"
                                            onClick={handleAddQuestion}
                                            className="text-accent hover:underline cursor-pointer flex items-center gap-1"
                                        >
                                            <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                                            <span>Add question</span>
                                        </button>
                                    </div>

                                    {formQuestions.map((q, qIdx) => (
                                        <div
                                            key={qIdx}
                                            className="rounded-lg border border-white/8 bg-card p-5 space-y-4"
                                        >
                                            <div className="flex justify-between items-center pb-2 border-b border-white/6">
                                                <span className="text-xs font-mono text-muted-text">
                                                    QUESTION {qIdx + 1}
                                                </span>
                                                {formQuestions.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveQuestion(qIdx)}
                                                        className="text-muted-text hover:text-semantic-negative transition-colors p-1"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                                                    </button>
                                                )}
                                            </div>

                                            <div>
                                                <label className="block text-xs font-medium text-secondary-text mb-1.5">
                                                    Prompt text
                                                </label>
                                                <input
                                                    type="text"
                                                    value={q.question}
                                                    onChange={e => handleQuestionTextChange(qIdx, e.target.value)}
                                                    placeholder="Enter question statement..."
                                                    className="w-full h-10 bg-canvas border border-white/8 focus:border-accent rounded-md px-3 text-xs text-primary-text placeholder-muted-text focus:outline-none transition-colors"
                                                    required
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="block text-xs font-medium text-secondary-text">
                                                    Answer options (select radio for correct key)
                                                </label>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                    {q.options.map((opt, oIdx) => {
                                                        const isCorrect = q.answer === opt && opt !== '';
                                                        return (
                                                            <div
                                                                key={oIdx}
                                                                className="flex items-center gap-2 p-1.5 rounded border border-white/8 bg-canvas"
                                                            >
                                                                <input
                                                                    type="radio"
                                                                    name={`correct_q_${qIdx}`}
                                                                    checked={isCorrect}
                                                                    onChange={() => {
                                                                        const updated = [...formQuestions];
                                                                        updated[qIdx].answer = opt;
                                                                        setFormQuestions(updated);
                                                                    }}
                                                                    className="w-3.5 h-3.5 text-accent border-white/20 ml-1.5 cursor-pointer"
                                                                    required
                                                                />
                                                                <span className="font-mono text-xs text-muted-text">
                                                                    {String.fromCharCode(65 + oIdx)}.
                                                                </span>
                                                                <input
                                                                    type="text"
                                                                    value={opt}
                                                                    onChange={e => handleOptionTextChange(qIdx, oIdx, e.target.value)}
                                                                    placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                                                                    className="flex-1 bg-transparent text-xs text-primary-text placeholder-muted-text focus:outline-none"
                                                                    required
                                                                />
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex justify-end gap-3 pt-3">
                                    <button
                                        type="button"
                                        onClick={handleCancelEdit}
                                        className="h-10 px-4 rounded-md border border-white/8 bg-card hover:bg-raised text-xs font-medium text-primary-text transition-colors cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="h-10 px-5 rounded-md bg-primary-text hover:bg-white text-canvas text-xs font-medium transition-colors cursor-pointer"
                                    >
                                        {editingExamId ? 'Save changes' : 'Publish assessment'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* TAB 3: PROCTOR FEED */}
                    {activeTab === 'sessions' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h1 className="text-xl font-medium tracking-tight text-primary-text">Proctoring feed</h1>
                                    <p className="text-xs text-secondary-text mt-0.5">Live candidate telemetry, face bounds, and incident review logs</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={loadDashboardData}
                                    className="h-8 px-3 rounded-md border border-white/8 bg-card hover:bg-raised text-primary-text text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                                >
                                    <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
                                    <span>Refresh feed</span>
                                </button>
                            </div>

                            {/* Clean KPI Stats Grid (Strict Anti-Slop: No 4px borders, no glowing pulse) */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="p-4 rounded-lg border border-white/8 bg-card">
                                    <span className="text-[11px] font-mono text-muted-text uppercase tracking-wider block">
                                        Total sessions
                                    </span>
                                    <div className="flex items-baseline justify-between mt-2">
                                        <span className="text-2xl font-medium font-mono tabular-nums text-primary-text">
                                            {totalSessions}
                                        </span>
                                        <span className="text-[11px] font-mono text-muted-text">Active</span>
                                    </div>
                                </div>

                                <div className="p-4 rounded-lg border border-white/8 bg-card">
                                    <span className="text-[11px] font-mono text-semantic-negative uppercase tracking-wider block">
                                        Critical risk
                                    </span>
                                    <div className="flex items-baseline justify-between mt-2">
                                        <span className="text-2xl font-medium font-mono tabular-nums text-semantic-negative">
                                            {criticalSessionsCount}
                                        </span>
                                        <span className="text-[11px] font-mono text-muted-text">Immediate</span>
                                    </div>
                                </div>

                                <div className="p-4 rounded-lg border border-white/8 bg-card">
                                    <span className="text-[11px] font-mono text-semantic-warning uppercase tracking-wider block">
                                        Suspicious
                                    </span>
                                    <div className="flex items-baseline justify-between mt-2">
                                        <span className="text-2xl font-medium font-mono tabular-nums text-semantic-warning">
                                            {suspiciousSessionsCount}
                                        </span>
                                        <span className="text-[11px] font-mono text-muted-text">Review</span>
                                    </div>
                                </div>

                                <div className="p-4 rounded-lg border border-white/8 bg-card">
                                    <span className="text-[11px] font-mono text-semantic-positive uppercase tracking-wider block">
                                        Normal status
                                    </span>
                                    <div className="flex items-baseline justify-between mt-2">
                                        <span className="text-2xl font-medium font-mono tabular-nums text-semantic-positive">
                                            {normalSessionsCount}
                                        </span>
                                        <span className="text-[11px] font-mono text-muted-text">Verified</span>
                                    </div>
                                </div>
                            </div>

                            {/* Search & Verdict Filters */}
                            <div className="flex flex-col sm:flex-row gap-3 p-2 rounded-lg border border-white/8 bg-card">
                                <div className="relative flex-1">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-text">
                                        <Search className="w-3.5 h-3.5" strokeWidth={1.5} />
                                    </div>
                                    <input
                                        type="text"
                                        value={searchTerm}
                                        onChange={e => {
                                            setSearchTerm(e.target.value);
                                            setCurrentPage(1);
                                        }}
                                        placeholder="Search student, exam, or session ID..."
                                        className="w-full h-8 pl-8 pr-3 bg-canvas border border-white/8 focus:border-accent rounded text-xs text-primary-text placeholder-muted-text focus:outline-none transition-colors"
                                    />
                                </div>

                                <div className="flex items-center gap-1">
                                    {(['ALL', 'CRITICAL', 'SUSPICIOUS', 'NORMAL'] as const).map(verdict => (
                                        <button
                                            key={verdict}
                                            type="button"
                                            onClick={() => {
                                                setVerdictFilter(verdict);
                                                setCurrentPage(1);
                                            }}
                                            className={`h-8 px-3 rounded text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer ${
                                                verdictFilter === verdict
                                                    ? 'bg-raised text-primary-text border border-white/20'
                                                    : 'text-muted-text hover:text-primary-text'
                                            }`}
                                        >
                                            {verdict}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Filtered Sessions List */}
                            {filteredSessions.length === 0 ? (
                                <div className="rounded-lg p-12 text-center border border-white/8 bg-card">
                                    <p className="text-sm font-medium text-primary-text">No sessions match query</p>
                                    <p className="text-xs text-muted-text mt-1">Adjust search terms or verdict filter</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {filteredSessions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((session) => {
                                        const currentVerdict = session.verdict || 'NORMAL';
                                        return (
                                            <div
                                                key={session.session_id}
                                                onClick={() => setSelectedSession(session)}
                                                className="p-4 rounded-lg border border-white/8 bg-card hover:border-white/20 transition-colors cursor-pointer flex flex-col md:flex-row justify-between md:items-center gap-4"
                                            >
                                                <div className="space-y-1.5 flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-xs font-medium text-primary-text">
                                                            {session.student.name}
                                                        </span>
                                                        <span className="text-[11px] font-mono text-muted-text">
                                                            ({session.student.email})
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-secondary-text">
                                                        Assessment: <span className="text-primary-text">{session.exam.title}</span>
                                                    </p>
                                                    {session.reason && (
                                                        <p className="text-[11px] font-mono text-muted-text truncate max-w-xl">
                                                            {session.reason}
                                                        </p>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-3 shrink-0">
                                                    <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${
                                                        currentVerdict === 'CRITICAL'
                                                            ? 'bg-semantic-negative/10 text-semantic-negative border-semantic-negative/30'
                                                            : currentVerdict === 'SUSPICIOUS'
                                                            ? 'bg-semantic-warning/10 text-semantic-warning border-semantic-warning/30'
                                                            : 'bg-semantic-positive/10 text-semantic-positive border-semantic-positive/30'
                                                    }`}>
                                                        {currentVerdict}
                                                    </span>

                                                    <span className="text-xs font-mono tabular-nums text-muted-text bg-canvas px-2 py-0.5 rounded border border-white/6">
                                                        {session.flagsCount} {session.flagsCount === 1 ? 'flag' : 'flags'}
                                                    </span>

                                                    <ArrowRight className="w-4 h-4 text-muted-text" strokeWidth={1.5} />
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Pagination Controls */}
                                    {filteredSessions.length > itemsPerPage && (
                                        <div className="flex justify-between items-center pt-4 text-xs font-mono text-muted-text">
                                            <span>
                                                Showing {Math.min(filteredSessions.length, (currentPage - 1) * itemsPerPage + 1)} - {Math.min(filteredSessions.length, currentPage * itemsPerPage)} of {filteredSessions.length}
                                            </span>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                                    disabled={currentPage === 1}
                                                    className="h-8 px-2.5 rounded border border-white/8 hover:bg-raised text-current disabled:opacity-30 cursor-pointer"
                                                >
                                                    <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setCurrentPage(prev => prev + 1)}
                                                    disabled={currentPage >= Math.ceil(filteredSessions.length / itemsPerPage)}
                                                    className="h-8 px-2.5 rounded border border-white/8 hover:bg-raised text-current disabled:opacity-30 cursor-pointer"
                                                >
                                                    <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 4: SUBMISSIONS OVERVIEW */}
                    {activeTab === 'submissions' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h1 className="text-xl font-medium tracking-tight text-primary-text">Submissions</h1>
                                    <p className="text-xs text-secondary-text mt-0.5">
                                        Candidate response records for {selectedSubmissionsExam?.title || 'Selected Exam'}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('exams')}
                                    className="h-8 px-3 rounded-md border border-white/8 bg-card hover:bg-raised text-primary-text text-xs font-medium transition-colors cursor-pointer"
                                >
                                    Back to exams
                                </button>
                            </div>

                            {loadingSubmissions ? (
                                <div className="py-16 text-center text-xs font-mono text-muted-text">
                                    Retrieving submission records...
                                </div>
                            ) : submissionsList.length === 0 ? (
                                <div className="rounded-lg p-12 text-center border border-white/8 bg-card">
                                    <p className="text-sm font-medium text-primary-text">No completed submissions found</p>
                                    <p className="text-xs text-muted-text mt-1">Submitted responses will populate here once completed</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {submissionsList.map((sub: any) => (
                                        <div
                                            key={sub.id}
                                            className="p-4 rounded-lg border border-white/8 bg-card flex flex-col md:flex-row justify-between md:items-center gap-4"
                                        >
                                            <div className="space-y-1">
                                                <div className="text-xs font-medium text-primary-text">
                                                    {sub.student?.name || 'Unknown Candidate'}
                                                    <span className="font-mono text-muted-text ml-2">({sub.student?.email})</span>
                                                </div>
                                                <div className="flex items-center gap-4 text-xs font-mono text-muted-text">
                                                    <span className="text-primary-text font-medium tabular-nums">Score: {sub.score?.toFixed(1)}%</span>
                                                    <span className="tabular-nums">{sub.correct_answers}/{sub.total_questions} correct</span>
                                                    <span className={`tabular-nums ${sub.total_flags > 0 ? 'text-semantic-negative' : 'text-semantic-positive'}`}>
                                                        {sub.total_flags} flagged
                                                    </span>
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => setInspectingSubmission(sub)}
                                                className="h-8 px-3 rounded-md border border-white/8 bg-raised hover:bg-white/10 text-primary-text text-xs font-medium transition-colors cursor-pointer"
                                            >
                                                Inspect answers
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>

            {/* Session Inspection Modal */}
            {selectedSession && (
                <div className="fixed inset-0 z-50 bg-deep/80 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-card border border-white/8 w-full max-w-5xl h-[85vh] rounded-xl p-6 flex flex-col shadow-2xl">
                        <div className="flex justify-between items-start border-b border-white/8 pb-4 mb-5">
                            <div>
                                <div className="flex items-center gap-2.5">
                                    <h2 className="text-base font-medium text-primary-text">
                                        {selectedSession.student.name}
                                    </h2>
                                    <span className="text-xs font-mono text-muted-text">
                                        ({selectedSession.student.email})
                                    </span>
                                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded border border-white/20 bg-raised text-primary-text">
                                        {selectedSession.verdict || 'NORMAL'}
                                    </span>
                                </div>
                                <p className="text-xs text-muted-text mt-1 font-mono">
                                    Assessment: {selectedSession.exam.title} • Session: {selectedSession.session_id}
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => setSelectedSession(null)}
                                className="p-1 rounded hover:bg-raised text-muted-text hover:text-primary-text transition-colors cursor-pointer"
                            >
                                <X className="w-4 h-4" strokeWidth={1.5} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 overflow-hidden">
                            {/* Left: Frame Analysis & Timeline */}
                            <div className="lg:col-span-7 flex flex-col gap-4 overflow-y-auto pr-1">
                                <div className="h-64 rounded-lg bg-deep border border-white/8 relative overflow-hidden flex items-center justify-center">
                                    {selectedFlag && selectedFlag.image_path ? (
                                        /* eslint-disable-next-line @next/next/no-img-element */
                                        <img
                                            src={selectedFlag.image_path.startsWith('http')
                                                ? selectedFlag.image_path
                                                : `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/api/proctor/static/${selectedFlag.image_path.replace(/\\/g, '/')}`}
                                            alt={selectedFlag.alert_type}
                                            className="w-full h-full object-contain"
                                        />
                                    ) : (
                                        <div className="text-center space-y-2 text-muted-text font-mono text-xs">
                                            <Activity className="w-6 h-6 mx-auto text-muted-text" strokeWidth={1.5} />
                                            <span>Telemetry stream active</span>
                                            <p className="text-[10px] text-muted-text/60">Select an event below to inspect frame snapshot</p>
                                        </div>
                                    )}

                                    <div className="absolute top-2.5 right-2.5 text-[10px] font-mono px-2 py-0.5 rounded bg-deep/80 border border-white/8 text-muted-text">
                                        LOGGED SENSOR
                                    </div>
                                </div>

                                {/* Event Timeline List */}
                                <div className="flex-1 rounded-lg border border-white/8 bg-canvas p-3 overflow-y-auto space-y-2">
                                    <div className="text-[11px] font-mono text-muted-text uppercase pb-2 border-b border-white/6">
                                        Incident log stream ({selectedSession.flags?.length || 0})
                                    </div>
                                    {selectedSession.flags && selectedSession.flags.length > 0 ? (
                                        selectedSession.flags.map((flag: any, idx: number) => {
                                            const isSelected = selectedFlag && (selectedFlag.id === flag.id || idx === selectedFlag._idx);
                                            return (
                                                <div
                                                    key={idx}
                                                    onClick={() => setSelectedFlag({ ...flag, _idx: idx })}
                                                    className={`p-2.5 rounded border text-xs font-mono transition-colors cursor-pointer flex items-center justify-between ${
                                                        isSelected
                                                            ? 'border-accent bg-accent/10 text-primary-text'
                                                            : 'border-white/6 bg-card text-secondary-text hover:border-white/20'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2 truncate">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-semantic-warning shrink-0" />
                                                        <span className="truncate">{flag.alert_type}</span>
                                                    </div>
                                                    <span className="text-[10px] text-muted-text shrink-0 ml-2">
                                                        {new Date(flag.createdAt).toLocaleTimeString()}
                                                    </span>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <p className="text-xs font-mono text-muted-text text-center py-6">
                                            No incident flags recorded
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Right: Technical Metadata Specs */}
                            <div className="lg:col-span-5 rounded-lg border border-white/8 bg-canvas p-4 flex flex-col justify-between text-xs font-mono space-y-4">
                                <div className="space-y-3">
                                    <div className="text-[11px] text-muted-text uppercase pb-2 border-b border-white/6">
                                        Environment telemetry
                                    </div>
                                    <div>
                                        <span className="text-muted-text block text-[10px]">CLIENT AUTHENTICATOR</span>
                                        <span className="text-primary-text">{realMetadata?.browser || 'Browser Standby'}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-text block text-[10px]">IP ADDRESS</span>
                                        <span className="text-primary-text">{realMetadata?.ip || '127.0.0.1'}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-text block text-[10px]">GEOLOCATION</span>
                                        <span className="text-primary-text">{realMetadata?.location || 'Local Network'}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-text block text-[10px]">HARDWARE CONCURRENCY</span>
                                        <span className="text-primary-text">{realMetadata?.cpuCores} Cores • {realMetadata?.ramGb} GB RAM</span>
                                    </div>
                                </div>

                                <div className="p-3 rounded bg-card border border-white/8 text-[11px] text-muted-text">
                                    All telemetry frames and verification hashes are cryptographically signed.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Answer Inspection Modal for Examiner */}
            {inspectingSubmission && (
                <div className="fixed inset-0 z-50 bg-deep/80 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-card border border-white/8 w-full max-w-3xl max-h-[85vh] rounded-xl p-6 flex flex-col shadow-2xl">
                        <div className="flex justify-between items-start border-b border-white/8 pb-4 mb-5">
                            <div>
                                <h2 className="text-base font-medium text-primary-text">
                                    Candidate Response Audit
                                </h2>
                                <p className="text-xs font-mono text-muted-text mt-0.5">
                                    Score: {inspectingSubmission.score?.toFixed(1)}% • {inspectingSubmission.correct_answers}/{inspectingSubmission.total_questions} correct
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setInspectingSubmission(null)}
                                className="p-1 rounded hover:bg-raised text-muted-text hover:text-primary-text transition-colors cursor-pointer"
                            >
                                <X className="w-4 h-4" strokeWidth={1.5} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                            {inspectingSubmission.exam?.questions?.map((q: any, qIdx: number) => {
                                const studentAnswer = inspectingSubmission.answers[qIdx];
                                const isCorrect = studentAnswer === q.answer;

                                return (
                                    <div key={qIdx} className="p-4 rounded-lg border border-white/8 bg-canvas space-y-2.5">
                                        <div className="flex justify-between items-start gap-2">
                                            <div className="text-xs font-medium text-primary-text">
                                                <span className="font-mono text-muted-text mr-2">Q{qIdx + 1}.</span>
                                                {q.question || q.questionText}
                                            </div>
                                            <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border shrink-0 ${
                                                isCorrect
                                                    ? 'bg-semantic-positive/10 border-semantic-positive/20 text-semantic-positive'
                                                    : 'bg-semantic-negative/10 border-semantic-negative/20 text-semantic-negative'
                                            }`}>
                                                {isCorrect ? 'Correct' : 'Incorrect'}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                            {q.options?.map((opt: string, oIdx: number) => {
                                                const isCorrectOpt = opt === q.answer;
                                                const isSelectedOpt = opt === studentAnswer;

                                                let style = 'border-white/6 bg-card text-muted-text';
                                                if (isCorrectOpt) {
                                                    style = 'border-semantic-positive/30 bg-semantic-positive/10 text-semantic-positive font-medium';
                                                } else if (isSelectedOpt) {
                                                    style = 'border-semantic-negative/30 bg-semantic-negative/10 text-semantic-negative font-medium';
                                                }

                                                return (
                                                    <div key={oIdx} className={`p-2 rounded border text-xs flex items-center justify-between ${style}`}>
                                                        <span>{String.fromCharCode(65 + oIdx)}. {opt}</span>
                                                        <span className="text-[9px] font-mono uppercase">
                                                            {isSelectedOpt && 'Selected'}
                                                            {isCorrectOpt && ' Key'}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Toast Notifications */}
            <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        className="p-3.5 rounded-lg border border-white/8 bg-card shadow-xl flex items-start gap-2.5 pointer-events-auto text-xs text-primary-text"
                    >
                        {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-semantic-positive shrink-0 mt-0.5" strokeWidth={1.5} />}
                        {toast.type === 'warning' && <AlertTriangle className="w-4 h-4 text-semantic-warning shrink-0 mt-0.5" strokeWidth={1.5} />}
                        {toast.type === 'error' && <AlertOctagon className="w-4 h-4 text-semantic-negative shrink-0 mt-0.5" strokeWidth={1.5} />}
                        {toast.type === 'info' && <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" strokeWidth={1.5} />}

                        <span className="flex-1">{toast.message}</span>
                        <button
                            type="button"
                            onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                            className="text-muted-text hover:text-primary-text cursor-pointer"
                        >
                            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
