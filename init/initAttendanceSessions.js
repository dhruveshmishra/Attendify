const mongoose = require("mongoose");

const Teacher = require("../models/teacherSchema");
const Subject = require("../models/subjectSchema");
const College = require("../models/collegeSchema");
const Classroom = require("../models/classroomSchema");
const AttendanceSession = require("../models/attendanceSessionSchema");

mongoose.connect("mongodb://127.0.0.1:27017/attendance-app")
.then(() => {
    console.log("MongoDB Connected");
})
.catch((err) => {
    console.log(err);
});

const initAttendanceSessions = async () => {

    try {

        await AttendanceSession.deleteMany({});

        const teacher = await Teacher.findOne({
            employeeId: "EMP101"
        });

        const subject = await Subject.findOne({
            subjectCode: "CS401"
        });

        const college = await College.findOne({
            collegeCode: "MIT001"
        });

        const classroom = await Classroom.findOne({
            classroomName: "Room 101"
        });

        const sessions = [

            {
                teacher: teacher._id,
                subject: subject._id,
                college: college._id,
                classroom: classroom._id,
                startTime: new Date(),
                endTime: new Date(Date.now() + 5 * 60 * 1000),
                isActive: true
            }

        ];

        const result = await AttendanceSession.insertMany(sessions);
        console.log("Attendance Sessions Added Successfully");
        console.log(result);
        mongoose.connection.close();

    } catch (err) {

        console.log(err);

    }

};

initAttendanceSessions();