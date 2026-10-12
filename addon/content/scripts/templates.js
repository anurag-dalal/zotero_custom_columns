/* global CustomColumns */
"use strict";

/**
 * Column templates: reusable sets of column definitions. Built-in templates
 * ship here; user templates live in config.templates. Applying a template
 * creates fresh columns (new ids), either everywhere or scoped to a collection.
 */
CustomColumns.BUILTIN_TEMPLATES = [
	{
		id: "builtin-reading",
		name: "Reading tracker",
		description: "Keep track of what you've read and what you thought of it.",
		columns: [
			{ name: "Read", type: "checkbox" },
			{ name: "Rating", type: "rating", max: 5 },
			{
				name: "Status", type: "select", options: [
					{ label: "To read", color: "#2e6fd8" },
					{ label: "Reading", color: "#f5a623" },
					{ label: "Done", color: "#3ba55d" },
					{ label: "Skip", color: "#6e6e6e" },
				],
			},
			{ name: "Verdict", type: "text" },
		],
	},
	{
		id: "builtin-review",
		name: "Literature review (screening)",
		description: "Screen papers for a systematic or scoping review.",
		columns: [
			{
				name: "Decision", type: "select", options: [
					{ label: "Include", color: "#3ba55d" },
					{ label: "Maybe", color: "#f5a623" },
					{ label: "Exclude", color: "#e5484d" },
					{ label: "Duplicate", color: "#6e6e6e" },
				],
			},
			{ name: "Relevance", type: "rating", max: 5 },
			{ name: "Quality", type: "rating", max: 3 },
			{ name: "Full text checked", type: "checkbox" },
			{ name: "Reason", type: "text" },
		],
	},
	{
		id: "builtin-writing",
		name: "Paper writing",
		description: "Track which sources go where in a manuscript.",
		columns: [
			{ name: "Cited", type: "checkbox" },
			{
				name: "Section", type: "select", options: [
					{ label: "Introduction", color: "#2e6fd8" },
					{ label: "Related work", color: "#8e4ec6" },
					{ label: "Methods", color: "#12a594" },
					{ label: "Results", color: "#f5a623" },
					{ label: "Discussion", color: "#e93d82" },
				],
			},
			{ name: "Key point", type: "text" },
			{ name: "Code / data", type: "link" },
		],
	},
	{
		id: "builtin-course",
		name: "Course readings",
		description: "Organise readings for a course or reading group.",
		columns: [
			{
				name: "Priority", type: "select", options: [
					{ label: "Required", color: "#e5484d" },
					{ label: "Recommended", color: "#f5a623" },
					{ label: "Optional", color: "#6e6e6e" },
				],
			},
			{ name: "Done", type: "checkbox" },
			{ name: "Summary", type: "text" },
			{ name: "Slides", type: "link" },
		],
	},
];

CustomColumns.templates = {
	list() {
		return [
			...CustomColumns.BUILTIN_TEMPLATES.map(t => Object.assign({ builtin: true }, t)),
			...(CustomColumns.store.config.templates || []),
		];
	},

	get(id) {
		return this.list().find(t => t.id === id) || null;
	},

	/**
	 * Add a template's columns to the config.
	 * @param {string} templateID
	 * @param {string|null} collectionRef - scope to this collection, or null for everywhere
	 * @param {{subcollections?: boolean}} [opts]
	 * @returns {string[]} ids of the new columns
	 */
	apply(templateID, collectionRef, { subcollections = true } = {}) {
		const { store, makeID } = CustomColumns;
		const tpl = this.get(templateID);
		if (!tpl) throw new Error("Unknown template " + templateID);
		const config = JSON.parse(JSON.stringify(store.config));
		const ids = [];
		for (const def of tpl.columns) {
			const col = {
				id: makeID(),
				name: def.name,
				type: def.type,
				color: def.color || "",
				autoShow: true,
			};
			if (def.type === "rating") col.max = def.max || 5;
			if (def.type === "select") {
				col.options = (def.options || []).map(o => ({ id: makeID(), label: o.label, color: o.color }));
			}
			if (collectionRef) col.scope = { collections: [collectionRef], subcollections };
			config.columns.push(col);
			ids.push(col.id);
		}
		store.setConfig(config);
		return ids;
	},

	/** Save existing columns as a new user template. */
	saveFrom(name, description, columnIDs) {
		const { store, makeID } = CustomColumns;
		const columns = columnIDs
			.map(id => store.getColumn(id))
			.filter(Boolean)
			.map((c) => {
				const def = { name: c.name, type: c.type, color: c.color || "" };
				if (c.type === "rating") def.max = c.max;
				if (c.type === "select") def.options = c.options.map(o => ({ label: o.label, color: o.color }));
				return def;
			});
		if (!columns.length) throw new Error("Pick at least one column");
		const config = JSON.parse(JSON.stringify(store.config));
		const tpl = { id: "user-" + makeID(), name: name || "My template", description: description || "", columns };
		config.templates = [...(config.templates || []), tpl];
		store.setConfig(config);
		return tpl.id;
	},

	remove(id) {
		const { store } = CustomColumns;
		const config = JSON.parse(JSON.stringify(store.config));
		config.templates = (config.templates || []).filter(t => t.id !== id);
		store.setConfig(config);
	},
};
