/* global CustomColumns, Zotero */
"use strict";

/**
 * Item-tree column registration and cell rendering.
 *
 * dataProvider() returns a plain string used for sorting and type-to-find;
 * renderCell() draws the interactive widget from the stored value.
 */
const HTML_NS = "http://www.w3.org/1999/xhtml";

const DEFAULT_WIDTHS = {
	checkbox: "60",
	rating: "110",
	link: "140",
	text: "200",
	select: "110",
};

CustomColumns.cells = {
	// colID -> { dataKey, signature }
	registered: new Map(),

	/** Bring registered columns in line with the current config. */
	sync() {
		const { pluginID } = CustomColumns;
		// Only columns that apply to the collection(s) on screen are registered;
		// collection-scoped columns come and go as you switch collections.
		const columns = CustomColumns.scope.activeColumns();
		const wanted = new Map(columns.map(c => [c.id, c]));

		for (const [colID, reg] of this.registered) {
			const col = wanted.get(colID);
			if (!col || reg.signature !== this._signature(col)) {
				Zotero.ItemTreeManager.unregisterColumn(reg.dataKey);
				this.registered.delete(colID);
			}
		}

		const added = [];
		for (const col of columns) {
			if (this.registered.has(col.id)) continue;
			const colID = col.id;
			const dataKey = Zotero.ItemTreeManager.registerColumn({
				dataKey: `cc-${colID}`,
				label: col.name,
				pluginID,
				width: DEFAULT_WIDTHS[col.type],
				zoteroPersist: ["width", "hidden", "sortDirection"],
				dataProvider: item => this.sortValue(item, colID),
				renderCell: (index, data, column, isFirstColumn, doc) => this.renderCell(colID, index, data, column, doc),
			});
			if (dataKey) {
				this.registered.set(colID, { dataKey, signature: this._signature(col) });
				if (col.autoShow) added.push(colID);
			}
		}
		this.redrawAll();
		if (added.length) this._autoShow(added).catch(e => Zotero.logError(e));
	},

	/** True when the set of columns that should be registered has changed. */
	needsSync() {
		const active = CustomColumns.scope.activeColumns();
		if (active.length !== this.registered.size) return true;
		return active.some(c => this.registered.get(c.id)?.signature !== this._signature(c));
	},

	/**
	 * Zotero hides newly registered columns. Columns created from settings or
	 * templates are flagged autoShow, so un-hide them once, then forget the flag
	 * (after that, the user's own show/hide choice sticks).
	 */
	async _autoShow(colIDs) {
		for (const win of Zotero.getMainWindows()) {
			const tree = win.ZoteroPane?.itemsView?.tree;
			if (!tree?._columns) continue;
			for (const colID of colIDs) {
				const dataKey = this.registered.get(colID)?.dataKey;
				if (!dataKey) continue;
				// Registration resets the tree's columns asynchronously; wait for it.
				let index = -1;
				for (let i = 0; i < 40 && index < 0; i++) {
					index = tree._getColumns().findIndex(c => c.dataKey === dataKey);
					if (index < 0) await Zotero.Promise.delay(75);
				}
				if (index >= 0 && tree._getColumns()[index].hidden) {
					tree._columns.toggleHidden(index);
				}
			}
		}
		for (const colID of colIDs) {
			CustomColumns.store.patchColumnQuietly(colID, { autoShow: undefined });
		}
	},

	unregisterAll() {
		for (const reg of this.registered.values()) {
			Zotero.ItemTreeManager.unregisterColumn(reg.dataKey);
		}
		this.registered.clear();
	},

	_signature(col) {
		return `${col.type}\u0000${col.name}`;
	},

	// ---- data ------------------------------------------------------------

	sortValue(item, colID) {
		const col = CustomColumns.store.getColumn(colID);
		const value = CustomColumns.store.get(item, colID);
		if (!col || value === undefined) return "";
		switch (col.type) {
			case "checkbox":
				return value ? "✓" : "";
			case "rating":
				// Zero-padded so "10" sorts after "9" with plain string collation.
				return String(value).padStart(2, "0");
			case "select": {
				const idx = col.options.findIndex(o => o.id === value);
				return idx < 0 ? "" : `${String(idx).padStart(3, "0")} ${col.options[idx].label}`;
			}
			default:
				return String(value);
		}
	},

	// ---- redraw ----------------------------------------------------------

	_itemsViews() {
		return Zotero.getMainWindows()
			.map(w => w.ZoteroPane?.itemsView)
			.filter(Boolean);
	},

	/** Re-render rows for the given items (or everything) in all main windows. */
	redraw(items) {
		for (const view of this._itemsViews()) {
			if (!view.tree) continue;
			if (!items) {
				view.invalidateRowCache?.(true);
				view.tree.invalidate();
				continue;
			}
			// The tree is virtualized, so a full invalidate only redraws visible rows.
			view.invalidateRowCache?.(items.map(i => i.id));
			view.tree.invalidate();
		}
	},

	redrawAll() {
		this.redraw(null);
	},

	_itemAt(doc, index) {
		const view = doc.defaultView?.ZoteroPane?.itemsView;
		const row = view?.getRow(index);
		return row?.ref instanceof Zotero.Item ? row.ref : null;
	},

	/**
	 * Items a cell edit applies to: the whole selection when the clicked row
	 * is part of a multi-selection, otherwise just the clicked item.
	 */
	_targetItems(doc, index) {
		const view = doc.defaultView?.ZoteroPane?.itemsView;
		const item = this._itemAt(doc, index);
		if (!item) return [];
		if (view?.selection?.isSelected(index) && view.selection.count > 1) {
			return view.getSelectedItems().filter(i => i instanceof Zotero.Item);
		}
		return [item];
	},

	_editable(item) {
		return item && !item.isFeedItem;
	},

	// ---- render ----------------------------------------------------------

	renderCell(colID, index, data, column, doc) {
		const cell = doc.createElementNS(HTML_NS, "span");
		cell.className = `cell ${column.className} cc-cell`;

		const col = CustomColumns.store.getColumn(colID);
		const item = this._itemAt(doc, index);
		if (!col || !item) return cell;

		cell.classList.add(`cc-type-${col.type}`);
		if (col.color) cell.style.setProperty("--cc-col", col.color);
		const value = CustomColumns.store.get(item, colID);

		switch (col.type) {
			case "checkbox":
				this._renderCheckbox(cell, col, value, index, doc);
				break;
			case "rating":
				this._renderRating(cell, col, value, index, doc);
				break;
			case "link":
				this._renderLink(cell, col, value, index, doc);
				break;
			case "text":
				this._renderText(cell, col, value, index, doc);
				break;
			case "select":
				this._renderSelect(cell, col, value, index, doc);
				break;
		}
		return cell;
	},

	/** Keep fast double-clicks on widgets from opening the item. */
	_swallowDblClick(el) {
		el.addEventListener("dblclick", e => e.stopPropagation());
	},

	/**
	 * For widgets inside non-clickable cells (links, edit buttons): stop the
	 * row from handling mousedown/up, because a selection change re-renders
	 * the row and the click would never arrive.
	 */
	_guard(el) {
		for (const type of ["mousedown", "mouseup", "dblclick"]) {
			el.addEventListener(type, e => e.stopPropagation());
		}
	},

	_renderCheckbox(cell, col, value, index, doc) {
		cell.classList.add("clickable");
		const box = doc.createElementNS(HTML_NS, "span");
		box.className = "cc-box" + (value ? " cc-checked" : "");
		box.setAttribute("role", "checkbox");
		box.setAttribute("aria-checked", value ? "true" : "false");
		cell.append(box);
		this._swallowDblClick(cell);
		cell.addEventListener("click", (e) => {
			if (e.button !== 0) return;
			e.stopPropagation();
			const items = this._targetItems(doc, index).filter(i => this._editable(i));
			if (!items.length) return;
			CustomColumns.store.set(items, col.id, !value);
		});
	},

	_renderRating(cell, col, value, index, doc) {
		cell.classList.add("clickable");
		const stars = doc.createElementNS(HTML_NS, "span");
		stars.className = "cc-stars";
		const symbol = CustomColumns.store.config.starSymbol || "★";
		// Rendered high-to-low inside a row-reverse flexbox so the CSS
		// "hovered star and everything after it" sibling rule lights up 1..n.
		for (let v = col.max; v >= 1; v--) {
			const star = doc.createElementNS(HTML_NS, "span");
			star.className = "cc-star" + (value && v <= value ? " cc-on" : "");
			star.textContent = symbol;
			star.dataset.value = v;
			stars.append(star);
		}
		cell.title = value ? `${value} / ${col.max}` : "";
		cell.append(stars);
		this._swallowDblClick(cell);
		cell.addEventListener("click", (e) => {
			if (e.button !== 0) return;
			e.stopPropagation();
			const star = e.target.closest(".cc-star");
			const items = this._targetItems(doc, index).filter(i => this._editable(i));
			if (!items.length) return;
			let v = star ? parseInt(star.dataset.value) : 0;
			// Clicking the current rating clears it.
			if (v === value) v = 0;
			CustomColumns.store.set(items, col.id, v);
		});
	},

	_editButton(doc, onClick) {
		const btn = doc.createElementNS(HTML_NS, "span");
		btn.className = "cc-edit";
		btn.textContent = "✎";
		btn.title = "Edit";
		btn.addEventListener("click", (e) => {
			if (e.button !== 0) return;
			e.stopPropagation();
			onClick(e);
		});
		this._guard(btn);
		return btn;
	},

	_renderLink(cell, col, value, index, doc) {
		const edit = () => {
			const item = this._itemAt(doc, index);
			if (!this._editable(item)) return;
			CustomColumns.editors.editText(doc, cell, {
				title: col.name,
				value: value || "",
				placeholder: "https://…",
				multiline: false,
				onSave: (v) => CustomColumns.store.set(this._targetItems(doc, index), col.id, CustomColumns.normalizeURL(v)),
			});
		};

		if (value) {
			const link = doc.createElementNS(HTML_NS, "span");
			link.className = "cc-link";
			link.textContent = CustomColumns.prettyURL(value);
			link.title = value;
			link.addEventListener("click", (e) => {
				if (e.button !== 0) return;
				e.stopPropagation();
				Zotero.launchURL(value);
			});
			this._guard(link);
			cell.append(link);
		}
		else {
			const ph = doc.createElementNS(HTML_NS, "span");
			ph.className = "cc-placeholder";
			ph.textContent = "+ link";
			ph.addEventListener("click", (e) => {
				e.stopPropagation();
				edit();
			});
			this._guard(ph);
			cell.append(ph);
		}
		cell.append(this._editButton(doc, edit));
	},

	_renderText(cell, col, value, index, doc) {
		const text = doc.createElementNS(HTML_NS, "span");
		text.className = "cc-text";
		text.textContent = value ? String(value).replace(/\s*\n\s*/g, " ⏎ ") : "";
		if (value) cell.title = value;
		cell.append(text);
		cell.append(this._editButton(doc, () => {
			const item = this._itemAt(doc, index);
			if (!this._editable(item)) return;
			CustomColumns.editors.editText(doc, cell, {
				title: col.name,
				value: value || "",
				placeholder: "Write a comment…",
				multiline: true,
				onSave: v => CustomColumns.store.set(this._targetItems(doc, index), col.id, v.trim()),
			});
		}));
	},

	_renderSelect(cell, col, value, index, doc) {
		cell.classList.add("clickable");
		const opt = col.options.find(o => o.id === value);
		if (opt) {
			cell.append(CustomColumns.makeChip(doc, opt, CustomColumns.store.config.chipStyle));
		}
		else {
			const ph = doc.createElementNS(HTML_NS, "span");
			ph.className = "cc-placeholder";
			ph.textContent = "▾";
			cell.append(ph);
		}
		this._swallowDblClick(cell);
		cell.addEventListener("click", (e) => {
			if (e.button !== 0) return;
			e.stopPropagation();
			const items = this._targetItems(doc, index).filter(i => this._editable(i));
			if (!items.length) return;
			CustomColumns.editors.pickOption(doc, cell, col, value, (optID) => {
				CustomColumns.store.set(items, col.id, optID);
			});
		});
	},
};

/** A colored option label, shared by the tree, item pane and settings. */
CustomColumns.makeChip = function (doc, opt, style) {
	const chip = doc.createElementNS(HTML_NS, "span");
	chip.className = `cc-chip cc-chip-${style || "soft"}`;
	chip.textContent = opt.label;
	chip.style.setProperty("--cc-opt", opt.color || "#888888");
	chip.style.setProperty("--cc-opt-fg", CustomColumns.contrastText(opt.color));
	return chip;
};

CustomColumns.normalizeURL = function (value) {
	value = (value || "").trim();
	if (!value) return "";
	if (/^10\.\d{4,9}\//.test(value)) return "https://doi.org/" + value;
	if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return "https://" + value;
	return value;
};

CustomColumns.prettyURL = function (value) {
	try {
		const url = new URL(value);
		const path = url.pathname === "/" ? "" : url.pathname;
		return (url.host + path).replace(/^www\./, "") || value;
	}
	catch {
		return value;
	}
};
