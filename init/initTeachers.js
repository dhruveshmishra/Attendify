const mongoose = require("mongoose");

const College = require("../models/collegeSchema");
const Subject = require("../models/subjectSchema");
const Teacher = require("../models/teacherSchema");

mongoose.connect("mongodb://127.0.0.1:27017/attendance-app")
.then(() => {
    console.log("MongoDB Connected");
})
.catch((err) => {
    console.log(err);
});

const initTeachers = async () => {

    try {

        await Teacher.deleteMany({});

        const college = await College.findOne({
            collegeCode: "MIT001"
        });

        const dbms = await Subject.findOne({
            subjectCode: "CS401"
        });

        const os = await Subject.findOne({
            subjectCode: "CS402"
        });

        const teachers = [

            {
                fullName: "Aman Sir",
                email: "aman@college.com",
                password: "aman123",
                employeeId: "EMP101",
                department: "CSE",
                college: college._id,
                subjects: [dbms._id, os._id]
            }

        ];

        const result = await Teacher.insertMany(teachers);

        console.log("Teachers Added Successfully");

        console.log(result);

        mongoose.connection.close();

    } catch (err) {

        console.log(err);

    }

};

initTeachers();