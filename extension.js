
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

// --- Global Interaction State (Singleton) ---
// This ensures only ONE widget can be dragged/resized at a time
const InteractionState = {
    activeWidget: null,
    activeHandle: null,
    mode: null, // 'drag' or 'resize'
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
    initialW: 0,
    initialH: 0,
    stageHandlerId: 0,
    timeoutId: 0,  // Auto-release timeout

    // Reset timeout on activity - auto-release after 2 seconds of no motion
    resetTimeout() {
        if (this.timeoutId) {
            GLib.source_remove(this.timeoutId);
            this.timeoutId = 0;
        }
        this.timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
            if (this.mode) {
                if (this.activeWidget) {
                    this.activeWidget.saveState();
                }
                if (this.activeHandle) {
                    this.activeHandle.remove_style_class_name('active');
                }
                this.clear();
            }
            return GLib.SOURCE_REMOVE;
        });
    },

    clear() {
        if (this.stageHandlerId) {
            global.stage.disconnect(this.stageHandlerId);
            this.stageHandlerId = 0;
        }
        if (this.timeoutId) {
            GLib.source_remove(this.timeoutId);
            this.timeoutId = 0;
        }
        this.activeWidget = null;
        this.activeHandle = null;
        this.mode = null;
    }
};

// --- WidgetMenuButton ---
const WidgetMenuButton = GObject.registerClass(
    class WidgetMenuButton extends PanelMenu.Button {
        constructor(extension) {
            super(0.0, 'anyWidget', false);
            this.extension = extension;

            const icon = new St.Icon({
                icon_name: 'preferences-system-windows-symbolic',
                style_class: 'system-status-icon',
            });
            this.add_child(icon);

            this._buildMenu();
            this._settingsChangedId = this.extension.settings.connect('changed::widget-list', () => {
                if (this.extension._internalUpdate) return;
                this._buildMenu();
            });
        }

        _buildMenu() {
            this.menu.removeAll();
            const widgets = this.extension.getWidgetConfigs();

            this.menu.addAction('Create New Widget', () => {
                this.extension.openPreferences();
            });
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            if (widgets.length === 0) {
                const item = new PopupMenu.PopupMenuItem('No Active Widgets', { reactive: false });
                this.menu.addMenuItem(item);
            } else {
                widgets.forEach(config => {
                    const item = new PopupMenu.PopupBaseMenuItem({ activate: false });
                    const box = new St.BoxLayout({ x_align: Clutter.ActorAlign.START, x_expand: true });
                    item.add_child(box);

                    const toggle = new PopupMenu.Switch(config.enabled !== false);
                    toggle.connect('notify::state', () => {
                        this.extension.toggleWidget(config.id, toggle.state);
                    });

                    const label = new St.Label({
                        text: config.name || 'Untitled',
                        y_align: Clutter.ActorAlign.CENTER,
                        style: 'font-weight: bold; padding-right: 10px;'
                    });

                    box.add_child(label);
                    const spacer = new St.Widget({ x_expand: true });
                    item.add_child(spacer);

                    if (config.enabled !== false) {
                        const restartBtn = new St.Button({
                            style_class: 'button',
                            child: new St.Icon({ icon_name: 'view-refresh-symbolic', style_class: 'popup-menu-icon' }),
                            x_align: Clutter.ActorAlign.CENTER,
                            y_align: Clutter.ActorAlign.CENTER
                        });
                        restartBtn.connect('clicked', () => {
                            this.extension.reloadWidget(config.id);
                            this.menu.close();
                        });
                        item.add_child(restartBtn);
                    }

                    item.add_child(toggle);
                    this.menu.addMenuItem(item);
                });
            }

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this.menu.addAction('Extensions Settings', () => this.extension.openPreferences());
        }

        destroy() {
            if (this._settingsChangedId) {
                this.extension.settings.disconnect(this._settingsChangedId);
            }
            super.destroy();
        }
    }
);

