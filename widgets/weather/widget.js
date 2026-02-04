
// Mock Weather Widget
const box = new St.BoxLayout({ vertical: true, style: 'spacing: 4px;' });

const icon = new St.Icon({
    icon_name: 'weather-clear-symbolic',
    style_class: 'popup-menu-icon',
    style: 'icon-size: 48px; color: yellow;'
});
box.add_child(icon);

const temp = new St.Label({
    text: "72°F",
    style: 'font-size: 2em; font-weight: bold; color: white;',
    x_align: Clutter.ActorAlign.CENTER
});
box.add_child(temp);

const desc = new St.Label({
    text: "Sunny",
    style: 'font-size: 1em; color: rgba(255,255,255,0.8);',
    x_align: Clutter.ActorAlign.CENTER
});
box.add_child(desc);

return box;
