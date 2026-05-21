const express = require("express");
const router = express.Router();
const passport = require("passport");

// STUDENT LOGIN
router.post("/student/login",
    passport.authenticate("student-local"),
    (req, res) => {
        res.send("Student logged in successfully");
    }
);

module.exports = router;