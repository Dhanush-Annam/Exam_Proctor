const { DataTypes } = require('sequelize');
const sequelize     = require('./index');

const Flag = sequelize.define('Flag', {
    id: {
        type         : DataTypes.UUID,
        defaultValue : DataTypes.UUIDV4,
        primaryKey   : true
    },
    session_id: {
        type      : DataTypes.STRING,
        allowNull : false
    },
    student_id: {
        type      : DataTypes.UUID,
        allowNull : false
    },
    exam_id: {
        type      : DataTypes.UUID,
        allowNull : false
    },
    alert_type: {
        type      : DataTypes.STRING,
        allowNull : false
    },
    detail: {
        type         : DataTypes.STRING,
        defaultValue : ''
    },
    image_path: {
        type      : DataTypes.STRING,
        allowNull : true
    },
    ear_value: {
        type      : DataTypes.FLOAT,
        allowNull : true
    },
    yaw_degrees: {
        type      : DataTypes.FLOAT,
        allowNull : true
    },
    ai_verdict: {
        type         : DataTypes.STRING,
        defaultValue : null
    },
    ai_reason: {
        type         : DataTypes.STRING,
        defaultValue : null
    }
}, { timestamps: true });

module.exports = Flag;