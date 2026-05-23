function getWebAuthnConfig(req) {
    const host = req.get("host");
    const protocol = req.protocol;

    return {
        rpName: "Attendify",
        rpID: host.split(":")[0],
        origin: protocol + "://" + host
    };
}

async function getSimpleWebAuthnServer() {
    const importedModule = await import("@simplewebauthn/server");
    return importedModule.default || importedModule;
}

module.exports = {
    getWebAuthnConfig,
    getSimpleWebAuthnServer
};