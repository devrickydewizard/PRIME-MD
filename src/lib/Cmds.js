let commands = [];
const tabCmds = [];

const evt = {
    events: {},
    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
    },
    emit(event, data) {
        if (this.events[event]) {
            this.events[event].forEach((callback) => callback(data));
        }
    },
};

function gmd(obj, functions) {
    let infoComs = obj;

    if (!infoComs.category) infoComs.category = "general";
    if (!infoComs.react) infoComs.react = "🚀";
    if (infoComs.dontAddCommandList === undefined) {
        infoComs.dontAddCommandList = false;
    }

    infoComs.function = functions;

    try {
        const stack = new Error().stack;
        const match = stack?.split('\n')[2]?.match(/\((.*):\d+:\d+\)/);
        infoComs.filename = match ? match[1] : "unknown";
    } catch {
        infoComs.filename = "unknown";
    }

    commands.push(infoComs);
    return infoComs;
}

// Aliases
const cmd = gmd;
const bot = gmd;
const amd = gmd;
const ke = gmd;
const plugin = gmd;

evt.commands = commands;

module.exports = {
    gmd,
    cmd,
    bot,
    amd,
    ke,
    plugin,
    commands,
    tabCmds,
    evt
};
