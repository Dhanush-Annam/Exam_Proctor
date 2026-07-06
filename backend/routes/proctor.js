const express = require('express');
const axios   = require('axios');
const FormData = require('form-data');
const auth    = require('../middleware/auth');
const upload  = require('../middleware/upload');
const Flag    = require('../models/Flag');
const User    = require('../models/User');
const Exam    = require('../models/Exam');
const router  = express.Router();

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
            await Flag.create({
                session_id,
                student_id : req.user.id,
                exam_id,
                alert_type : result.alerts[0],
                detail     : `gaze=${result.gaze} signal=${result.signal}`,
                ear_value  : result.ear,
                yaw_degrees: result.yaw
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
        await Flag.create({
            session_id,
            student_id : req.user.id,
            exam_id,
            alert_type : 'TAB_SWITCH',
            detail     : 'Student switched tabs during exam'
        });
        res.json({ logged: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all flagged proctoring sessions (examiner only)
router.get('/sessions', auth, async (req, res) => {
    try {
        if (req.user.role !== 'examiner')
            return res.status(403).json({ error: 'Only examiners can view proctoring sessions' });

        // Associate if not already done
        if (!Flag.associations.student) {
            Flag.belongsTo(User, { foreignKey: 'student_id', as: 'student' });
        }
        if (!Flag.associations.exam) {
            Flag.belongsTo(Exam, { foreignKey: 'exam_id', as: 'exam' });
        }

        const flags = await Flag.findAll({
            include: [
                { model: User, as: 'student', attributes: ['id', 'name', 'email'] },
                { model: Exam, as: 'exam', attributes: ['id', 'title'] }
            ],
            order: [['createdAt', 'DESC']]
        });

        // Group by session_id
        const sessionsMap = {};
        for (const flag of flags) {
            const sId = flag.session_id;
            if (!sessionsMap[sId]) {
                sessionsMap[sId] = {
                    session_id: sId,
                    student: flag.student ? {
                        id: flag.student.id,
                        name: flag.student.name,
                        email: flag.student.email
                    } : { id: flag.student_id, name: 'Unknown Student', email: '' },
                    exam: flag.exam ? {
                        id: flag.exam.id,
                        title: flag.exam.title
                    } : { id: flag.exam_id, title: 'Unknown Exam' },
                    flagsCount: 0,
                    flags: [],
                    latestFlagAt: flag.createdAt
                };
            }
            sessionsMap[sId].flagsCount += 1;
            sessionsMap[sId].flags.push(flag);
        }

        const sessionsList = Object.values(sessionsMap);
        res.json(sessionsList);
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
        await Flag.create({
            session_id,
            student_id : req.user.id,
            exam_id,
            alert_type,
            detail     : detail || ''
        });
        res.json({ logged: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;