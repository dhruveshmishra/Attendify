const mongoose = require("mongoose");
const bcrypt = require("bcrypt");


const studentPasskeySchema = new mongoose.Schema(
    {
        credentialId: {
            type: String,
            required: true
        },

        credentialPublicKey: {
            type: Buffer,
            required: true
        },

        counter: {
            type: Number,
            default: 0
        },

        transports: [
            {
                type: String
            }
        ],

        deviceType: String,

        backedUp: {
            type: Boolean,
            default: false
        },

        name: {
            type: String,
            default: "Passkey"
        },

        registeredAt: {
            type: Date,
            default: Date.now
        },

        lastUsedAt: Date
    },
    {
        _id: false
    }
);

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
        uppercase: true,
        trim: true
    },

    department: {
        type: String,
        required: true,
        uppercase: true,
        trim: true
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

    classGroup: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ClassGroup",
        required: true
    },

    subjects: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Subject"
        }
    ],

    passkeys: [studentPasskeySchema],

    isBlocked: {
        type: Boolean,
        default: false
    },

    lastLogin: {
        type: Date
    }

}, {
    timestamps: true
});

studentSchema.index(
    { college: 1, enrollmentNumber: 1 },
    { unique: true }
);
studentSchema.index(
    { "passkeys.credentialId": 1 },
    { sparse: true }
);

studentSchema.pre("save", async function () {

    if (!this.isModified("password")) return;

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

studentSchema.methods.comparePassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

const Student = mongoose.model("Student", studentSchema);

module.exports = Student;