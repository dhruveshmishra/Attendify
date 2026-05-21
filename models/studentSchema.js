const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const studentSchema = new mongoose.Schema({

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

    enrollmentNumber: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },

    department: {
        type: String,
        required: true,
        uppercase: true
    },

    semester: {
        type: Number,
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

    subjects: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Subject"
        }
    ],

    isBlocked: {
        type: Boolean,
        default: false
    }

}, {
    timestamps: true
});


// 🔐 FIXED PASSWORD HASHING (NO next(), NO ERROR)
studentSchema.pre("save", async function () {

    if (!this.isModified("password")) return;

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});


// 🔐 PASSWORD COMPARISON
studentSchema.methods.comparePassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("Student", studentSchema);