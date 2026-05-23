const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Student = require("../models/studentSchema");
const AttendanceSession = require("../models/attendanceSessionSchema");
const AttendanceRecord = require("../models/attendanceRecordSchema");
const AttendanceAttempt = require("../models/attendanceAttemptSchema");
const Schedule = require("../models/scheduleSchema");

const { sortSchedulesByTime } = require("../utils/scheduleTime");
const getDistanceInMeters = require("../utils/geoDistance");
const socketManager = require("../utils/socketManager");

const {
    createAttendanceToken,
    consumeAttendanceToken,
    allowAttendanceRequest,
    getClientIp
} = require("../utils/attendanceSecurity");

const {
    getWebAuthnConfig,
    getSimpleWebAuthnServer
} = require("../utils/webauthnConfig");

const MAX_GPS_ACCURACY_METERS = 100;

function isStudent(req, res, next) {
    if (!req.isAuthenticated()) {
        return res.redirect("/student/login");
    }

    if (req.user.accountType !== "student") {
        return res.redirect("/");
    }

    next();
}

function getTodayName() {
    const days = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday"
    ];

    return days[new Date().getDay()];
}

function getTodayRange() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    return {
        start: todayStart,
        end: todayEnd
    };
}

function getId(value) {
    if (!value) {
        return null;
    }

    if (value._id) {
        return value._id.toString();
    }

    return value.toString();
}

function sameId(a, b) {
    if (!a || !b) {
        return false;
    }

    return getId(a) === getId(b);
}

function getStudentIdFromRequest(req) {
    return req.user._id || req.user.id;
}

function getPasskeyCount(student) {
    if (!student || !student.passkeys) {
        return 0;
    }

    return student.passkeys.length;
}

function getPasskeyByCredentialId(student, credentialId) {
    if (!student || !student.passkeys || !credentialId) {
        return null;
    }

    for (let i = 0; i < student.passkeys.length; i++) {
        if (student.passkeys[i].credentialId === credentialId) {
            return student.passkeys[i];
        }
    }

    return null;
}

function getPublicKeyBytes(passkey) {
    if (!passkey || !passkey.credentialPublicKey) {
        return null;
    }

    return new Uint8Array(passkey.credentialPublicKey);
}

function findScheduleForSession(schedules, session) {
    for (let i = 0; i < schedules.length; i++) {
        const schedule = schedules[i];

        if (session.schedule && sameId(session.schedule, schedule._id)) {
            return schedule;
        }

        if (
            !session.schedule &&
            session.subject &&
            schedule.subject &&
            session.classGroup &&
            schedule.classGroup &&
            sameId(session.subject, schedule.subject) &&
            sameId(session.classGroup, schedule.classGroup)
        ) {
            return schedule;
        }
    }

    return null;
}

function studentGetDateInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return year + "-" + month + "-" + day;
}

function studentGetMonthStartInputValue() {
    const date = new Date();
    date.setDate(1);
    return studentGetDateInputValue(date);
}

function studentGetStartOfDate(dateString) {
    const date = dateString ? new Date(dateString + "T00:00:00") : new Date();
    date.setHours(0, 0, 0, 0);
    return date;
}

function studentGetEndOfDate(dateString) {
    const date = dateString ? new Date(dateString + "T23:59:59.999") : new Date();
    date.setHours(23, 59, 59, 999);
    return date;
}

function studentGetPercent(part, total) {
    if (!total || total <= 0) {
        return 0;
    }

    return Math.round((part / total) * 100);
}

function studentSafeObjectId(value) {
    if (!value || value === "all") {
        return null;
    }

    if (!mongoose.Types.ObjectId.isValid(value)) {
        return null;
    }

    return value;
}


