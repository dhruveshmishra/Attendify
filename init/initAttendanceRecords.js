const mongoose = require("mongoose");

const Student = require("../models/studentSchema");
const Subject = require("../models/subjectSchema");
const College = require("../models/collegeSchema");
const Classroom = require("../models/classroomSchema");
const AttendanceSession = require("../models/attendanceSessionSchema");
const AttendanceRecord = require("../models/attendanceRecordSchema");

mongoose.connect("mongodb://127.0.0.1:27017/attendance-app")
.then(() => {
    console.log("MongoDB Connected");
})
.catch((err) => {
    console.log(err);
});

const initAttendanceRecords = async () => {
    try {
        await AttendanceRecord.deleteMany({});
        
        const student = await Student.findOne({
            enrollmentNumber: "22BCS101"
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

        const session = await AttendanceSession.findOne({
            isActive: true
        });

        const records = [
            {
                student: student._id,
                attendanceSession: session._id,
                subject: subject._id,
                college: college._id,
                classroom: classroom._id,
                latitude: 12.9715,
                longitude: 77.5944
            }
        ];

        const result = await AttendanceRecord.insertMany(records);
        console.log("Attendance Records Added Successfully");
        console.log(result);
        mongoose.connection.close();

    } catch (err) {
        console.log(err);
    }

};

initAttendanceRecords();