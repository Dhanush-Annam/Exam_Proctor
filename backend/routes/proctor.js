const express = require('express');
const axios   = require('axios');
const FormData = require('form-data');
const auth    = require('../middleware/auth');
const upload  = require('../middleware/upload');
const Flag    = require('../models/Flag');
const User    = require('../models/User');
const Exam    = require('../models/Exam');
const Submission = require('../models/Submission');
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

        // Save flags to PostgreSQL if any (processes all alerts logged)
        if (result.alerts && result.alerts.length > 0 && result.flag_saved) {
            for (const alertType of result.alerts) {
                const detailStr = `gaze=${result.gaze} signal=${result.signal}`;
                const { ai_verdict, ai_reason } = getFlagAiVerdict(alertType, detailStr);

                // Find matching saved flag from AI service to get the image_path
                const matchingFlag = result.saved_flags && result.saved_flags.find(f => f.alert_type === alertType);
                const imagePath = matchingFlag ? matchingFlag.image_path : null;

                await Flag.create({
                    session_id,
                    student_id : req.user.id,
                    exam_id,
                    alert_type : alertType,
                    detail     : detailStr,
                    ear_value  : result.ear,
                    yaw_degrees: result.yaw,
                    image_path : imagePath,
                    ai_verdict,
                    ai_reason
                });
            }
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all proctoring sessions for examiner
router.get('/sessions', auth, async (req, res) => {
    try {
        if (req.user.role !== 'examiner')
            return res.status(403).json({ error: 'Examiners only' });

        // Get exams created by this examiner
        const myExams = await Exam.findAll({
            where: { created_by: req.user.id },
            attributes: ['id']
        });
        const myExamIds = myExams.map(e => e.id);

        // Get all submissions for these exams (representing all student test attempts)
        const submissions = await Submission.findAll({
            where: { exam_id: { [Op.in]: myExamIds } },
            include: [
                { model: User, as: 'student', attributes: ['id', 'name', 'email'] },
                { model: Exam, as: 'exam', attributes: ['id', 'title'] }
            ],
            order: [['submitted_at', 'DESC']]
        });

        const sessionIds = submissions.map(s => s.session_id);

        // Get all flags for these sessions in bulk
        const flags = await Flag.findAll({
            where: { session_id: { [Op.in]: sessionIds } },
            order: [['createdAt', 'DESC']]
        });

        // Group flags by session_id
        const flagsMap = {};
        for (const flag of flags) {
            const sid = flag.session_id;
            if (!flagsMap[sid]) {
                flagsMap[sid] = [];
            }
            flagsMap[sid].push(flag);
        }

        // Construct session objects with status determined by Gemini AI verdicts
        const sessions = submissions.map((sub) => {
            const sessionFlags = flagsMap[sub.session_id] || [];
            
            // Filter flags that are NOT false alarms
            const activeFlags = sessionFlags.filter(f => f.ai_verdict !== 'FALSE_ALARM');
            
            const hasHighRisk = activeFlags.some(f => f.ai_verdict === 'HIGH_RISK');
            const hasSuspicious = activeFlags.some(f => f.ai_verdict === 'SUSPICIOUS');
            
            let verdict = 'NORMAL';
            let reason = 'Normal session activity with minimal alerts.';

            if (hasHighRisk || activeFlags.length >= 5) {
                verdict = 'CRITICAL';
                reason = `CRITICAL RISK: Detected ${activeFlags.filter(f => f.ai_verdict === 'HIGH_RISK').length} high-risk violation(s).`;
            } else if (hasSuspicious || activeFlags.length >= 2) {
                verdict = 'SUSPICIOUS';
                reason = `SUSPICIOUS: Minor or ambiguous anomalies observed during student review.`;
            }

            return {
                session_id   : sub.session_id,
                student      : sub.student,
                exam         : sub.exam,
                flags        : sessionFlags, // Return all flags for detailed timeline
                flagsCount   : sessionFlags.length,
                latestFlagAt : sessionFlags.length > 0 ? sessionFlags[0].createdAt : sub.submitted_at,
                verdict      : verdict,
                reason       : reason
            };
        });

        res.json(sessions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Callback webhook for FastAPI asynchronously completed review
router.post('/session/:session_id/review-complete', async (req, res) => {
    try {
        const { session_id } = req.params;
        const { flags } = req.body;
        
        if (flags && Array.isArray(flags)) {
            for (const flag of flags) {
                if (flag.image_path) {
                    await Flag.update(
                        {
                            ai_verdict: flag.ai_verdict,
                            ai_reason: flag.ai_reason
                        },
                        {
                            where: {
                                session_id,
                                image_path: flag.image_path
                            }
                        }
                    );
                }
            }
        }
        res.json({ success: true, message: 'Verdicts successfully updated' });
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

        if (flags.length > 0) {
            if (req.user.role === 'examiner') {
                const exam = await Exam.findByPk(flags[0].exam_id);
                if (exam && exam.created_by !== req.user.id) {
                    return res.status(403).json({ error: 'Unauthorized to view flags for this session' });
                }
            } else if (req.user.role === 'student') {
                if (flags[0].student_id !== req.user.id) {
                    return res.status(403).json({ error: 'Unauthorized to view flags for this session' });
                }
            }
        }
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