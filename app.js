const express = require("express");
const session = require("express-session");
const passport = require("passport");
const authRoutes = require("./routes/authRoutes");
const studentRoutes = require("./routes/studentRoutes");
require("./config/passport");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionOptions = {
    secret: "attendance-secret",
    resave: false,
    saveUninitialized: false

}
app.use(session(sessionOptions));
app.use(passport.initialize());
app.use(passport.session());

app.use("/auth", authRoutes);
app.use("/student", studentRoutes);

module.exports = app;
