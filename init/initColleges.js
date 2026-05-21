const mongoose = require("mongoose");
const College = require("../models/collegeSchema");

mongoose.connect("mongodb://127.0.0.1:27017/attendance-app")
.then(() => {
    console.log("MongoDB Connected");
})
.catch((err) => {
    console.log(err);
});

const colleges = [

    {
        collegeName: "MIT College",
        collegeCode: "MIT001",
        address: "MG Road",
        city: "Bangalore",
        state: "Karnataka"
    },

    {
        collegeName: "IIT Delhi",
        collegeCode: "IIT002",
        address: "Hauz Khas",
        city: "Delhi",
        state: "Delhi"
    }

];

const initColleges = async () => {

    try {
        await College.deleteMany({});
        const result = await College.insertMany(colleges);
        console.log("Colleges Added Successfully");
        console.log(result);
        mongoose.connection.close();

    } catch (err) {

        console.log(err);

    }

};

initColleges();