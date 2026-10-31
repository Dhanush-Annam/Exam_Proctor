'use client';
import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface Props {
    readonly duration_minutes: number;
    readonly onTimeUp: () => void;
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
    }, [onTimeUp]);

    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const isLow = seconds < 300; // last 5 minutes

    return (
        <div
            className={`h-9 px-3 rounded-md font-mono text-xs flex items-center gap-2 border transition-colors ${
                isLow
                    ? 'border-semantic-negative/40 bg-semantic-negative/10 text-semantic-negative'
                    : 'border-white/8 bg-card text-primary-text'
            }`}
        >
            <Clock className={`w-3.5 h-3.5 ${isLow ? 'text-semantic-negative' : 'text-muted-text'}`} strokeWidth={1.5} />
            <span className="tabular-nums font-medium tracking-wider">
                {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </span>
            {isLow && (
                <span className="text-[10px] font-sans uppercase tracking-wider text-semantic-negative ml-1">
                    Low time
                </span>
            )}
        </div>
    );
}
