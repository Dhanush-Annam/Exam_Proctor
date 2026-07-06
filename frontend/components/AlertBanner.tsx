'use client';

interface Props {
    alerts  : string[];
    onClear : () => void;
}

const ALERT_MESSAGES: Record<string, string> = {
    GAZE_LEFT      : '⚠️ Please look at the screen — gaze detected left',
    GAZE_RIGHT     : '⚠️ Please look at the screen — gaze detected right',
    EYES_CLOSED    : '⚠️ Please keep your eyes open',
    NO_FACE        : '⚠️ Face not detected — please stay in frame',
    MULTIPLE_FACES : '🚨 Multiple faces detected — only you should be visible',
    FULLSCREEN_EXIT : '🚨 Fullscreen exited — please stay in exam mode',
    TAB_SWITCH : '🚨 Tab switch detected — this has been flagged',
    WINDOW_BLUR : '🚨 Window lost focus — please stay on exam',
    META_KEY_PRESS  : '🚨 System key (Windows/Cmd) press detected — this has been flagged',
    DEVTOOLS_OPENED : '🚨 Developer tools usage detected — this has been flagged',
    SCREENSHARE_STOPPED : '🚨 Screensharing stopped — screenshare must be active at all times',
    SCREENSHARE_WINDOW_SHARED : '🚨 Entire screen share is required — please share your full screen',
    CLIPBOARD_ACTION : '🚨 Clipboard action (copy/paste/cut/select-all) detected — this has been flagged',
    SHORTCUT_BLOCKED : '🚨 Prohibited system shortcut blocked — this has been flagged',
};

export default function AlertBanner({ alerts, onClear }: Props) {
    if (alerts.length === 0) return null;

    return (
        <div className="alert-pulse fixed top-4 left-1/2 -translate-x-1/2
                        z-50 bg-red-100 border border-red-400 rounded-xl
                        px-6 py-4 shadow-lg max-w-lg w-full mx-4">
            {alerts.map((alert, i) => (
                <p key={i} className="text-red-700 font-medium text-sm">
                    {ALERT_MESSAGES[alert] || `⚠️ ${alert}`}
                </p>
            ))}
            <button
                onClick={onClear}
                className="mt-2 text-xs text-red-500 hover:text-red-700
                           underline">
                Dismiss
            </button>
        </div>
    );
}