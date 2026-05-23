const socketManager = require("../utils/socketManager");
const express = require("express");
const router = express.Router();

const Schedule = require("../models/scheduleSchema");
const Teacher = require("../models/teacherSchema");
const Student = require("../models/studentSchema");
const Classroom = require("../models/classroomSchema");
const ClassGroup = require("../models/classGroupSchema");
const AttendanceSession = require("../models/attendanceSessionSchema");
const AttendanceRecord = require("../models/attendanceRecordSchema");
const AttendanceAttempt = require("../models/attendanceAttemptSchema");
const Subject = require("../models/subjectSchema");


const {
    getScheduleTimeStatus,
    getTodayRange,
    sortSchedulesByTime
} = require("../utils/scheduleTime");

function teacherGetDateInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return year + "-" + month + "-" + day;
}

function teacherGetStartOfDate(dateString) {
    const date = dateString ? new Date(dateString + "T00:00:00") : new Date();
    date.setHours(0, 0, 0, 0);
    return date;
}

function teacherGetEndOfDate(dateString) {
    const date = dateString ? new Date(dateString + "T23:59:59.999") : new Date();
    date.setHours(23, 59, 59, 999);
    return date;
}

function teacherGetPercent(part, total) {
    if (!total || total <= 0) {
        return 0;
    }

    return Math.round((part / total) * 100);
}

function teacherSafeObjectId(value) {
    if (!value || value === "all") {
        return null;
    }

    if (!value.match(/^[0-9a-fA-F]{24}$/)) {
        return null;
    }

    return value;
}




