const mongoose = require("mongoose");

async function main(params) {
    await mongoose.connect("127.0.0.1:27017/attendance-app");
}

module.exports = main;