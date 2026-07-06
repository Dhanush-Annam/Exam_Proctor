'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getExam, submitExam }              from '@/lib/api';
import WebcamProctor            from '@/components/WebcamProctor';
import ExamTimer                from '@/components/ExamTimer';
import AlertBanner              from '@/components/AlertBanner';

export default function ExamPage() {
    const router   = useRouter();
    const { id }   = useParams();

    const [exam, setExam]             = useState<any>(null);
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading]       = useState(true);
    const [started, setStarted]       = useState(false);
    const [submitted, setSubmitted]   = useState(false);
    const [answers, setAnswers]       = useState<Record<number, string>>({});
    const [alerts, setAlerts]         = useState<string[]>([]);
    const [sessionId, setSessionId]   = useState('');
    const [user, setUser]             = useState<any>(null);

    const screenStreamRef = useRef<MediaStream | null>(null);

    useEffect(() => {
        const stored = localStorage.getItem('user');
        if (!stored) { router.push('/login'); return; }
        setUser(JSON.parse(stored));

        const sid = `session_${Date.now()}`;
        setSessionId(sid);

        getExam(id as string)
            .then(res => setExam(res.data))
            .catch(() => router.push('/exam'))
            .finally(() => setLoading(false));
    }, []);

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
                method  : 'POST',
                headers : {
                    'Content-Type'  : 'application/json',
                    'Authorization' : `Bearer ${localStorage.getItem('token')}`
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
            const threshold = 160; // minimum width/height for devtools docked panel
            const widthDiff = window.outerWidth - window.innerWidth;
            const heightDiff = window.outerHeight - window.innerHeight;

            // In fullscreen mode, the outer and inner window dimensions should be very close.
            // If they differ by more than the threshold, DevTools is likely open.
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
            // This statement pauses javascript execution if DevTools is open
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

    // Advanced Keyboard Interceptors & Clipboard Action logging
    useEffect(() => {
        if (!started || submitted) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const isMac = typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

            // 1. Detect Meta Key (Windows/Cmd)
            if (e.key === 'Meta') {
                e.preventDefault();
                logFlag('META_KEY_PRESS', 'Windows/Command key pressed');
                return;
            }

            // 2. DevTools F12 Shortcut
            if (e.key === 'F12') {
                e.preventDefault();
                logFlag('DEVTOOLS_OPENED', 'F12 key pressed (Developer Tools)');
                return;
            }

            // 3. DevTools Combos (Inspect / Console / Selector)
            const isInspectKey = e.key.toLowerCase() === 'i' || e.key.toLowerCase() === 'j' || e.key.toLowerCase() === 'c';
            const isInspectShortcut = (e.ctrlKey && e.shiftKey && isInspectKey) || (e.metaKey && e.altKey && isInspectKey);
            if (isInspectShortcut) {
                e.preventDefault();
                logFlag('DEVTOOLS_OPENED', `DevTools key shortcut detected: Ctrl/Cmd + Shift + ${e.key.toUpperCase()}`);
                return;
            }

            // 4. View Source (Ctrl+U / Cmd+Opt+U)
            if ((e.ctrlKey && e.key.toLowerCase() === 'u') || (e.metaKey && e.altKey && e.key.toLowerCase() === 'u')) {
                e.preventDefault();
                logFlag('DEVTOOLS_OPENED', 'View source key shortcut detected');
                return;
            }

            // 5. Clipboard actions via key combinations (Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A)
            const isClipboardKey = e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'v' || e.key.toLowerCase() === 'x' || e.key.toLowerCase() === 'a';
            const isClipboardShortcut = (e.ctrlKey && isClipboardKey) || (e.metaKey && isClipboardKey);
            if (isClipboardShortcut) {
                e.preventDefault();
                logFlag('CLIPBOARD_ACTION', `Prohibited shortcut key combination blocked: Ctrl/Cmd + ${e.key.toUpperCase()}`);
                return;
            }

            // 6. Print / Save shortcuts (Ctrl+P, Ctrl+S)
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
            // 1. Request screenshare
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    displaySurface: 'monitor'
                } as any
            });

            // 2. Validate that they shared their entire monitor (not window/tab)
            const track = stream.getVideoTracks()[0];
            const settings = track.getSettings();
            if (settings.displaySurface && settings.displaySurface !== 'monitor') {
                stream.getTracks().forEach(t => t.stop());
                logFlag('SCREENSHARE_WINDOW_SHARED', 'Attempted to share single window/tab instead of full screen');
                alert('You MUST share your ENTIRE screen to start the exam. Please try again and select the whole screen.');
                return;
            }

            screenStreamRef.current = stream;

            // 3. Listen for screenshare stop
            track.onended = () => {
                logFlag('SCREENSHARE_STOPPED', 'Screenshare session terminated by the student');
            };

            // 4. Request fullscreen
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
        // Clean up screen share stream
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

    const handleTimeUp = () => {
        handleSubmit();
    };

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center">
            <p className="text-gray-500">Loading exam...</p>
        </div>
    );

    if (submitted) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="bg-white rounded-2xl p-10 shadow text-center max-w-md">
                <div className="text-5xl mb-4">✅</div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">
                    Exam Submitted
                </h2>
                {result && (
                    <div className="bg-indigo-50 rounded-xl p-6 mb-6">
                        <p className="text-4xl font-bold text-indigo-700 mb-1">
                            {result.score?.toFixed(1)}%
                        </p>
                        <p className="text-gray-600 text-sm">
                            {result.correct_answers} / {result.total_questions} correct
                        </p>
                        {result.total_flags > 0 && (
                            <p className="text-red-500 text-sm mt-2">
                                ⚠️ {result.total_flags} suspicious events flagged
                            </p>
                        )}
                    </div>
                )}
                <button
                    onClick={() => router.push('/exam')}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg
                            hover:bg-indigo-700 transition">
                    Back to Exams
                </button>
            </div>
        </div>
    );

    if (!started) return (
        <div className="min-h-screen flex items-center justify-center
                        bg-gray-50">
            <div className="bg-white rounded-2xl p-10 shadow max-w-md
                            w-full text-center">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">
                    {exam?.title}
                </h2>
                <p className="text-gray-500 mb-2">
                    Duration: {exam?.duration_minutes} minutes
                </p>
                <p className="text-gray-500 mb-6">
                    Questions: {exam?.questions?.length || 0}
                </p>

                <div className="bg-yellow-50 border border-yellow-200
                                rounded-lg p-4 mb-6 text-sm text-yellow-800
                                text-left">
                    <p className="font-semibold mb-2">⚠️ Before you start:</p>
                    <ul className="space-y-1 list-disc list-inside">
                        <li>Allow camera access when prompted</li>
                        <li>Stay in frame throughout the exam</li>
                        <li>Do not switch tabs or open other windows</li>
                        <li>Ensure good lighting on your face</li>
                        <li>No other person should be visible</li>
                    </ul>
                </div>

                <button
                    onClick={handleStart}
                    className="w-full py-3 bg-indigo-600 text-white rounded-lg
                               font-semibold hover:bg-indigo-700 transition">
                    Start Exam
                </button>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50">
            <AlertBanner
                alerts={alerts}
                onClear={() => setAlerts([])}
            />

            {/* Top bar */}
            <div className="bg-white border-b border-gray-200 px-6 py-3
                            flex justify-between items-center sticky top-0
                            z-40">
                <h1 className="font-semibold text-gray-800">{exam?.title}</h1>
                <ExamTimer
                    duration_minutes={exam?.duration_minutes || 60}
                    onTimeUp={handleTimeUp}
                />
                <button
                    onClick={handleSubmit}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg
                               text-sm font-medium hover:bg-indigo-700
                               transition">
                    Submit Exam
                </button>
            </div>

            <div className="max-w-4xl mx-auto p-6 flex gap-6">
                {/* Questions */}
                <div className="flex-1 space-y-6">
                    {exam?.questions?.map((q: any, i: number) => (
                        <div key={i}
                             className="bg-white rounded-xl p-6 shadow-sm">
                            <p className="font-medium text-gray-800 mb-4">
                                {i + 1}. {q.question}
                            </p>
                            <div className="space-y-2">
                                {q.options?.map((opt: string, j: number) => (
                                    <label key={j}
                                           className="flex items-center gap-3
                                                      cursor-pointer group">
                                        <input
                                            type="radio"
                                            name={`q_${i}`}
                                            value={opt}
                                            checked={answers[i] === opt}
                                            onChange={() => setAnswers({
                                                ...answers, [i]: opt
                                            })}
                                            className="text-indigo-600"
                                        />
                                        <span className="text-gray-700
                                                         group-hover:text-indigo-600
                                                         transition text-sm">
                                            {opt}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Webcam sidebar */}
                <div className="w-56 sticky top-20 h-fit">
                    <div className="bg-white rounded-xl p-4 shadow-sm">
                        <p className="text-xs font-medium text-gray-600 mb-3
                                      text-center">
                            Proctoring Active
                        </p>
                        <WebcamProctor
                            session_id={sessionId}
                            exam_id={id as string}
                            onAlert={setAlerts}
                            active={started}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}