/* global CustomColumns, Zotero */
"use strict";

/**
 * Popups opened from item-tree cells: a small text/link editor panel and the
 * option picker for "Options" columns.
 */
CustomColumns.editors = {
	_popupParent(doc) {
		return doc.querySelector("popupset") || doc.documentElement;
	},

	/**
	 * @param {Document} doc
	 * @param {Element} anchor
	 * @param {{title, value, placeholder, multiline, onSave}} opts
	 */
	editText(doc, anchor, { title, value, placeholder, multiline, onSave }) {
		const HTML = "http://www.w3.org/1999/xhtml";
		doc.getElementById("cc-editor-panel")?.remove();

		const panel = doc.createXULElement("panel");
		panel.id = "cc-editor-panel";
		panel.setAttribute("type", "arrow");
		panel.setAttribute("class", "cc-editor-panel");

		const wrap = doc.createElementNS(HTML, "div");
		wrap.className = "cc-editor";

		const label = doc.createElementNS(HTML, "div");
		label.className = "cc-editor-title";
		label.textContent = title;

		const field = doc.createElementNS(HTML, multiline ? "textarea" : "input");
		field.className = "cc-editor-field";
		if (multiline) field.rows = 5;
		else field.type = "text";
		field.placeholder = placeholder || "";
		field.value = value || "";

		const footer = doc.createElementNS(HTML, "div");
		footer.className = "cc-editor-footer";
		const hint = doc.createElementNS(HTML, "span");
		hint.className = "cc-editor-hint";
		hint.textContent = multiline
			? (Zotero.isMac ? "⌘↩ to save" : "Ctrl+Enter to save")
			: "Enter to save";
		const clear = doc.createElementNS(HTML, "button");
		clear.textContent = "Clear";
		const cancel = doc.createElementNS(HTML, "button");
		cancel.textContent = "Cancel";
		const save = doc.createElementNS(HTML, "button");
		save.textContent = "Save";
		save.className = "cc-primary";
		footer.append(hint, clear, cancel, save);

		wrap.append(label, field, footer);
		panel.append(wrap);
		this._popupParent(doc).append(panel);

		const commit = (v) => {
			try {
				onSave(v);
			}
			catch (e) {
				Zotero.logError(e);
			}
			panel.hidePopup();
		};
		save.addEventListener("click", () => commit(field.value));
		clear.addEventListener("click", () => commit(""));
		cancel.addEventListener("click", () => panel.hidePopup());
		field.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				e.preventDefault();
				panel.hidePopup();
			}
			else if (e.key === "Enter" && (!multiline || e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				commit(field.value);
			}
		});
		panel.addEventListener("popupshown", () => {
			field.focus();
			field.select();
		});
		panel.addEventListener("popuphidden", (e) => {
			if (e.target === panel) panel.remove();
		});
		this._open(panel, anchor);
	},

	/**
	 * Show the option menu for a select column below `anchor`.
	 */
	pickOption(doc, anchor, col, currentID, onPick) {
		doc.getElementById("cc-option-popup")?.remove();
		const popup = doc.createXULElement("menupopup");
		popup.id = "cc-option-popup";

		for (const opt of col.options) {
			const mi = doc.createXULElement("menuitem");
			mi.setAttribute("label", opt.label);
			mi.setAttribute("class", "menuitem-iconic cc-option-item");
			mi.setAttribute("image", CustomColumns.dotIcon(opt.color));
			if (opt.id === currentID) {
				mi.setAttribute("type", "checkbox");
				mi.setAttribute("checked", "true");
			}
			mi.addEventListener("command", () => onPick(opt.id));
			popup.append(mi);
		}
		if (!col.options.length) {
			const mi = doc.createXULElement("menuitem");
			mi.setAttribute("label", "No options yet — add some in settings");
			mi.setAttribute("disabled", "true");
			popup.append(mi);
		}
		popup.append(doc.createXULElement("menuseparator"));

		const clear = doc.createXULElement("menuitem");
		clear.setAttribute("label", "Clear");
		clear.setAttribute("disabled", currentID ? "false" : "true");
		clear.addEventListener("command", () => onPick(""));
		popup.append(clear);

		const edit = doc.createXULElement("menuitem");
		edit.setAttribute("label", "Edit options…");
		edit.addEventListener("command", () => CustomColumns.openSettings(col.id));
		popup.append(edit);

		this._popupParent(doc).append(popup);
		popup.addEventListener("popuphidden", (e) => {
			if (e.target === popup) popup.remove();
		});
		this._open(popup, anchor);
	},

	_open(popup, anchor) {
		if (anchor?.isConnected) {
			popup.openPopup(anchor, "after_start", 0, 0, false, false);
		}
		else {
			const win = popup.ownerGlobal;
			popup.openPopupAtScreen(win.mozInnerScreenX + 200, win.mozInnerScreenY + 200, false);
		}
	},
};

/** Data-URI circle icon in the given color, for menu items. */
CustomColumns.dotIcon = function (color) {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="5.5" fill="${color || "#888888"}"/></svg>`;
	return "data:image/svg+xml," + encodeURIComponent(svg);
};