// --- Resize Handle ---
const ResizeHandle = GObject.registerClass(
    class ResizeHandle extends St.Widget {
        _init(widget) {
            super._init({
                style_class: 'any-widget-resize-handle',
                reactive: true,
                x_align: Clutter.ActorAlign.END,
                y_align: Clutter.ActorAlign.END,
                x_expand: true,
                y_expand: true,
                width: 24,
                height: 24
            });
            this.widget = widget;

            this._icon = new St.Icon({
                icon_name: 'list-add-symbolic',
                style_class: 'popup-menu-icon'
            });
            this.add_child(this._icon);

            // Start resize on press
            this.connect('button-press-event', (actor, event) => {
                if (event.get_button() === 1 && !InteractionState.mode) {
                    [InteractionState.startX, InteractionState.startY] = event.get_coords();
                    InteractionState.initialW = this.widget.width;
                    InteractionState.initialH = this.widget.height;
                    InteractionState.activeWidget = this.widget;
                    InteractionState.activeHandle = this;
                    InteractionState.mode = 'resize';

                    this.add_style_class_name('active');
                    InteractionState.resetTimeout();  // Start safety timeout

                    // Attach to stage for reliable event capture
                    InteractionState.stageHandlerId = global.stage.connect('event', (stage, evt) => {
                        return this._handleStageEvent(evt);
                    });

                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            });
        }

        _handleStageEvent(event) {
            if (InteractionState.mode !== 'resize' || InteractionState.activeHandle !== this) {
                return Clutter.EVENT_PROPAGATE;
            }

            const type = event.type();

            if (type === Clutter.EventType.MOTION) {
                InteractionState.resetTimeout();  // Keep resetting while active
                let [currX, currY] = event.get_coords();
                let w = Math.max(50, InteractionState.initialW + (currX - InteractionState.startX));
                let h = Math.max(50, InteractionState.initialH + (currY - InteractionState.startY));
                this.widget.set_size(w, h);
                this.widget.min_width = w;
                this.widget.min_height = h;
                return Clutter.EVENT_STOP;
            }
            else if (type === Clutter.EventType.BUTTON_RELEASE) {
                this.remove_style_class_name('active');
                this.widget.saveState();
                InteractionState.clear();
                return Clutter.EVENT_STOP;
            }

            return Clutter.EVENT_PROPAGATE;
        }
    }
);


// --- AnyWidget (Container) ---
const AnyWidget = GObject.registerClass(
    {
        GTypeName: 'AnyWidget',
    },
    class AnyWidget extends St.BoxLayout {
        _init(config, extension) {
            super._init({
                style_class: 'any-widget-container',
                reactive: true,
                can_focus: true,
                track_hover: true,  // Enable for CSS :hover on resize handle
                vertical: true,
                x_expand: false,
                y_expand: false,
                x_align: Clutter.ActorAlign.START,
                y_align: Clutter.ActorAlign.START
            });
            this.extension = extension;
            this.id = config.id;

            // Blur Effect
            this._blurEffect = new Shell.BlurEffect({
                mode: Shell.BlurMode.BACKGROUND
            });
            if ('brightness' in this._blurEffect) this._blurEffect.brightness = 1.0;
            this.add_effect(this._blurEffect);

            this._contentBox = new St.Widget({
                x_expand: true,
                y_expand: true,
                layout_manager: new Clutter.BinLayout()
            });
            this.add_child(this._contentBox);

            this.set_layout_manager(new Clutter.BinLayout());

            // Start drag on press - ONLY if clicking on widget background, not child buttons
            this.connect('button-press-event', (actor, event) => {
                if (this.config.click_through) return Clutter.EVENT_PROPAGATE;

                // Helper to check if an actor is an interactive element
                const isInteractive = (actor) => {
                    if (!actor) return false;

                    // 1. Check GType name (catches StButton, StEntry, etc.)
                    const typeName = actor.constructor?.$gtype?.name || '';
                    if (typeName.includes('Button') ||
                        typeName.includes('Entry') ||
                        typeName.includes('Icon')) return true;

                    // 2. Check style class (often used for custom buttons)
                    const styleClass = actor.style_class || '';
                    if (styleClass.includes('button')) return true;

                    // 3. Check for specific signals (most reliable for custom widgets)
                    if (actor.connect && actor.has_signal && actor.has_signal('clicked')) return true;

                    // 4. Fallback: If it's reactive and NOT our structural containers, assume interactive
                    // This is the key fix: assume any reactive child is meant to be clicked, not dragged
                    if (actor.reactive && actor !== this && actor !== this._contentBox) return true;

                    return false;
                };

                // Traverse up from source to find any interactive element
                let source = event.get_source();
                while (source && source !== this) {
                    if (isInteractive(source)) {
                        // Found a button or interactive element - don't start drag
                        return Clutter.EVENT_PROPAGATE;
                    }
                    source = source.get_parent();
                }

                if (event.get_button() === 1 && !InteractionState.mode) {
                    [InteractionState.startX, InteractionState.startY] = event.get_coords();
                    InteractionState.initialX = this.x;
                    InteractionState.initialY = this.y;
                    InteractionState.activeWidget = this;
                    InteractionState.mode = 'drag-pending';
                    InteractionState.resetTimeout();
                    return Clutter.EVENT_PROPAGATE;
                }
                return Clutter.EVENT_PROPAGATE;
            });

            // Monitor motion to detect drag threshold
            this.connect('motion-event', (actor, event) => {
                if (InteractionState.mode === 'drag-pending' && InteractionState.activeWidget === this) {
                    let [currX, currY] = event.get_coords();
                    let dx = currX - InteractionState.startX;
                    let dy = currY - InteractionState.startY;

                    const DRAG_THRESHOLD = 8;  // pixels to start drag
                    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
                        // NOW we start dragging - attach to stage for reliable capture
                        InteractionState.mode = 'drag';
                        this.get_parent().set_child_above_sibling(this, null);

                        InteractionState.stageHandlerId = global.stage.connect('event', (stage, evt) => {
                            return this._handleStageEvent(evt);
                        });

                        // Move immediately
                        this.set_position(
                            InteractionState.initialX + dx,
                            InteractionState.initialY + dy
                        );
                        return Clutter.EVENT_STOP;
                    }
                }
                return Clutter.EVENT_PROPAGATE;
            });

            // Release while pending = it was a click, not a drag
            this.connect('button-release-event', (actor, event) => {
                if (InteractionState.mode === 'drag-pending' && InteractionState.activeWidget === this) {
                    // Still pending = was just a click, clear state and let it propagate
                    InteractionState.clear();
                }
                return Clutter.EVENT_PROPAGATE;
            });

            this.updateConfig(config);

            // Resize Handle
            this._resizeHandle = new ResizeHandle(this);
            this.add_child(this._resizeHandle);
            this._resizeHandle.opacity = 0; // Hide by default

            // Toggle visibility on hover
            this.connect('notify::hover', () => {
                this._resizeHandle.opacity = this.hover ? 255 : 0;
            });
        }

        _handleStageEvent(event) {
            // Only handle when in active drag mode
            if (InteractionState.mode !== 'drag' || InteractionState.activeWidget !== this) {
                return Clutter.EVENT_PROPAGATE;
            }

            const type = event.type();

            if (type === Clutter.EventType.MOTION) {
                let [currX, currY] = event.get_coords();
                InteractionState.resetTimeout();
                this.set_position(
                    InteractionState.initialX + (currX - InteractionState.startX),
                    InteractionState.initialY + (currY - InteractionState.startY)
                );
                return Clutter.EVENT_STOP;
            }
            else if (type === Clutter.EventType.BUTTON_RELEASE) {
                this.x = Math.round(this.x);
                this.y = Math.round(this.y);
                this.saveState();
                InteractionState.clear();
                return Clutter.EVENT_STOP;
            }

            return Clutter.EVENT_PROPAGATE;
        }

        updateConfig(config) {
            this.config = config;

            this.fixed_position_set = true;
            this.set_position(config.widget_position_x || 100, config.widget_position_y || 100);

            const w = config.width || 200;
            const h = config.height || 200;
            this.set_size(w, h);
            this.min_width = w;
            this.min_height = h;
            this.natural_width = w;
            this.natural_height = h;

            this.set_pivot_point(0.5, 0.5);

            if (config.click_through) {
                this.reactive = false;
                if (this._resizeHandle) this._resizeHandle.reactive = false;
            } else {
                this.reactive = true;
                if (this._resizeHandle) this._resizeHandle.reactive = true;
            }

            const bgColor = config.background_color || 'rgba(0,0,0,0.5)';
            const radius = config.corner_radius || 12;
            const borderW = config.border_width || 0;
            const borderColor = config.border_color || 'rgba(255,255,255,0.2)';
            const shadowBlur = config.shadow_blur || 0;
            const shadowColor = config.shadow_color || 'rgba(0,0,0,0.5)';

            let style = `
                background-color: ${bgColor};
                border-radius: ${radius}px;
                border: ${borderW}px solid ${borderColor};
            `;

            if (shadowBlur > 0) {
                style += `box-shadow: 0 4px ${shadowBlur}px ${shadowColor};`;
            }

            this.set_style(style);
            this.set_opacity(config.transparency !== undefined ? (config.transparency * 2.55) : 255);

            // Blur Fallback
            if (config.background_blur) {
                const val = config.blur_radius || 30;
                if ('radius' in this._blurEffect) this._blurEffect.radius = val;
                else if ('sigma' in this._blurEffect) this._blurEffect.sigma = val;
                else if ('blur_radius' in this._blurEffect) this._blurEffect.blur_radius = val;
            } else {
                if ('radius' in this._blurEffect) this._blurEffect.radius = 0;
                else if ('sigma' in this._blurEffect) this._blurEffect.sigma = 0;
                else if ('blur_radius' in this._blurEffect) this._blurEffect.blur_radius = 0;
            }

            this.reloadContent();
            this.updateContainer(config.always_on_top);
        }

        updateContainer(alwaysOnTop) {
            const parent = this.get_parent();
            if (!parent) return;

            if (alwaysOnTop) {
                if (parent === Main.layoutManager._backgroundGroup) {
                    parent.remove_child(this);
                    Main.layoutManager.addChrome(this, {
                        affectsInputRegion: true,
                        trackFullscreen: false
                    });
                } else {
                    // Already in uiGroup/Chrome, just ensure on top
                    parent.set_child_above_sibling(this, null);
                }
            } else {
                if (parent !== Main.layoutManager._backgroundGroup) {
                    Main.layoutManager.removeChrome(this);
                    Main.layoutManager._backgroundGroup.add_child(this);
                }
            }
        }

        saveState() {
            // Atomic save to prevent race conditions or wrong-widget updates
            if (!this.extension || !this.extension.settings || !this.id) return;

            try {
                let currentList = [];
                try {
                    currentList = JSON.parse(this.extension.settings.get_string('widget-list') || '[]');
                } catch (e) { currentList = []; }

                const index = currentList.findIndex(w => w.id === this.id);
                if (index !== -1) {
                    // Update ONLY positioning and size to avoid overwriting other props (like color/code)
                    currentList[index].x = Math.round(this.x);
                    currentList[index].y = Math.round(this.y);
                    currentList[index].width = Math.round(this.width);
                    currentList[index].height = Math.round(this.height);

                    // Save back - SUPPRESS internal update to prevent reloading all widgets
                    if (this.extension) this.extension._internalUpdate = true;
                    this.extension.settings.set_string('widget-list', JSON.stringify(currentList));
                    if (this.extension) this.extension._internalUpdate = false;
                }
            } catch (e) {
                console.warn(`[AnyWidget] Failed to save state: ${e.message}`);
                if (this.extension) this.extension._internalUpdate = false;
            }
        }

        async reloadContent() {
            if (this._contentBox) this._contentBox.destroy_all_children();

            try {
                let code = "";
                if (this.config.loader_type === 'file' && this.config.loader_source) {
                    const file = Gio.File.new_for_path(this.config.loader_source);
                    const [success, contents] = file.load_contents(null);
                    if (success) {
                        code = new TextDecoder().decode(contents);
                    } else {
                        throw new Error("Failed to load file");
                    }
                } else {
                    code = this.config.loader_source || "";
                }

                if (!code.trim()) {
                    if (this._contentBox) this._contentBox.add_child(new St.Label({ text: "No code" }));
                    this.show();
                    return;
                }

                const func = new Function('St', 'Clutter', 'GObject', 'Gio', 'GLib', 'Main', 'console', 'global', `
                    return (async () => {
                        try {
                            ${code}
                        } catch(e) { 
                            console.error("AnyWidget User Code Error:", e);
                            return new St.Label({text: "Error: " + e.toString()}); 
                        }
                    })();
                `);

                const result = await func(St, Clutter, GObject, Gio, GLib, Main, console, global);

                if (result instanceof Clutter.Actor) {
                    if (this._contentBox) this._contentBox.add_child(result);
                } else {
                    if (result !== undefined && result !== null) {
                        if (this._contentBox) this._contentBox.add_child(new St.Label({ text: "Error: Return Actor" }));
                    }
                }

                this.show();

            } catch (e) {
                global.logError(e);
                if (this._contentBox) this._contentBox.add_child(new St.Label({ text: `Err: ${e.message}` }));
                this.show();
            }
        }
    }
);