function isTeacher(req, res, next) {
    if (!req.isAuthenticated()) {
        return res.redirect("/teacher/login");
    }

    if (req.user.accountType !== "teacher") {
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

function getErrorMessage(errorCode) {
    if (errorCode === "location") {
        return "Teacher location is required to start attendance. Please allow location access.";
    }

    if (errorCode === "outside_window") {
        return "You can only start attendance during the scheduled class time.";
    }

    if (errorCode === "class_not_ended") {
        return "Manual attendance is only available after the class time has ended.";
    }

    if (errorCode === "session_exists") {
        return "Attendance was already started for this class today.";
    }

    if (errorCode === "manual_done") {
        return "Attendance was already recorded for this class today.";
    }

    if (errorCode === "schedule_missing") {
        return "Schedule not found. Please start attendance from a valid schedule card.";
    }

    return null;
}

function getSuccessMessage(messageCode) {
    if (messageCode === "live_started") {
        return "Attendance started successfully.";
    }

    if (messageCode === "manual_saved") {
        return "Manual attendance saved successfully.";
    }

    return null;
}

function sameId(a, b) {
    if (!a || !b) {
        return false;
    }

    const first = a._id ? a._id.toString() : a.toString();
    const second = b._id ? b._id.toString() : b.toString();

    return first === second;
}

function findSessionForSchedule(sessions, schedule) {
    for (let i = 0; i < sessions.length; i++) {
        const session = sessions[i];

        if (session.schedule && sameId(session.schedule, schedule._id)) {
            return session;
        }

        if (
            !session.schedule &&
            session.subject &&
            session.classGroup &&
            schedule.subject &&
            schedule.classGroup &&
            sameId(session.subject, schedule.subject) &&
            sameId(session.classGroup, schedule.classGroup)
        ) {
            return session;
        }
    }

    return null;
}

async function getScheduleForTeacher(req) {
    const scheduleId = req.body.scheduleId;

    if (!scheduleId) {
        return null;
    }

    const today = getTodayName();

    const scheduleItem = await Schedule.findOne({
        _id: scheduleId,
        teacher: req.user._id,
        college: req.user.college,
        day: today
    })
    .populate("subject")
    .populate("classGroup")
    .populate("classroom");

    return scheduleItem;
}

router.get("/dashboard", isTeacher, async (req, res) => {
    try {
        const today = getTodayName();
        const now = new Date();
        const todayRange = getTodayRange();

        const teacher = await Teacher.findById(req.user._id)
            .populate("subjects");

        if (!teacher) {
            return res.send("Teacher not found");
        }

        const schedules = await Schedule.find({
            teacher: req.user._id,
            college: req.user.college,
            day: today
        })
        .populate("subject")
        .populate("classGroup")
        .populate("classroom");

        sortSchedulesByTime(schedules);

        const classGroups = await ClassGroup.find({
            college: req.user.college,
            isActive: true
        });

        const classrooms = await Classroom.find({
            college: req.user.college
        });

        const activeSessions = await AttendanceSession.find({
            teacher: req.user._id,
            college: req.user.college,
            isActive: true,
            status: "ACTIVE",
            endTime: { $gt: now }
        })
        .populate("schedule")
        .populate("subject")
        .populate("classGroup")
        .populate("classroom");

        const todaysSessions = await AttendanceSession.find({
            teacher: req.user._id,
            college: req.user.college,
            startTime: {
                $gte: todayRange.start,
                $lte: todayRange.end
            }
        })
        .populate("schedule")
        .populate("subject")
        .populate("classGroup")
        .populate("classroom");

        const classGroupIds = [];

        for (let i = 0; i < schedules.length; i++) {
            if (schedules[i].classGroup) {
                classGroupIds.push(schedules[i].classGroup._id);
            }
        }

        const students = await Student.find({
            college: req.user.college,
            classGroup: { $in: classGroupIds }
        }).sort({ fullName: 1 });

        const studentsByClassGroup = {};

        for (let i = 0; i < students.length; i++) {
            const groupId = students[i].classGroup.toString();

            if (!studentsByClassGroup[groupId]) {
                studentsByClassGroup[groupId] = [];
            }

            studentsByClassGroup[groupId].push(students[i]);
        }

        const scheduleCards = [];
        const manualAttendanceList = [];

        for (let i = 0; i < schedules.length; i++) {
            const item = schedules[i];

            let timeStatus = "invalid";
            let todaySession = null;
            let liveSession = null;

            if (item.subject && item.classGroup && item.classroom) {
                timeStatus = getScheduleTimeStatus(
                    item.startTime,
                    item.endTime,
                    now
                );

                todaySession = findSessionForSchedule(todaysSessions, item);
                liveSession = findSessionForSchedule(activeSessions, item);
            }

            const card = {
                schedule: item,
                timeStatus: timeStatus,
                todaySession: todaySession,
                liveSession: liveSession,
                canStart: false,
                showManual: false
            };

            if (
                timeStatus === "live" &&
                !todaySession &&
                item.subject &&
                item.classGroup &&
                item.classroom
            ) {
                card.canStart = true;
            }

            if (
                timeStatus === "ended" &&
                !todaySession &&
                item.subject &&
                item.classGroup &&
                item.classroom
            ) {
                card.showManual = true;

                const groupId = item.classGroup._id.toString();
                const classStudents = studentsByClassGroup[groupId] || [];

                manualAttendanceList.push({
                    schedule: item,
                    students: classStudents
                });
            }

            scheduleCards.push(card);
        }

        res.render("teacherDashboard", {
            teacher: teacher,
            subjects: teacher.subjects || [],
            classGroups: classGroups || [],
            classrooms: classrooms || [],
            activeSessions: activeSessions || [],
            schedules: schedules || [],
            scheduleCards: scheduleCards || [],
            manualAttendanceList: manualAttendanceList || [],
            today: today,
            message: getSuccessMessage(req.query.message),
            error: getErrorMessage(req.query.error)
        });

    } catch (err) {
        console.log("TEACHER DASHBOARD ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.send("Teacher dashboard error: " + err.message);
    }
});

router.get("/suspicious-attempts/recent", isTeacher, async function (req, res) {
    try {
        const teacherId = req.user._id || req.user.id;

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const attempts = await AttendanceAttempt.find({
            teacher: teacherId,
            result: { $ne: "SUCCESS" },
            createdAt: { $gte: todayStart }
        })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        res.json({
            success: true,
            attempts: attempts.map(function (attempt) {
                return {
                    attemptId: attempt._id.toString(),
                    sessionId: attempt.attendanceSession ? attempt.attendanceSession.toString() : "",
                    scheduleId: attempt.schedule ? attempt.schedule.toString() : "",
                    studentId: attempt.student ? attempt.student.toString() : "",
                    studentName: attempt.studentName || "Unknown Student",
                    enrollmentNumber: attempt.enrollmentNumber || "Unknown",
                    reasonCode: attempt.reasonCode || "UNKNOWN",
                    reasonMessage: attempt.reasonMessage || "Suspicious attendance attempt.",
                    result: attempt.result || "REJECTED",
                    distanceFromTeacher: Math.round(attempt.distanceFromTeacher || 0),
                    allowedRadius: Math.round(attempt.allowedRadius || 0),
                    gpsAccuracy: Math.round(attempt.gpsAccuracy || 0),
                    maxAllowedAccuracy: Math.round(attempt.maxAllowedAccuracy || 100),
                    createdAt: attempt.createdAt
                };
            })
        });

    } catch (err) {
        console.log("TEACHER RECENT SUSPICIOUS ATTEMPTS ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.status(500).json({
            success: false,
            message: "Unable to load suspicious attempts."
        });
    }
});


router.post("/attendance/start", isTeacher, async (req, res) => {
    try {
        const durationMinutes = Number(req.body.durationMinutes) || 5;
        const teacherLatitude = req.body.teacherLatitude;
        const teacherLongitude = req.body.teacherLongitude;

        const scheduleItem = await getScheduleForTeacher(req);

        if (
            !scheduleItem ||
            !scheduleItem.subject ||
            !scheduleItem.classGroup ||
            !scheduleItem.classroom
        ) {
            return res.redirect("/teacher/dashboard?error=schedule_missing");
        }

        if (
            teacherLatitude == null || teacherLatitude === "" ||
            teacherLongitude == null || teacherLongitude === ""
        ) {
            return res.redirect("/teacher/dashboard?error=location");
        }

        const timeStatus = getScheduleTimeStatus(
            scheduleItem.startTime,
            scheduleItem.endTime,
            new Date()
        );

        if (timeStatus !== "live") {
            return res.redirect("/teacher/dashboard?error=outside_window");
        }

        const todayRange = getTodayRange();

        const sessionToday = await AttendanceSession.findOne({
            schedule: scheduleItem._id,
            teacher: req.user._id,
            college: req.user.college,
            startTime: {
                $gte: todayRange.start,
                $lte: todayRange.end
            }
        });

        if (sessionToday) {
            return res.redirect("/teacher/dashboard?error=session_exists");
        }

        const alreadyActive = await AttendanceSession.findOne({
            schedule: scheduleItem._id,
            teacher: req.user._id,
            college: req.user.college,
            isActive: true,
            status: "ACTIVE",
            endTime: { $gt: new Date() }
        });

        if (alreadyActive) {
            return res.redirect("/teacher/dashboard?error=session_exists");
        }

        const startTime = new Date();
        const endTime = new Date(Date.now() + durationMinutes * 60 * 1000);

        const attendanceSession = await AttendanceSession.create({
            schedule: scheduleItem._id,
            teacher: req.user._id,
            subject: scheduleItem.subject._id,
            college: req.user.college,
            classGroup: scheduleItem.classGroup._id,
            classroom: scheduleItem.classroom._id,

            latitude: Number(teacherLatitude),
            longitude: Number(teacherLongitude),
            radius: scheduleItem.classroom.radius,

            startTime: startTime,
            endTime: endTime,
            status: "ACTIVE",
            isActive: true
        });
        socketManager.emitAttendanceStarted(attendanceSession, scheduleItem);

        res.redirect("/teacher/dashboard?message=live_started");

    } catch (err) {
        console.log("TEACHER START ATTENDANCE ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.send("Could not start attendance: " + err.message);
    }
});

router.post("/attendance/manual", isTeacher, async (req, res) => {
    try {
        let presentStudentIds = req.body.presentStudents || [];

        if (!Array.isArray(presentStudentIds)) {
            presentStudentIds = [presentStudentIds];
        }

        const scheduleItem = await getScheduleForTeacher(req);

        if (
            !scheduleItem ||
            !scheduleItem.subject ||
            !scheduleItem.classGroup ||
            !scheduleItem.classroom
        ) {
            return res.redirect("/teacher/dashboard?error=schedule_missing");
        }

        const timeStatus = getScheduleTimeStatus(
            scheduleItem.startTime,
            scheduleItem.endTime,
            new Date()
        );

        if (timeStatus !== "ended") {
            return res.redirect("/teacher/dashboard?error=class_not_ended");
        }

        const todayRange = getTodayRange();

        const sessionToday = await AttendanceSession.findOne({
            schedule: scheduleItem._id,
            teacher: req.user._id,
            college: req.user.college,
            startTime: {
                $gte: todayRange.start,
                $lte: todayRange.end
            }
        });

        if (sessionToday) {
            return res.redirect("/teacher/dashboard?error=manual_done");
        }

        const students = await Student.find({
            college: req.user.college,
            classGroup: scheduleItem.classGroup._id
        }).sort({ fullName: 1 });

        if (students.length === 0) {
            return res.send("No students found in this class group");
        }

        const presentIdStrings = [];

        for (let i = 0; i < presentStudentIds.length; i++) {
            presentIdStrings.push(presentStudentIds[i].toString());
        }

        const session = await AttendanceSession.create({
            schedule: scheduleItem._id,
            teacher: req.user._id,
            subject: scheduleItem.subject._id,
            college: req.user.college,
            classGroup: scheduleItem.classGroup._id,
            classroom: scheduleItem.classroom._id,
            latitude: scheduleItem.classroom.latitude,
            longitude: scheduleItem.classroom.longitude,
            radius: scheduleItem.classroom.radius,
            startTime: new Date(),
            endTime: new Date(),
            status: "CLOSED",
            isActive: false,
            closedAt: new Date(),
            closedBy: req.user._id
        });

        const recordIds = [];
        const presentStudentSnapshots = [];
        const absentStudentSnapshots = [];

        for (let i = 0; i < students.length; i++) {
            const oneStudent = students[i];
            const isPresent = presentIdStrings.includes(oneStudent._id.toString());

            const record = await AttendanceRecord.create({
                student: oneStudent._id,
                attendanceSession: session._id,
                subject: scheduleItem.subject._id,
                college: req.user.college,
                classGroup: scheduleItem.classGroup._id,
                classroom: scheduleItem.classroom._id,
                status: isPresent ? "PRESENT" : "ABSENT",
                latitude: scheduleItem.classroom.latitude,
                longitude: scheduleItem.classroom.longitude,
                distanceFromClassroom: 0,
                verificationMethod: "MANUAL",
                deviceInfo: {
                    userAgent: req.headers["user-agent"],
                    ip: req.ip
                }
            });

            recordIds.push(record._id);

            const studentSnapshot = {
                student: oneStudent._id,
                fullName: oneStudent.fullName,
                enrollmentNumber: oneStudent.enrollmentNumber,
                status: isPresent ? "PRESENT" : "ABSENT",
                attendanceRecord: record._id,
                markedAt: new Date(),
                verificationMethod: "MANUAL",
                distanceFromClassroom: 0
            };

            if (isPresent) {
                presentStudentSnapshots.push(studentSnapshot);
            } else {
                absentStudentSnapshots.push(studentSnapshot);
            }
        }

        session.attendanceRecords = recordIds;
        session.presentStudents = presentStudentSnapshots;
        session.absentStudents = absentStudentSnapshots;

        session.attendanceSummary.totalPresent = presentStudentSnapshots.length;
        session.attendanceSummary.totalAbsent = absentStudentSnapshots.length;
        session.attendanceSummary.totalMarked =
        presentStudentSnapshots.length + absentStudentSnapshots.length;

        await session.save();

        res.redirect("/teacher/dashboard?message=manual_saved");

    } catch (err) {
        console.log("TEACHER MANUAL ATTENDANCE ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.send("Could not save manual attendance: " + err.message);
    }
});

async function createAbsentRecordsForMissingStudents(session, req) {
    const students = await Student.find({
        college: session.college,
        classGroup: session.classGroup._id ? session.classGroup._id : session.classGroup
    });

    const existingRecords = await AttendanceRecord.find({
        attendanceSession: session._id
    });

    const alreadyMarkedStudentIds = [];

    for (let i = 0; i < existingRecords.length; i++) {
        alreadyMarkedStudentIds.push(existingRecords[i].student.toString());
    }

    for (let i = 0; i < students.length; i++) {
        const oneStudent = students[i];

        if (!alreadyMarkedStudentIds.includes(oneStudent._id.toString())) {
            const absentRecord = await AttendanceRecord.create({
                student: oneStudent._id,
                attendanceSession: session._id,
                subject: session.subject._id ? session.subject._id : session.subject,
                college: session.college,
                classGroup: session.classGroup._id ? session.classGroup._id : session.classGroup,
                classroom: session.classroom._id ? session.classroom._id : session.classroom,
                status: "ABSENT",
                latitude: session.latitude || 0,
                longitude: session.longitude || 0,
                distanceFromClassroom: 0,
                verificationMethod: "AUTO_ABSENT",
                deviceInfo: {
                    userAgent: req.headers["user-agent"],
                    ip: req.ip
                }
            });

            session.attendanceRecords.push(absentRecord._id);

            session.absentStudents.push({
                student: oneStudent._id,
                fullName: oneStudent.fullName,
                enrollmentNumber: oneStudent.enrollmentNumber,
                status: "ABSENT",
                attendanceRecord: absentRecord._id,
                markedAt: new Date(),
                verificationMethod: "AUTO_ABSENT",
                distanceFromClassroom: 0
            });
        }
    }

    session.attendanceSummary.totalPresent = session.presentStudents.length;
    session.attendanceSummary.totalAbsent = session.absentStudents.length;
    session.attendanceSummary.totalMarked =
        session.presentStudents.length + session.absentStudents.length;
}

router.post("/attendance/end/:id", isTeacher, async (req, res) => {
    try {
        const session = await AttendanceSession.findOne({
            _id: req.params.id,
            teacher: req.user._id
        })
        .populate("subject")
        .populate("classGroup")
        .populate("classroom");

        if (!session) {
            return res.send("Attendance session not found");
        }

        await createAbsentRecordsForMissingStudents(session, req);

        session.isActive = false;
        session.status = "CLOSED";
        session.closedAt = new Date();
        session.closedBy = req.user._id;

        await session.save();
        socketManager.emitAttendanceEnded(session);

        res.redirect("/teacher/dashboard");

    } catch (err) {
        console.log("TEACHER END ATTENDANCE ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.send("Could not end attendance: " + err.message);
    }
});

router.get("/reports", isTeacher, async function (req, res) {
    try {
        const teacherId = req.user._id || req.user.id;
        const collegeId = req.user.college;

        const todayInput = teacherGetDateInputValue(new Date());

        const filters = {
            fromDate: req.query.fromDate || todayInput,
            toDate: req.query.toDate || todayInput,
            classGroupId: req.query.classGroupId || "all",
            subjectId: req.query.subjectId || "all",
            status: req.query.status || "all"
        };

        const fromDate = teacherGetStartOfDate(filters.fromDate);
        const toDate = teacherGetEndOfDate(filters.toDate);

        const classGroupId = teacherSafeObjectId(filters.classGroupId);
        const subjectId = teacherSafeObjectId(filters.subjectId);

        const teacherSchedules = await Schedule.find({
            college: collegeId,
            teacher: teacherId
        })
            .populate("classGroup")
            .populate("subject")
            .sort({
                day: 1,
                startTime: 1
            });

        const classGroupIdMap = {};
        const subjectIdMap = {};

        teacherSchedules.forEach(function (schedule) {
            if (schedule.classGroup) {
                classGroupIdMap[schedule.classGroup._id.toString()] = true;
            }

            if (schedule.subject) {
                subjectIdMap[schedule.subject._id.toString()] = true;
            }
        });

        const classGroups = await ClassGroup.find({
            _id: { $in: Object.keys(classGroupIdMap) },
            college: collegeId
        }).sort({
            department: 1,
            semester: 1,
            section: 1
        });

        const subjects = await Subject.find({
            _id: { $in: Object.keys(subjectIdMap) },
            college: collegeId
        })
            .populate("classGroup")
            .sort({
                subjectName: 1
            });

        const sessionQuery = {
            college: collegeId,
            teacher: teacherId,
            startTime: {
                $gte: fromDate,
                $lte: toDate
            }
        };

        if (classGroupId) {
            sessionQuery.classGroup = classGroupId;
        }

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
            college: collegeId,
            attendanceSession: {
                $in: sessionIds
            }
        };

        if (filters.status !== "all") {
            recordQuery.status = filters.status;
        }

        const attendanceRecords = await AttendanceRecord.find(recordQuery)
            .populate("student")
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
        const classSummaryMap = {};
        const studentSummaryMap = {};

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

            const classKey = record.classGroup
                ? record.classGroup._id.toString()
                : "missing-class";

            if (!classSummaryMap[classKey]) {
                classSummaryMap[classKey] = {
                    name: record.classGroup ? record.classGroup.name : "Class Missing",
                    total: 0,
                    present: 0,
                    absent: 0
                };
            }

            classSummaryMap[classKey].total++;

            if (record.status === "PRESENT") {
                classSummaryMap[classKey].present++;
            }

            if (record.status === "ABSENT") {
                classSummaryMap[classKey].absent++;
            }

            const studentKey = record.student
                ? record.student._id.toString()
                : "missing-student";

            if (!studentSummaryMap[studentKey]) {
                studentSummaryMap[studentKey] = {
                    name: record.student ? record.student.fullName : "Student Missing",
                    enrollmentNumber: record.student && record.student.enrollmentNumber ? record.student.enrollmentNumber : "",
                    total: 0,
                    present: 0,
                    absent: 0
                };
            }

            studentSummaryMap[studentKey].total++;

            if (record.status === "PRESENT") {
                studentSummaryMap[studentKey].present++;
            }

            if (record.status === "ABSENT") {
                studentSummaryMap[studentKey].absent++;
            }
        });

        const subjectSummary = Object.values(subjectSummaryMap).map(function (item) {
            item.percentage = teacherGetPercent(item.present, item.total);
            return item;
        });

        const classSummary = Object.values(classSummaryMap).map(function (item) {
            item.percentage = teacherGetPercent(item.present, item.total);
            return item;
        });

        const studentSummary = Object.values(studentSummaryMap).map(function (item) {
            item.percentage = teacherGetPercent(item.present, item.total);
            return item;
        });

        const attemptQuery = {
            college: collegeId,
            teacher: teacherId,
            result: { $ne: "SUCCESS" },
            createdAt: {
                $gte: fromDate,
                $lte: toDate
            }
        };

        if (classGroupId) {
            attemptQuery.classGroup = classGroupId;
        }

        if (subjectId) {
            attemptQuery.subject = subjectId;
        }

        const suspiciousAttempts = await AttendanceAttempt.find(attemptQuery)
            .populate("student")
            .populate("subject")
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
            attendancePercentage: teacherGetPercent(totalPresent, attendanceRecords.length),
            suspiciousCount: suspiciousAttempts.length
        };

        res.render("teacherReports", {
            teacher: req.user,
            activePage: "reports",
            filters: filters,
            classGroups: classGroups,
            subjects: subjects,
            sessions: sessions,
            attendanceRecords: attendanceRecords,
            suspiciousAttempts: suspiciousAttempts,
            subjectSummary: subjectSummary,
            classSummary: classSummary,
            studentSummary: studentSummary,
            summary: summary
        });

    } catch (err) {
        console.log("TEACHER REPORTS ERROR:");
        console.log(err.message);
        console.log(err.stack);

        res.status(500).send("Teacher reports error: " + err.message);
    }
});


module.exports = router;