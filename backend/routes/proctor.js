const express = require('express');
const axios   = require('axios');
const FormData = require('form-data');
const auth    = require('../middleware/auth');
const upload  = require('../middleware/upload');
const Flag    = require('../models/Flag');
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

module.exports = router;