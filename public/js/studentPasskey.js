document.addEventListener("DOMContentLoaded", function () {
    const registerButton = document.getElementById("registerPasskeyBtn");
    const passkeyStatusText = document.getElementById("passkeyStatusText");

    if (registerButton) {
        registerButton.addEventListener("click", function () {
            registerStudentPasskey(registerButton, passkeyStatusText);
        });
    }
});

function passkeyLibraryReady() {
    return typeof SimpleWebAuthnBrowser !== "undefined";
}

function webauthnAvailable() {
    return typeof PublicKeyCredential !== "undefined";
}

function showPasskeyMessage(message, type) {
    if (typeof showMessage === "function") {
        showMessage(message, type || "success");
        return;
    }

    alert(message);
}

async function checkLocalPasskeySupport() {
    if (!webauthnAvailable()) {
        return {
            supported: false,
            message: "This browser does not support passkeys. Use latest Chrome, Edge, or Safari."
        };
    }

    try {
        const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();

        if (!available) {
            return {
                supported: false,
                message: "No local passkey option found. Do not use Chrome Guest mode. Use normal Chrome/Safari profile and make sure device lock, Touch ID, Face ID, or PIN is enabled."
            };
        }

        return {
            supported: true
        };

    } catch (err) {
        return {
            supported: false,
            message: "Passkey check failed. Try normal Chrome profile or Safari."
        };
    }
}

async function registerStudentPasskey(button, statusText) {
    try {
        if (!passkeyLibraryReady()) {
            showPasskeyMessage("Passkey library is not loaded. Check internet and refresh.", "error");
            return;
        }

        const support = await checkLocalPasskeySupport();

        if (!support.supported) {
            showPasskeyMessage(support.message, "error");
            return;
        }

        button.disabled = true;
        button.innerText = "Starting...";

        const optionsResponse = await fetch("/student/passkey/register/options", {
            method: "GET",
            credentials: "same-origin"
        });

        const optionsJSON = await optionsResponse.json();

        if (!optionsResponse.ok || optionsJSON.success === false) {
            throw new Error(optionsJSON.message || "Could not start passkey setup.");
        }

        button.innerText = "Verify on device...";

        const registrationResponse = await SimpleWebAuthnBrowser.startRegistration({
            optionsJSON: optionsJSON
        });

        const verifyResponse = await fetch("/student/passkey/register/verify", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "same-origin",
            body: JSON.stringify(registrationResponse)
        });

        const verifyJSON = await verifyResponse.json();

        if (!verifyResponse.ok || !verifyJSON.success) {
            throw new Error(verifyJSON.message || "Passkey setup failed.");
        }

        if (statusText) {
            statusText.innerText = "Passkey active";
        }

        button.innerText = "Passkey Registered";
        button.classList.add("marked");
        button.disabled = true;

        showPasskeyMessage("Passkey registered successfully.", "success");

        if (window.location.pathname === "/student/passkeys") {
            setTimeout(function () {
                window.location.reload();
            }, 800);
        }

    } catch (err) {
        console.log(err);

        showPasskeyMessage(
            err.message || "Passkey setup cancelled or failed.",
            "error"
        );

        button.disabled = false;
        button.innerText = "Set Up Passkey";
    }
}

async function getAttendanceTokenWithPasskey(sessionId) {
    if (!passkeyLibraryReady()) {
        throw new Error("Passkey library is not loaded. Refresh once.");
    }

    if (!webauthnAvailable()) {
        throw new Error("This browser does not support passkeys.");
    }

    const optionsResponse = await fetch("/student/attendance/passkey/options/" + sessionId, {
        method: "GET",
        credentials: "same-origin"
    });

    const optionsJSON = await optionsResponse.json();

    if (!optionsResponse.ok || optionsJSON.success === false) {
        throw new Error(optionsJSON.message || "Passkey verification could not start.");
    }

    const authenticationResponse = await SimpleWebAuthnBrowser.startAuthentication({
        optionsJSON: optionsJSON
    });

    const verifyResponse = await fetch("/student/attendance/passkey/verify/" + sessionId, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        credentials: "same-origin",
        body: JSON.stringify(authenticationResponse)
    });

    const verifyJSON = await verifyResponse.json();

    if (!verifyResponse.ok || !verifyJSON.success) {
        throw new Error(verifyJSON.message || "Passkey verification failed.");
    }

    return verifyJSON.attendanceToken;
}