const mongoose = require("mongoose");

const teacherSchema = new mongoose.Schema({
    
    fullName: {
        type: String,
        required: true,
        trim: true
    },

    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },

    password: {
        type: String,
        required: true
    },

    employeeId: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },

    department: {
        type: String,
        required: true,
        uppercase: true,
        trim: true
    },

    college: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "College",
        required: true
    },

    subjects: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Subject"
        }
    ],

    attendanceSessions: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AttendanceSession"
        }
    ],

    isAdmin: {
        type: Boolean,
        default: false
    },

    isBlocked: {
        type: Boolean,
        default: false
    }

}, {
    timestamps: true
});

const Teacher = mongoose.model(
    "Teacher",
    teacherSchema
);

module.exports = Teacher;