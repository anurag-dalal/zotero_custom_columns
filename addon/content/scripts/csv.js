/* global CustomColumns, Zotero, ChromeUtils, IOUtils, PathUtils */
"use strict";

/**
 * CSV export of items with their custom column values. Opens cleanly in
 * Excel, LibreOffice and Google Sheets (UTF-8 with BOM, CRLF line endings).
 */
CustomColumns.csv = {
	BASE_FIELDS: [
		["Title", item => item.getField("title")],
		["Authors", item => item.getCreators()
			.map(c => (c.fieldMode === 1 ? c.lastName : [c.lastName, c.firstName].filter(Boolean).join(", ")))
			.join("; ")],
		["Year", (item) => {
			const y = (item.getField("date", true, true) || "").slice(0, 4);
			return y === "0000" ? "" : y;
		}],
		["Item Type", item => Zotero.ItemTypes.getLocalizedString(item.itemTypeID)],
		["Publication", item => item.getField("publicationTitle", false, true) || ""],
		["DOI", item => item.getField("DOI", false, true) || ""],
		["URL", item => item.getField("url", false, true) || ""],
		["Date Added", item => item.dateAdded],
		["Item Key", item => item.key],
		["Zotero Link", item => CustomColumns.csv.zoteroLink(item)],
	],

	zoteroLink(item) {
		const lib = Zotero.Libraries.get(item.libraryID);
		const prefix = lib?.libraryType === "group" ? `groups/${lib.groupID}` : "library";
		return `zotero://select/${prefix}/items/${item.key}`;
	},

	formatValue(col, value) {
		if (value === undefined || value === null) return col.type === "checkbox" ? "FALSE" : "";
		switch (col.type) {
			case "checkbox":
				return value ? "TRUE" : "FALSE";
			case "select":
				return col.options.find(o => o.id === value)?.label || "";
			default:
				return String(value);
		}
	},

	escape(value) {
		const s = String(value ?? "");
		return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	},

	/** Build CSV text for items × (base fields + columns). */
	build(items, columns) {
		const { store } = CustomColumns;
		const header = [...this.BASE_FIELDS.map(([name]) => name), ...columns.map(c => c.name)];
		const lines = [header.map(v => this.escape(v)).join(",")];
		for (const item of items) {
			const row = this.BASE_FIELDS.map(([, get]) => {
				try {
					return get(item);
				}
				catch {
					return "";
				}
			});
			for (const col of columns) row.push(this.formatValue(col, store.get(item, col.id)));
			lines.push(row.map(v => this.escape(v)).join(","));
		}
		return "﻿" + lines.join("\r\n") + "\r\n";
	},

	/** Keep regular items only, sorted by title. */
	_prepare(items) {
		return items
			.filter(i => i instanceof Zotero.Item && i.isRegularItem() && !i.isFeedItem)
			.sort((a, b) => Zotero.localeCompare(a.getField("title"), b.getField("title")));
	},

	/** Union of columns that apply to any of the items, in config order. */
	columnsForItems(items) {
		const { scope, store } = CustomColumns;
		return store.config.columns.filter(c => items.some(i => scope.appliesToItem(c, i)));
	},

	async _save(win, defaultName, text) {
		const { FilePicker } = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs");
		const fp = new FilePicker();
		fp.init(win, "Export to CSV", fp.modeSave);
		fp.appendFilter("CSV", "*.csv");
		fp.defaultExtension = "csv";
		fp.defaultString = defaultName.replace(/[\\/:*?"<>|]+/g, "-") + ".csv";
		const rv = await fp.show();
		if (rv !== fp.returnOK && rv !== fp.returnReplace) return null;
		let path = fp.file;
		if (!/\.csv$/i.test(path)) path += ".csv";
		await IOUtils.writeUTF8(path, text);
		return path;
	},

	/** Export a collection / library / saved search row from the collection tree. */
	async exportTreeRow(win, treeRow) {
		const { scope, store } = CustomColumns;
		const items = this._prepare(await treeRow.getItems());
		const columns = treeRow.isCollection?.()
			? scope.columnsForCollection(treeRow.ref)
			: store.config.columns;
		const name = treeRow.ref?.name || treeRow.getName?.() || "Zotero";
		return this._finish(win, `${name} - custom columns`, items, columns);
	},

	/** Export a collection by ref (used by the settings window). */
	async exportCollection(win, ref, { subcollections = true } = {}) {
		const { scope } = CustomColumns;
		const coll = scope.collectionFor(ref);
		if (!coll) throw new Error("Collection not found");
		let items = coll.getChildItems(false, false);
		if (subcollections) {
			const ids = coll.getDescendents(false, "item", false).map(d => d.id);
			items = items.concat(await Zotero.Items.getAsync(ids));
		}
		items = this._prepare([...new Map(items.map(i => [i.id, i])).values()]);
		return this._finish(win, `${coll.name} - custom columns`, items, scope.columnsForCollection(coll));
	},

	/** Export every regular item in a library with all columns. */
	async exportLibrary(win, libraryID) {
		const items = this._prepare(await Zotero.Items.getAll(libraryID, true, false));
		const name = Zotero.Libraries.get(libraryID)?.name || "Library";
		return this._finish(win, `${name} - custom columns`, items, CustomColumns.store.config.columns);
	},

	async exportItems(win, items) {
		items = this._prepare(items);
		return this._finish(win, "Selected items - custom columns", items, this.columnsForItems(items));
	},

	async _finish(win, defaultName, items, columns) {
		const path = await this._save(win, defaultName, this.build(items, columns));
		if (path) {
			const pw = new Zotero.ProgressWindow({ closeOnClick: true });
			pw.changeHeadline("Custom Columns");
			pw.addDescription(`Exported ${items.length} item${items.length === 1 ? "" : "s"} to ${PathUtils.filename(path)}`);
			pw.show();
			pw.startCloseTimer(4000);
		}
		return path;
	},
};
