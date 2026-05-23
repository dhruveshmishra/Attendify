function showMessage(message, type) {
    const messageBox = document.getElementById("messageBox");

    if (!messageBox) {
        alert(message);
        return;
    }

    messageBox.innerHTML = "";

    const div = document.createElement("div");
    div.className = type === "success" ? "success-box" : "error-box";
    div.innerText = message;

    messageBox.appendChild(div);

    setTimeout(function () {
        div.remove();
    }, 5000);
}

function getBrowserFingerprint() {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";

    return [
        navigator.userAgent || "unknown",
        navigator.language || "unknown",
        timezone,
        screen.width + "x" + screen.height,
        screen.colorDepth || "unknown"
    ].join("|");
}

function setAttendancePresentUI(button) {
    const card = button.closest("[data-schedule-id]");

    if (card) {
        card.setAttribute("data-attendance-state", "present");
    }

    const actionBox = button.closest(".js-schedule-action");

    if (!actionBox) {
        button.innerText = "Marked";
        button.classList.add("marked");
        button.disabled = true;
        return;
    }

    actionBox.innerHTML = `
        <span class="status-badge present">
            <i class="fa-solid fa-circle-check"></i>
            Present
        </span>

        <button class="view-btn marked" type="button" disabled>
            Attendance Marked
        </button>
    `;
}

function markAttendance(sessionId, button) {
    if (!navigator.geolocation) {
        showMessage("Your browser does not support location access.", "error");
        return;
    }

    if (typeof getAttendanceTokenWithPasskey !== "function") {
        showMessage("Passkey script is not loaded. Please refresh once.", "error");
        return;
    }

    const oldText = button.innerText;

    button.innerText = "Passkey Check...";
    button.disabled = true;

    getAttendanceTokenWithPasskey(sessionId)
        .then(function (attendanceToken) {
            button.innerText = "Getting Location...";

            navigator.geolocation.getCurrentPosition(
                function (position) {
                    button.innerText = "Marking...";

                    fetch("/student/attendance/mark", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        credentials: "same-origin",
                        body: JSON.stringify({
                            sessionId: sessionId,
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                            accuracy: position.coords.accuracy,
                            attendanceToken: attendanceToken,
                            browserFingerprint: getBrowserFingerprint()
                        })
                    })
                    .then(function (res) {
                        return res.json();
                    })
                    .then(function (data) {
                        if (data.success) {
                            showMessage(data.message, "success");
                            setAttendancePresentUI(button);
                        } else {
                            showMessage(data.message, "error");

                            button.innerText = oldText;
                            button.disabled = false;
                        }
                    })
                    .catch(function (err) {
                        console.log(err);

                        showMessage("Something went wrong while marking attendance.", "error");

                        button.innerText = oldText;
                        button.disabled = false;
                    });
                },

                function (error) {
                    console.log(error);

                    showMessage("Please allow location access to mark attendance.", "error");

                    button.innerText = oldText;
                    button.disabled = false;
                },

                {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 0
                }
            );
        })
        .catch(function (err) {
            console.log(err);

            showMessage(err.message || "Passkey verification failed or was cancelled.", "error");

            button.innerText = oldText;
            button.disabled = false;
        });
}