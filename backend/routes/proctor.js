const express = require('express');
const axios   = require('axios');
const FormData = require('form-data');
const auth    = require('../middleware/auth');
const upload  = require('../middleware/upload');
const Flag    = require('../models/Flag');
const User    = require('../models/User');
const Exam    = require('../models/Exam');
const sequelize  = require('../models/index');
const { Op }     = require('sequelize');
const router  = express.Router();

// Heuristic flag-level AI verdict engine
function getFlagAiVerdict(alertType, detail = '') {
    const type = (alertType || '').toUpperCase();
    
    // Default low-risk unless matched
    let ai_verdict = 'LOW_RISK';
    let ai_reason = 'AI detected a minor event during monitoring.';

    if (type === 'TAB_SWITCH') {
        ai_verdict = 'SUSPICIOUS';
        ai_reason = 'Student switched browser tab or minimized window, indicating potential navigation away from the exam.';
    } else if (type === 'WINDOW_BLUR') {
        ai_verdict = 'SUSPICIOUS';
        ai_reason = 'Browser window lost focus. The student clicked outside the exam interface or opened an overlay.';
    } else if (type === 'FULLSCREEN_EXIT') {
        ai_verdict = 'HIGH_RISK';
        ai_reason = 'Student exited fullscreen mode, violating the exam configuration and integrity guidelines.';
    } else if (type === 'DEVTOOLS_OPENED') {
        ai_verdict = 'HIGH_RISK';
        ai_reason = 'Developer Tools opened. The student may be inspecting variables, injecting code, or bypassing checks.';
    } else if (type === 'SCREENSHARE_STOPPED') {
        ai_verdict = 'HIGH_RISK';
        ai_reason = 'Screen sharing was stopped or terminated by the student, preventing full screen activity monitoring.';
    } else if (type === 'SCREENSHARE_WINDOW_SHARED') {
        ai_verdict = 'HIGH_RISK';
        ai_reason = 'Student attempted to share a single window or tab instead of the required entire desktop screen.';
    } else if (type === 'META_KEY_PRESS') {
        ai_verdict = 'SUSPICIOUS';
        ai_reason = 'Windows/Command key pressed, which may launch external search/system shortcuts.';
    } else if (type === 'CLIPBOARD_ACTION') {
        ai_verdict = 'SUSPICIOUS';
        ai_reason = 'Copy, cut, or paste keyboard actions were blocked, violating response independence rules.';
    } else if (type === 'SHORTCUT_BLOCKED') {
        ai_verdict = 'SUSPICIOUS';
        ai_reason = 'Blocked system shortcut or hotkey combination (e.g. Save, Print, etc.).';
    } else if (type === 'EYES_CLOSED') {
        ai_verdict = 'LOW_RISK';
        ai_reason = 'Eyelid closure or prolonged blink detected by webcam facial analysis.';
    } else if (type.startsWith('GAZE_')) {
        const direction = type.split('_')[1] || 'SIDEWAYS';
        ai_verdict = 'SUSPICIOUS';
        ai_reason = `Student gaze detected looking ${direction.toLowerCase()} away from the center of the screen, indicating potential look-away towards external materials.`;
    } else if (type === 'NO_FACE') {
        ai_verdict = 'HIGH_RISK';
        ai_reason = 'No face detected in webcam feed. Student might have left the desk, blocked the camera, or obscured their face.';
    } else if (type === 'MULTIPLE_FACES') {
        ai_verdict = 'HIGH_RISK';
        ai_reason = 'Multiple faces detected in webcam feed. Another person is present or looking at the exam screen.';
    }

    return { ai_verdict, ai_reason };
}

// Heuristic session-level AI verdict aggregator
function calculateSessionVerdict(flags) {
    let highRiskCount = 0;
    let suspiciousCount = 0;
    let lowRiskCount = 0;
    let tabSwitches = 0;
    let gazeCount = 0;

    for (const flag of flags) {
        const verdict = flag.ai_verdict;
        const type = flag.alert_type;

        if (verdict === 'HIGH_RISK') {
            highRiskCount++;
        } else if (verdict === 'SUSPICIOUS') {
            suspiciousCount++;
            if (type === 'TAB_SWITCH' || type === 'WINDOW_BLUR') tabSwitches++;
            if (type.startsWith('GAZE_')) gazeCount++;
        } else {
            lowRiskCount++;
        }
    }

    let verdict = 'NORMAL';
    let reason = 'No major anomalies detected. Student behavior appears consistent with test guidelines.';

    if (highRiskCount > 0 || tabSwitches >= 3 || flags.length >= 6) {
        verdict = 'CRITICAL';
        const explanations = [];
        if (highRiskCount > 0) explanations.push(`${highRiskCount} high-risk trigger(s) (e.g., webcam face loss or DevTools)`);
        if (tabSwitches >= 3) explanations.push(`${tabSwitches} browser tab transitions/focus losses`);
        if (flags.length >= 6) explanations.push(`unusually high frequency of alerts (${flags.length} total events)`);
        
        reason = `CRITICAL RISK: Potential integrity compromise. Detected ${explanations.join(', and ')}. Manual audit recommended.`;
    } else if (suspiciousCount > 0 || flags.length >= 2) {
        verdict = 'SUSPICIOUS';
        const explanations = [];
        if (tabSwitches > 0) explanations.push(`switched browser focus ${tabSwitches} time(s)`);
        if (gazeCount > 0) explanations.push(`looked away from the screen ${gazeCount} time(s)`);
        if (flags.length >= 2 && explanations.length === 0) explanations.push(`multiple minor alerts (${flags.length} alerts)`);

        reason = `SUSPICIOUS: Minor anomalies observed. Student ${explanations.join(' and ')}. Check the timeline for details.`;
    } else if (flags.length === 1) {
        verdict = 'NORMAL';
        const label = flags[0].alert_type.replace(/_/g, ' ').toLowerCase();
        reason = `NORMAL: Clear overall behavior with a single minor alert (${label}).`;
    }

    return { verdict, reason };
}

