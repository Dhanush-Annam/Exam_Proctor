const { DataTypes } = require('sequelize');
const sequelize     = require('./index');

const User = sequelize.define('User', {
    id: {
        type         : DataTypes.UUID,
        defaultValue : DataTypes.UUIDV4,
        primaryKey   : true
    },
    name: {
        type      : DataTypes.STRING,
        allowNull : false
    },
    email: {
        type      : DataTypes.STRING,
        allowNull : false,
        unique    : true
    },
    password: {
        type      : DataTypes.STRING,
        allowNull : false
    },
    role: {
        type         : DataTypes.ENUM('student', 'examiner'),
        defaultValue : 'student'
    }
}, {
    timestamps: true,
    defaultScope: {
        attributes: { exclude: ['password'] }
    },
    scopes: {
        withPassword: {
            attributes: ['id', 'name', 'email', 'password', 'role', 'createdAt', 'updatedAt']
        }
    }
});

module.exports = User;