
// Premium Pomodoro Widget with Chime Sounds
// Features: Timer, Start/Pause/Reset, Sound Alarm, Animated Progress Ring

const WORK_TIME = 25 * 60;
const BREAK_TIME = 5 * 60;
const LONG_BREAK_TIME = 15 * 60;

// State
let timeLeft = WORK_TIME;
let totalTime = WORK_TIME;
let isRunning = false;
let mode = 'work'; // 'work', 'break', 'long-break'
let intervalId = null;
let sessions = 0;

// Main Container with Glass Effect
const Box = new St.BoxLayout({
    vertical: true,
    style: `
        padding: 20px;
        spacing: 12px;
        background: linear-gradient(135deg, rgba(40, 20, 60, 0.9), rgba(80, 40, 100, 0.8));
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.15);
    `
});

// --- Header with Session Counter ---
const header = new St.BoxLayout({
    x_align: Clutter.ActorAlign.CENTER,
    style: 'spacing: 8px;'
});
const title = new St.Label({
    text: "🍅 POMODORO",
    style: 'font-weight: 900; font-size: 1.1em; color: rgba(255,255,255,0.9); letter-spacing: 2px;'
});
const sessionLabel = new St.Label({
    text: "Session 0",
    style: 'font-size: 0.85em; color: rgba(255,200,100,0.8); margin-left: 10px;'
});
header.add_child(title);
header.add_child(sessionLabel);
Box.add_child(header);

// --- Timer Ring (Simulated with CSS) ---
const ringContainer = new St.Widget({
    x_align: Clutter.ActorAlign.CENTER,
    style: `
        width: 140px;
        height: 140px;
        margin: 10px 0;
    `
});

const ringBg = new St.Widget({
    style: `
        width: 140px;
        height: 140px;
        border-radius: 70px;
        border: 8px solid rgba(255,255,255,0.15);
        background-color: rgba(0, 0, 0, 0.3);
    `
});
ringContainer.add_child(ringBg);

const timeLabel = new St.Label({
    text: "25:00",
    style: `
        font-size: 2.4em;
        font-weight: bold;
        color: white;
        text-shadow: 0 2px 10px rgba(0,0,0,0.5);
    `,
    x_align: Clutter.ActorAlign.CENTER,
    y_align: Clutter.ActorAlign.CENTER
});

// Position time label in center of ring
const timeLabelContainer = new St.BoxLayout({
    x_align: Clutter.ActorAlign.CENTER,
    y_align: Clutter.ActorAlign.CENTER,
    x_expand: true,
    y_expand: true,
    style: 'width: 140px; height: 140px;'
});
timeLabelContainer.add_child(timeLabel);
ringContainer.add_child(timeLabelContainer);

Box.add_child(ringContainer);

// Mode Label
const modeLabel = new St.Label({
    text: "FOCUS TIME",
    style: 'font-size: 0.9em; font-weight: 600; color: rgba(255,150,150,0.9); text-align: center; letter-spacing: 1px;',
    x_align: Clutter.ActorAlign.CENTER
});
Box.add_child(modeLabel);

// --- Controls ---
const controls = new St.BoxLayout({
    style: 'spacing: 16px; margin-top: 8px;',
    x_align: Clutter.ActorAlign.CENTER
});

const createBtn = (icon, onClick, bgColor = 'rgba(255,255,255,0.12)') => {
    const btn = new St.Button({
        style_class: 'button',
        child: new St.Icon({ icon_name: icon, style_class: 'popup-menu-icon', style: 'color: white;' }),
        style: `
            padding: 12px;
            background-color: ${bgColor};
            border-radius: 50px;
            transition-duration: 150ms;
        `
    });
    btn.connect('clicked', onClick);
    btn.connect('enter-event', () => btn.set_style(btn.get_style().replace(bgColor, 'rgba(255,255,255,0.25)')));
    btn.connect('leave-event', () => btn.set_style(btn.get_style().replace('rgba(255,255,255,0.25)', bgColor)));
    return btn;
};

const playBtn = createBtn('media-playback-start-symbolic', () => toggleTimer(), 'rgba(100,255,150,0.3)');
const resetBtn = createBtn('view-refresh-symbolic', () => resetTimer());
const skipBtn = createBtn('media-skip-forward-symbolic', () => skipSession());

controls.add_child(resetBtn);
controls.add_child(playBtn);
controls.add_child(skipBtn);
Box.add_child(controls);

// --- Mode Switcher Pills ---
const modeBox = new St.BoxLayout({
    x_align: Clutter.ActorAlign.CENTER,
    style: 'spacing: 8px; margin-top: 12px;'
});

const createPill = (label, targetMode, color) => {
    const btn = new St.Button({
        label: label,
        style: `
            padding: 6px 14px;
            border-radius: 20px;
            font-size: 0.8em;
            font-weight: 600;
            background-color: ${mode === targetMode ? color : 'rgba(255,255,255,0.1)'};
            color: ${mode === targetMode ? 'white' : 'rgba(255,255,255,0.6)'};
            transition-duration: 150ms;
        `
    });
    btn.connect('clicked', () => setMode(targetMode));
    return btn;
};

