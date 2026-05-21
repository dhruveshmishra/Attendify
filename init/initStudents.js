const mongoose = require("mongoose");

const Student = require("../models/studentSchema");
const College = require("../models/collegeSchema");
const Classroom = require("../models/classroomSchema");
const Subject = require("../models/subjectSchema");

mongoose.connect("mongodb://127.0.0.1:27017/attendance-app")
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

const initStudents = async () => {

    try {

        await Student.deleteMany({});

        const college = await College.findOne({ collegeCode: "MIT001" });
        const classroom = await Classroom.findOne({ classroomName: "Room 101" });

        const dbms = await Subject.findOne({ subjectCode: "CS401" });
        const os = await Subject.findOne({ subjectCode: "CS402" });

        const students = [
            {
                fullName: "Harsh Koli",
                email: "harsh@gmail.com",
                password: "harsh123",
                enrollmentNumber: "22BCS101",
                department: "CSE",
                semester: 4,
                college: college._id,
                classroom: classroom._id,
                subjects: [dbms._id, os._id]
            },

            {
                fullName: "Rahul Verma",
                email: "rahul@gmail.com",
                password: "rahul123",
                enrollmentNumber: "22BCS102",
                department: "CSE",
                semester: 4,
                college: college._id,
                classroom: classroom._id,
                subjects: [dbms._id]
            }
        ];

        // 🔥 IMPORTANT: MUST USE save() to trigger hashing
        const result = [];

        for (let s of students) {
            const student = new Student(s);
            await student.save();   // triggers pre("save")
            result.push(student);
        }

        console.log("Students inserted successfully");
        console.log(result);

        mongoose.connection.close();

    } catch (err) {
        console.log(err);
    }
};

initStudents();