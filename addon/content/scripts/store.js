/* global CustomColumns, Zotero, IOUtils, PathUtils, setTimeout, clearTimeout */
"use strict";

/**
 * Persistence for column definitions (config.json) and per-item values
 * (values.json). Both live in <Zotero data dir>/custom-columns/.
 *
 * Values are keyed by "<libraryID>/<itemKey>", which stays stable when item
 * IDs change, and hold one entry per column id:
 *   checkbox -> true
 *   rating   -> 1..max
 *   link     -> "https://…"
 *   text     -> "free text"
 *   select   -> option id
 * Empty values are deleted rather than stored.
 */
CustomColumns.TYPES = {
	checkbox: "Checkbox",
	rating: "Rating",
	link: "Link",
	text: "Text",
	select: "Options",
};

CustomColumns.makeID = function () {
	return Zotero.Utilities.randomString(8).toLowerCase();
};

CustomColumns.defaultConfig = function () {
	const id = CustomColumns.makeID;
	return {
		version: 1,
		theme: "zotero",
		overrides: { light: {}, dark: {} },
		chipStyle: "soft",
		chipShape: "pill",
		starSymbol: "★",
		templates: [],
		columns: [
			{ id: id(), name: "Read", type: "checkbox", color: "" },
			{ id: id(), name: "Rating", type: "rating", max: 5, color: "" },
			{
				id: id(), name: "Status", type: "select", color: "",
				options: [
					{ id: id(), label: "To read", color: "#2e6fd8" },
					{ id: id(), label: "Reading", color: "#f5a623" },
					{ id: id(), label: "Done", color: "#3ba55d" },
					{ id: id(), label: "Skip", color: "#6e6e6e" },
				],
			},
			{ id: id(), name: "Verdict", type: "text", color: "" },
			{ id: id(), name: "Link", type: "link", color: "" },
		],
	};
};

