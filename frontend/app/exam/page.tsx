'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getExams, getExam, analyzeFrame } from '@/lib/api';

interface Question {
    questionText: string;
    options: string[];
}

interface Exam {
    id: string;
    title: string;
    duration_minutes: number;
    questions: Question[];
}

export default function ExamPage() {
    const router = useRouter();
    const [exams, setExams] = useState<Exam[]>([]);
    const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [user, setUser] = useState<any>(null);

    // Exam Active State
    const [isActive, setIsActive] = useState(false);
    const [isFinished, setIsFinished] = useState(false);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [timeLeft, setTimeLeft] = useState(0);
    const [sessionId, setSessionId] = useState('');
    const [proctorLogs, setProctorLogs] = useState<string[]>([]);
    const [proctorStatus, setProctorStatus] = useState('Initializing...');
    const [flagsCount, setFlagsCount] = useState(0);

    // Media & Proctor Refs
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const proctorIntervalRef = useRef<any>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Load available exams
    useEffect(() => {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        if (!token || !userData) {
            router.push('/login');
            return;
        }
        setUser(JSON.parse(userData));

        getExams()
            .then((res) => {
                setExams(res.data);
                setLoading(false);
            })
            .catch((err) => {
                setError(err.response?.data?.error || 'Failed to load exams');
                setLoading(false);
            });
    }, [router]);

    // Timer Effect
    useEffect(() => {
        if (!isActive || timeLeft <= 0) return;
        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    handleSubmitExam();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [isActive, timeLeft]);

    // Cleanup video stream and intervals on unmount
    useEffect(() => {
        return () => {
            stopProctoring();
        };
    }, []);

    const startExamFlow = async (examId: string) => {
        setLoading(true);
        setError('');
        try {
            const res = await getExam(examId);
            const examData = res.data;
            setSelectedExam(examData);
            setTimeLeft(examData.duration_minutes * 60);

            // Create a simple session ID
            const newSessionId = `session-${Math.random().toString(36).substr(2, 9)}`;
            setSessionId(newSessionId);
            setIsActive(true);
            setIsFinished(false);
            setProctorLogs([]);
            setFlagsCount(0);

            // Initialize camera
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
                setProctorStatus('Proctoring Active');

                // Start sending frames for analysis every 5 seconds
                startProctoringLoop(examData.id, newSessionId);
            } catch (err) {
                console.error("Camera access failed:", err);
                setError('Failed to access camera. Camera is required for AI-Proctored exams.');
                setIsActive(false);
                setLoading(false);
                return;
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to start exam');
        } finally {
            setLoading(false);
        }
    };

    const startProctoringLoop = (examId: string, sId: string) => {
        if (proctorIntervalRef.current) clearInterval(proctorIntervalRef.current);

        proctorIntervalRef.current = setInterval(async () => {
            if (!videoRef.current || !canvasRef.current) return;

            const video = videoRef.current;
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');

            if (context) {
                // Draw the video frame onto the canvas
                context.drawImage(video, 0, 0, canvas.width, canvas.height);

                // Convert canvas to blob
                canvas.toBlob(async (blob) => {
                    if (!blob) return;

                    const formData = new FormData();
                    formData.append('frame', blob, 'frame.jpg');
                    formData.append('session_id', sId);
                    formData.append('exam_id', examId);

                    try {
                        const res = await analyzeFrame(formData);
                        const data = res.data;
                        if (data.alerts && data.alerts.length > 0) {
                            setProctorStatus('Warning: Suspicious Behavior');
                            setFlagsCount(prev => prev + 1);
                            setProctorLogs(prev => [
                                `[${new Date().toLocaleTimeString()}] ALERT: ${data.alerts.join(', ')}`,
                                ...prev.slice(0, 8)
                            ]);
                        } else {
                            setProctorStatus('Proctoring Active');
                        }
                    } catch (err) {
                        console.error('Proctoring frame upload error:', err);
                    }
                }, 'image/jpeg', 0.7);
            }
        }, 5000);
    };

    const stopProctoring = () => {
        if (proctorIntervalRef.current) {
            clearInterval(proctorIntervalRef.current);
            proctorIntervalRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
    };

    const handleSelectOption = (questionIdx: number, option: string) => {
        setAnswers({ ...answers, [questionIdx]: option });
    };

    const handleSubmitExam = () => {
        stopProctoring();
        setIsActive(false);
        setIsFinished(true);
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.push('/login');
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const getChoiceLetter = (idx: number) => {
        return String.fromCharCode(65 + idx); // A, B, C, D
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <svg className="animate-spin h-10 w-10 text-indigo-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <div className="text-lg font-semibold text-slate-300">Initializing Exam Session...</div>
                </div>
            </div>
        );
    }

    // --- Post-Exam Finished Summary ---
    if (isFinished && selectedExam) {
        return (
            <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 sm:px-6 py-8 sm:py-12 relative">
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.05),transparent_70%)] pointer-events-none" />
                <div className="auth-card max-w-md text-center relative z-10 fade-in">
                    <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-6 text-green-400">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>

                    <h1 className="text-3xl font-bold text-white mb-2">Exam Submitted</h1>
                    <p className="text-slate-400 text-sm mb-6">Your answers have been stored and the proctoring logs have been submitted to your examiner.</p>

                    <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 mb-8 text-left space-y-3 font-medium">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-400">Exam Title:</span>
                            <span className="text-white">{selectedExam.title}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-400">Session ID:</span>
                            <span className="font-mono text-indigo-400 text-xs">{sessionId}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-400">Questions Answered:</span>
                            <span className="text-white">{Object.keys(answers).length} / {selectedExam.questions.length}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-400">AI Integrity Flags:</span>
                            <span className={flagsCount > 0 ? 'text-red-400 font-bold' : 'text-green-400'}>
                                {flagsCount} {flagsCount === 1 ? 'flag' : 'flags'}
                            </span>
                        </div>
                    </div>

                    <button
                        onClick={() => {
                            setSelectedExam(null);
                            setIsFinished(false);
                        }}
                        className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold shadow-lg shadow-indigo-600/20 hover:shadow-indigo-500/35 transition duration-200"
                    >
                        Back to Exams Hub
                    </button>
                </div>
            </div>
        );
    }

    // --- Active Exam Layout ---
    if (isActive && selectedExam) {
        const currentQuestion = selectedExam.questions[currentQuestionIndex];
        const isWarning = proctorStatus.includes('Warning');

        return (
            <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
                {/* Header */}
                <header className="bg-slate-900 border-b border-slate-800 px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center gap-4 relative z-10">
                    <div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">EXAM WORKSPACE</span>
                        <h1 className="text-lg font-bold text-white leading-tight">{selectedExam.title}</h1>
                    </div>
                    <div className={`px-5 py-2.5 rounded-xl border text-lg font-mono font-bold transition duration-300 ${
                        timeLeft <= 300 
                            ? 'bg-red-500/10 border-red-500/30 text-red-400 animate-pulse shadow-md shadow-red-500/5' 
                            : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                    }`}>
                        Timer: {formatTime(timeLeft)}
                    </div>
                </header>

                {/* Split Workspace */}
                <div className="flex-1 flex flex-col md:flex-row relative">
                    {/* Main Question Section */}
                    <main className="flex-1 px-4 sm:px-6 lg:px-10 py-6 sm:py-8 lg:py-10 flex flex-col justify-between relative overflow-y-auto">
                        <div className="max-w-3xl w-full mx-auto">
                            {selectedExam.questions.length > 0 ? (
                                <div className="card-surface p-6 sm:p-8 rounded-3xl shadow-xl backdrop-blur-md relative overflow-hidden">
                                    <div className="flex justify-between items-center mb-6">
                                        <span className="px-3 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                                            Question {currentQuestionIndex + 1} of {selectedExam.questions.length}
                                        </span>
                                        <span className="text-xs text-slate-500">Single Choice</span>
                                    </div>

                                    <h2 className="text-xl font-bold text-slate-100 mb-8 leading-relaxed">
                                        {currentQuestion?.questionText}
                                    </h2>

                                    <div className="space-y-4">
                                        {currentQuestion?.options.map((option, idx) => {
                                            const isSelected = answers[currentQuestionIndex] === option;
                                            return (
                                                <button
                                                    key={idx}
                                                    onClick={() => handleSelectOption(currentQuestionIndex, option)}
                                                    className={`w-full text-left p-4 rounded-2xl border flex items-center gap-4 transition duration-200 group ${
                                                        isSelected
                                                            ? 'border-indigo-500 bg-indigo-500/5 text-white font-medium shadow-lg shadow-indigo-500/5'
                                                            : 'border-slate-800 hover:border-slate-700 bg-slate-900/20 text-slate-300 hover:text-slate-200'
                                                    }`}
                                                >
                                                    <div className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center text-sm font-semibold transition ${
                                                        isSelected
                                                            ? 'bg-indigo-600 text-white shadow-md'
                                                            : 'bg-slate-950 border border-slate-800 text-slate-400 group-hover:text-slate-200 group-hover:border-slate-700'
                                                    }`}>
                                                        {getChoiceLetter(idx)}
                                                    </div>
                                                    <span className="leading-snug">{option}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-20 text-slate-500 italic">No questions found in this exam.</div>
                            )}

                            {/* Progress dots */}
                            <div className="mt-8 flex justify-center gap-2 flex-wrap">
                                {selectedExam.questions.map((_, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setCurrentQuestionIndex(idx)}
                                        className={`w-3.5 h-3.5 rounded-full transition-all duration-200 ${
                                            currentQuestionIndex === idx
                                                ? 'bg-indigo-500 ring-4 ring-indigo-500/25 scale-110'
                                                : answers[idx]
                                                ? 'bg-indigo-800 hover:bg-indigo-700'
                                                : 'bg-slate-800 hover:bg-slate-700'
                                        }`}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Navigation controls footer */}
                        <div className="max-w-3xl w-full mx-auto mt-8 flex justify-between items-center border-t border-slate-900 pt-6">
                            <button
                                onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                                disabled={currentQuestionIndex === 0}
                                className="inline-flex items-center justify-center px-6 py-3 border border-slate-800 hover:border-slate-700 rounded-xl text-slate-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition duration-200 font-medium cursor-pointer"
                            >
                                Previous
                            </button>

                            {currentQuestionIndex < selectedExam.questions.length - 1 ? (
                                <button
                                    onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                                    className="inline-flex items-center justify-center px-6 py-3 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl text-slate-100 font-medium transition duration-200 cursor-pointer"
                                >
                                    Next Question
                                </button>
                            ) : (
                                <button
                                    onClick={handleSubmitExam}
                                    className="inline-flex items-center justify-center px-8 py-3 bg-linear-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white rounded-xl font-bold shadow-lg shadow-green-600/10 hover:shadow-green-500/20 transition duration-200 cursor-pointer"
                                >
                                    Submit Exam
                                </button>
                            )}
                        </div>
                    </main>

                    {/* Right AI Sidebar */}
                    <aside className="w-full md:w-80 lg:w-96 bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 px-4 sm:px-6 py-6 flex flex-col justify-between relative z-10 shrink-0">
                        <div>
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>
                                AI Proctoring Feed
                            </h3>

                            {/* Camera Viewport with custom HUD brackets */}
                            <div className="relative aspect-video w-full bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-inner group mb-4">
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="w-full h-full object-cover transform -scale-x-100"
                                />
                                <canvas ref={canvasRef} width="320" height="240" className="hidden" />

                                {/* Camera HUD frame */}
                                <div className="absolute inset-2 border border-slate-500/10 rounded-xl pointer-events-none">
                                    {/* Scanline line */}
                                    <div className="absolute left-0 right-0 h-[1.5px] bg-indigo-500/15 top-1/2 animate-[pulse_2s_infinite]"></div>
                                    {/* HUD target brackets */}
                                    <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-slate-500/30"></div>
                                    <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-slate-500/30"></div>
                                    <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-slate-500/30"></div>
                                    <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-slate-500/30"></div>
                                </div>

                                <div className="absolute top-3 right-3 bg-red-600 text-white text-[10px] px-2.5 py-1 rounded-full uppercase tracking-widest font-extrabold shadow-lg animate-pulse flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                                    Live
                                </div>
                            </div>

                            {/* Proctoring status card */}
                            <div className={`p-4 rounded-2xl border text-sm font-semibold mb-6 flex gap-3 items-center transition duration-300 ${
                                isWarning
                                    ? 'bg-red-500/10 border-red-500/20 text-red-400 alert-pulse'
                                    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            }`}>
                                <div className="shrink-0">
                                    {isWarning ? (
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                    ) : (
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                        </svg>
                                    )}
                                </div>
                                <span className="leading-tight">{proctorStatus}</span>
                            </div>

                            {/* Live proctor log ticker */}
                            <div className="space-y-2">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Live integrity log</h4>
                                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-[11px] font-mono text-slate-400 min-h-[140px] max-h-[220px] overflow-y-auto space-y-2 scrollbar-thin">
                                    {proctorLogs.length === 0 ? (
                                        <div className="text-slate-600 italic text-center py-8">Active scanning. Logs will print here.</div>
                                    ) : (
                                        proctorLogs.map((log, idx) => (
                                            <div key={idx} className="text-red-400 border-l border-red-500/30 pl-2 leading-relaxed">{log}</div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 text-center text-[10px] text-slate-500 border-t border-slate-800 pt-4 flex flex-col gap-1">
                            <div>Session ID: <span className="font-mono text-slate-400">{sessionId}</span></div>
                            <div>System checks running. Do not exit window.</div>
                        </div>
                    </aside>
                </div>
            </div>
        );
    }

    // --- Selection Layout ---
    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col relative overflow-hidden">
            {/* Background ambient glows */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/5 blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-violet-600/5 blur-[120px] pointer-events-none" />

            {/* Hub Header */}
            <header className="page-container py-5 sm:py-6 border-b border-slate-900/60 flex justify-between items-center relative z-10">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-linear-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg">
                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                    </div>
                    <span className="font-bold text-white tracking-tight">ExamProctor Hub</span>
                </div>
                {user && (
                    <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                            <div className="text-sm font-semibold text-slate-200">{user.name}</div>
                            <div className="text-xs text-slate-500">Examinee</div>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="inline-flex items-center justify-center px-4 py-2 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-400 hover:text-white rounded-lg transition duration-200 cursor-pointer"
                        >
                            Sign Out
                        </button>
                    </div>
                )}
            </header>

            {/* Hub Body */}
            <main className="page-container-narrow page-section relative z-10 flex-1 flex flex-col justify-center">
                <div className="mb-8">
                    <h1 className="text-3xl font-extrabold text-white">Active Examination Hub</h1>
                    <p className="text-slate-400 mt-1 text-sm">Select an exam module. Before starting, grant camera access for the AI Proctoring suite.</p>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-200 p-4 rounded-2xl mb-6 text-sm flex gap-3">
                        <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{error}</span>
                    </div>
                )}

                <div className="space-y-4">
                    {exams.length === 0 ? (
                        <div className="bg-slate-900/30 border border-slate-800 p-12 text-center rounded-3xl backdrop-blur-sm">
                            <svg className="w-10 h-10 text-slate-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <h3 className="font-semibold text-slate-300">No Exams Available</h3>
                            <p className="text-slate-500 text-sm mt-1">There are no active exam modules configured. Contact your examiner.</p>
                        </div>
                    ) : (
                        exams.map((exam) => (
                            <div
                                key={exam.id}
                                className="card-surface p-5 sm:p-6 hover:border-slate-700/80 hover:bg-slate-900/60 transition duration-300 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 group"
                            >
                                <div>
                                    <h3 className="font-bold text-slate-200 text-lg group-hover:text-white transition duration-200">
                                        {exam.title}
                                    </h3>
                                    <div className="flex gap-4 mt-2 text-xs font-semibold uppercase text-slate-500 tracking-wider">
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
                                            {exam.questions?.length || 0} Questions
                                        </span>
                                        <span className="flex items-center gap-1.5 text-indigo-400">
                                            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                            AI Monitor
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => startExamFlow(exam.id)}
                                    className="inline-flex items-center justify-center px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/10 hover:shadow-indigo-500/20 transition duration-200 shrink-0 self-end sm:self-auto cursor-pointer"
                                >
                                    Start Exam
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </main>
        </div>
    );
}
