const { St, Clutter, GLib, Gst, Gio } = imports.gi;

// 1. IMPROVED AUDIO ENGINE
try { Gst.init(null); } catch (e) { log("Gst Init Failed"); }

function playSound({ freq = 440, durationMs = 50, volume = 0.5 }) {
    if (!soundOn) return;
    try {
        // Use a pipeline with an explicit duration via 'num-buffers'
        // 'samplesperbuffer' set to 441 (10ms at 44.1khz)
        let numBuffers = Math.floor(durationMs / 10);
        let pipelineStr = `audiotestsrc freq=${freq} volume=${volume} samplesperbuffer=441 num-buffers=${numBuffers} ! audioconvert ! autoaudiosink`;
        let p = Gst.parse_launch(pipelineStr);
        
        // Use the bus to catch the end of the sound for clean disposal
        let bus = p.get_bus();
        bus.add_signal_watch();
        bus.connect('message::eos', () => {
            p.set_state(Gst.State.NULL);
            bus.remove_signal_watch();
        });
        bus.connect('message::error', () => {
            p.set_state(Gst.State.NULL);
        });

        p.set_state(Gst.State.PLAYING);
    } catch (err) {
        log("Audio Error: " + err.message);
    }
}

// 2. STATE MANAGEMENT
const WORK_VAL = 25 * 60;
const BREAK_VAL = 5 * 60;
let timeLeft = WORK_VAL;
let targetTime = WORK_VAL;
let totalWorkSeconds = 0; 
let isRunning = false, soundOn = true, isDigital = false;
let sessions = 0, timerId = null, mode = 'WORK';

// 3. UI CONSTRUCTION
const MainBox = new St.BoxLayout({
    style: 'background: rgba(20,20,25,0.0); padding: 12px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.1);'
});

// Left: Circular Progress
const clockBtn = new St.Button({ can_focus: true });
const clockStack = new St.Widget({ layout_manager: new Clutter.BinLayout(), width: 74, height: 74 });
const canvas = new St.DrawingArea({ width: 74, height: 74 });
const label = new St.Label({ 
    text: "25", 
    style: 'font-weight: bold; font-size: 18px; color: white;',
    x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER 
});

canvas.connect('repaint', (area) => {
    let cr = area.get_context();
    let [w, h] = area.get_surface_size();
    let progress = timeLeft / targetTime;
    
    // Track Track
    cr.setSourceRGBA(1, 1, 1, 0.05);
    cr.setLineWidth(6);
    cr.arc(w/2, h/2, 32, 0, 2 * Math.PI);
    cr.stroke();

    // Progress Bar
    if (mode === 'WORK') cr.setSourceRGB(0.9, 0.3, 0.3); // Soft Red
    else cr.setSourceRGB(0.2, 0.8, 0.5); // Soft Green
    
    cr.setLineWidth(6);
    cr.setLineCap(1);
    cr.arc(w/2, h/2, 32, -Math.PI/2, (2 * Math.PI * progress) - Math.PI/2);
    cr.stroke();
    cr.$dispose();
});

clockStack.add_child(canvas);
clockStack.add_child(label);
clockBtn.set_child(clockStack);

// Right: Information & Controls
const rightBox = new St.BoxLayout({ vertical: true, style: 'margin-left: 15px;' });
const sessionLabel = new St.Label({ text: "IDLE", style: 'font-size: 11px; color: #aaa; font-weight: bold;' });
const totalTimeLabel = new St.Label({ text: "TOTAL: 0m", style: 'font-size: 10px; color: #666; margin-bottom: 6px;' });

const bS = 'width: 34px; height: 30px; font-size: 12px; background: #2a2a2a; border-radius: 8px; margin: 2px;';
const row1 = new St.BoxLayout();
const startBtn = new St.Button({ label: "▶", style: bS + 'background: #234d20;', can_focus: true });
const breakBtn = new St.Button({ label: "☕", style: bS, can_focus: true });
row1.add_child(startBtn); row1.add_child(breakBtn);

const row2 = new St.BoxLayout();
const soundBtn = new St.Button({ label: "🔊", style: bS, can_focus: true });
const resetBtn = new St.Button({ label: "↺", style: bS, can_focus: true });
row2.add_child(soundBtn); row2.add_child(resetBtn);

rightBox.add_child(sessionLabel);
rightBox.add_child(totalTimeLabel);
rightBox.add_child(row1);
rightBox.add_child(row2);

MainBox.add_child(clockBtn);
MainBox.add_child(rightBox);

// 4. CORE LOGIC
function formatTotalTime(s) {
    let h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `TOTAL: ${h}h ${m}m` : `TOTAL: ${m}m`;
}

function updateUI() {
    let m = Math.floor(timeLeft / 60), s = timeLeft % 60;
    label.text = isDigital ? `${m}:${s < 10 ? '0' : ''}${s}` : `${m}`;
    totalTimeLabel.text = formatTotalTime(totalWorkSeconds);
    canvas.queue_repaint();
}

function stopTimer() {
    isRunning = false;
    startBtn.label = "▶";
    startBtn.style = bS + 'background: #234d20;';
    if (timerId) { GLib.source_remove(timerId); timerId = null; }
}

function onTick() {
    if (timeLeft <= 0) {
        if (mode === 'WORK') {
            sessions++;
            sessionLabel.text = `SESSIONS: ${sessions}`;
            // Success Alarm: High-Low-High
            playSound({ freq: 880, durationMs: 150 });
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => playSound({ freq: 660, durationMs: 150 }));
        } else {
            sessionLabel.text = "READY TO WORK";
            playSound({ freq: 440, durationMs: 300 });
        }
        stopTimer();
        return GLib.SOURCE_REMOVE;
    }
    
    timeLeft--;
    if (mode === 'WORK') totalWorkSeconds++;

    // Notification Beep at specific intervals (5m, 1m)
    if (timeLeft === 300 || timeLeft === 60) {
        playSound({ freq: 550, durationMs: 100, volume: 0.3 });
    }

    updateUI();
    return GLib.SOURCE_CONTINUE;
}

// 5. EVENT HANDLERS
clockBtn.connect('clicked', () => {
    isDigital = !isDigital;
    label.style = isDigital ? 'font-size: 14px; font-weight: bold; color: white;' : 'font-size: 18px; font-weight: bold; color: white;';
    updateUI();
});

startBtn.connect('clicked', () => {
    playSound({ freq: 1000, durationMs: 10, volume: 0.2 }); // Tactile click
    if (isRunning) {
        stopTimer();
    } else {
        if (timeLeft <= 0) return;
        isRunning = true;
        startBtn.label = "Ⅱ";
        startBtn.style = bS + 'background: #6b2020;';
        sessionLabel.text = mode === 'WORK' ? "FOCUSING" : "BREAK";
        timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, onTick);
    }
});

breakBtn.connect('clicked', () => {
    stopTimer();
    mode = 'BREAK';
    targetTime = BREAK_VAL;
    timeLeft = BREAK_VAL;
    sessionLabel.text = "RESTING";
    updateUI();
});

soundBtn.connect('clicked', () => {
    soundOn = !soundOn;
    soundBtn.label = soundOn ? "🔊" : "🔇";
    if (soundOn) playSound({ freq: 800, durationMs: 30 });
});

resetBtn.connect('clicked', () => {
    stopTimer();
    mode = 'WORK';
    targetTime = WORK_VAL;
    timeLeft = WORK_VAL;
    sessionLabel.text = "READY";
    updateUI();
});

updateUI();
return MainBox;
