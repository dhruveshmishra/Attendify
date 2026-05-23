document.addEventListener("DOMContentLoaded", function () {
    if (typeof io === "undefined") {
        return;
    }

    const socket = io();

    socket.emit("teacher:join");

    function findLiveCard(sessionId) {
        return document.querySelector(".live-card[data-session-id='" + sessionId + "']");
    }

    function showTeacherToast(message, type) {
        let toast = document.getElementById("teacherRealtimeToast");

        if (!toast) {
            toast = document.createElement("div");
            toast.id = "teacherRealtimeToast";
            toast.className = "teacher-realtime-toast";
            document.body.appendChild(toast);
        }

        toast.textContent = message;

        toast.classList.remove("danger");

        if (type === "danger") {
            toast.classList.add("danger");
        }

        toast.classList.add("show");

        setTimeout(function () {
            toast.classList.remove("show");
        }, 4000);
    }

    function formatTime(dateValue) {
        if (!dateValue) {
            return "Just now";
        }

        const date = new Date(dateValue);

        if (Number.isNaN(date.getTime())) {
            return "Just now";
        }

        return date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function getReasonLabel(reasonCode, reasonMessage) {
        const labels = {
            OUTSIDE_RADIUS: "Outside allowed radius",
            LOW_GPS_ACCURACY: "Poor GPS accuracy",
            TOKEN_INVALID: "Invalid security token",
            SESSION_CLOSED: "Session closed",
            SESSION_EXPIRED: "Session expired",
            COLLEGE_MISMATCH: "Wrong college",
            CLASS_GROUP_MISMATCH: "Wrong class group",
            ALREADY_MARKED: "Already marked",
            TEACHER_LOCATION_MISSING: "Teacher location missing",
            DUPLICATE_ATTENDANCE: "Duplicate attendance",
            SERVER_ERROR: "Server error"
        };

        return labels[reasonCode] || reasonMessage || "Suspicious attempt";
    }

    function updateSuspiciousCount() {
        const list = document.getElementById("suspiciousAttemptList");
        const countPill = document.getElementById("suspiciousAttemptCount");
        const emptyState = document.getElementById("suspiciousEmptyState");

        if (!list || !countPill) {
            return;
        }

        const count = list.querySelectorAll("li").length;

        countPill.textContent = count + (count === 1 ? " Alert" : " Alerts");

        if (emptyState) {
            emptyState.style.display = count > 0 ? "none" : "flex";
        }
    }

    function addSuspiciousAttempt(payload, prepend) {
        const list = document.getElementById("suspiciousAttemptList");

        if (!list || !payload) {
            return;
        }

        if (payload.attemptId) {
            const existingItem = list.querySelector("[data-attempt-id='" + payload.attemptId + "']");

            if (existingItem) {
                return;
            }
        }

        const item = document.createElement("li");
        item.className = "suspicious-attempt-item";
        item.setAttribute("data-attempt-id", payload.attemptId || "");

        const reasonLabel = getReasonLabel(payload.reasonCode, payload.reasonMessage);

        let distanceText = "";

        if (payload.distanceFromTeacher && Number(payload.distanceFromTeacher) > 0) {
            distanceText =
                "<span><i class='fa-solid fa-location-arrow'></i> " +
                payload.distanceFromTeacher +
                "m away</span>";
        }

        let radiusText = "";

        if (payload.allowedRadius && Number(payload.allowedRadius) > 0) {
            radiusText =
                "<span><i class='fa-solid fa-circle-dot'></i> Radius " +
                payload.allowedRadius +
                "m</span>";
        }

        let accuracyText = "";

        if (payload.gpsAccuracy && Number(payload.gpsAccuracy) > 0) {
            accuracyText =
                "<span><i class='fa-solid fa-crosshairs'></i> Accuracy " +
                payload.gpsAccuracy +
                "m</span>";
        }

        item.innerHTML = `
            <div class="suspicious-attempt-top">
                <div>
                    <strong>${payload.studentName || "Unknown Student"}</strong>
                    <small>${payload.enrollmentNumber || "Unknown"}</small>
                </div>

                <span class="suspicious-time">
                    ${formatTime(payload.createdAt)}
                </span>
            </div>

            <p>${reasonLabel}</p>

            <div class="suspicious-meta">
                ${distanceText}
                ${radiusText}
                ${accuracyText}
            </div>
        `;

        if (prepend) {
            list.prepend(item);
        } else {
            list.appendChild(item);
        }

        while (list.querySelectorAll("li").length > 10) {
            list.removeChild(list.lastElementChild);
        }

        updateSuspiciousCount();
    }

    function loadRecentSuspiciousAttempts() {
        const list = document.getElementById("suspiciousAttemptList");

        if (!list) {
            return;
        }

        fetch("/teacher/suspicious-attempts/recent", {
            method: "GET",
            credentials: "same-origin"
        })
            .then(function (res) {
                return res.json();
            })
            .then(function (data) {
                if (!data.success || !Array.isArray(data.attempts)) {
                    updateSuspiciousCount();
                    return;
                }

                data.attempts.reverse().forEach(function (attempt) {
                    addSuspiciousAttempt(attempt, false);
                });

                updateSuspiciousCount();
            })
            .catch(function (err) {
                console.log("Recent suspicious attempts load error:", err);
                updateSuspiciousCount();
            });
    }

    socket.on("attendance:marked", function (payload) {
        const card = findLiveCard(payload.sessionId);

        if (card) {
            const countElement = card.querySelector(".js-live-present-count");

            if (countElement) {
                countElement.textContent = payload.totalPresent;
            }

            const list = card.querySelector(".js-live-student-list");

            if (list) {
                const item = document.createElement("li");

                item.innerHTML =
                    "<strong>" +
                    payload.studentName +
                    "</strong> <span>" +
                    payload.enrollmentNumber +
                    "</span>";

                list.prepend(item);
            }
        }

        showTeacherToast(payload.studentName + " marked attendance", "success");
    });

    socket.on("attendance:ended:teacher", function (payload) {
        const card = findLiveCard(payload.sessionId);

        if (card) {
            card.classList.add("session-ended");

            const badge = card.querySelector(".live-badge");

            if (badge) {
                badge.textContent = "CLOSED";
            }
        }

        showTeacherToast("Attendance session closed", "success");
    });

    socket.on("attendance:suspicious", function (payload) {
        addSuspiciousAttempt(payload, true);

        showTeacherToast(
            "Suspicious attempt: " + (payload.studentName || "Student") + " - " + getReasonLabel(payload.reasonCode, payload.reasonMessage),
            "danger"
        );
    });

    loadRecentSuspiciousAttempts();
});