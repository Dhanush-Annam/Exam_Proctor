const { Sequelize } = require('sequelize');
require('dotenv').config();

let sequelize;

if (process.env.DATABASE_URL) {
    sequelize = new Sequelize(process.env.DATABASE_URL, {
        dialect : 'postgres',
        logging : false,
        dialectOptions: {
            ssl: {
                require: true,
                rejectUnauthorized: false
            }
        }
    });
} else {
    sequelize = new Sequelize(
        process.env.DB_NAME,
        process.env.DB_USER,
        process.env.DB_PASSWORD,
        {
            host    : process.env.DB_HOST,
            port    : process.env.DB_PORT,
            dialect : 'postgres',
            logging : false
        }
    );
}

module.exports = sequelize;

// Load models to establish relationships
const User = require('./User');
const Exam = require('./Exam');
const Flag = require('./Flag');
const Submission = require('./Submission');

// Define relationships/associations
Submission.belongsTo(User, { foreignKey: 'student_id', as: 'student' });
Submission.belongsTo(Exam, { foreignKey: 'exam_id', as: 'exam' });
Flag.belongsTo(User, { foreignKey: 'student_id', as: 'student' });
Flag.belongsTo(Exam, { foreignKey: 'exam_id', as: 'exam' });

User.hasMany(Submission, { foreignKey: 'student_id', as: 'submissions' });
Exam.hasMany(Submission, { foreignKey: 'exam_id', as: 'submissions' });
User.hasMany(Flag, { foreignKey: 'student_id', as: 'flags' });
Exam.hasMany(Flag, { foreignKey: 'exam_id', as: 'flags' });