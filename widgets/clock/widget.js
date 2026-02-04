
// Elegant Digital Clock Widget
// Features: Time, Date, Animated Seconds Bar

const Box = new St.BoxLayout({
    vertical: true,
    style: `
        padding: 16px 24px;
        background: linear-gradient(145deg, rgba(20, 30, 50, 0.95), rgba(40, 50, 80, 0.9));
        border-radius: 16px;
        border: 1px solid rgba(100, 150, 255, 0.2);
    `
});

// Time Display
const timeLabel = new St.Label({
    text: "00:00",
    style: `
        font-size: 3.5em;
        font-weight: 200;
        color: white;
        letter-spacing: 4px;
        text-shadow: 0 0 20px rgba(100, 180, 255, 0.5);
    `,
    x_align: Clutter.ActorAlign.CENTER
});
Box.add_child(timeLabel);

// Seconds Bar Container
const barContainer = new St.Widget({
    style: `
        width: 180px;
        height: 4px;
        background-color: rgba(255,255,255,0.1);
        border-radius: 2px;
        margin: 8px 0;
    `,
    x_align: Clutter.ActorAlign.CENTER
});

const barFill = new St.Widget({
    style: `
        width: 0px;
        height: 4px;
        background: linear-gradient(90deg, rgba(100, 180, 255, 0.8), rgba(150, 100, 255, 0.8));
        border-radius: 2px;
    `
});
barContainer.add_child(barFill);
Box.add_child(barContainer);

// Date Display
const dateLabel = new St.Label({
    text: "Monday, Jan 1",
    style: `
        font-size: 1.1em;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.7);
        letter-spacing: 1px;
    `,
    x_align: Clutter.ActorAlign.CENTER
});
Box.add_child(dateLabel);

// Update Logic
let intervalId = null;

function updateClock() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds();

    timeLabel.text = `${hours}:${minutes}`;

    // Animate seconds bar
    const barWidth = Math.round((seconds / 60) * 180);
    barFill.set_style(`
        width: ${barWidth}px;
        height: 4px;
        background: linear-gradient(90deg, rgba(100, 180, 255, 0.8), rgba(150, 100, 255, 0.8));
        border-radius: 2px;
    `);

    // Format date
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    dateLabel.text = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;
}

// Start updates
updateClock();
intervalId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
    updateClock();
    return GLib.SOURCE_CONTINUE;
});

// Cleanup
Box.connect('destroy', () => {
    if (intervalId) GLib.source_remove(intervalId);
});

return Box;
