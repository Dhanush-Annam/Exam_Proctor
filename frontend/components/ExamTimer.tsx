'use client';
import { useEffect, useState } from 'react';

interface Props {
    duration_minutes : number;
    onTimeUp         : () => void;
}

export default function ExamTimer({ duration_minutes, onTimeUp }: Props) {
    const [seconds, setSeconds] = useState(duration_minutes * 60);

    useEffect(() => {
        const interval = setInterval(() => {
            setSeconds(prev => {
                if (prev <= 1) {
                    clearInterval(interval);
                    onTimeUp();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const isLow = seconds < 300; // last 5 minutes

    return (
        <div className={`px-4 py-2 rounded-lg font-mono font-bold text-lg
                        ${isLow
                            ? 'bg-red-100 text-red-600'
                            : 'bg-indigo-100 text-indigo-700'}`}>
            ⏱ {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </div>
    );
}