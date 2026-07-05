const { DataTypes } = require('sequelize');
const sequelize     = require('./index');

const Exam = sequelize.define('Exam', {
    id: {
        type         : DataTypes.UUID,
        defaultValue : DataTypes.UUIDV4,
        primaryKey   : true
    },
    title: {
        type      : DataTypes.STRING,
        allowNull : false
    },
    duration_minutes: {
        type         : DataTypes.INTEGER,
        defaultValue : 60
    },
    questions: {
        type         : DataTypes.JSONB,
        defaultValue : []
    },
    created_by: {
        type      : DataTypes.UUID,
        allowNull : false
    },
    status: {
        type         : DataTypes.ENUM('draft', 'active', 'closed'),
        defaultValue : 'draft'
    }
}, { timestamps: true });

module.exports = Exam;