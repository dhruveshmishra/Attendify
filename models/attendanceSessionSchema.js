const mongoose = require("mongoose");

const attendanceSessionSchema = new mongoose.Schema({

    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Teacher",
        required: true
    },

    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Subject",
        required: true
    },

    college: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "College",
        required: true
    },

    classroom: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Classroom",
        required: true
    },

    startTime: {
        type: Date,
        default: Date.now
    },

    endTime: {
        type: Date,
        required: true
    },

    isActive: {
        type: Boolean,
        default: true
    },

    attendanceRecords: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AttendanceRecord"
        }
    ]

}, {
    timestamps: true
});

const AttendanceSession = mongoose.model(
    "AttendanceSession",
    attendanceSessionSchema
);

module.exports = AttendanceSession;