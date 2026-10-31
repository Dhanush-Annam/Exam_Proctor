'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Shield, Clock, FileText, CheckCircle2, AlertTriangle, ArrowLeft, ArrowRight, Loader2, Check } from 'lucide-react';
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
    const [consented, setConsented] = useState(false);
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
        if (!stored) {
            router.push('/login');
            return;
        }
        
        try {
            setUser(JSON.parse(stored));
        } catch {}
        setSessionId(`session_${Date.now()}`);

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
                logFlag('FULLSCREEN_EXIT', 'Candidate exited full-screen mode');
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
                logFlag('TAB_SWITCH', 'Exam tab hidden or minimized');
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
                    logFlag('DEVTOOLS_OPENED', `DevTools panel docked (diff: ${widthDiff}px x ${heightDiff}px)`);
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
                logFlag('DEVTOOLS_OPENED', `Debugger loop latency: ${(end - start).toFixed(1)}ms`);
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
                logFlag('META_KEY_PRESS', 'System key pressed');
                return;
            }

            if (e.key === 'F12') {
                e.preventDefault();
                logFlag('DEVTOOLS_OPENED', 'F12 pressed');
                return;
            }

            const isInspectKey = e.key.toLowerCase() === 'i' || e.key.toLowerCase() === 'j' || e.key.toLowerCase() === 'c';
            const isInspectShortcut = (e.ctrlKey && e.shiftKey && isInspectKey) || (e.metaKey && e.altKey && isInspectKey);
            if (isInspectShortcut) {
                e.preventDefault();
                logFlag('DEVTOOLS_OPENED', `Inspect shortcut: Ctrl/Cmd + Shift + ${e.key.toUpperCase()}`);
                return;
            }

            if ((e.ctrlKey && e.key.toLowerCase() === 'u') || (e.metaKey && e.altKey && e.key.toLowerCase() === 'u')) {
                e.preventDefault();
                logFlag('DEVTOOLS_OPENED', 'View source shortcut intercepted');
                return;
            }

            const isClipboardKey = e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'v' || e.key.toLowerCase() === 'x' || e.key.toLowerCase() === 'a';
            const isClipboardShortcut = (e.ctrlKey && isClipboardKey) || (e.metaKey && isClipboardKey);
            if (isClipboardShortcut) {
                e.preventDefault();
                logFlag('CLIPBOARD_ACTION', `Clipboard combination blocked: Ctrl/Cmd + ${e.key.toUpperCase()}`);
                return;
            }

            const isSystemShortcutKey = e.key.toLowerCase() === 'p' || e.key.toLowerCase() === 's';
            const isSystemShortcut = (e.ctrlKey && isSystemShortcutKey) || (e.metaKey && isSystemShortcutKey);
            if (isSystemShortcut) {
                e.preventDefault();
                logFlag('SHORTCUT_BLOCKED', `System shortcut blocked: Ctrl/Cmd + ${e.key.toUpperCase()}`);
                return;
            }
        };

        const handleClipboardEvent = (e: Event) => {
            e.preventDefault();
            logFlag('CLIPBOARD_ACTION', `Clipboard activity: ${e.type}`);
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
                logFlag('SCREENSHARE_WINDOW_SHARED', 'Window shared instead of entire screen');
                alert('Entire screen share is required for this examination. Please re-select the entire screen.');
                return;
            }

            screenStreamRef.current = stream;

            track.onended = () => {
                logFlag('SCREENSHARE_STOPPED', 'Display capture terminated by user');
            };

            try {
                await document.documentElement.requestFullscreen();
            } catch {
                console.log('Fullscreen not available');
            }

            setStarted(true);
        } catch (err) {
            console.error('Display capture error:', err);
            alert('Entire screen sharing permission is required to launch this exam session.');
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

    if (loading) {
        return (
            <div className="min-h-screen bg-canvas flex flex-col items-center justify-center text-muted-text gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-primary-text" strokeWidth={1.5} />
                <span className="text-xs font-mono">Initializing assessment environment...</span>
            </div>
        );
    }

    // Submitted state
    if (submitted) {
        return (
            <div className="min-h-screen bg-canvas text-primary-text flex items-center justify-center p-6">
                <div className="w-full max-w-md rounded-xl border border-white/8 bg-card p-8 shadow-xl text-center">
                    <div className="w-10 h-10 rounded-full bg-semantic-positive/10 border border-semantic-positive/20 text-semantic-positive flex items-center justify-center mx-auto mb-4">
                        <Check className="w-5 h-5" strokeWidth={2} />
                    </div>
                    <h1 className="text-xl font-medium tracking-tight text-primary-text mb-1">
                        Assessment submitted
                    </h1>
                    <p className="text-xs text-secondary-text mb-6">
                        Responses and telemetry log encrypted and uploaded
                    </p>

                    {result && (
                        <div className="rounded-lg border border-white/8 bg-canvas p-5 mb-6 text-left space-y-3 font-mono">
                            <div className="flex justify-between items-baseline">
                                <span className="text-xs text-muted-text">SCORE</span>
                                <span className="text-3xl font-medium text-primary-text tabular-nums">
                                    {result.score?.toFixed(1)}%
                                </span>
                            </div>
                            <div className="h-px bg-white/6" />
                            <div className="grid grid-cols-2 gap-4 text-xs">
                                <div>
                                    <span className="text-[10px] text-muted-text block">CORRECT</span>
                                    <span className="text-sm font-medium text-primary-text tabular-nums">
                                        {result.correct_answers} / {result.total_questions}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-[10px] text-muted-text block">INCIDENTS</span>
                                    <span className={`text-sm font-medium tabular-nums ${result.total_flags > 0 ? 'text-semantic-negative' : 'text-semantic-positive'}`}>
                                        {result.total_flags} flagged
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={() => router.push('/exam')}
                        className="w-full h-10 rounded-md bg-primary-text hover:bg-white text-canvas text-xs font-medium transition-colors cursor-pointer"
                    >
                        Return to assessment list
                    </button>
                </div>
            </div>
        );
    }

    // Pre-exam preparation screen
    if (!started) {
        return (
            <div className="min-h-screen bg-canvas text-primary-text flex items-center justify-center p-6">
                <div className="w-full max-w-lg rounded-xl border border-white/8 bg-card p-8 shadow-xl">
                    <div className="flex items-center gap-2 text-xs font-mono text-muted-text mb-4">
                        <Shield className="w-4 h-4 text-accent" strokeWidth={1.5} />
                        <span>PRE-EXAM TELEMETRY VERIFICATION</span>
                    </div>

                    <h1 className="text-xl font-medium tracking-tight text-primary-text mb-2">
                        {exam?.title}
                    </h1>

                    <div className="flex items-center gap-4 text-xs font-mono text-muted-text pb-5 mb-5 border-b border-white/8">
                        <span className="flex items-center gap-1.5 text-secondary-text">
                            <Clock className="w-3.5 h-3.5 text-muted-text" strokeWidth={1.5} />
                            <span className="tabular-nums">{exam?.duration_minutes} minutes</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-secondary-text">
                            <FileText className="w-3.5 h-3.5 text-muted-text" strokeWidth={1.5} />
                            <span className="tabular-nums">{exam?.questions?.length || 0} questions</span>
                        </span>
                    </div>

                    {/* Operational Protocols */}
                    <div className="rounded-lg p-4 border border-white/8 bg-canvas mb-6 space-y-2 text-xs text-secondary-text">
                        <div className="text-[11px] font-mono uppercase tracking-wider text-primary-text mb-2 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-semantic-warning" strokeWidth={1.5} />
                            <span>Candidate requirements</span>
                        </div>
                        <ul className="space-y-1.5 text-[11px] font-mono text-muted-text list-disc list-inside">
                            <li>Continuous full-screen display capture is mandatory</li>
                            <li>Webcam face presence verified every 2.0 seconds</li>
                            <li>Gaze diversion and tab switches are automatically logged</li>
                            <li>Single occupant in sensor frame at all times</li>
                        </ul>
                    </div>

                    {/* Consent Checkbox */}
                    <div className="flex items-start gap-3 mb-6">
                        <input
                            type="checkbox"
                            id="consent-check"
                            checked={consented}
                            onChange={(e) => setConsented(e.target.checked)}
                            className="mt-0.5 w-4 h-4 rounded border-white/20 bg-canvas text-accent focus:ring-0 cursor-pointer"
                        />
                        <label htmlFor="consent-check" className="text-xs text-muted-text leading-relaxed cursor-pointer select-none">
                            I authorize temporary streaming and logging of camera telemetry, screen capture, and window events for academic verification (FERPA & GDPR compliant).
                        </label>
                    </div>

                    <button
                        type="button"
                        onClick={handleStart}
                        disabled={!consented}
                        className="w-full h-11 rounded-md bg-primary-text hover:bg-white text-canvas font-medium text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    >
                        <span>Start proctored session</span>
                        <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                </div>
            </div>
        );
    }

    const currentQuestion = exam?.questions?.[currentQuestionIdx];

    // Live proctored examination interface
    return (
        <div className="min-h-screen bg-canvas text-primary-text flex flex-col h-screen overflow-hidden">
            {/* Docked Alert Banner */}
            <AlertBanner
                alerts={alerts}
                onClear={() => setAlerts([])}
            />

            {/* Top Workspace Header (56px) */}
            <header className="h-14 border-b border-white/8 bg-deep px-6 flex items-center justify-between z-30 shrink-0">
                <div className="flex items-center gap-4">
                    <Link href="/" className="flex items-center gap-2 text-xs font-medium text-primary-text hover:text-white">
                        <Shield className="w-4 h-4 text-accent" strokeWidth={1.5} />
                        <span className="hidden sm:inline">ExamProctor</span>
                    </Link>
                    <span className="text-white/20 hidden sm:inline">/</span>
                    <span className="text-xs font-mono text-secondary-text truncate max-w-xs">
                        {exam?.title}
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    <ExamTimer
                        duration_minutes={exam?.duration_minutes || 60}
                        onTimeUp={handleSubmit}
                    />
                    <button
                        type="button"
                        onClick={handleSubmit}
                        className="h-9 px-4 rounded-md border border-white/8 bg-card hover:bg-raised text-primary-text text-xs font-medium transition-colors cursor-pointer"
                    >
                        Submit exam
                    </button>
                </div>
            </header>

            {/* Main Layout Area */}
            <div className="flex flex-1 overflow-hidden relative">
                {/* Left Telemetry & Question Map Sidebar (260px) */}
                <aside className="hidden md:flex flex-col h-full w-64 border-r border-white/8 bg-deep shrink-0 z-20">
                    <div className="p-4 border-b border-white/8 flex items-center justify-between text-xs font-mono text-muted-text">
                        <span>TELEMETRY MAP</span>
                        <span className="text-[10px] text-semantic-positive">LIVE</span>
                    </div>

                    {/* Question Grid */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        <div className="grid grid-cols-5 gap-1.5">
                            {exam?.questions?.map((_: any, idx: number) => {
                                const isCurrent = currentQuestionIdx === idx;
                                const isAnswered = answers[idx] !== undefined;

                                let btnStyle = 'border-white/8 bg-card text-muted-text hover:text-primary-text';
                                if (isCurrent) {
                                    btnStyle = 'border-accent bg-accent/20 text-accent font-medium';
                                } else if (isAnswered) {
                                    btnStyle = 'border-white/20 bg-raised text-primary-text';
                                }

                                return (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => setCurrentQuestionIdx(idx)}
                                        className={`h-8 rounded border font-mono text-xs flex items-center justify-center transition-colors cursor-pointer ${btnStyle}`}
                                    >
                                        {idx + 1}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Docked Sensor Camera at Bottom */}
                    {!isMobile && (
                        <div className="p-4 border-t border-white/8 bg-deep">
                            <WebcamProctor
                                session_id={sessionId}
                                exam_id={id as string}
                                onAlert={setAlerts}
                                active={started}
                            />
                        </div>
                    )}
                </aside>

                {/* Central Question Workspace */}
                <main className="flex-1 h-full overflow-y-auto p-6 md:p-12 flex flex-col items-center justify-center">
                    <div className="w-full max-w-2xl space-y-6">
                        {currentQuestion && (
                            <div className="rounded-xl border border-white/8 bg-card p-6 sm:p-8 space-y-6 shadow-lg">
                                <div className="flex justify-between items-center text-xs font-mono text-muted-text pb-3 border-b border-white/6">
                                    <span>QUESTION {currentQuestionIdx + 1} OF {exam?.questions?.length || 0}</span>
                                    {answers[currentQuestionIdx] !== undefined ? (
                                        <span className="text-semantic-positive flex items-center gap-1">
                                            <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                                            <span>Answer saved</span>
                                        </span>
                                    ) : (
                                        <span>Not answered</span>
                                    )}
                                </div>

                                <h2 className="text-base sm:text-lg font-medium text-primary-text leading-relaxed">
                                    {currentQuestion.question}
                                </h2>

                                <div className="space-y-2.5">
                                    {currentQuestion.options?.map((opt: string, oIdx: number) => {
                                        const optLetter = String.fromCharCode(65 + oIdx);
                                        const isChecked = answers[currentQuestionIdx] === opt;

                                        return (
                                            <label
                                                key={oIdx}
                                                className={`flex items-center p-3.5 rounded-lg border text-xs sm:text-sm cursor-pointer transition-colors ${
                                                    isChecked
                                                        ? 'border-accent bg-accent/10 text-primary-text'
                                                        : 'border-white/8 bg-canvas text-secondary-text hover:border-white/20 hover:text-primary-text'
                                                }`}
                                            >
                                                <input
                                                    type="radio"
                                                    name={`q_${currentQuestionIdx}`}
                                                    value={opt}
                                                    checked={isChecked}
                                                    onChange={() => setAnswers({
                                                        ...answers, [currentQuestionIdx]: opt
                                                    })}
                                                    className="sr-only"
                                                />
                                                <span className={`w-5 h-5 rounded-full border flex items-center justify-center mr-3 font-mono text-[11px] shrink-0 ${
                                                    isChecked
                                                        ? 'border-accent bg-accent text-white font-medium'
                                                        : 'border-white/20 bg-raised text-muted-text'
                                                }`}>
                                                    {optLetter}
                                                </span>
                                                <span className="flex-1 leading-snug">{opt}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Navigation Controls */}
                        <div className="flex justify-between items-center pt-2">
                            <button
                                type="button"
                                onClick={() => setCurrentQuestionIdx(prev => Math.max(0, prev - 1))}
                                disabled={currentQuestionIdx === 0}
                                className="h-9 px-4 rounded-md border border-white/8 bg-card hover:bg-raised text-primary-text text-xs font-medium flex items-center gap-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                            >
                                <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
                                <span>Previous</span>
                            </button>

                            {currentQuestionIdx < (exam?.questions?.length || 0) - 1 ? (
                                <button
                                    type="button"
                                    onClick={() => setCurrentQuestionIdx(prev => prev + 1)}
                                    className="h-9 px-5 rounded-md bg-primary-text hover:bg-white text-canvas text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer"
                                >
                                    <span>Next</span>
                                    <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleSubmit}
                                    className="h-9 px-5 rounded-md bg-semantic-positive hover:opacity-90 text-canvas text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer"
                                >
                                    <span>Finish exam</span>
                                    <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
                                </button>
                            )}
                        </div>
                    </div>
                </main>

                {/* Mobile Floating Camera */}
                {isMobile && (
                    <div className="fixed bottom-4 right-4 z-40 w-44 shadow-2xl">
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
