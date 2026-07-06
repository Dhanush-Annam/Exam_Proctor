'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { analyzeFrame }  from '@/lib/api';
import { connectSocket, disconnectSocket } from '@/lib/socket';

interface Props {
    session_id : string;
    exam_id    : string;
    onAlert    : (alerts: string[]) => void;
    active     : boolean;
}

export default function WebcamProctor({
    session_id, exam_id, onAlert, active
}: Props) {
    const videoRef       = useRef<HTMLVideoElement>(null);
    const canvasRef      = useRef<HTMLCanvasElement>(null);
    const streamRef      = useRef<MediaStream | null>(null);
    const intervalRef    = useRef<NodeJS.Timeout | null>(null);

    const [status, setStatus]   = useState<string>('Initializing...');
    const [faceOk, setFaceOk]   = useState<boolean>(true);

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
    }, [active]);

    // Capture and send frames every 2 seconds
    useEffect(() => {
        if (!active) return;

        intervalRef.current = setInterval(async () => {
            if (!videoRef.current || !canvasRef.current) return;

            const canvas  = canvasRef.current;
            const video   = videoRef.current;
            const ctx     = canvas.getContext('2d');
            if (!ctx) return;

            canvas.width  = 640;
            canvas.height = 480;
            ctx.drawImage(video, 0, 0, 640, 480);

            canvas.toBlob(async (blob) => {
                if (!blob) return;
                try {
                    const form = new FormData();
                    form.append('frame',      blob, 'frame.jpg');
                    form.append('session_id', session_id);
                    form.append('exam_id',    exam_id);

                    const res = await analyzeFrame(form);
                    const data = res.data;

                    setFaceOk(data.face_count === 1);
                    setStatus(
                        data.face_count === 0 ? '🔴 No face detected' :
                        data.face_count > 1   ? '🔴 Multiple faces'   :
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
    }, [active, session_id, exam_id]);

    return (
        <div className="flex flex-col items-center gap-2">
            <div className="relative">
                <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-48 h-36 rounded-lg object-cover border-2
                               border-indigo-200 bg-black"
                />
                <canvas ref={canvasRef} className="hidden" />
                <div className={`absolute bottom-1 left-1 right-1 text-center
                                 text-xs py-0.5 rounded
                                 ${faceOk ? 'bg-green-500' : 'bg-red-500'}
                                 text-white`}>
                    {faceOk ? '● Proctoring' : '● Alert'}
                </div>
            </div>
            <p className="text-xs text-gray-500 text-center max-w-48">
                {status}
            </p>
        </div>
    );
}