export default class AnyWidgetExtension extends Extension {
    enable() {
        this.settings = this.getSettings();
        this._widgets = new Map();
        this._internalUpdate = false;

        this._widgetsChangedId = this.settings.connect('changed::widget-list', () => {
            if (this._internalUpdate) return;

            if (this._pendingRefreshId) {
                GLib.source_remove(this._pendingRefreshId);
                this._pendingRefreshId = 0;
            }

            this._pendingRefreshId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                this.refreshWidgets();
                this._pendingRefreshId = 0;
                return GLib.SOURCE_REMOVE;
            });
        });

        this._indicator = new WidgetMenuButton(this);
        Main.panel.addToStatusArea('anyWidget-indicator', this._indicator);

        this.refreshWidgets();
    }

    disable() {
        // Clear any active interactions
        InteractionState.clear();

        if (this._pendingRefreshId) {
            GLib.source_remove(this._pendingRefreshId);
            this._pendingRefreshId = 0;
        }

        if (this._widgetsChangedId) {
            this.settings.disconnect(this._widgetsChangedId);
            this._widgetsChangedId = null;
        }

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        this._widgets.forEach(w => {
            if (Main.layoutManager.uiGroup.contains(w)) {
                Main.layoutManager.uiGroup.remove_child(w);
            }
            w.destroy();
        });
        this._widgets.clear();
        this.settings = null;
    }

    getWidgetConfigs() {
        try {
            return JSON.parse(this.settings.get_string('widget-list') || '[]');
        } catch (e) {
            return [];
        }
    }

    saveWidgetConfigs(configs) {
        this._internalUpdate = true;
        this.settings.set_string('widget-list', JSON.stringify(configs));
        this._internalUpdate = false;
    }

    refreshWidgets() {
        const configs = this.getWidgetConfigs();
        const activeIds = new Set();

        configs.forEach(config => {
            if (config.enabled === false) return;

            activeIds.add(config.id);

            if (this._widgets.has(config.id)) {
                const widget = this._widgets.get(config.id);
                widget.updateConfig(config);
            } else {
                const widget = new AnyWidget(config, this);

                if (config.always_on_top) {
                    Main.layoutManager.addChrome(widget, {
                        affectsInputRegion: true,
                        trackFullscreen: false
                    });
                } else {
                    Main.layoutManager._backgroundGroup.add_child(widget);
                }

                this._widgets.set(config.id, widget);
            }
        });

        for (const [id, widget] of this._widgets) {
            if (!activeIds.has(id)) {
                if (widget.get_parent()) {
                    widget.get_parent().remove_child(widget);
                }
                widget.destroy();
                this._widgets.delete(id);
            }
        }
    }

    toggleWidget(id, enabled) {
        const configs = this.getWidgetConfigs();
        const config = configs.find(c => c.id === id);
        if (config) {
            config.enabled = enabled;
            this.saveWidgetConfigs(configs);
            this.refreshWidgets();
        }
    }

    updateWidgetConfig(newConfig) {
        const configs = this.getWidgetConfigs();
        const index = configs.findIndex(c => c.id === newConfig.id);
        if (index !== -1) {
            configs[index] = newConfig;
            this.saveWidgetConfigs(configs);
        }
    }

    reloadWidget(id) {
        const widget = this._widgets.get(id);
        if (widget) {
            widget.reloadContent();
        }
    }
}
