let ioInstance = null;

const Student = require("../models/studentSchema");
const Teacher = require("../models/teacherSchema");

function getId(value) {
    if (!value) {
        return "";
    }

    if (value._id) {
        return value._id.toString();
    }

    return value.toString();
}

function getSessionUser(socket) {
    if (
        !socket ||
        !socket.request ||
        !socket.request.session ||
        !socket.request.session.passport ||
        !socket.request.session.passport.user
    ) {
        return null;
    }

    return socket.request.session.passport.user;
}

function getStudentRoom(studentId) {
    return "student:" + studentId.toString();
}

function getTeacherRoom(teacherId) {
    return "teacher:" + teacherId.toString();
}

function getClassGroupRoom(classGroupId) {
    return "classGroup:" + classGroupId.toString();
}

function initializeSocket(io) {
    ioInstance = io;

    io.on("connection", function (socket) {
        const sessionUser = getSessionUser(socket);

        if (!sessionUser) {
            socket.emit("socket:error", {
                message: "Login required for realtime updates."
            });
            return;
        }

        socket.on("student:join", async function () {
            try {
                const currentUser = getSessionUser(socket);

                if (!currentUser || currentUser.accountType !== "student") {
                    return;
                }

                const studentId = currentUser._id || currentUser.id;

                const student = await Student.findById(studentId).select("classGroup college fullName");

                if (!student || !student.classGroup) {
                    return;
                }

                socket.join(getStudentRoom(student._id));
                socket.join(getClassGroupRoom(student.classGroup));

                socket.emit("student:joined", {
                    studentId: student._id.toString(),
                    classGroupId: student.classGroup.toString()
                });
            } catch (err) {
                console.log("SOCKET STUDENT JOIN ERROR:");
                console.log(err.message);
            }
        });

        socket.on("teacher:join", async function () {
            try {
                const currentUser = getSessionUser(socket);

                if (!currentUser || currentUser.accountType !== "teacher") {
                    return;
                }

                const teacherId = currentUser._id || currentUser.id;

                const teacher = await Teacher.findById(teacherId).select("fullName college role");

                if (!teacher) {
                    return;
                }

                socket.join(getTeacherRoom(teacher._id));

                socket.emit("teacher:joined", {
                    teacherId: teacher._id.toString()
                });
            } catch (err) {
                console.log("SOCKET TEACHER JOIN ERROR:");
                console.log(err.message);
            }
        });
    });
}

function getIO() {
    return ioInstance;
}

function emitAttendanceStarted(session, scheduleItem) {
    const io = getIO();

    if (!io || !session || !scheduleItem) {
        return;
    }

    const classGroupId = getId(session.classGroup || scheduleItem.classGroup);

    if (!classGroupId) {
        return;
    }

    const payload = {
        sessionId: getId(session._id),
        scheduleId: getId(session.schedule || scheduleItem._id),
        classGroupId: classGroupId,
        subjectId: getId(session.subject || scheduleItem.subject),
        teacherId: getId(session.teacher || scheduleItem.teacher),
        classroomId: getId(session.classroom || scheduleItem.classroom),
        subjectName: scheduleItem.subject ? scheduleItem.subject.subjectName : "Subject",
        classGroupName: scheduleItem.classGroup ? scheduleItem.classGroup.name : "Class",
        classroomName: scheduleItem.classroom ? scheduleItem.classroom.classroomName : "Classroom",
        startTime: session.startTime,
        endTime: session.endTime,
        radius: session.radius
    };

    io.to(getClassGroupRoom(classGroupId)).emit("attendance:started", payload);

    io.to(getTeacherRoom(getId(session.teacher || scheduleItem.teacher))).emit(
        "attendance:started:teacher",
        payload
    );
}

function emitAttendanceEnded(session) {
    const io = getIO();

    if (!io || !session) {
        return;
    }

    const classGroupId = getId(session.classGroup);
    const teacherId = getId(session.teacher);

    const payload = {
        sessionId: getId(session._id),
        scheduleId: getId(session.schedule),
        classGroupId: classGroupId,
        subjectId: getId(session.subject),
        teacherId: teacherId,
        status: session.status,
        totalPresent: session.attendanceSummary ? session.attendanceSummary.totalPresent : 0,
        totalAbsent: session.attendanceSummary ? session.attendanceSummary.totalAbsent : 0,
        totalMarked: session.attendanceSummary ? session.attendanceSummary.totalMarked : 0
    };

    if (classGroupId) {
        io.to(getClassGroupRoom(classGroupId)).emit("attendance:ended", payload);
    }

    if (teacherId) {
        io.to(getTeacherRoom(teacherId)).emit("attendance:ended:teacher", payload);
    }
}

function emitAttendanceMarked(session, student, attendanceRecord, distance) {
    const io = getIO();

    if (!io || !session || !student) {
        return;
    }

    const teacherId = getId(session.teacher);

    const payload = {
        sessionId: getId(session._id),
        scheduleId: getId(session.schedule),
        studentId: getId(student._id),
        studentName: student.fullName,
        enrollmentNumber: student.enrollmentNumber,
        attendanceRecordId: attendanceRecord ? getId(attendanceRecord._id) : "",
        status: "PRESENT",
        distance: Math.round(distance || 0),
        totalPresent: session.presentStudents ? session.presentStudents.length : 0,
        totalAbsent: session.absentStudents ? session.absentStudents.length : 0,
        totalMarked: session.attendanceSummary ? session.attendanceSummary.totalMarked : 0,
        markedAt: new Date()
    };

    if (teacherId) {
        io.to(getTeacherRoom(teacherId)).emit("attendance:marked", payload);
    }

    io.to(getStudentRoom(student._id)).emit("attendance:marked:self", payload);
}


function emitSuspiciousAttendanceAttempt(attempt) {
    const io = getIO();

    if (!io || !attempt) {
        return;
    }

    const teacherId = getId(attempt.teacher);

    if (!teacherId) {
        return;
    }

    const payload = {
        attemptId: getId(attempt._id),
        sessionId: getId(attempt.attendanceSession),
        scheduleId: getId(attempt.schedule),
        studentId: getId(attempt.student),
        studentName: attempt.studentName || "Unknown Student",
        enrollmentNumber: attempt.enrollmentNumber || "Unknown",
        reasonCode: attempt.reasonCode || "UNKNOWN",
        reasonMessage: attempt.reasonMessage || "Suspicious attendance attempt.",
        result: attempt.result || "REJECTED",
        distanceFromTeacher: Math.round(attempt.distanceFromTeacher || 0),
        allowedRadius: Math.round(attempt.allowedRadius || 0),
        gpsAccuracy: Math.round(attempt.gpsAccuracy || 0),
        maxAllowedAccuracy: Math.round(attempt.maxAllowedAccuracy || 100),
        createdAt: attempt.createdAt || new Date()
    };

    io.to(getTeacherRoom(teacherId)).emit("attendance:suspicious", payload);
}

module.exports = {
    initializeSocket,
    getIO,
    emitAttendanceStarted,
    emitAttendanceEnded,
    emitAttendanceMarked,
    emitSuspiciousAttendanceAttempt
};