const workBtn = createPill("Focus", 'work', 'rgba(255,100,100,0.6)');
const breakBtn = createPill("Break", 'break', 'rgba(100,200,100,0.6)');
const longBreakBtn = createPill("Long", 'long-break', 'rgba(100,150,255,0.6)');

modeBox.add_child(workBtn);
modeBox.add_child(breakBtn);
modeBox.add_child(longBreakBtn);
Box.add_child(modeBox);

// --- Logic Functions ---

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function updateDisplay() {
    timeLabel.text = formatTime(timeLeft);

    // Update ring progress (change border color based on progress)
    const progress = timeLeft / totalTime;
    const hue = mode === 'work' ? 0 : (mode === 'break' ? 120 : 220);
    const saturation = 60 + (40 * (1 - progress));
    ringBg.set_style(`
        width: 140px;
        height: 140px;
        border-radius: 70px;
        border: 8px solid hsla(${hue}, ${saturation}%, 60%, ${0.3 + 0.7 * (1 - progress)});
        background-color: rgba(0, 0, 0, 0.3);
    `);
}

function playChime(type = 'complete') {
    try {
        // Try GNOME sound system first
        const soundNames = {
            'complete': 'complete',
            'start': 'bell',
            'tick': 'message'
        };
        global.display.get_sound_context().play_theme_sound(0, soundNames[type], type, null);
    } catch (e) {
        // Fallback to paplay
        try {
            const sounds = {
                'complete': '/usr/share/sounds/gnome/default/alerts/glass.ogg',
                'start': '/usr/share/sounds/freedesktop/stereo/bell.oga',
                'tick': '/usr/share/sounds/freedesktop/stereo/message.oga'
            };
            GLib.spawn_command_line_async(`paplay ${sounds[type] || sounds.complete}`);
        } catch (e2) { /* silent fail */ }
    }
}

function toggleTimer() {
    if (isRunning) {
        // Pause
        isRunning = false;
        if (intervalId) {
            GLib.source_remove(intervalId);
            intervalId = null;
        }
        playBtn.child.icon_name = 'media-playback-start-symbolic';
    } else {
        // Start
        isRunning = true;
        playChime('start');
        playBtn.child.icon_name = 'media-playback-pause-symbolic';
        intervalId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            if (timeLeft > 0) {
                timeLeft--;
                updateDisplay();

                // Play tick sound at 5, 4, 3, 2, 1 seconds
                if (timeLeft <= 5 && timeLeft > 0) {
                    playChime('tick');
                }

                return GLib.SOURCE_CONTINUE;
            } else {
                // Timer complete!
                playChime('complete');
                isRunning = false;
                intervalId = null;
                playBtn.child.icon_name = 'media-playback-start-symbolic';

                // Auto-switch mode
                if (mode === 'work') {
                    sessions++;
                    sessionLabel.text = `Session ${sessions}`;
                    if (sessions % 4 === 0) {
                        setMode('long-break');
                    } else {
                        setMode('break');
                    }
                } else {
                    setMode('work');
                }

                return GLib.SOURCE_REMOVE;
            }
        });
    }
}

function resetTimer() {
    isRunning = false;
    if (intervalId) {
        GLib.source_remove(intervalId);
        intervalId = null;
    }
    playBtn.child.icon_name = 'media-playback-start-symbolic';

    switch (mode) {
        case 'work': timeLeft = WORK_TIME; totalTime = WORK_TIME; break;
        case 'break': timeLeft = BREAK_TIME; totalTime = BREAK_TIME; break;
        case 'long-break': timeLeft = LONG_BREAK_TIME; totalTime = LONG_BREAK_TIME; break;
    }
    updateDisplay();
}

function skipSession() {
    if (mode === 'work') {
        sessions++;
        sessionLabel.text = `Session ${sessions}`;
        if (sessions % 4 === 0) {
            setMode('long-break');
        } else {
            setMode('break');
        }
    } else {
        setMode('work');
    }
}

function setMode(newMode) {
    mode = newMode;

    // Update button styles
    const modes = { 'work': workBtn, 'break': breakBtn, 'long-break': longBreakBtn };
    const colors = { 'work': 'rgba(255,100,100,0.6)', 'break': 'rgba(100,200,100,0.6)', 'long-break': 'rgba(100,150,255,0.6)' };
    const labels = { 'work': 'FOCUS TIME', 'break': 'SHORT BREAK', 'long-break': 'LONG BREAK' };

    Object.keys(modes).forEach(m => {
        const btn = modes[m];
        const isActive = m === newMode;
        btn.set_style(`
            padding: 6px 14px;
            border-radius: 20px;
            font-size: 0.8em;
            font-weight: 600;
            background-color: ${isActive ? colors[m] : 'rgba(255,255,255,0.1)'};
            color: ${isActive ? 'white' : 'rgba(255,255,255,0.6)'};
            transition-duration: 150ms;
        `);
    });

    modeLabel.text = labels[newMode];
    resetTimer();
}

// Cleanup on destroy
Box.connect('destroy', () => {
    if (intervalId) GLib.source_remove(intervalId);
});

// Initial display
updateDisplay();

return Box;
