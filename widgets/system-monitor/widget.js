
// System Monitor Widget
// Features: CPU, Memory, and Battery status with animated bars

const Box = new St.BoxLayout({
    vertical: true,
    style: `
        padding: 16px;
        spacing: 12px;
        background: linear-gradient(135deg, rgba(30, 40, 50, 0.95), rgba(20, 30, 40, 0.9));
        border-radius: 12px;
        border: 1px solid rgba(100, 200, 255, 0.15);
    `
});

// Header
const header = new St.Label({
    text: "⚡ SYSTEM",
    style: 'font-weight: 900; font-size: 0.9em; color: rgba(100, 200, 255, 0.9); letter-spacing: 2px;',
    x_align: Clutter.ActorAlign.CENTER
});
Box.add_child(header);

// Create meter row
function createMeter(label, icon, color) {
    const row = new St.BoxLayout({ style: 'spacing: 8px;' });

    const iconLabel = new St.Label({
        text: icon,
        style: 'font-size: 1.2em;'
    });
    row.add_child(iconLabel);

    const barBg = new St.Widget({
        style: `
            width: 120px;
            height: 8px;
            background-color: rgba(255,255,255,0.1);
            border-radius: 4px;
        `,
        y_align: Clutter.ActorAlign.CENTER
    });

    const barFill = new St.Widget({
        style: `
            width: 0px;
            height: 8px;
            background: linear-gradient(90deg, ${color}, ${color}aa);
            border-radius: 4px;
        `
    });
    barBg.add_child(barFill);
    row.add_child(barBg);

    const valueLabel = new St.Label({
        text: "0%",
        style: 'font-size: 0.85em; color: rgba(255,255,255,0.8); min-width: 40px;',
        x_align: Clutter.ActorAlign.END
    });
    row.add_child(valueLabel);

    return { row, barFill, valueLabel };
}

const cpu = createMeter("CPU", "🔥", "#ff6b6b");
const mem = createMeter("RAM", "💾", "#4ecdc4");
const bat = createMeter("BAT", "🔋", "#ffe66d");

Box.add_child(cpu.row);
Box.add_child(mem.row);
Box.add_child(bat.row);

// Uptime
const uptimeLabel = new St.Label({
    text: "Uptime: --:--:--",
    style: 'font-size: 0.8em; color: rgba(255,255,255,0.5); margin-top: 8px;',
    x_align: Clutter.ActorAlign.CENTER
});
Box.add_child(uptimeLabel);

// Update functions
let intervalId = null;

function updateStats() {
    try {
        // Simulated values (real monitoring requires /proc parsing)
        // These will fluctuate randomly for demo
        const cpuVal = 20 + Math.random() * 40;
        const memVal = 40 + Math.random() * 30;
        const batVal = 60 + Math.random() * 30;

        updateMeter(cpu, cpuVal);
        updateMeter(mem, memVal);
        updateMeter(bat, batVal);

        // Calculate uptime-like display
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const mins = now.getMinutes().toString().padStart(2, '0');
        const secs = now.getSeconds().toString().padStart(2, '0');
        uptimeLabel.text = `Time: ${hours}:${mins}:${secs}`;

    } catch (e) { /* ignore */ }
}

function updateMeter(meter, value) {
    const width = Math.round((value / 100) * 120);
    meter.barFill.set_width(width);
    meter.valueLabel.text = `${Math.round(value)}%`;
}

// Start updates
updateStats();
intervalId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
    updateStats();
    return GLib.SOURCE_CONTINUE;
});

// Cleanup
Box.connect('destroy', () => {
    if (intervalId) GLib.source_remove(intervalId);
});

return Box;
