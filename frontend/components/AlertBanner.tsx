'use client';
import { AlertOctagon, AlertTriangle, X } from 'lucide-react';

export interface AlertBannerProps {
    readonly alerts: readonly string[];
    readonly onClear: () => void;
}

const ALERT_MESSAGES: Record<string, string> = {
    GAZE_LEFT: 'Gaze diverted left — return attention to screen',
    GAZE_RIGHT: 'Gaze diverted right — return attention to screen',
    EYES_CLOSED: 'Eyes not visible or closed',
    NO_FACE: 'Face not detected in frame',
    MULTIPLE_FACES: 'Multiple faces detected in frame',
    FULLSCREEN_EXIT: 'Full-screen mode exited',
    TAB_SWITCH: 'Browser tab or window changed',
    WINDOW_BLUR: 'Exam window lost focus',
    META_KEY_PRESS: 'System key shortcut intercepted',
    DEVTOOLS_OPENED: 'Developer tools panel detected',
    SCREENSHARE_STOPPED: 'Display sharing terminated',
    SCREENSHARE_WINDOW_SHARED: 'Full-screen capture required instead of window capture',
    CLIPBOARD_ACTION: 'Clipboard shortcut intercepted',
    SHORTCUT_BLOCKED: 'Prohibited browser key combination intercepted',
};

const CRITICAL_ALERTS = new Set([
    'MULTIPLE_FACES',
    'FULLSCREEN_EXIT',
    'TAB_SWITCH',
    'WINDOW_BLUR',
    'META_KEY_PRESS',
    'DEVTOOLS_OPENED',
    'SCREENSHARE_STOPPED',
    'SCREENSHARE_WINDOW_SHARED',
    'CLIPBOARD_ACTION',
    'SHORTCUT_BLOCKED',
]);

export default function AlertBanner({ alerts, onClear }: AlertBannerProps) {
    if (alerts.length === 0) return null;

    const hasCritical = alerts.some(alert => CRITICAL_ALERTS.has(alert));

    return (
        <div
            className={`w-full border-b px-6 py-2.5 flex items-center justify-between text-xs z-40 transition-colors ${
                hasCritical
                    ? 'bg-semantic-negative/10 border-semantic-negative/30 text-semantic-negative'
                    : 'bg-semantic-warning/10 border-semantic-warning/30 text-semantic-warning'
            }`}
        >
            <div className="flex items-center gap-3 min-w-0">
                {hasCritical ? (
                    <AlertOctagon className="w-4 h-4 shrink-0 text-semantic-negative" strokeWidth={1.5} />
                ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 text-semantic-warning" strokeWidth={1.5} />
                )}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium tracking-wide uppercase text-[10px] bg-black/30 px-1.5 py-0.5 rounded-md border border-current/20">
                        {hasCritical ? 'Critical security event' : 'Suspicious telemetry'}
                    </span>
                    <span className="text-primary-text truncate">
                        {alerts.map(a => ALERT_MESSAGES[a] || a).join(' • ')}
                    </span>
                </div>
            </div>

            <button
                type="button"
                onClick={onClear}
                className="ml-4 shrink-0 p-1 rounded hover:bg-white/10 text-current transition-colors cursor-pointer"
                aria-label="Dismiss alert"
            >
                <X className="w-4 h-4" strokeWidth={1.5} />
            </button>
        </div>
    );
}
