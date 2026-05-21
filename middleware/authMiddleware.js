function isLoggedIn(req, res, next) {

    if (req.isAuthenticated()) {
        return next();
    }

    return res.status(401).send("Not authorized. Please login first.");
}

module.exports = { isLoggedIn };