'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, ShieldCheck, ShieldAlert } from 'lucide-react';
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

    const [status, setStatus] = useState<string>('Initializing sensor...');
    const [faceOk, setFaceOk] = useState<boolean>(true);
    const [hasCamera, setHasCamera] = useState<boolean>(false);

    // Start webcam
    useEffect(() => {
        if (!active) return;

        navigator.mediaDevices.getUserMedia({ video: true })
            .then(stream => {
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
                setHasCamera(true);
                setStatus('Sensor active • Calibrated');
            })
            .catch(() => {
                setHasCamera(false);
                setStatus('Camera access denied');
            });

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

                    const singleFace = data.face_count === 1;
                    setFaceOk(singleFace);

                    if (data.face_count === 0) {
                        setStatus('No face detected');
                    } else if (data.face_count > 1) {
                        setStatus('Multiple faces in frame');
                    } else if (data.gaze && data.gaze !== 'CENTER') {
                        setStatus(`Gaze diverted: ${data.gaze.toLowerCase()}`);
                    } else {
                        setStatus('Verified in frame');
                    }

                    if (data.alerts && data.alerts.length > 0) {
                        onAlert(data.alerts);
                    }
                } catch {
                    // silently fail on network errors
                }
            }, 'image/jpeg', 0.8);
        }, 2000);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [active, session_id, exam_id, onAlert]);

    return (
        <div className="w-full rounded-lg overflow-hidden border border-white/8 bg-card flex flex-col">
            {/* Camera Feed Container */}
            <div className="relative h-44 bg-deep w-full overflow-hidden flex items-center justify-center">
                <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover grayscale-20"
                />
                <canvas ref={canvasRef} className="hidden" />

                {!hasCamera && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-text bg-deep">
                        <Camera className="w-5 h-5 text-muted-text" strokeWidth={1.5} />
                        <span className="text-xs font-mono">Camera feed standby</span>
                    </div>
                )}

                {/* Face Alignment Frame Guide (Technical Moment) */}
                <div className="absolute inset-4 pointer-events-none border border-dashed border-white/20 rounded-md flex items-start justify-between p-1.5 text-[9px] font-mono text-white/40">
                    <span>SENSOR_01</span>
                    <span>640x480</span>
                </div>

                {/* Status Indicator */}
                <div className="absolute top-2.5 right-2.5 bg-deep/90 border border-white/8 px-2 py-0.5 rounded text-[11px] font-mono flex items-center gap-1.5">
                    <span
                        className={`w-1.5 h-1.5 rounded-full ${
                            faceOk ? 'bg-semantic-positive' : 'bg-semantic-negative'
                        }`}
                    />
                    <span className={faceOk ? 'text-primary-text' : 'text-semantic-negative'}>
                        {faceOk ? 'FEED_LIVE' : 'FLAGGED'}
                    </span>
                </div>
            </div>

            {/* Widget Footer Telemetry */}
            <div className="px-3 py-2 bg-canvas border-t border-white/8 flex items-center justify-between text-xs font-mono text-secondary-text">
                <div className="flex items-center gap-1.5 truncate">
                    {faceOk ? (
                        <ShieldCheck className="w-3.5 h-3.5 text-semantic-positive shrink-0" strokeWidth={1.5} />
                    ) : (
                        <ShieldAlert className="w-3.5 h-3.5 text-semantic-negative shrink-0" strokeWidth={1.5} />
                    )}
                    <span className="text-[11px] truncate text-primary-text">{status}</span>
                </div>
                <span className="text-[10px] text-muted-text shrink-0 ml-2">2.0s</span>
            </div>
        </div>
    );
}
