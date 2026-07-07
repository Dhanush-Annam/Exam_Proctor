'use client';

export interface AlertBannerProps {
    readonly alerts: readonly string[];
    readonly onClear: () => void;
}

const ALERT_MESSAGES: Record<string, string> = {
    GAZE_LEFT: 'Please look at the screen — gaze detected left',
    GAZE_RIGHT: 'Please look at the screen — gaze detected right',
    EYES_CLOSED: 'Please keep your eyes open',
    NO_FACE: 'Face not detected — please stay in frame',
    MULTIPLE_FACES: 'Multiple faces detected — only you should be visible',
    FULLSCREEN_EXIT: 'Fullscreen exited — please stay in exam mode',
    TAB_SWITCH: 'Tab switch detected — this has been flagged',
    WINDOW_BLUR: 'Window lost focus — please stay on exam',
    META_KEY_PRESS: 'System key (Windows/Cmd) press detected — this has been flagged',
    DEVTOOLS_OPENED: 'Developer tools usage detected — this has been flagged',
    SCREENSHARE_STOPPED: 'Screensharing stopped — screenshare must be active at all times',
    SCREENSHARE_WINDOW_SHARED: 'Entire screen share is required — please share your full screen',
    CLIPBOARD_ACTION: 'Clipboard action (copy/paste/cut/select-all) detected — this has been flagged',
    SHORTCUT_BLOCKED: 'Prohibited system shortcut blocked — this has been flagged',
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

    // Choice of styling: high-contrast dark backgrounds with relative status border lights
    const containerClasses = hasCritical
        ? 'border-red-500/50 shadow-red-950/20'
        : 'border-amber-500/50 shadow-amber-950/20';

    const headerText = hasCritical ? 'Critical Security Violation' : 'Suspicious Activity Detected';
    const headerColor = hasCritical ? 'text-red-400' : 'text-amber-400';
    const icon = hasCritical ? '🚨' : '⚠️';
    const buttonClasses = hasCritical
        ? 'bg-red-500/20 hover:bg-red-500 hover:text-white text-red-200 border-red-500/30'
        : 'bg-amber-500/20 hover:bg-amber-500 hover:text-slate-950 text-amber-200 border-amber-500/30';

    return (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border backdrop-blur-md rounded-2xl p-5 shadow-2xl max-w-md w-full mx-4 transition-all duration-300 ${containerClasses}`}>
            <div className="flex gap-4">
                <span className="text-2xl shrink-0 mt-0.5 select-none">{icon}</span>
                <div className="flex-1 min-w-0">
                    <h3 className={`font-bold text-sm leading-snug ${headerColor}`}>{headerText}</h3>
                    <div className="mt-2.5 space-y-1.5 max-h-36 overflow-y-auto pr-1 scrollbar-thin">
                        {alerts.map((alert, i) => (
                            <p key={i} className="text-xs text-slate-200 leading-relaxed font-medium">
                                • {ALERT_MESSAGES[alert] || alert}
                            </p>
                        ))}
                    </div>
                </div>
            </div>
            <div className="mt-4 flex justify-end">
                <button
                    onClick={onClear}
                    className={`text-xs font-bold px-4 py-2 rounded-xl border transition-all cursor-pointer ${buttonClasses}`}
                >
                    Dismiss Alerts
                </button>
            </div>
        </div>
    );
}