CustomColumns.store = {
	config: null,
	values: {},
	_dir: null,
	_saveTimer: null,
	_dirty: { config: false, values: false },
	_listeners: new Set(),

	get dir() {
		return this._dir;
	},

	async load() {
		this._dir = PathUtils.join(Zotero.DataDirectory.dir, "custom-columns");
		await IOUtils.makeDirectory(this._dir, { ignoreExisting: true });

		this.config = await this._readJSON("config.json");
		if (!this.config || !Array.isArray(this.config.columns)) {
			this.config = CustomColumns.defaultConfig();
			this._dirty.config = true;
		}
		this.config = this.normalizeConfig(this.config);

		const values = await this._readJSON("values.json");
		this.values = values?.items || {};
		await this.flush();
	},

	normalizeConfig(config) {
		const base = CustomColumns.defaultConfig();
		config = Object.assign({}, base, config);
		const safe = CustomColumns.safeColor;
		const cleanOverrides = (o) => {
			const out = {};
			for (const [key] of CustomColumns.THEME_VARS) {
				if (safe(o?.[key])) out[key] = o[key];
			}
			return out;
		};
		config.overrides = {
			light: cleanOverrides(config.overrides?.light),
			dark: cleanOverrides(config.overrides?.dark),
		};
		if (!CustomColumns.THEMES[config.theme]) config.theme = "zotero";
		if (!CustomColumns.STAR_SYMBOLS.includes(config.starSymbol)) config.starSymbol = "★";
		config.columns = (config.columns || [])
			.filter(c => c && c.id && CustomColumns.TYPES[c.type])
			.map((c) => {
				c = Object.assign({}, c, {
					id: String(c.id),
					name: String(c.name || "Column"),
					color: safe(c.color),
				});
				if (c.type === "rating") c.max = Math.min(10, Math.max(1, parseInt(c.max) || 5));
				else delete c.max;
				if (c.type === "select") {
					c.options = (c.options || [])
						.filter(o => o && o.id)
						.map(o => ({ id: String(o.id), label: String(o.label ?? ""), color: safe(o.color) || "#888888" }));
				}
				else delete c.options;
				const refs = Array.isArray(c.scope?.collections)
					? [...new Set(c.scope.collections.map(String).filter(r => /^\d+\/\w+$/.test(r)))]
					: [];
				if (refs.length) c.scope = { collections: refs, subcollections: c.scope.subcollections !== false };
				else delete c.scope;
				if (c.autoShow) c.autoShow = true;
				else delete c.autoShow;
				return c;
			});
		config.templates = (Array.isArray(config.templates) ? config.templates : [])
			.filter(t => t && t.id && Array.isArray(t.columns))
			.map(t => ({
				id: String(t.id),
				name: String(t.name || "Template"),
				description: String(t.description || ""),
				columns: t.columns
					.filter(d => d && CustomColumns.TYPES[d.type])
					.map((d) => {
						const out = { name: String(d.name || "Column"), type: d.type, color: safe(d.color) };
						if (d.type === "rating") out.max = Math.min(10, Math.max(1, parseInt(d.max) || 5));
						if (d.type === "select") {
							out.options = (d.options || []).filter(Boolean)
								.map(o => ({ label: String(o.label ?? ""), color: safe(o.color) || "#888888" }));
						}
						return out;
					}),
			}));
		return config;
	},

	async _readJSON(name) {
		const path = PathUtils.join(this._dir, name);
		try {
			if (!(await IOUtils.exists(path))) return null;
			return await IOUtils.readJSON(path);
		}
		catch (e) {
			Zotero.logError(e);
			// Keep the unreadable file around rather than overwrite it silently.
			await IOUtils.copy(path, path + ".corrupt-" + Date.now()).catch(() => {});
			return null;
		}
	},

	async _writeJSON(name, data) {
		const path = PathUtils.join(this._dir, name);
		await IOUtils.writeJSON(path, data, { tmpPath: path + ".tmp" });
	},

	_scheduleSave() {
		if (this._saveTimer) clearTimeout(this._saveTimer);
		this._saveTimer = setTimeout(() => {
			this._saveTimer = null;
			this.flush().catch(e => Zotero.logError(e));
		}, 500);
	},

	async flush() {
		if (this._saveTimer) {
			clearTimeout(this._saveTimer);
			this._saveTimer = null;
		}
		if (!this._dir) return;
		if (this._dirty.config) {
			this._dirty.config = false;
			await this._writeJSON("config.json", this.config);
		}
		if (this._dirty.values) {
			this._dirty.values = false;
			await this._writeJSON("values.json", { version: 1, items: this.values });
		}
	},

	// ---- listeners -------------------------------------------------------

	addListener(fn) {
		this._listeners.add(fn);
		return () => this._listeners.delete(fn);
	},

	_emit(event) {
		for (const fn of this._listeners) {
			try {
				fn(event);
			}
			catch (e) {
				Zotero.logError(e);
			}
		}
	},

	// ---- config ----------------------------------------------------------

	getColumn(colID) {
		return this.config.columns.find(c => c.id === colID) || null;
	},

	setConfig(config) {
		this.config = this.normalizeConfig(config);
		this._dirty.config = true;

		// Drop values of deleted columns and of select options that no longer exist.
		const cols = new Map(this.config.columns.map(c => [c.id, c]));
		let changedValues = false;
		for (const [key, entry] of Object.entries(this.values)) {
			for (const colID of Object.keys(entry)) {
				const col = cols.get(colID);
				const stale = !col
					|| (col.type === "select" && !col.options.some(o => o.id === entry[colID]))
					|| (col.type === "rating" && entry[colID] > col.max);
				if (stale) {
					delete entry[colID];
					changedValues = true;
				}
			}
			if (!Object.keys(entry).length) delete this.values[key];
		}
		if (changedValues) this._dirty.values = true;
		this._scheduleSave();
		this._emit({ type: "config" });
	},

	/** Update a column without notifying listeners (internal bookkeeping). */
	patchColumnQuietly(colID, patch) {
		const col = this.getColumn(colID);
		if (!col) return;
		for (const [k, v] of Object.entries(patch)) {
			if (v === undefined) delete col[k];
			else col[k] = v;
		}
		this._dirty.config = true;
		this._scheduleSave();
	},

	// ---- values ----------------------------------------------------------

	keyFor(item) {
		return `${item.libraryID}/${item.key}`;
	},

	get(item, colID) {
		return this.values[this.keyFor(item)]?.[colID];
	},

	getAll(item) {
		return this.values[this.keyFor(item)] || {};
	},

	set(items, colID, value) {
		if (!Array.isArray(items)) items = [items];
		const empty = value === undefined || value === null || value === "" || value === false || value === 0;
		for (const item of items) {
			const key = this.keyFor(item);
			if (empty) {
				if (this.values[key]) {
					delete this.values[key][colID];
					if (!Object.keys(this.values[key]).length) delete this.values[key];
				}
			}
			else {
				(this.values[key] ||= {})[colID] = value;
			}
		}
		this._dirty.values = true;
		this._scheduleSave();
		this._emit({ type: "values", items, colID });
	},

	removeByKeys(keys) {
		let changed = false;
		for (const key of keys) {
			if (this.values[key]) {
				delete this.values[key];
				changed = true;
			}
		}
		if (changed) {
			this._dirty.values = true;
			this._scheduleSave();
		}
	},

	// ---- import / export -------------------------------------------------

	exportData() {
		return {
			format: "zotero-custom-columns",
			version: 1,
			exported: new Date().toISOString(),
			config: this.config,
			values: this.values,
		};
	},

	importData(data, { replaceConfig = true } = {}) {
		if (data?.format !== "zotero-custom-columns") {
			throw new Error("Not a Custom Columns export file");
		}
		if (replaceConfig && data.config) {
			this.config = this.normalizeConfig(data.config);
			this._dirty.config = true;
		}
		for (const [key, entry] of Object.entries(data.values || {})) {
			this.values[key] = Object.assign(this.values[key] || {}, entry);
		}
		this._dirty.values = true;
		this._scheduleSave();
		this._emit({ type: "config" });
	},
};