async function saveAttendanceAttempt(options) {
    try {
        const req = options.req;
        const student = options.student;
        const session = options.session;

        if (!student || !session) {
            return;
        }

        const attempt = await AttendanceAttempt.create({
            student: student._id,
            studentName: student.fullName || "Unknown Student",
            enrollmentNumber: student.enrollmentNumber || "Unknown",

            attendanceSession: session._id,
            schedule: getId(session.schedule),
            teacher: getId(session.teacher),
            subject: getId(session.subject),
            college: getId(session.college),
            classGroup: getId(session.classGroup),
            classroom: getId(session.classroom),

            result: options.result || "REJECTED",
            reasonCode: options.reasonCode || "UNKNOWN",
            reasonMessage: options.reasonMessage || "Attendance attempt logged.",

            studentLatitude: options.latitude !== undefined ? Number(options.latitude) : undefined,
            studentLongitude: options.longitude !== undefined ? Number(options.longitude) : undefined,
            teacherLatitude: options.teacherLatitude !== undefined ? Number(options.teacherLatitude) : undefined,
            teacherLongitude: options.teacherLongitude !== undefined ? Number(options.teacherLongitude) : undefined,

            distanceFromTeacher: Number.isFinite(Number(options.distance)) ? Math.round(Number(options.distance)) : 0,
            allowedRadius: Number.isFinite(Number(options.allowedRadius)) ? Number(options.allowedRadius) : 0,
            gpsAccuracy: Number.isFinite(Number(options.accuracy)) ? Math.round(Number(options.accuracy)) : 0,
            maxAllowedAccuracy: MAX_GPS_ACCURACY_METERS,

            passkeyCredentialId: options.passkeyCredentialId || "",
            browserFingerprint: options.browserFingerprint || "",
            userAgent: req ? req.headers["user-agent"] : "",
            ip: req ? getClientIp(req) : ""
        });

        if (
            attempt.result !== "SUCCESS" &&
            socketManager &&
            typeof socketManager.emitSuspiciousAttendanceAttempt === "function"
        ) {
            socketManager.emitSuspiciousAttendanceAttempt(attempt);
        }
    } catch (err) {
        console.log("SAVE ATTENDANCE ATTEMPT ERROR:");
        console.log(err.message);
    }
}

async function getStudentPageData(req) {
    const student = await Student.findById(getStudentIdFromRequest(req))
        .populate("classGroup")
        .populate("subjects");

    if (!student) {
        return {
            error: "Student not found"
        };
    }

    if (!student.classGroup) {
        return {
            error: "Student classGroup missing. Run initAll.js again."
        };
    }

    if (!student.college) {
        return {
            error: "Student college missing. Please contact admin."
        };
    }

    const today = getTodayName();
    const todayRange = getTodayRange();

    const schedules = await Schedule.find({
        college: student.college,
        classGroup: student.classGroup._id,
        day: today
    })
        .populate("subject")
        .populate("teacher")
        .populate("classroom")
        .populate("classGroup");

    sortSchedulesByTime(schedules);

    const todaySessions = await AttendanceSession.find({
        college: student.college,
        classGroup: student.classGroup._id,
        startTime: {
            $gte: todayRange.start,
            $lte: todayRange.end
        }
    })
        .populate("schedule")
        .populate("subject")
        .populate("classroom")
        .populate("teacher")
        .populate("classGroup");

    const activeSessions = await AttendanceSession.find({
        college: student.college,
        classGroup: student.classGroup._id,
        isActive: true,
        status: "ACTIVE",
        endTime: { $gt: new Date() }
    })
        .populate("schedule")
        .populate("subject")
        .populate("classroom")
        .populate("teacher")
        .populate("classGroup");

    const todaySessionIds = [];

    for (let i = 0; i < todaySessions.length; i++) {
        todaySessionIds.push(todaySessions[i]._id);
    }

    const attendanceRecords = await AttendanceRecord.find({
        student: student._id,
        attendanceSession: { $in: todaySessionIds }
    });

    const markedSessionIds = [];
    const attendanceStatusBySchedule = {};

    for (let i = 0; i < attendanceRecords.length; i++) {
        const record = attendanceRecords[i];

        if (record.attendanceSession) {
            markedSessionIds.push(record.attendanceSession.toString());
        }

        let matchedSession = null;

        for (let j = 0; j < todaySessions.length; j++) {
            if (
                record.attendanceSession &&
                todaySessions[j]._id.toString() === record.attendanceSession.toString()
            ) {
                matchedSession = todaySessions[j];
            }
        }

        if (matchedSession) {
            const matchedSchedule = findScheduleForSession(schedules, matchedSession);

            if (matchedSchedule) {
                attendanceStatusBySchedule[matchedSchedule._id.toString()] = {
                    status: record.status,
                    sessionId: matchedSession._id.toString()
                };
            }
        }
    }

    let presentCount = 0;
    let absentCount = 0;

    for (let key in attendanceStatusBySchedule) {
        if (attendanceStatusBySchedule[key].status === "PRESENT") {
            presentCount++;
        }

        if (attendanceStatusBySchedule[key].status === "ABSENT") {
            absentCount++;
        }
    }

    let attendancePercentage = 0;

    if (schedules.length > 0) {
        attendancePercentage = Math.round((presentCount / schedules.length) * 100);
    }

    return {
        student: student,
        schedules: schedules,
        todaySessions: todaySessions,
        activeSessions: activeSessions,
        markedSessionIds: markedSessionIds,
        attendanceStatusBySchedule: attendanceStatusBySchedule,
        today: today,
        presentCount: presentCount,
        absentCount: absentCount,
        attendancePercentage: attendancePercentage,
        passkeyCount: getPasskeyCount(student),
        hasPasskey: getPasskeyCount(student) > 0
    };
}

