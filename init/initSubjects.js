const mongoose = require("mongoose");

const College = require("../models/collegeSchema");
const Classroom = require("../models/classroomSchema");
const Subject = require("../models/subjectSchema");

mongoose.connect("mongodb://127.0.0.1:27017/attendance-app")
.then(() => {
    console.log("MongoDB Connected");
})
.catch((err) => {
    console.log(err);
});

const initSubjects = async () => {

    try {

        await Subject.deleteMany({});

        const college = await College.findOne({
            collegeCode: "MIT001"
        });

        const classroom = await Classroom.findOne({
            classroomName: "Room 101"
        });

        const subjects = [

            {
                subjectName: "DBMS",
                subjectCode: "CS401",
                department: "CSE",
                semester: 4,
                college: college._id,
                classroom: classroom._id
            },

            {
                subjectName: "OPERATING SYSTEM",
                subjectCode: "CS402",
                department: "CSE",
                semester: 4,
                college: college._id,
                classroom: classroom._id
            }

        ];

        const result = await Subject.insertMany(subjects);

        console.log("Subjects Added Successfully");

        console.log(result);

        mongoose.connection.close();

    } catch (err) {

        console.log(err);

    }

};

initSubjects();