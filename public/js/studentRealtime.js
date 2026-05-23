document.addEventListener("DOMContentLoaded", function () {
    if (typeof io === "undefined") {
        return;
    }

    const socket = io();

    socket.emit("student:join");

    function showRealtimeMessage(message, type) {
        if (typeof showMessage === "function") {
            showMessage(message, type || "success");
            return;
        }

        console.log(message);
    }

    function getScheduleCard(scheduleId) {
        return document.querySelector("[data-schedule-id='" + scheduleId + "']");
    }

    function getActionBox(card) {
        if (!card) {
            return null;
        }

        return card.querySelector(".js-schedule-action");
    }

    function setLiveUI(card, sessionId) {
        const actionBox = getActionBox(card);

        if (!actionBox) {
            return;
        }

        card.setAttribute("data-attendance-state", "live");
        card.setAttribute("data-session-id", sessionId);

        actionBox.innerHTML = `
            <span class="status-badge live">
                <i class="fa-solid fa-circle-dot"></i>
                Live Now
            </span>

            <button
                class="view-btn live"
                type="button"
                data-session-id="${sessionId}">
                Mark Attendance
            </button>
        `;

        const button = actionBox.querySelector("button[data-session-id]");

        if (button) {
            button.addEventListener("click", function () {
                if (typeof markAttendance === "function") {
                    markAttendance(sessionId, button);
                } else {
                    alert("Attendance script is not loaded. Please refresh once.");
                }
            });
        }
    }

    function setAbsentUI(card) {
        const actionBox = getActionBox(card);

        if (!actionBox) {
            return;
        }

        const currentState = card.getAttribute("data-attendance-state");

        if (currentState === "present" || currentState === "absent") {
            return;
        }

        card.setAttribute("data-attendance-state", "absent");

        actionBox.innerHTML = `
            <span class="status-badge absent">
                <i class="fa-solid fa-circle-xmark"></i>
                Absent
            </span>

            <button class="view-btn marked" type="button" disabled>
                Marked Absent
            </button>
        `;
    }

    socket.on("attendance:started", function (payload) {
        const card = getScheduleCard(payload.scheduleId);

        if (!card) {
            return;
        }

        const currentState = card.getAttribute("data-attendance-state");

        if (currentState === "present" || currentState === "absent") {
            return;
        }

        setLiveUI(card, payload.sessionId);
        showRealtimeMessage(
            "Attendance started for " + payload.subjectName + ". You can mark now.",
            "success"
        );
    });

    socket.on("attendance:ended", function (payload) {
        const card = getScheduleCard(payload.scheduleId);

        if (!card) {
            return;
        }

        const currentState = card.getAttribute("data-attendance-state");

        if (currentState === "live" || currentState === "waiting") {
            setAbsentUI(card);
            showRealtimeMessage("Attendance session ended.", "error");
        }
    });

    socket.on("attendance:marked:self", function (payload) {
        const card = getScheduleCard(payload.scheduleId);

        if (card) {
            card.setAttribute("data-attendance-state", "present");
        }
    });
});