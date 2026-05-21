const mongoose = require("mongoose");

const College = require("../models/collegeSchema");
const Classroom = require("../models/classroomSchema");

mongoose.connect("mongodb://127.0.0.1:27017/attendance-app")
.then(() => {
    console.log("MongoDB Connected");
})
.catch((err) => {
    console.log(err);
});

const initClassrooms = async () => {

    try {

        await Classroom.deleteMany({});

        const mitCollege = await College.findOne({
            collegeCode: "MIT001"
        });

        const classrooms = [

            {
                classroomName: "Room 101",
                buildingName: "CS Block",
                floorNumber: 1,
                latitude: 12.9716,
                longitude: 77.5946,
                radius: 100,
                college: mitCollege._id
            },

            {
                classroomName: "Room 102",
                buildingName: "CS Block",
                floorNumber: 1,
                latitude: 12.9718,
                longitude: 77.5948,
                radius: 100,
                college: mitCollege._id
            }

        ];

        const result = await Classroom.insertMany(classrooms);
        console.log("Classrooms Added Successfully");
        console.log(result);
        mongoose.connection.close();

    } catch (err) {

        console.log(err);

    }

};

initClassrooms();