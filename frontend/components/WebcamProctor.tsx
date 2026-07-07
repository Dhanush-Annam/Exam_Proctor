'use client';
import { useEffect, useRef, useState } from 'react';
import { analyzeFrame } from '@/lib/api';
import { connectSocket, disconnectSocket } from '@/lib/socket';

export interface WebcamProctorProps {
    readonly session_id: string;
    readonly exam_id: string;
    readonly onAlert: (alerts: string[]) => void;
    readonly active: boolean;
}

export default function WebcamProctor({
    session_id, exam_id, onAlert, active
}: WebcamProctorProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    const [status, setStatus] = useState<string>('Initializing...');
    const [faceOk, setFaceOk] = useState<boolean>(true);

    // Start webcam
    useEffect(() => {
        if (!active) return;

        navigator.mediaDevices.getUserMedia({ video: true })
            .then(stream => {
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
                setStatus('Proctoring active');
            })
            .catch(() => setStatus('Camera access denied'));

        // Connect WebSocket
        const socket = connectSocket(session_id);
        socket.on('proctor_alert', (data: any) => {
            onAlert(data.alerts);
        });

        return () => {
            streamRef.current?.getTracks().forEach(t => t.stop());
            disconnectSocket();
        };
    }, [active, session_id, onAlert]);

    // Capture and send frames every 2 seconds
    useEffect(() => {
        if (!active) return;

        intervalRef.current = setInterval(async () => {
            if (!videoRef.current || !canvasRef.current) return;

            const canvas = canvasRef.current;
            const video = videoRef.current;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            canvas.width = 640;
            canvas.height = 480;
            ctx.drawImage(video, 0, 0, 640, 480);

            canvas.toBlob(async (blob) => {
                if (!blob) return;
                try {
                    const form = new FormData();
                    form.append('frame', blob, 'frame.jpg');
                    form.append('session_id', session_id);
                    form.append('exam_id', exam_id);

                    const res = await analyzeFrame(form);
                    const data = res.data;

                    setFaceOk(data.face_count === 1);
                    setStatus(
                        data.face_count === 0 ? '🔴 No face detected' :
                            data.face_count > 1 ? '🔴 Multiple faces' :
                                data.gaze !== 'CENTER' ? `🟡 Looking ${data.gaze}` :
                                    '🟢 All clear'
                    );

                    if (data.alerts && data.alerts.length > 0) {
                        onAlert(data.alerts);
                    }
                } catch {
                    // silently fail on network errors
                }
            }, 'image/jpeg', 0.8);
        }, 2000); // every 2 seconds

        return () => {
            if (intervalRef.current)
                clearInterval(intervalRef.current);
        };
    }, [active, session_id, exam_id, onAlert]);

    return (
        <div className="w-full glass-card bg-surface-container-lowest/80 rounded-xl overflow-hidden shadow-2xl border border-outline-variant/40 transition-transform duration-300 hover:scale-[1.02] group flex flex-col">
            {/* Camera Feed Container */}
            <div className="relative h-48 bg-black w-full overflow-hidden flex items-center justify-center">
                <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />


                {/* Status Ribbon (Green Pulsing when healthy, Red when alert) */}
                <div className="absolute top-3 right-3 bg-slate-950/70 backdrop-blur-md border border-outline-variant/30 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                    <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${faceOk
                            ? 'bg-success shadow-[0_0_5px_#10b981]'
                            : 'bg-error shadow-[0_0_5px_#ef4444]'
                        }`}></span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${faceOk ? 'text-success' : 'text-error'
                        }`}>
                        {faceOk ? 'Monitoring' : 'Flagged'}
                    </span>
                </div>


            </div>

            {/* Widget Footer */}
            <div className="px-3.5 py-3 bg-surface-container flex flex-col gap-1.5 border-t border-outline-variant/20">
                <p className="text-[12px] font-medium text-slate-400 truncate">
                    {status}
                </p>
            </div>
        </div>
    );
}