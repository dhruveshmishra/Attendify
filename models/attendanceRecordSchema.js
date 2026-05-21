const mongoose = require("mongoose");

const attendanceRecordSchema = new mongoose.Schema({

    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Student",
        required: true
    },

    attendanceSession: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AttendanceSession",
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

    latitude: {
        type: Number,
        required: true
    },

    longitude: {
        type: Number,
        required: true
    },

    markedAt: {
        type: Date,
        default: Date.now
    }

}, {
    timestamps: true
});

const AttendanceRecord = mongoose.model("AttendanceRecord", attendanceRecordSchema);

module.exports = AttendanceRecord;