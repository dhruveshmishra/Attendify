const express = require("express");
const router = express.Router();

const { isLoggedIn } = require("../middlewares/authMiddleware");

// Protected Student Dashboard
router.get("/dashboard", isLoggedIn, (req, res) => {
    res.send("Welcome to Student Dashboard");
});

module.exports = router;