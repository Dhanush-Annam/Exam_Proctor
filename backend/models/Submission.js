const { DataTypes } = require('sequelize');
const sequelize     = require('./index');

const Submission = sequelize.define('Submission', {
    id: {
        type         : DataTypes.UUID,
        defaultValue : DataTypes.UUIDV4,
        primaryKey   : true
    },
    student_id: {
        type      : DataTypes.UUID,
        allowNull : false
    },
    exam_id: {
        type      : DataTypes.UUID,
        allowNull : false
    },
    session_id: {
        type      : DataTypes.STRING,
        allowNull : false
    },
    answers: {
        type         : DataTypes.JSONB,
        defaultValue : {}
    },
    score: {
        type         : DataTypes.FLOAT,
        defaultValue : null
    },
    total_questions: {
        type      : DataTypes.INTEGER,
        allowNull : false
    },
    correct_answers: {
        type         : DataTypes.INTEGER,
        defaultValue : 0
    },
    total_flags: {
        type         : DataTypes.INTEGER,
        defaultValue : 0
    },
    submitted_at: {
        type         : DataTypes.DATE,
        defaultValue : DataTypes.NOW
    }
}, {
    timestamps: true,
    indexes: [
        { fields: ['session_id'] },
        { fields: ['student_id'] },
        { fields: ['exam_id'] }
    ]
});

module.exports = Submission;