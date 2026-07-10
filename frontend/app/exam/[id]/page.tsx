'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { getExam, submitExam } from '@/lib/api';
import WebcamProctor from '@/components/WebcamProctor';
import ExamTimer from '@/components/ExamTimer';
import AlertBanner from '@/components/AlertBanner';

export interface ExamPageProps {
    readonly params?: any;
}

export default function ExamPage({ params }: ExamPageProps) {
    const router = useRouter();
    const { id } = useParams();

    const [exam, setExam] = useState<any>(null);
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [started, setStarted] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [alerts, setAlerts] = useState<string[]>([]);
    const [sessionId, setSessionId] = useState('');
    const [user, setUser] = useState<any>(null);
    
    const [currentQuestionIdx, setCurrentQuestionIdx] = useState<number>(0);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768);
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const screenStreamRef = useRef<MediaStream | null>(null);

    useEffect(() => {
        const stored = localStorage.getItem('user');
        if (!stored) { router.push('/login'); return; }
        
        setTimeout(() => {
            setUser(JSON.parse(stored));
            setSessionId(`session_${Date.now()}`);
        }, 0);

        getExam(id as string)
            .then(res => setExam(res.data))
            .catch(() => router.push('/exam'))
            .finally(() => setLoading(false));
    }, [id, router]);

    // Stop screensharing tracks on page unmount
    useEffect(() => {
        return () => {
            if (screenStreamRef.current) {
                screenStreamRef.current.getTracks().forEach(t => t.stop());
            }
        };
    }, []);

    // Log suspicious event helper
    const logFlag = useCallback(async (type: string, detail: string) => {
        setAlerts(prev => prev.includes(type) ? prev : [...prev, type]);
        try {
            await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/proctor/log-event`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    session_id: sessionId,
                    exam_id: id,
                    alert_type: type,
                    detail: detail
                })
            });
        } catch (err) {
            console.error('Failed to log flag:', err);
        }
    }, [sessionId, id]);

    // Fullscreen Exit detection
    useEffect(() => {
        if (!started) return;

        const handleFullscreenChange = () => {
            if (!document.fullscreenElement && started && !submitted) {
                logFlag('FULLSCREEN_EXIT', 'Exited fullscreen mode');
            }
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, [started, submitted, logFlag]);

    // Tab switch/Visibility change detection
    useEffect(() => {
        if (!started) return;

        const handleVisibilityChange = () => {
            if (document.hidden && !submitted) {
                logFlag('TAB_SWITCH', 'Student switched tabs or minimized browser');
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [started, submitted, logFlag]);

    // Window Focus loss detection
    useEffect(() => {
        if (!started) return;

        const handleBlur = () => {
            if (!submitted) {
                logFlag('WINDOW_BLUR', 'Browser window lost focus');
            }
        };

        window.addEventListener('blur', handleBlur);
        return () => window.removeEventListener('blur', handleBlur);
    }, [started, submitted, logFlag]);

    // DevTools detection via window size comparison
    useEffect(() => {
        if (!started || submitted) return;

        const checkDimensions = () => {
            const threshold = 160; 
            const widthDiff = window.outerWidth - window.innerWidth;
            const heightDiff = window.outerHeight - window.innerHeight;

            if (document.fullscreenElement) {
                if (widthDiff > threshold || heightDiff > threshold) {
                    logFlag('DEVTOOLS_OPENED', `DevTools panel docked detected (widthDiff: ${widthDiff}px, heightDiff: ${heightDiff}px)`);
                }
            }
        };

        const interval = setInterval(checkDimensions, 1000);
        return () => clearInterval(interval);
    }, [started, submitted, logFlag]);

    // DevTools detection via timing debugger loop
    useEffect(() => {
        if (!started || submitted) return;

        const checkDebugger = () => {
            const start = performance.now();
            (() => {
                debugger;
            })();
            const end = performance.now();
            if (end - start > 100) {
                logFlag('DEVTOOLS_OPENED', `Debugger loop delayed (latency: ${(end - start).toFixed(1)}ms)`);
            }
        };

        const interval = setInterval(checkDebugger, 1500);
        return () => clearInterval(interval);
    }, [started, submitted, logFlag]);

    // Keyboard Interceptors & Clipboard Action logging
    useEffect(() => {
        if (!started || submitted) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Meta') {
                e.preventDefault();
                logFlag('META_KEY_PRESS', 'Windows/Command key pressed');
                return;
            }

            if (e.key === 'F12') {
                e.preventDefault();
                logFlag('DEVTOOLS_OPENED', 'F12 key pressed (Developer Tools)');
                return;
            }

            const isInspectKey = e.key.toLowerCase() === 'i' || e.key.toLowerCase() === 'j' || e.key.toLowerCase() === 'c';
            const isInspectShortcut = (e.ctrlKey && e.shiftKey && isInspectKey) || (e.metaKey && e.altKey && isInspectKey);
            if (isInspectShortcut) {
                e.preventDefault();
                logFlag('DEVTOOLS_OPENED', `DevTools key shortcut detected: Ctrl/Cmd + Shift + ${e.key.toUpperCase()}`);
                return;
            }

            if ((e.ctrlKey && e.key.toLowerCase() === 'u') || (e.metaKey && e.altKey && e.key.toLowerCase() === 'u')) {
                e.preventDefault();
                logFlag('DEVTOOLS_OPENED', 'View source key shortcut detected');
                return;
            }

            const isClipboardKey = e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'v' || e.key.toLowerCase() === 'x' || e.key.toLowerCase() === 'a';
            const isClipboardShortcut = (e.ctrlKey && isClipboardKey) || (e.metaKey && isClipboardKey);
            if (isClipboardShortcut) {
                e.preventDefault();
                logFlag('CLIPBOARD_ACTION', `Prohibited shortcut key combination blocked: Ctrl/Cmd + ${e.key.toUpperCase()}`);
                return;
            }

            const isSystemShortcutKey = e.key.toLowerCase() === 'p' || e.key.toLowerCase() === 's';
            const isSystemShortcut = (e.ctrlKey && isSystemShortcutKey) || (e.metaKey && isSystemShortcutKey);
            if (isSystemShortcut) {
                e.preventDefault();
                logFlag('SHORTCUT_BLOCKED', `Prohibited system action blocked: Ctrl/Cmd + ${e.key.toUpperCase()}`);
                return;
            }
        };

        const handleClipboardEvent = (e: Event) => {
            e.preventDefault();
            logFlag('CLIPBOARD_ACTION', `Clipboard activity intercepted: type=${e.type}`);
        };

        const blockContextMenu = (e: MouseEvent) => {
            e.preventDefault();
        };

        window.addEventListener('keydown', handleKeyDown, true);
        document.addEventListener('contextmenu', blockContextMenu);
        document.addEventListener('copy', handleClipboardEvent);
        document.addEventListener('paste', handleClipboardEvent);
        document.addEventListener('cut', handleClipboardEvent);

        return () => {
            window.removeEventListener('keydown', handleKeyDown, true);
            document.removeEventListener('contextmenu', blockContextMenu);
            document.removeEventListener('copy', handleClipboardEvent);
            document.removeEventListener('paste', handleClipboardEvent);
            document.removeEventListener('cut', handleClipboardEvent);
        };
    }, [started, submitted, logFlag]);

    const handleStart = async () => {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    displaySurface: 'monitor'
                } as any
            });

            const track = stream.getVideoTracks()[0];
            const settings = track.getSettings();
            if (settings.displaySurface && settings.displaySurface !== 'monitor') {
                stream.getTracks().forEach(t => t.stop());
                logFlag('SCREENSHARE_WINDOW_SHARED', 'Attempted to share single window/tab instead of full screen');
                alert('You MUST share your ENTIRE screen to start the exam. Please try again and select the whole screen.');
                return;
            }

            screenStreamRef.current = stream;

            track.onended = () => {
                logFlag('SCREENSHARE_STOPPED', 'Screenshare session terminated by the student');
            };

            try {
                await document.documentElement.requestFullscreen();
            } catch {
                console.log('Fullscreen not available');
            }

            setStarted(true);
        } catch (err) {
            console.error('Screensharing setup error:', err);
            alert('Entire screen sharing is required to start this exam. Please allow screen capture and try again.');
        }
    };

    const handleSubmit = async () => {
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(t => t.stop());
            screenStreamRef.current = null;
        }

        try {
            const res = await submitExam(id as string, {
                answers,
                session_id: sessionId
            });
            document.exitFullscreen?.();
            setResult(res.data);
            setSubmitted(true);
        } catch (err) {
            console.error('Submit failed:', err);
        }
    };

    if (loading) return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
                <svg className="animate-spin h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <p className="text-slate-400 font-medium text-sm">Loading examination...</p>
            </div>
        </div>
    );

    if (submitted) return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-violet-600/10 blur-[120px] pointer-events-none" />

            <div className="glass-card rounded-2xl p-10 max-w-md w-full text-center relative z-10 border border-outline-variant/40 shadow-2xl">
                <h2 className="text-2xl font-bold text-white mb-2">
                    Exam Submitted
                </h2>
                <p className="text-slate-400 text-sm mb-6">Your answers have been uploaded securely.</p>
                {result && (
                    <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-6 mb-8 shadow-inner">
                        <p className="text-5xl font-black text-primary mb-1">
                            {result.score?.toFixed(1)}%
                        </p>
                        <p className="text-slate-350 text-xs font-semibold uppercase tracking-wider">
                            Score
                        </p>
                        <div className="h-px bg-outline-variant/20 my-4" />
                        <div className="flex justify-around text-sm">
                            <div>
                                <span className="block font-bold text-white">{result.correct_answers}</span>
                                <span className="text-[10px] text-slate-500 uppercase font-semibold">Correct</span>
                            </div>
                            <div className="w-px bg-outline-variant/20 h-8 self-center" />
                            <div>
                                <span className="block font-bold text-white">{result.total_questions}</span>
                                <span className="text-[10px] text-slate-500 uppercase font-semibold">Total Qs</span>
                            </div>
                        </div>
                        {result.total_flags > 0 && (
                            <div className="mt-4 pt-3 border-t border-outline-variant/10">
                                <p className="text-error text-xs font-bold animate-pulse flex items-center justify-center gap-1">
                                    ⚠️ {result.total_flags} suspicious events flagged
                                </p>
                            </div>
                        )}
                    </div>
                )}
                <button
                    onClick={() => router.push('/exam')}
                    className="w-full py-3.5 bg-primary text-on-primary rounded-xl font-body-bold hover:bg-primary-container hover:shadow-primary/30 shadow-md transition-all cursor-pointer"
                >
                    Back to Exams
                </button>
            </div>
        </div>
    );

    if (!started) return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-500/10 blur-[130px] pointer-events-none" />
            <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-violet-600/10 blur-[130px] pointer-events-none" />

            <div className="glass-card rounded-2xl p-8 sm:p-10 max-w-lg w-full relative z-10 border border-outline-variant/40 shadow-2xl">
                <h2 className="text-3xl font-extrabold text-white mb-2 leading-tight">
                    {exam?.title}
                </h2>
                <div className="flex gap-4 mt-3 mb-6 text-xs font-bold uppercase text-slate-500 tracking-wider">
                    <span className="text-primary">⏱ {exam?.duration_minutes} minutes</span>
                    <span className="text-secondary">📋 {exam?.questions?.length || 0} Questions</span>
                </div>

                <div className="bg-warning/10 border border-warning/30 rounded-xl p-5 mb-8 text-sm text-warning text-left leading-relaxed">
                    <p className="font-bold mb-2.5 flex items-center gap-1.5 text-warning">
                        <span>⚠️</span> IMPORTANT INSTRUCTIONS:
                    </p>
                    <ul className="space-y-2 list-disc list-inside text-xs opacity-90">
                        <li>Entire screen sharing is required before beginning</li>
                        <li>Maintain constant eye contact with the screen</li>
                        <li>Do not open developer tools or switch browser tabs</li>
                        <li>Ensure your face is fully lit and centered in frame</li>
                        <li>No secondary individuals are allowed in frame</li>
                    </ul>
                </div>

                <button
                    onClick={handleStart}
                    className="w-full py-4 bg-primary text-on-primary rounded-xl font-body-bold text-base hover:bg-primary-container transition-all shadow-lg shadow-primary/20 hover:scale-[1.01] cursor-pointer"
                >
                    Agree & Start Exam
                </button>
            </div>
        </div>
    );

    const currentQuestion = exam?.questions?.[currentQuestionIdx];

    return (
        <div className="min-h-screen bg-background text-on-background font-body-base antialiased flex flex-col h-screen overflow-hidden">
            <AlertBanner
                alerts={alerts}
                onClear={() => setAlerts([])}
            />

            {/* TopNavBar */}
            <header className="bg-surface-container border-b border-outline-variant/30 backdrop-blur-xl shadow-sm flex justify-between items-center w-full px-margin-desktop h-16 shrink-0 z-50 sticky top-0">
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
                <div className="flex items-center gap-4 sm:gap-6">
                    {/* Timer */}
                    <ExamTimer
                        duration_minutes={exam?.duration_minutes || 60}
                        onTimeUp={handleSubmit}
                    />
                    <button
                        onClick={handleSubmit}
                        className="bg-primary/10 text-primary hover:bg-primary/20 hover:scale-95 duration-150 transition-all font-body-bold px-5 py-2 rounded-full border border-primary/30 flex items-center gap-1 text-sm cursor-pointer"
                    >
                        Finish
                    </button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden relative">
                {/* SideNavBar (Question Map Sidebar) */}
                <nav className="hidden md:flex flex-col h-full w-64 bg-surface-container-low border-r border-outline-variant/30 backdrop-blur-xl shrink-0 z-40 relative">
                    <div className="p-6 border-b border-outline-variant/30">
                        <div className="text-label-caps font-label-caps text-on-surface-variant mb-3 uppercase tracking-wider text-[10px]">Session Status</div>
                        <div className="text-body-bold font-body-bold text-on-surface flex items-center gap-1.5">
                            <span>Live Proctoring</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                            <span className={`w-2 h-2 rounded-full shadow-[0_0_8px] animate-pulse ${
                                alerts.length > 0
                                    ? 'bg-error shadow-error/60'
                                    : 'bg-success shadow-success/60'
                            }`}></span>
                            <span className="text-xs text-on-surface-variant font-medium">
                                {alerts.length > 0 ? 'AI Flagged Alerts' : 'AI Status: Healthy'}
                            </span>
                        </div>
                        <button
                            onClick={() => alert('Request logged. A proctor has been notified.')}
                            className="mt-5 w-full py-2.5 px-4 rounded-lg bg-surface-container-high border border-outline-variant/30 text-primary hover:bg-surface-container-highest transition-colors flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer"
                        >
                            <span>🙋‍♂️</span> Request Support
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                        <div className="text-label-caps font-label-caps text-on-surface-variant mb-4 uppercase tracking-wider text-[10px]">Question Map</div>
                        <div className="grid grid-cols-4 gap-2">
                            {exam?.questions?.map((_: any, idx: number) => {
                                const isCurrent = currentQuestionIdx === idx;
                                const isAnswered = answers[idx] !== undefined;

                                let btnClasses = '';
                                if (isCurrent) {
                                    btnClasses = 'bg-primary/20 border-primary text-primary font-bold';
                                } else if (isAnswered) {
                                    btnClasses = 'bg-secondary/15 border-secondary/40 text-secondary';
                                } else {
                                    btnClasses = 'bg-surface-container-high border-outline-variant/30 text-on-surface-variant';
                                }

                                return (
                                    <button
                                        key={idx}
                                        onClick={() => setCurrentQuestionIdx(idx)}
                                        className={`w-8 h-8 rounded border flex items-center justify-center text-xs transition duration-150 cursor-pointer ${btnClasses}`}
                                    >
                                        {idx + 1}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    {!isMobile && (
                        <div className="p-6 border-t border-outline-variant/30 mt-auto">
                            <WebcamProctor
                                session_id={sessionId}
                                exam_id={id as string}
                                onAlert={setAlerts}
                                active={started}
                            />
                        </div>
                    )}
                </nav>

                {/* Main Content Area */}
                <main className="flex-1 h-full overflow-y-auto relative bg-background p-margin-mobile md:p-margin-desktop scroll-smooth">
                    <div className="max-w-3xl mx-auto h-full flex flex-col justify-center pt-8 pb-32">
                        


                        {currentQuestion && (
                            <>
                                {/* Question Index & Question Text */}
                                <div className="flex justify-between items-end mb-6 gap-4">
                                    <div>
                                        <span className="text-primary font-body-bold text-xs tracking-wide uppercase">
                                            Question {currentQuestionIdx + 1} of {exam?.questions?.length || 0}
                                        </span>
                                        <h2 className="text-headline-md font-headline-md font-bold text-on-surface mt-2 leading-snug">
                                            {currentQuestion.question}
                                        </h2>
                                    </div>
                                </div>

                                {/* Glass Card Question Box */}
                                <div className="glass-card rounded-2xl p-6 md:p-8 shadow-2xl relative overflow-hidden flex flex-col">
                                    {/* Subtle gradient blob background */}
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none"></div>
                                    
                                    <form className="space-y-4 relative z-10">
                                        {currentQuestion.options?.map((opt: string, oIdx: number) => {
                                            const optLetter = String.fromCharCode(65 + oIdx);
                                            const isChecked = answers[currentQuestionIdx] === opt;

                                            return (
                                                <div key={oIdx} className="relative">
                                                    <input
                                                        type="radio"
                                                        id={`opt-${oIdx}`}
                                                        name={`q_${currentQuestionIdx}`}
                                                        value={opt}
                                                        checked={isChecked}
                                                        onChange={() => setAnswers({
                                                            ...answers, [currentQuestionIdx]: opt
                                                        })}
                                                        className="peer sr-only"
                                                    />
                                                    <label
                                                        htmlFor={`opt-${oIdx}`}
                                                        className={`flex items-center p-4 sm:p-5 rounded-xl border cursor-pointer transition-all duration-200 group ${
                                                            isChecked
                                                                ? 'bg-primary/10 border-primary shadow-[0_0_15px_-5px_rgba(99,102,241,0.3)]'
                                                                : 'border-outline-variant/30 bg-surface-container/30 hover:bg-surface-container/60'
                                                        }`}
                                                    >
                                                        {/* Radio Circle */}
                                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-4 shrink-0 transition-colors ${
                                                            isChecked 
                                                                ? 'border-primary bg-primary' 
                                                                : 'border-outline-variant/80 group-hover:border-primary/50'
                                                        }`}>
                                                            <div className={`w-2 h-2 rounded-full ${isChecked ? 'bg-white' : 'bg-transparent'}`}></div>
                                                        </div>
                                                        <span className={`font-body-bold mr-4 text-sm ${isChecked ? 'text-primary' : 'text-slate-400'}`}>
                                                            {optLetter}
                                                        </span>
                                                        <span className="text-sm font-medium text-slate-100">
                                                            {opt}
                                                        </span>
                                                    </label>
                                                </div>
                                            );
                                        })}
                                    </form>
                                </div>
                            </>
                        )}

                        {/* Bottom Pagination Controls */}
                        <div className="flex justify-between items-center mt-8">
                            <button
                                onClick={() => setCurrentQuestionIdx(prev => Math.max(0, prev - 1))}
                                disabled={currentQuestionIdx === 0}
                                className={`px-6 py-3 rounded-lg border border-outline-variant/50 text-slate-300 font-body-bold flex items-center gap-2 transition-all ${
                                    currentQuestionIdx === 0 
                                        ? 'opacity-30 cursor-not-allowed' 
                                        : 'hover:bg-surface-container-high hover:text-white cursor-pointer'
                                }`}
                            >
                                <span>←</span> Previous
                            </button>
                            {currentQuestionIdx < (exam?.questions?.length || 0) - 1 ? (
                                <button
                                    onClick={() => setCurrentQuestionIdx(prev => prev + 1)}
                                    className="px-8 py-3 rounded-lg bg-primary text-slate-950 font-body-bold flex items-center gap-2 hover:opacity-90 transition-all hover:shadow-[0_0_20px_rgba(192,193,255,0.4)] hover:-translate-y-0.5 cursor-pointer"
                                >
                                    Next Question <span>→</span>
                                </button>
                            ) : (
                                <button
                                    onClick={handleSubmit}
                                    className="px-8 py-3 rounded-lg bg-emerald-600 text-white font-body-bold flex items-center gap-2 hover:bg-emerald-500 transition-all hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:-translate-y-0.5 cursor-pointer"
                                >
                                    Submit
                                </button>
                            )}
                        </div>

                    </div>
                </main>

                {/* Floating Proctoring Widget Wrapper (Mobile only) */}
                {isMobile && (
                    <div className="fixed bottom-6 right-6 z-40 w-48">
                        <WebcamProctor
                            session_id={sessionId}
                            exam_id={id as string}
                            onAlert={setAlerts}
                            active={started}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}