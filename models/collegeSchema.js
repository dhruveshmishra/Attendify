const mongoose = require("mongoose");

const collegeSchema = new mongoose.Schema({

    collegeName: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },

    collegeCode: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },

    address: {
        type: String,
        required: true,
        trim: true
    },

    city: {
        type: String,
        required: true,
        trim: true
    },

    state: {
        type: String,
        required: true,
        trim: true
    },

    classrooms: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Classroom"
        }
    ],

    students: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Student"
        }
    ],

    teachers: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Teacher"
        }
    ]

}, {
    timestamps: true
});

const College = mongoose.model(
    "College",
    collegeSchema
);

module.exports = College;