router.get("/dashboard", isStudent, async function (req, res) {
    try {
        if (!req.user || !getStudentIdFromRequest(req)) {
            return res.send("User session invalid. Please login again.");
        }

        const data = await getStudentPageData(req);

        if (data.error) {
            return res.send(data.error);
        }

        data.activePage = "dashboard";

        res.render("studentDashboard", data);

    } catch (err) {
        console.log("STUDENT DASHBOARD ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.send("Student dashboard error: " + err.message);
    }
});


router.get("/schedule", isStudent, async function (req, res) {
    try {
        if (!req.user || !getStudentIdFromRequest(req)) {
            return res.redirect("/student/login");
        }

        const data = await getStudentPageData(req);

        if (data.error) {
            return res.send(data.error);
        }

        data.activePage = "schedule";

        res.render("studentSchedule", data);

    } catch (err) {
        console.log("STUDENT SCHEDULE ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.send("Student schedule error: " + err.message);
    }
});

router.get("/passkey/register/options", isStudent, async function (req, res) {
    try {
        const student = await Student.findById(getStudentIdFromRequest(req));

        if (!student) {
            return res.status(404).json({
                success: false,
                message: "Student not found."
            });
        }

        const webauthn = await getSimpleWebAuthnServer();
        const config = getWebAuthnConfig(req);

        const options = await webauthn.generateRegistrationOptions({
            rpName: config.rpName,
            rpID: config.rpID,

            userID: Buffer.from(student._id.toString()),
            userName: student.email,
            userDisplayName: student.fullName,

            attestationType: "none",

            excludeCredentials: (student.passkeys || []).map(function (passkey) {
                return {
                    id: passkey.credentialId,
                    transports: passkey.transports || []
                };
            }),

            authenticatorSelection: {
                residentKey: "preferred",
                requireResidentKey: false,
                userVerification: "required"
            },

            supportedAlgorithmIDs: [-7, -257],
            timeout: 60000
        });

        req.session.webauthnRegistration = {
            challenge: options.challenge,
            studentId: student._id.toString()
        };

        res.json(options);

    } catch (err) {
        console.log("PASSKEY REGISTER OPTIONS ERROR:");
        console.log(err.message);

        res.status(500).json({
            success: false,
            message: "Could not start passkey registration: " + err.message
        });
    }
});

router.post("/passkey/register/verify", isStudent, async function (req, res) {
    try {
        const savedChallenge = req.session.webauthnRegistration;

        if (!savedChallenge) {
            return res.status(400).json({
                success: false,
                message: "Passkey registration session expired. Please try again."
            });
        }

        const student = await Student.findById(getStudentIdFromRequest(req));

        if (!student) {
            return res.status(404).json({
                success: false,
                message: "Student not found."
            });
        }

        if (savedChallenge.studentId !== student._id.toString()) {
            return res.status(403).json({
                success: false,
                message: "Invalid passkey registration session."
            });
        }

        const webauthn = await getSimpleWebAuthnServer();
        const config = getWebAuthnConfig(req);

        const verification = await webauthn.verifyRegistrationResponse({
            response: req.body,
            expectedChallenge: savedChallenge.challenge,
            expectedOrigin: config.origin,
            expectedRPID: config.rpID
        });

        if (!verification.verified || !verification.registrationInfo) {
            return res.status(400).json({
                success: false,
                message: "Passkey verification failed."
            });
        }

        const credential = verification.registrationInfo.credential;

        if (!student.passkeys) {
            student.passkeys = [];
        }

        if (getPasskeyByCredentialId(student, credential.id)) {
            return res.status(400).json({
                success: false,
                message: "This passkey is already registered."
            });
        }

        student.passkeys.push({
            credentialId: credential.id,
            credentialPublicKey: Buffer.from(credential.publicKey),
            counter: credential.counter || 0,
            transports: credential.transports || (req.body.response && req.body.response.transports) || [],
            deviceType: verification.registrationInfo.credentialDeviceType,
            backedUp: verification.registrationInfo.credentialBackedUp || false,
            name: "Passkey " + (student.passkeys.length + 1),
            registeredAt: new Date()
        });

        await student.save();

        req.session.webauthnRegistration = null;

        res.json({
            success: true,
            verified: true,
            message: "Passkey registered successfully."
        });
    } catch (err) {
        console.log("PASSKEY REGISTER VERIFY ERROR:");
        console.log(err.message);

        res.status(400).json({
            success: false,
            message: "Could not verify passkey: " + err.message
        });
    }
});

router.get("/attendance/passkey/options/:sessionId", isStudent, async function (req, res) {
    try {
        const sessionId = req.params.sessionId;

        if (!mongoose.Types.ObjectId.isValid(sessionId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid attendance session."
            });
        }

        const student = await Student.findById(getStudentIdFromRequest(req));

        if (!student || student.isBlocked) {
            return res.status(403).json({
                success: false,
                message: "Student account not allowed."
            });
        }

        if (!student.passkeys || student.passkeys.length === 0) {
            return res.status(403).json({
                success: false,
                needPasskey: true,
                message: "Please register your passkey before marking attendance."
            });
        }

        const session = await AttendanceSession.findById(sessionId);

        if (!session || !session.isActive || session.status !== "ACTIVE") {
            return res.status(400).json({
                success: false,
                message: "Attendance session is not active."
            });
        }

        if (session.endTime < new Date()) {
            session.isActive = false;
            session.status = "EXPIRED";
            await session.save();

            return res.status(400).json({
                success: false,
                message: "Attendance session expired."
            });
        }

        if (!sameId(session.college, student.college)) {
            return res.status(403).json({
                success: false,
                message: "Invalid college."
            });
        }

        if (!sameId(session.classGroup, student.classGroup)) {
            return res.status(403).json({
                success: false,
                message: "This attendance is not for your class."
            });
        }

        const alreadyMarked = await AttendanceRecord.findOne({
            student: student._id,
            attendanceSession: session._id
        });

        if (alreadyMarked) {
            return res.status(400).json({
                success: false,
                message: "Attendance already marked."
            });
        }

        const webauthn = await getSimpleWebAuthnServer();
        const config = getWebAuthnConfig(req);

        const options = await webauthn.generateAuthenticationOptions({
            rpID: config.rpID,
            userVerification: "required",
            allowCredentials: student.passkeys.map(function (passkey) {
                return {
                    id: passkey.credentialId,
                    transports: passkey.transports || []
                };
            })
        });

        req.session.webauthnAttendance = {
            challenge: options.challenge,
            studentId: student._id.toString(),
            sessionId: session._id.toString()
        };

        res.json(options);
    } catch (err) {
        console.log("ATTENDANCE PASSKEY OPTIONS ERROR:");
        console.log(err.message);

        res.status(500).json({
            success: false,
            message: "Could not start passkey verification: " + err.message
        });
    }
});

router.post("/attendance/passkey/verify/:sessionId", isStudent, async function (req, res) {
    try {
        const savedChallenge = req.session.webauthnAttendance;

        if (!savedChallenge) {
            return res.status(400).json({
                success: false,
                message: "Passkey verification expired. Please try again."
            });
        }

        const student = await Student.findById(getStudentIdFromRequest(req));
        const session = await AttendanceSession.findById(req.params.sessionId);

        if (!student || !session) {
            return res.status(404).json({
                success: false,
                message: "Student or attendance session not found."
            });
        }

        if (
            savedChallenge.studentId !== student._id.toString() ||
            savedChallenge.sessionId !== session._id.toString()
        ) {
            return res.status(403).json({
                success: false,
                message: "Invalid passkey attendance session."
            });
        }

        const passkey = getPasskeyByCredentialId(student, req.body.id);

        if (!passkey) {
            return res.status(403).json({
                success: false,
                message: "This passkey is not registered for your account."
            });
        }

        const webauthn = await getSimpleWebAuthnServer();
        const config = getWebAuthnConfig(req);

        const verification = await webauthn.verifyAuthenticationResponse({
            response: req.body,
            expectedChallenge: savedChallenge.challenge,
            expectedOrigin: config.origin,
            expectedRPID: config.rpID,
            credential: {
                id: passkey.credentialId,
                publicKey: getPublicKeyBytes(passkey),
                counter: passkey.counter || 0,
                transports: passkey.transports || []
            }
        });

        if (!verification.verified) {
            return res.status(400).json({
                success: false,
                message: "Passkey verification failed."
            });
        }

        passkey.counter = verification.authenticationInfo.newCounter;
        passkey.lastUsedAt = new Date();

        await student.save();

        req.session.webauthnAttendance = null;

        const attendanceToken = createAttendanceToken({
            sessionId: session._id,
            studentId: student._id,
            credentialId: passkey.credentialId,
            expiresInSeconds: 120
        });

        res.json({
            success: true,
            verified: true,
            attendanceToken: attendanceToken
        });
    } catch (err) {
        console.log("ATTENDANCE PASSKEY VERIFY ERROR:");
        console.log(err.message);

        res.status(400).json({
            success: false,
            message: "Could not verify passkey: " + err.message
        });
    }
});

router.post("/attendance/mark", isStudent, async function (req, res) {
    let student = null;
    let session = null;

    try {
        const loggedStudentId = getStudentIdFromRequest(req);
        const requestIp = getClientIp(req);

        const markLimitKey = "mark:" + loggedStudentId.toString() + ":" + requestIp;
        const markLimit = allowAttendanceRequest(markLimitKey, 10, 60 * 1000);

        if (!markLimit.allowed) {
            return res.status(429).json({
                success: false,
                message: "Too many attendance attempts. Try again after " + markLimit.retryAfter + " seconds."
            });
        }

        const sessionId = req.body.sessionId;
        const latitude = req.body.latitude;
        const longitude = req.body.longitude;
        const accuracy = req.body.accuracy;
        const attendanceToken = req.body.attendanceToken;
        const browserFingerprint = req.body.browserFingerprint || "";

        if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid attendance session."
            });
        }

        if (
            latitude === undefined ||
            latitude === null ||
            latitude === "" ||
            longitude === undefined ||
            longitude === null ||
            longitude === ""
        ) {
            return res.status(400).json({
                success: false,
                message: "Location is required."
            });
        }

        if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
            return res.status(400).json({
                success: false,
                message: "Invalid location coordinates."
            });
        }

        if (accuracy === undefined || accuracy === null || accuracy === "") {
            return res.status(400).json({
                success: false,
                message: "GPS accuracy is required. Please refresh and try again."
            });
        }

        if (!Number.isFinite(Number(accuracy)) || Number(accuracy) <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid GPS accuracy."
            });
        }

        student = await Student.findById(loggedStudentId);

        if (!student) {
            return res.status(401).json({
                success: false,
                message: "Student not found."
            });
        }

        if (student.isBlocked) {
            return res.status(403).json({
                success: false,
                message: "Your student account is blocked."
            });
        }

        session = await AttendanceSession.findById(sessionId)
            .populate("schedule")
            .populate("classroom")
            .populate("subject")
            .populate("classGroup")
            .populate("teacher");

        if (!session) {
            return res.status(404).json({
                success: false,
                message: "Attendance session not found."
            });
        }

        if (!session.isActive || session.status !== "ACTIVE") {
            await saveAttendanceAttempt({
                req,
                student,
                session,
                result: "REJECTED",
                reasonCode: "SESSION_CLOSED",
                reasonMessage: "Attendance session is closed.",
                latitude,
                longitude,
                accuracy,
                browserFingerprint
            });

            return res.status(400).json({
                success: false,
                message: "Attendance session is closed."
            });
        }

        if (session.endTime < new Date()) {
            session.isActive = false;
            session.status = "EXPIRED";
            await session.save();

            await saveAttendanceAttempt({
                req,
                student,
                session,
                result: "REJECTED",
                reasonCode: "SESSION_EXPIRED",
                reasonMessage: "Attendance session expired.",
                latitude,
                longitude,
                accuracy,
                browserFingerprint
            });

            return res.status(400).json({
                success: false,
                message: "Attendance session expired."
            });
        }

        if (!sameId(session.college, student.college)) {
            await saveAttendanceAttempt({
                req,
                student,
                session,
                result: "REJECTED",
                reasonCode: "COLLEGE_MISMATCH",
                reasonMessage: "Student tried to mark attendance for another college.",
                latitude,
                longitude,
                accuracy,
                browserFingerprint
            });

            return res.status(403).json({
                success: false,
                message: "Invalid college."
            });
        }

        if (!sameId(session.classGroup, student.classGroup)) {
            await saveAttendanceAttempt({
                req,
                student,
                session,
                result: "REJECTED",
                reasonCode: "CLASS_GROUP_MISMATCH",
                reasonMessage: "Student tried to mark attendance for another class group.",
                latitude,
                longitude,
                accuracy,
                browserFingerprint
            });

            return res.status(403).json({
                success: false,
                message: "This attendance is not for your class."
            });
        }

        const tokenCheck = consumeAttendanceToken(attendanceToken, {
            sessionId: session._id,
            studentId: student._id
        });

        if (!tokenCheck.valid) {
            await saveAttendanceAttempt({
                req,
                student,
                session,
                result: "REJECTED",
                reasonCode: "TOKEN_INVALID",
                reasonMessage: tokenCheck.message,
                latitude,
                longitude,
                accuracy,
                browserFingerprint
            });

            return res.status(403).json({
                success: false,
                message: tokenCheck.message
            });
        }

        const alreadyMarked = await AttendanceRecord.findOne({
            student: student._id,
            attendanceSession: session._id
        });

        if (alreadyMarked) {
            await saveAttendanceAttempt({
                req,
                student,
                session,
                result: "REJECTED",
                reasonCode: "ALREADY_MARKED",
                reasonMessage: "Student tried to mark attendance again.",
                latitude,
                longitude,
                accuracy,
                browserFingerprint,
                passkeyCredentialId: tokenCheck.payload.cid
            });

            return res.status(400).json({
                success: false,
                message: "Attendance already marked."
            });
        }

        if (Number(accuracy) > MAX_GPS_ACCURACY_METERS) {
            await saveAttendanceAttempt({
                req,
                student,
                session,
                result: "REJECTED",
                reasonCode: "LOW_GPS_ACCURACY",
                reasonMessage: "GPS accuracy is too low.",
                latitude,
                longitude,
                accuracy,
                browserFingerprint,
                passkeyCredentialId: tokenCheck.payload.cid
            });

            return res.status(403).json({
                success: false,
                message:
                    "Your GPS accuracy is too low. Move near a window and try again. Accuracy: " +
                    Math.round(Number(accuracy)) +
                    "m. Required: " +
                    MAX_GPS_ACCURACY_METERS +
                    "m or better."
            });
        }

        const sessionLatitude = session.latitude;
        const sessionLongitude = session.longitude;
        const sessionRadius = session.radius || 100;

        if (
            sessionLatitude === undefined ||
            sessionLatitude === null ||
            sessionLongitude === undefined ||
            sessionLongitude === null
        ) {
            await saveAttendanceAttempt({
                req,
                student,
                session,
                result: "REJECTED",
                reasonCode: "TEACHER_LOCATION_MISSING",
                reasonMessage: "Teacher GPS location missing from attendance session.",
                latitude,
                longitude,
                accuracy,
                browserFingerprint,
                passkeyCredentialId: tokenCheck.payload.cid
            });

            return res.status(400).json({
                success: false,
                message: "Attendance location is missing. Teacher must start attendance with location enabled."
            });
        }

        const distance = getDistanceInMeters(
            Number(latitude),
            Number(longitude),
            Number(sessionLatitude),
            Number(sessionLongitude)
        );

        if (distance > sessionRadius) {
            await saveAttendanceAttempt({
                req,
                student,
                session,
                result: "REJECTED",
                reasonCode: "OUTSIDE_RADIUS",
                reasonMessage: "Student is outside the allowed attendance radius.",
                latitude,
                longitude,
                teacherLatitude: sessionLatitude,
                teacherLongitude: sessionLongitude,
                distance,
                allowedRadius: sessionRadius,
                accuracy,
                browserFingerprint,
                passkeyCredentialId: tokenCheck.payload.cid
            });

            return res.status(403).json({
                success: false,
                message: "You are outside the allowed classroom range.",
                distance: Math.round(distance),
                allowedRadius: sessionRadius
            });
        }

        const attendanceRecord = await AttendanceRecord.create({
            student: student._id,
            attendanceSession: session._id,
            subject: getId(session.subject),
            college: getId(session.college),
            classGroup: getId(session.classGroup),
            classroom: getId(session.classroom),
            status: "PRESENT",
            latitude: Number(latitude),
            longitude: Number(longitude),
            distanceFromClassroom: Math.round(distance),
            verificationMethod: "PASSKEY_GEOLOCATION",
            deviceInfo: {
                userAgent: req.headers["user-agent"],
                ip: requestIp,
                browserFingerprint: browserFingerprint,
                gpsAccuracy: Number(accuracy),
                passkeyCredentialId: tokenCheck.payload.cid
            }
        });

        if (!session.attendanceRecords) {
            session.attendanceRecords = [];
        }

        if (!session.presentStudents) {
            session.presentStudents = [];
        }

        if (!session.absentStudents) {
            session.absentStudents = [];
        }

        session.attendanceRecords.push(attendanceRecord._id);

        session.presentStudents.push({
            student: student._id,
            fullName: student.fullName,
            enrollmentNumber: student.enrollmentNumber,
            status: "PRESENT",
            attendanceRecord: attendanceRecord._id,
            markedAt: new Date(),
            verificationMethod: "PASSKEY_GEOLOCATION",
            distanceFromClassroom: Math.round(distance)
        });

        session.attendanceSummary = {
            totalPresent: session.presentStudents.length,
            totalAbsent: session.absentStudents.length,
            totalMarked: session.presentStudents.length + session.absentStudents.length
        };

        await session.save();

        await saveAttendanceAttempt({
            req,
            student,
            session,
            result: "SUCCESS",
            reasonCode: "ATTENDANCE_MARKED",
            reasonMessage: "Attendance marked successfully with passkey and geolocation.",
            latitude,
            longitude,
            teacherLatitude: sessionLatitude,
            teacherLongitude: sessionLongitude,
            distance,
            allowedRadius: sessionRadius,
            accuracy,
            browserFingerprint,
            passkeyCredentialId: tokenCheck.payload.cid
        });

        socketManager.emitAttendanceMarked(session, student, attendanceRecord, distance);

        res.json({
            success: true,
            message: "Attendance marked successfully.",
            status: "PRESENT",
            distance: Math.round(distance),
            allowedRadius: sessionRadius,
            accuracy: Math.round(Number(accuracy))
        });
    } catch (err) {
        if (err.code === 11000) {
            if (student && session) {
                await saveAttendanceAttempt({
                    req,
                    student,
                    session,
                    result: "REJECTED",
                    reasonCode: "DUPLICATE_ATTENDANCE",
                    reasonMessage: "Duplicate attendance rejected by database unique index.",
                    latitude: req.body.latitude,
                    longitude: req.body.longitude,
                    accuracy: req.body.accuracy,
                    browserFingerprint: req.body.browserFingerprint || ""
                });
            }

            return res.status(400).json({
                success: false,
                message: "Attendance already marked."
            });
        }

        console.log("MARK ATTENDANCE ERROR:");
        console.log(err.message);
        console.log(err.stack);

        if (student && session) {
            await saveAttendanceAttempt({
                req,
                student,
                session,
                result: "ERROR",
                reasonCode: "SERVER_ERROR",
                reasonMessage: err.message,
                latitude: req.body.latitude,
                longitude: req.body.longitude,
                accuracy: req.body.accuracy,
                browserFingerprint: req.body.browserFingerprint || ""
            });
        }

        res.status(500).json({
            success: false,
            message: "Mark attendance error: " + err.message
        });
    }
});

