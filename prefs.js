'use strict';

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class AnyWidgetPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this.settings = this.getSettings();

        // CSS properties
        const provider = new Gtk.CssProvider();
        provider.load_from_string(`
            .widget-list-row { margin: 6px; }
            .delete-button { color: red; }
            .code-editor { font-family: monospace; padding: 10px; }
        `);
        Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({ title: _("Manage Widgets") });
        page.add(group);

        const addRow = new Adw.ActionRow({ title: _("Create New Widget") });
        const addButton = new Gtk.Button({
            label: _("Add"),
            css_classes: ['suggested-action']
        });
        addButton.connect('clicked', () => this._openWidgetEditor(window, null));
        addRow.add_suffix(addButton);
        group.add(addRow);

        this._widgetsListGroup = new Adw.PreferencesGroup({ title: _("Active Widgets") });
        page.add(this._widgetsListGroup);

        this._refreshWidgetList(window);
        this.settings.connect('changed::widget-list', () => this._refreshWidgetList(window));

        window.add(page);
    }

    _refreshWidgetList(window) {
        if (this._currentRows) {
            this._currentRows.forEach(row => this._widgetsListGroup.remove(row));
        }
        this._currentRows = [];

        const widgets = this._getWidgets();

        if (widgets.length === 0) {
            const emptyRow = new Adw.ActionRow({ title: _("No active widgets") });
            this._widgetsListGroup.add(emptyRow);
            this._currentRows.push(emptyRow);
            return;
        }

        widgets.forEach(widget => {
            const row = new Adw.ActionRow({
                title: widget.name,
                subtitle: widget.loader_type.toUpperCase()
            });

            const editBtn = new Gtk.Button({
                icon_name: 'document-edit-symbolic',
                valign: Gtk.Align.CENTER,
                tooltip_text: _("Edit Widget")
            });
            editBtn.connect('clicked', () => this._openWidgetEditor(window, widget));
            row.add_suffix(editBtn);

            const delBtn = new Gtk.Button({
                icon_name: 'user-trash-symbolic',
                valign: Gtk.Align.CENTER,
                css_classes: ['destructive-action'],
                tooltip_text: _("Delete Widget")
            });
            delBtn.connect('clicked', () => this._deleteWidget(widget.id, window));
            row.add_suffix(delBtn);

            this._widgetsListGroup.add(row);
            this._currentRows.push(row);
        });
    }

    _getWidgets() {
        try {
            return JSON.parse(this.settings.get_string('widget-list') || '[]');
        } catch (e) {
            return [];
        }
    }

    _saveWidgets(widgets) {
        this.settings.set_string('widget-list', JSON.stringify(widgets));
    }

    _deleteWidget(id, window) {
        const widgets = this._getWidgets().filter(w => w.id !== id);
        this._saveWidgets(widgets);
    }

    _openWidgetEditor(parentWindow, widgetData) {
        const isNew = !widgetData;
        const widget = widgetData || {
            id: GLib.uuid_string_random(),
            name: "New Widget",
            loader_type: 'code',
            loader_source: `// Example: Create a simple Label
const label = new St.Label({ 
    text: "Your anyWidget", 
    style_class: "any-widget-label" 
});
return label;`,
            width: 200,
            height: 100,
            widget_position_x: 100,
            widget_position_y: 100,
            background_color: 'rgba(0,0,0,0.5)',
            corner_radius: 12,
            transparency: 100,
            always_on_top: false,
            enabled: true,
            border_width: 0,
            border_color: 'rgba(255,255,255,0.2)',
            shadow_blur: 0,
            shadow_color: 'rgba(0,0,0,1)',
            background_blur: false,
            blur_radius: 30,
            click_through: false,
            hover_scale: false
        };

        const dialog = new Adw.Window({
            title: isNew ? _("New Widget") : _("Edit Widget"),
            transient_for: parentWindow,
            modal: true,
            default_width: 700,
            default_height: 800
        });

        const content = new Adw.ToolbarView();
        dialog.set_content(content);

        const header = new Adw.HeaderBar();
        content.add_top_bar(header);

        const cancelBtn = new Gtk.Button({ label: _("Cancel") });
        cancelBtn.connect('clicked', () => dialog.close());
        header.pack_start(cancelBtn);

        const saveBtn = new Gtk.Button({ label: _("Save"), css_classes: ['suggested-action'] });
        saveBtn.connect('clicked', () => {
            if (widget.loader_type === 'code' && codeBuffer) {
                const start = codeBuffer.get_start_iter();
                const end = codeBuffer.get_end_iter();
                widget.loader_source = codeBuffer.get_text(start, end, false);
            }
            this._saveWidgetData(widget, dialog);
        });
        header.pack_end(saveBtn);

        const stack = new Adw.ViewStack();
        const switcherBar = new Adw.ViewSwitcherBar({ stack: stack });
        content.add_bottom_bar(switcherBar);
        const switcherTitle = new Adw.ViewSwitcherTitle({ stack: stack, title: isNew ? _("New Widget") : _("Edit Widget") });
        header.set_title_widget(switcherTitle);

        // === Code Tab ===
        const codePage = new Adw.PreferencesPage();
        const codeGroup = new Adw.PreferencesGroup();
        codePage.add(codeGroup);
        const nameRow = new Adw.EntryRow({ title: _("Widget Name"), text: widget.name });
        nameRow.connect('notify::text', () => widget.name = nameRow.get_text());
        codeGroup.add(nameRow);
        const typeRow = new Adw.ComboRow({
            title: _("Source Type"),
            model: new Gtk.StringList({ strings: ['JavaScript Code', 'File Path'] })
        });
        const types = ['code', 'file'];
        typeRow.set_selected(types.indexOf(widget.loader_type) !== -1 ? types.indexOf(widget.loader_type) : 0);
        codeGroup.add(typeRow);
        const inputGroup = new Adw.PreferencesGroup({ title: _("Source") });
        codePage.add(inputGroup);
        let codeBuffer;
        const updateInputState = () => {
            const selectedType = types[typeRow.get_selected()];
            widget.loader_type = selectedType;
            codeBox.set_visible(selectedType === 'code');
            fileRow.set_visible(selectedType === 'file');
        };
        const autoSave = () => this._saveWidgetData(widget, null);
        const codeBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, margin_top: 10, margin_bottom: 10, spacing: 6 });
        const codeLabel = new Gtk.Label({ label: _("JavaScript Code (Must return a Clutter Actor)"), xalign: 0, css_classes: ['heading'] });
        const helpLabel = new Gtk.Label({ label: _("Available globals: St, Clutter, GObject, Gio, GLib, Main. \nExample: return new St.Label({ text: 'Hi' });"), xalign: 0, css_classes: ['dim-label'], wrap: true });
        codeBox.append(codeLabel);
        codeBox.append(helpLabel);
        const scrolled = new Gtk.ScrolledWindow({ min_content_height: 300, has_frame: true, hexpand: true, vexpand: true });
        const textView = new Gtk.TextView({ monospace: true, top_margin: 8, bottom_margin: 8, left_margin: 8, right_margin: 8 });
        codeBuffer = textView.get_buffer();
        if (widget.loader_type === 'code') codeBuffer.set_text(widget.loader_source || "", -1);
        scrolled.set_child(textView);
        codeBox.append(scrolled);
        inputGroup.add(codeBox);
        const fileRow = new Adw.ActionRow({ title: _("Select JavaScript File") });
        const fileBtn = new Gtk.Button({ label: _("Browse..."), valign: Gtk.Align.CENTER });
        const fileLabel = new Gtk.Label({ label: widget.loader_type === 'file' ? (widget.loader_source || _("No file selected")) : _("No file selected"), ellipsize: 3 });
        fileRow.add_suffix(fileLabel);
        fileRow.add_suffix(fileBtn);
        fileBtn.connect('clicked', () => {
            const chooser = new Gtk.FileChooserDialog({ title: _("Select JS File"), transient_for: dialog, action: Gtk.FileChooserAction.OPEN });
            chooser.add_button(_("Cancel"), Gtk.ResponseType.CANCEL);
            chooser.add_button(_("Select"), Gtk.ResponseType.ACCEPT);
            const filter = new Gtk.FileFilter();
            filter.set_name("JavaScript Files");
            filter.add_pattern("*.js");
            chooser.add_filter(filter);

            // Default to widgets folder
            try {
                const widgetsDir = GLib.build_filenamev([this.path, 'widgets']);
                const widgetsFile = Gio.File.new_for_path(widgetsDir);
                if (widgetsFile.query_exists(null)) {
                    chooser.set_current_folder(widgetsFile);
                }
            } catch (e) { /* ignore */ }

            chooser.connect('response', (d, response) => {
                if (response === Gtk.ResponseType.ACCEPT) {
                    const file = chooser.get_file();
                    const path = file.get_path();
                    if (path) { widget.loader_source = path; fileLabel.set_label(path); autoSave(); }
                }
                chooser.destroy();
            });
            chooser.present();
        });
        inputGroup.add(fileRow);
        typeRow.connect('notify::selected', () => { updateInputState(); });
        updateInputState();
        stack.add_titled(codePage, "code", _("Source"));

        // === Appearance Tab ===
        const uiPage = new Adw.PreferencesPage();
        const uiGroup = new Adw.PreferencesGroup({ title: _("Geometry & Transparency") });
        uiPage.add(uiGroup);

        const createSpin = (title, lower, upper, step, val, key) => {
            const row = new Adw.SpinRow({ title: title, adjustment: new Gtk.Adjustment({ lower, upper, step_increment: step, value: val }) });
            row.connect('notify::value', () => { widget[key] = row.get_value(); autoSave(); });
            uiGroup.add(row);
        };
        createSpin(_("X Position"), 0, 10000, 1, widget.widget_position_x, 'widget_position_x');
        createSpin(_("Y Position"), 0, 10000, 1, widget.widget_position_y, 'widget_position_y');
        createSpin(_("Width"), 50, 3000, 10, widget.width, 'width');
        createSpin(_("Height"), 50, 3000, 10, widget.height, 'height');

        const opacityRow = new Adw.ActionRow({ title: _("Global Opacity %") });
        const opacityScale = new Gtk.Scale({ orientation: Gtk.Orientation.HORIZONTAL, adjustment: new Gtk.Adjustment({ lower: 0, upper: 100, step_increment: 1, value: widget.transparency !== undefined ? widget.transparency : 100 }), draw_value: true, hexpand: true });
        opacityScale.connect('value-changed', () => { widget.transparency = opacityScale.get_value(); autoSave(); });
        opacityRow.add_suffix(opacityScale);
        uiGroup.add(opacityRow);

        const styleGroup = new Adw.PreferencesGroup({ title: _("Style") });
        uiPage.add(styleGroup);

        // Background Color
        const colorRow = new Adw.ActionRow({ title: _("Background Color") });
        const colorBtn = new Gtk.ColorButton();
        const rgba = new Gdk.RGBA();
        rgba.parse(widget.background_color || 'rgba(0,0,0,0.5)');
        colorBtn.set_rgba(rgba);
        colorBtn.connect('color-set', () => { const c = colorBtn.get_rgba(); widget.background_color = `rgba(${Math.round(c.red * 255)},${Math.round(c.green * 255)},${Math.round(c.blue * 255)},${c.alpha})`; autoSave(); });
        colorRow.add_suffix(colorBtn);
        styleGroup.add(colorRow);

        // Corner Radius
        const radiusRow = new Adw.SpinRow({ title: _("Corner Radius (px)"), adjustment: new Gtk.Adjustment({ lower: 0, upper: 200, step_increment: 1, value: widget.corner_radius || 0 }) });
        radiusRow.connect('notify::value', () => { widget.corner_radius = radiusRow.get_value(); autoSave(); });
        styleGroup.add(radiusRow);

        // Border Width & Color
        const borderWRow = new Adw.SpinRow({ title: _("Border Width (px)"), adjustment: new Gtk.Adjustment({ lower: 0, upper: 20, step_increment: 1, value: widget.border_width || 0 }) });
        borderWRow.connect('notify::value', () => { widget.border_width = borderWRow.get_value(); autoSave(); });
        styleGroup.add(borderWRow);

        const borderColRow = new Adw.ActionRow({ title: _("Border Color") });
        const borderColBtn = new Gtk.ColorButton();
        const bRgba = new Gdk.RGBA();
        bRgba.parse(widget.border_color || 'rgba(255,255,255,0.2)');
        borderColBtn.set_rgba(bRgba);
        borderColBtn.connect('color-set', () => { const c = borderColBtn.get_rgba(); widget.border_color = `rgba(${Math.round(c.red * 255)},${Math.round(c.green * 255)},${Math.round(c.blue * 255)},${c.alpha})`; autoSave(); });
        borderColRow.add_suffix(borderColBtn);
        styleGroup.add(borderColRow);

        // Drop Shadow
        const shadowBlurRow = new Adw.SpinRow({ title: _("Shadow Blur (px)"), adjustment: new Gtk.Adjustment({ lower: 0, upper: 100, step_increment: 1, value: widget.shadow_blur || 0 }) });
        shadowBlurRow.connect('notify::value', () => { widget.shadow_blur = shadowBlurRow.get_value(); autoSave(); });
        styleGroup.add(shadowBlurRow);

        const shadowColRow = new Adw.ActionRow({ title: _("Shadow Color") });
        const shadowColBtn = new Gtk.ColorButton();
        const sRgba = new Gdk.RGBA();
        sRgba.parse(widget.shadow_color || 'rgba(0,0,0,1)');
        shadowColBtn.set_rgba(sRgba);
        shadowColBtn.connect('color-set', () => { const c = shadowColBtn.get_rgba(); widget.shadow_color = `rgba(${Math.round(c.red * 255)},${Math.round(c.green * 255)},${Math.round(c.blue * 255)},${c.alpha})`; autoSave(); });
        shadowColRow.add_suffix(shadowColBtn);
        styleGroup.add(shadowColRow);

        // Backdrop Blur (Glass Effect)
        const blurRow = new Adw.SwitchRow({ title: _("Background Blur"), subtitle: _("Enable glassmorphism effect") });
        blurRow.set_active(widget.background_blur === true);
        blurRow.connect('notify::active', () => { widget.background_blur = blurRow.get_active(); autoSave(); });
        styleGroup.add(blurRow);

        stack.add_titled(uiPage, "style", _("Appearance"));

        // === Interaction Tab ===
        const interactPage = new Adw.PreferencesPage();
        const interactGroup = new Adw.PreferencesGroup({ title: _("Behavior") });
        interactPage.add(interactGroup);

        const topRow = new Adw.SwitchRow({ title: _("Always on Top"), subtitle: _("Keep overlapping other windows") });
        topRow.set_active(widget.always_on_top === true);
        topRow.connect('notify::active', () => { widget.always_on_top = topRow.get_active(); autoSave(); });
        interactGroup.add(topRow);

        const clickRow = new Adw.SwitchRow({ title: _("Click-Through Mode"), subtitle: _("Ignore mouse events (cannot resize/drag when enabled)") });
        clickRow.set_active(widget.click_through === true);
        clickRow.connect('notify::active', () => { widget.click_through = clickRow.get_active(); autoSave(); });
        interactGroup.add(clickRow);

        const hoverRow = new Adw.SwitchRow({ title: _("Hover Scale Effect"), subtitle: _("Slightly zoom when hovered") });
        hoverRow.set_active(widget.hover_scale === true);
        hoverRow.connect('notify::active', () => { widget.hover_scale = hoverRow.get_active(); autoSave(); });
        interactGroup.add(hoverRow);

        stack.add_titled(interactPage, "behavior", _("Behavior"));

        content.set_content(stack);
        dialog.present();
    }

    _saveWidgetData(widget, dialog) {
        let widgets = this._getWidgets();
        const index = widgets.findIndex(w => w.id === widget.id);
        if (index !== -1) {
            widgets[index] = widget;
        } else {
            widgets.push(widget);
        }
        this._saveWidgets(widgets);
        if (dialog) dialog.close();
    }
}
