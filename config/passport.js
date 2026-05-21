const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const Student = require("../models/studentSchema");

passport.use("student-local", new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
    try {
        const student = await Student.findOne({ email });
        
        if (!student) {
            return done(null, false, { message: "Student not found" });
        }

        const isMatch = await student.comparePassword(password);

        if (!isMatch) {
            return done(null, false, { message: "Wrong password" });
        }

        return done(null, { id: student._id, role: "student" });
    } catch (err) {
        return done(err);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((user, done) => {
    done(null, user);
});

module.exports = passport;