router.get("/attendance-history", isStudent, async function (req, res) {
    try {
        const studentId = getStudentIdFromRequest(req);

        const student = await Student.findById(studentId)
            .populate("classGroup")
            .populate("subjects");

        if (!student) {
            return res.redirect("/student/login");
        }

        if (!student.college) {
            return res.send("Student college missing. Please contact admin.");
        }

        if (!student.classGroup) {
            return res.send("Student class group missing. Please contact admin.");
        }

        const filters = {
            fromDate: req.query.fromDate || studentGetMonthStartInputValue(),
            toDate: req.query.toDate || studentGetDateInputValue(new Date()),
            subjectId: req.query.subjectId || "all",
            status: req.query.status || "all"
        };

        const fromDate = studentGetStartOfDate(filters.fromDate);
        const toDate = studentGetEndOfDate(filters.toDate);

        const subjectId = studentSafeObjectId(filters.subjectId);

        const sessionQuery = {
            college: student.college,
            classGroup: student.classGroup._id,
            startTime: {
                $gte: fromDate,
                $lte: toDate
            }
        };

        if (subjectId) {
            sessionQuery.subject = subjectId;
        }

        const sessions = await AttendanceSession.find(sessionQuery)
            .populate("schedule")
            .populate("subject")
            .populate("teacher")
            .populate("classGroup")
            .populate("classroom")
            .sort({
                startTime: -1
            });

        const sessionIds = sessions.map(function (session) {
            return session._id;
        });

        const recordQuery = {
            student: student._id,
            college: student.college,
            attendanceSession: {
                $in: sessionIds
            }
        };

        if (subjectId) {
            recordQuery.subject = subjectId;
        }

        if (filters.status !== "all") {
            recordQuery.status = filters.status;
        }

        const attendanceRecords = await AttendanceRecord.find(recordQuery)
            .populate("subject")
            .populate("classGroup")
            .populate("classroom")
            .populate({
                path: "attendanceSession",
                populate: [
                    { path: "teacher" },
                    { path: "schedule" },
                    { path: "subject" },
                    { path: "classGroup" },
                    { path: "classroom" }
                ]
            })
            .sort({
                createdAt: -1
            })
            .limit(1000);

        let totalPresent = 0;
        let totalAbsent = 0;

        const subjectSummaryMap = {};

        attendanceRecords.forEach(function (record) {
            if (record.status === "PRESENT") {
                totalPresent++;
            }

            if (record.status === "ABSENT") {
                totalAbsent++;
            }

            const subjectKey = record.subject
                ? record.subject._id.toString()
                : "missing-subject";

            if (!subjectSummaryMap[subjectKey]) {
                subjectSummaryMap[subjectKey] = {
                    name: record.subject ? record.subject.subjectName : "Subject Missing",
                    code: record.subject && record.subject.subjectCode ? record.subject.subjectCode : "",
                    total: 0,
                    present: 0,
                    absent: 0
                };
            }

            subjectSummaryMap[subjectKey].total++;

            if (record.status === "PRESENT") {
                subjectSummaryMap[subjectKey].present++;
            }

            if (record.status === "ABSENT") {
                subjectSummaryMap[subjectKey].absent++;
            }
        });

        const subjectSummary = Object.values(subjectSummaryMap).map(function (item) {
            item.percentage = studentGetPercent(item.present, item.total);
            return item;
        });

        const attemptQuery = {
            student: student._id,
            college: student.college,
            result: {
                $ne: "SUCCESS"
            },
            createdAt: {
                $gte: fromDate,
                $lte: toDate
            }
        };

        if (subjectId) {
            attemptQuery.subject = subjectId;
        }

        const suspiciousAttempts = await AttendanceAttempt.find(attemptQuery)
            .populate("subject")
            .populate("teacher")
            .populate("classGroup")
            .populate("classroom")
            .sort({
                createdAt: -1
            })
            .limit(50);

        const summary = {
            totalSessions: sessions.length,
            totalRecords: attendanceRecords.length,
            totalPresent: totalPresent,
            totalAbsent: totalAbsent,
            attendancePercentage: studentGetPercent(totalPresent, attendanceRecords.length),
            suspiciousCount: suspiciousAttempts.length
        };

        res.render("studentAttendanceHistory", {
            student: student,
            activePage: "attendance-history",
            filters: filters,
            subjects: student.subjects || [],
            sessions: sessions,
            attendanceRecords: attendanceRecords,
            suspiciousAttempts: suspiciousAttempts,
            subjectSummary: subjectSummary,
            summary: summary
        });

    } catch (err) {
        console.log("STUDENT ATTENDANCE HISTORY ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.status(500).send("Student attendance history error: " + err.message);
    }
});


router.get("/passkeys", isStudent, async function (req, res) {
    try {
        const student = await Student.findById(getStudentIdFromRequest(req))
            .populate("classGroup");

        if (!student) {
            return res.redirect("/student/login");
        }

        res.render("studentPasskeys", {
            student: student,
            activePage: "passkeys",
            passkeys: student.passkeys || [],
            message: req.query.message || null
        });

    } catch (err) {
        console.log("STUDENT PASSKEYS PAGE ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.status(500).send("Student passkeys page error: " + err.message);
    }
});

router.post("/passkeys/:credentialId/delete", isStudent, async function (req, res) {
    try {
        const student = await Student.findById(getStudentIdFromRequest(req));

        if (!student) {
            return res.redirect("/student/login");
        }

        const credentialId = req.params.credentialId;

        if (!credentialId) {
            return res.redirect("/student/passkeys?message=invalid");
        }

        student.passkeys = (student.passkeys || []).filter(function (passkey) {
            return passkey.credentialId !== credentialId;
        });

        await student.save();

        res.redirect("/student/passkeys?message=deleted");

    } catch (err) {
        console.log("DELETE STUDENT PASSKEY ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.redirect("/student/passkeys?message=error");
    }
});

module.exports = router;