router.post('/analyze', auth, upload.single('frame'), async (req, res) => {
    try {
        const { session_id, exam_id } = req.body;

        if (!req.file)
            return res.status(400).json({ error: 'No frame provided' });

        // Forward frame to FastAPI
        const form = new FormData();
        form.append('frame', req.file.buffer, {
            filename    : 'frame.jpg',
            contentType : 'image/jpeg'
        });
        form.append('session_id', session_id);

        const aiResponse = await axios.post(
            `${process.env.AI_SERVICE_URL}/analyze`,
            form,
            { headers: form.getHeaders() }
        );

        const result = aiResponse.data;

        // Save flags to PostgreSQL if any
        if (result.alerts && result.alerts.length > 0 && result.flag_saved) {
            const alertType = result.alerts[0];
            const detailStr = `gaze=${result.gaze} signal=${result.signal}`;
            const { ai_verdict, ai_reason } = getFlagAiVerdict(alertType, detailStr);

            await Flag.create({
                session_id,
                student_id : req.user.id,
                exam_id,
                alert_type : alertType,
                detail     : detailStr,
                ear_value  : result.ear,
                yaw_degrees: result.yaw,
                ai_verdict,
                ai_reason
            });
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/tab-switch', auth, async (req, res) => {
    try {
        const { session_id, exam_id } = req.body;
        const { ai_verdict, ai_reason } = getFlagAiVerdict('TAB_SWITCH');

        await Flag.create({
            session_id,
            student_id : req.user.id,
            exam_id,
            alert_type : 'TAB_SWITCH',
            detail     : 'Student switched tabs during exam',
            ai_verdict,
            ai_reason
        });
        res.json({ logged: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all proctoring sessions for examiner
router.get('/sessions', auth, async (req, res) => {
    try {
        if (req.user.role !== 'examiner')
            return res.status(403).json({ error: 'Examiners only' });

        // Get all flags grouped by session
        const flags = await Flag.findAll({
            order: [['createdAt', 'DESC']]
        });

        // Group by session_id
        const sessionMap = {};
        for (const flag of flags) {
            const sid = flag.session_id;
            if (!sessionMap[sid]) {
                // Get student info
                const student = await User.findByPk(flag.student_id, {
                    attributes: ['id', 'name', 'email']
                });
                // Get exam info
                const exam = await Exam.findByPk(flag.exam_id, {
                    attributes: ['id', 'title']
                });

                sessionMap[sid] = {
                    session_id   : sid,
                    student      : student,
                    exam         : exam,
                    flags        : [],
                    flagsCount   : 0,
                    latestFlagAt : flag.createdAt,
                    verdict      : null,
                    reason       : null
                };
            }
            sessionMap[sid].flags.push(flag);
            sessionMap[sid].flagsCount++;
        }

        // Compute verdict per session
        const sessions = Object.values(sessionMap).map((session) => {
            const count = session.flagsCount;
            const hasMultipleFaces = session.flags.some(
                (f) => f.alert_type === 'MULTIPLE_FACES'
            );
            const hasTabSwitch = session.flags.some(
                (f) => f.alert_type === 'TAB_SWITCH'
            );

            if (count >= 5 || hasMultipleFaces) {
                session.verdict = 'CRITICAL';
                session.reason  = 'Multiple serious violations detected including face or tab events.';
            } else if (count >= 2 || hasTabSwitch) {
                session.verdict = 'SUSPICIOUS';
                session.reason  = 'Some suspicious activity detected — manual review recommended.';
            } else {
                session.verdict = 'NORMAL';
                session.reason  = 'Normal session activity with minimal flags.';
            }

            return session;
        });

        res.json(sessions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all flags for a session
router.get('/flags/:session_id', auth, async (req, res) => {
    try {
        const flags = await Flag.findAll({
            where: { session_id: req.params.session_id }
        });
        res.json(flags);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/log-event', auth, async (req, res) => {
    try {
        const { session_id, exam_id, alert_type, detail } = req.body;
        if (!session_id || !exam_id || !alert_type) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        const { ai_verdict, ai_reason } = getFlagAiVerdict(alert_type, detail);

        await Flag.create({
            session_id,
            student_id : req.user.id,
            exam_id,
            alert_type,
            detail     : detail || '',
            ai_verdict,
            ai_reason
        });
        res.json({ logged: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;