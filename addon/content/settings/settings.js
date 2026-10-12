/* global ChromeUtils, Services */
"use strict";

var { Zotero } = ChromeUtils.importESModule("chrome://zotero/content/zotero.mjs");
var { FilePicker } = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs");

const CC = Zotero.CustomColumns;
const store = CC.store;

const TYPE_ICONS = { checkbox: "☑", rating: "★", link: "🔗", text: "✎", select: "▾" };
const TYPE_HINTS = {
	checkbox: "Click the box in the item list to toggle it. With several items selected, the click applies to all of them.",
	rating: "Click a symbol to rate; click the current rating again to clear it.",
	link: "Click the link to open it in your default browser. Hover the cell and click ✎ to edit. Bare DOIs become https://doi.org links.",
	text: "Hover the cell and click ✎ to edit, or use the item pane. Good for comments and verdicts.",
	select: "Click the cell to pick an option from a dropdown.",
};

const clone = o => JSON.parse(JSON.stringify(o));
let draft = clone(store.config);
let activeTab = "columns";
// Columns tab filter: "all", "global", or a collection ref ("libraryID/key").
let filter = "all";
let applyTimer = null;
let applying = false;

// ---- helpers --------------------------------------------------------------

function h(tag, props = {}, ...children) {
	const el = document.createElement(tag);
	for (const [k, v] of Object.entries(props || {})) {
		if (v === undefined || v === null || v === false) continue;
		if (k === "class") el.className = v;
		else if (k === "style" && typeof v === "object") {
			for (const [sk, sv] of Object.entries(v)) el.style.setProperty(sk, sv);
		}
		else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
		else if (k in el && typeof v !== "string") el[k] = v;
		else el.setAttribute(k, v === true ? "" : v);
	}
	for (const c of children.flat()) {
		if (c === null || c === undefined || c === false) continue;
		el.append(c instanceof Node ? c : document.createTextNode(String(c)));
	}
	return el;
}

function isDark() {
	return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function mode() {
	return isDark() ? "dark" : "light";
}

function confirmDialog(title, text) {
	return Services.prompt.confirm(window, title, text);
}

function status(text) {
	const el = document.getElementById("status");
	el.textContent = text;
	clearTimeout(status._t);
	status._t = setTimeout(() => (el.textContent = ""), 2500);
}

/** Push the draft to the store, debounced so typing doesn't thrash the tree. */
function apply({ now = false } = {}) {
	clearTimeout(applyTimer);
	updateThemeStyle();
	const run = () => {
		// autoShow is a one-shot flag the plugin clears once a column is shown;
		// don't resurrect it from this window's copy.
		for (const col of draft.columns) {
			const live = store.getColumn(col.id);
			if (live && !live.autoShow) delete col.autoShow;
		}
		applying = true;
		try {
			store.setConfig(clone(draft));
		}
		finally {
			applying = false;
		}
		status("Saved");
	};
	if (now) run();
	else applyTimer = setTimeout(run, 400);
}

function updateThemeStyle() {
	document.getElementById("cc-theme").textContent = CC.buildThemeCSS(draft);
}

function palette() {
	return CC.resolvePalette(draft, mode()).palette || CC.THEMES.zotero.light.palette;
}

function nextOptionColor(col) {
	const used = new Set((col.options || []).map(o => o.color));
	const p = palette();
	return p.find(c => !used.has(c)) || p[(col.options || []).length % p.length];
}

// ---- tabs -----------------------------------------------------------------

function render() {
	for (const btn of document.querySelectorAll(".tab")) {
		btn.classList.toggle("active", btn.dataset.tab === activeTab);
	}
	const content = document.getElementById("content");
	content.replaceChildren();
	updateThemeStyle();
	if (activeTab === "columns") renderColumns(content);
	else if (activeTab === "templates") renderTemplates(content);
	else if (activeTab === "appearance") renderAppearance(content);
	else renderData(content);
}

// ---- columns tab ----------------------------------------------------------

let _collections = null;
/** All collections, labelled with their library when there's more than one. */
function collections() {
	if (!_collections) {
		const all = CC.scope.allCollections();
		const multi = new Set(all.map(c => c.libraryName)).size > 1;
		_collections = all.map(c => Object.assign({}, c, { label: multi ? `${c.libraryName} › ${c.path}` : c.path }));
	}
	return _collections;
}

/** <select> of collections; `first` is an optional leading [value, label]. */
function collectionSelect(value, onChange, first) {
	const sel = h("select", { class: "coll-select", onchange: e => onChange(e.target.value) },
		first ? h("option", { value: first[0] }, first[1]) : null,
		collections().map(c => h("option", { value: c.ref, selected: c.ref === value },
			"\u00a0\u00a0\u00a0".repeat(c.depth) + (c.depth ? c.name : c.label))));
	if (value && !collections().some(c => c.ref === value) && !first) sel.value = "";
	return sel;
}

function isCollectionFilter() {
	return filter !== "all" && filter !== "global";
}

function columnMatchesFilter(col) {
	if (filter === "all") return true;
	if (filter === "global") return !CC.scope.isScoped(col);
	const coll = CC.scope.collectionFor(filter);
	return CC.scope.appliesToCollection(col, coll);
}

function addColumn(type) {
	const col = { id: CC.makeID(), name: CC.TYPES[type], type, color: "", autoShow: true };
	if (isCollectionFilter()) col.scope = { collections: [filter], subcollections: true };
	if (type === "rating") col.max = 5;
	if (type === "select") {
		col.options = [];
		for (const label of ["Option A", "Option B", "Option C"]) {
			col.options.push({ id: CC.makeID(), label, color: nextOptionColor(col) });
		}
	}
	draft.columns.push(col);
	apply({ now: true });
	render();
	focusColumn(col.id, true);
}

function focusColumn(id, selectName = false) {
	if (activeTab !== "columns" || !document.querySelector(`.card[data-id="${CSS.escape(id)}"]`)) {
		activeTab = "columns";
		const col = draft.columns.find(c => c.id === id);
		if (col && !columnMatchesFilter(col)) filter = "all";
		render();
	}
	const card = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
	if (!card) return;
	card.scrollIntoView({ block: "center", behavior: "smooth" });
	card.classList.remove("flash");
	void card.offsetWidth;
	card.classList.add("flash");
	if (selectName) {
		const name = card.querySelector(".name");
		name.focus();
		name.select();
	}
}

function moveInArray(arr, index, delta) {
	const j = index + delta;
	if (j < 0 || j >= arr.length) return false;
	[arr[index], arr[j]] = [arr[j], arr[index]];
	return true;
}

function renderColumns(root) {
	const scopedTo = isCollectionFilter() ? CC.scope.label(filter) : null;
	root.append(
		h("div", { class: "toolbar" },
			h("h2", {}, "Columns"),
			h("div", { class: "add-group" },
				h("span", { class: "label" }, scopedTo ? `Add to “${scopedTo}”:` : "Add:"),
				Object.entries(CC.TYPES).map(([type, label]) =>
					h("button", { onclick: () => addColumn(type), title: `Add a ${label.toLowerCase()} column` },
						`${TYPE_ICONS[type]} ${label}`))
			)
		),
		h("div", { class: "filter-bar" },
			h("label", {}, "Show "),
			collectionSelect(filter, (v) => {
				filter = v;
				render();
			}, null),
			filter !== "all" ? h("button", { class: "icon", title: "Show all columns", onclick: () => {
				filter = "all";
				render();
			} }, "✕") : null
		),
		h("p", { class: "hint" },
			"Changes save automatically and new columns appear in the item list right away. Show or hide columns any time by right-clicking a column header. ",
			"Columns limited to collections only appear while you view those collections. Pick a collection above to see its columns, or to add columns that belong only to it."
		)
	);
	// Prepend the non-collection choices to the filter select.
	const fsel = root.querySelector(".filter-bar select");
	fsel.prepend(
		h("option", { value: "all", selected: filter === "all" }, "All columns"),
		h("option", { value: "global", selected: filter === "global" }, "Columns shown everywhere"),
		h("option", { disabled: true }, "── Columns in collection ──")
	);
	fsel.value = filter;

	const visible = draft.columns.filter(columnMatchesFilter);
	if (!visible.length) {
		root.append(h("div", { class: "empty-state" },
			scopedTo
				? `No columns in “${scopedTo}” yet. Add one above, or apply a template from the Templates tab.`
				: "No columns yet. Add one with the buttons above, or start from a template."));
		return;
	}

	const list = h("div", { class: "cards" });
	for (const col of visible) list.append(columnCard(col, draft.columns.indexOf(col)));
	root.append(list);
}

function scopeEditor(col) {
	const scoped = CC.scope.isScoped(col);
	const wrap = h("div", { class: "scope-ctl" },
		h("span", { class: "muted" }, "Shown in"),
		h("select", {
			onchange: (e) => {
				if (e.target.value === "all") delete col.scope;
				else {
					const first = isCollectionFilter() ? filter : collections()[0]?.ref;
					if (!first) {
						Services.prompt.alert(window, "No collections", "Create a collection in Zotero first.");
						e.target.value = "all";
						return;
					}
					col.scope = { collections: [first], subcollections: true };
				}
				apply({ now: true });
				render();
			},
		},
		h("option", { value: "all", selected: !scoped }, "All items"),
		h("option", { value: "some", selected: scoped }, "Only specific collections"))
	);
	if (!scoped) return wrap;

	for (const ref of col.scope.collections) {
		wrap.append(h("span", { class: "coll-chip" },
			"📁 " + CC.scope.label(ref),
			h("button", {
				class: "chip-x", title: "Remove",
				onclick: () => {
					col.scope.collections = col.scope.collections.filter(r => r !== ref);
					if (!col.scope.collections.length) delete col.scope;
					apply({ now: true });
					render();
				},
			}, "✕")));
	}
	const add = collectionSelect("", (v) => {
		if (v && !col.scope.collections.includes(v)) col.scope.collections.push(v);
		apply({ now: true });
		render();
	}, ["", "+ Add collection…"]);
	wrap.append(add,
		h("label", { class: "check" },
			h("input", {
				type: "checkbox", checked: col.scope.subcollections !== false,
				onchange: (e) => {
					col.scope.subcollections = e.target.checked;
					apply({ now: true });
				},
			}),
			" include subcollections"));
	return wrap;
}

function columnCard(col, index) {
	const accent = CC.resolvePalette(draft, mode()).accent;

	const name = h("input", {
		type: "text",
		class: "name",
		value: col.name,
		placeholder: "Column name",
		oninput: (e) => {
			col.name = e.target.value || "Untitled";
			apply();
		},
	});

	const typeSelect = h("select", {
		onchange: (e) => {
			const newType = e.target.value;
			const hasValues = Object.values(store.values).some(v => col.id in v);
			if (hasValues && !confirmDialog("Change column type",
				`Changing the type of “${col.name}” clears the values already stored in it. Continue?`)) {
				e.target.value = col.type;
				return;
			}
			col.type = newType;
			// A fresh id drops the old, incompatible values.
			col.id = CC.makeID();
			if (newType === "rating") col.max = col.max || 5;
			if (newType === "select" && !col.options?.length) {
				col.options = [];
				for (const label of ["Option A", "Option B"]) {
					col.options.push({ id: CC.makeID(), label, color: nextOptionColor(col) });
				}
			}
			apply({ now: true });
			render();
		},
	}, Object.entries(CC.TYPES).map(([t, label]) => h("option", { value: t, selected: t === col.type }, label)));

	const colorInput = h("input", {
		type: "color",
		value: col.color || accent,
		title: "Column color",
		oninput: (e) => {
			col.color = e.target.value;
			tag.textContent = "custom";
			resetColor.disabled = false;
			apply();
		},
	});
	const tag = h("span", { class: "tag" }, col.color ? "custom" : "theme");
	const resetColor = h("button", {
		class: "icon",
		title: "Use theme color",
		disabled: !col.color,
		onclick: () => {
			col.color = "";
			apply({ now: true });
			render();
		},
	}, "↺");

	const head = h("div", { class: "card-head" },
		h("span", { class: "type-badge", style: { "--badge": col.color || accent } }, TYPE_ICONS[col.type]),
		name,
		typeSelect,
		h("label", { class: "color-ctl" }, "Color", colorInput, tag, resetColor),
		h("button", {
			class: "icon", title: "Move up", disabled: index === 0,
			onclick: () => {
				if (moveInArray(draft.columns, index, -1)) {
					apply({ now: true });
					render();
				}
			},
		}, "↑"),
		h("button", {
			class: "icon", title: "Move down", disabled: index === draft.columns.length - 1,
			onclick: () => {
				if (moveInArray(draft.columns, index, 1)) {
					apply({ now: true });
					render();
				}
			},
		}, "↓"),
		h("button", {
			class: "icon danger", title: "Delete column",
			onclick: () => {
				if (!confirmDialog("Delete column", `Delete “${col.name}” and all values stored in it?`)) return;
				draft.columns.splice(index, 1);
				apply({ now: true });
				render();
			},
		}, "✕")
	);

	const body = h("div", { class: "card-body" }, scopeEditor(col), h("div", { class: "muted" }, TYPE_HINTS[col.type]));

	if (col.type === "rating") {
		body.append(h("div", { class: "row-ctl" },
			h("label", {}, "Maximum "),
			h("input", {
				type: "number", min: 1, max: 10, value: col.max,
				onchange: (e) => {
					col.max = Math.min(10, Math.max(1, parseInt(e.target.value) || 5));
					e.target.value = col.max;
					apply({ now: true });
					render();
				},
			}),
			h("span", { class: "cc-cell", style: col.color ? { "--cc-col": col.color } : {} },
				h("span", { class: "cc-stars" },
					Array.from({ length: col.max }, (_, i) => h("span", { class: "cc-star" + (col.max - i <= Math.ceil(col.max * 0.6) ? " cc-on" : "") }, draft.starSymbol))))
		));
	}

	if (col.type === "select") {
		const opts = h("div", { class: "cards", style: { gap: "6px" } });
		col.options.forEach((opt, i) => {
			const chip = CC.makeChip(document, opt, draft.chipStyle);
			opts.append(h("div", { class: "opt-row" },
				h("input", {
					type: "color", value: opt.color, title: "Option color",
					oninput: (e) => {
						opt.color = e.target.value;
						chip.style.setProperty("--cc-opt", opt.color);
						chip.style.setProperty("--cc-opt-fg", CC.contrastText(opt.color));
						apply();
					},
				}),
				h("input", {
					type: "text", value: opt.label, placeholder: "Option label",
					oninput: (e) => {
						opt.label = e.target.value;
						chip.textContent = opt.label;
						apply();
					},
				}),
				h("button", {
					class: "icon", title: "Move up", disabled: i === 0,
					onclick: () => moveInArray(col.options, i, -1) && (apply({ now: true }), render()),
				}, "↑"),
				h("button", {
					class: "icon", title: "Move down", disabled: i === col.options.length - 1,
					onclick: () => moveInArray(col.options, i, 1) && (apply({ now: true }), render()),
				}, "↓"),
				h("button", {
					class: "icon danger", title: "Remove option",
					onclick: () => {
						const used = Object.values(store.values).some(v => v[col.id] === opt.id);
						if (used && !confirmDialog("Remove option", `“${opt.label}” is in use. Items using it will be cleared. Remove?`)) return;
						col.options.splice(i, 1);
						apply({ now: true });
						render();
					},
				}, "✕"),
				chip
			));
		});
		body.append(opts, h("div", { class: "row-ctl" },
			h("button", {
				onclick: () => {
					col.options.push({ id: CC.makeID(), label: `Option ${col.options.length + 1}`, color: nextOptionColor(col) });
					apply({ now: true });
					render();
					const inputs = document.querySelectorAll(`.card[data-id="${CSS.escape(col.id)}"] .opt-row input[type="text"]`);
					inputs[inputs.length - 1]?.select();
				},
			}, "+ Add option"),
			h("button", {
				title: "Recolor all options using the current theme palette",
				onclick: () => {
					const p = palette();
					col.options.forEach((o, i) => (o.color = p[i % p.length]));
					apply({ now: true });
					render();
				},
			}, "Use theme palette")
		));
	}

	return h("div", { class: "card", "data-id": col.id }, head, body);
}

// ---- templates tab --------------------------------------------------------

function templateCard(tpl) {
	let target = isCollectionFilter() ? filter : "global";
	const where = h("select", { onchange: e => (target = e.target.value) },
		h("option", { value: "global", selected: target === "global" }, "All items"),
		h("option", { disabled: true }, "── Only in collection ──"),
		collections().map(c => h("option", { value: c.ref, selected: c.ref === target },
			"\u00a0\u00a0\u00a0".repeat(c.depth) + (c.depth ? c.name : c.label))));

	return h("div", { class: "card template" },
		h("div", { class: "card-head" },
			h("span", { class: "type-badge" }, tpl.builtin ? "★" : "✎"),
			h("div", { class: "tpl-title" },
				h("strong", {}, tpl.name),
				tpl.description ? h("div", { class: "muted" }, tpl.description) : null),
			tpl.builtin ? h("span", { class: "tag muted" }, "built-in") : h("button", {
				class: "icon danger", title: "Delete template",
				onclick: () => {
					if (!confirmDialog("Delete template", `Delete the template “${tpl.name}”? Columns already created from it are kept.`)) return;
					CC.templates.remove(tpl.id);
					draft = clone(store.config);
					render();
				},
			}, "✕")
		),
		h("div", { class: "card-body" },
			h("div", { class: "tpl-cols" },
				tpl.columns.map(c => h("span", { class: "tpl-col" }, `${TYPE_ICONS[c.type]} ${c.name}`,
					c.type === "select" ? h("span", { class: "muted" }, ` (${c.options.map(o => o.label).join(" / ")})`) : null))),
			h("div", { class: "row-ctl" },
				h("span", { class: "muted" }, "Apply to"),
				where,
				h("button", {
					class: "primary",
					onclick: () => {
						clearTimeout(applyTimer);
						store.setConfig(clone(draft));
						const ref = target === "global" ? null : target;
						const ids = CC.templates.apply(tpl.id, ref);
						draft = clone(store.config);
						filter = ref || "all";
						status(`Added ${ids.length} columns`);
						activeTab = "columns";
						render();
						focusColumn(ids[0]);
					},
				}, "Apply template"))
		)
	);
}

function renderTemplates(root) {
	root.append(
		h("div", { class: "toolbar" }, h("h2", {}, "Templates")),
		h("p", { class: "hint" },
			"A template is a ready-made set of columns. Applying one adds fresh copies of its columns, either everywhere or only in one collection. ",
			"So you can give each project its own columns, e.g. a screening set for a review collection. You can also right-click a collection → Custom Columns → Apply template."
		)
	);
	const list = h("div", { class: "cards" });
	for (const tpl of CC.templates.list()) list.append(templateCard(tpl));
	root.append(list);

	// Save current columns as a template
	root.append(h("h3", {}, "Save columns as a template"));
	if (!draft.columns.length) {
		root.append(h("p", { class: "muted" }, "Create some columns first."));
		return;
	}
	const picked = new Set();
	const nameInput = h("input", { type: "text", placeholder: "Template name", style: { width: "260px" } });
	const descInput = h("input", { type: "text", placeholder: "Description (optional)", style: { width: "380px" } });
	const saveBtn = h("button", {
		class: "primary",
		disabled: true,
		onclick: () => {
			clearTimeout(applyTimer);
			store.setConfig(clone(draft));
			CC.templates.saveFrom(nameInput.value.trim() || "My template", descInput.value.trim(), [...picked]);
			draft = clone(store.config);
			status("Template saved");
			render();
		},
	}, "Save template");
	const update = () => (saveBtn.disabled = !picked.size || !nameInput.value.trim());
	nameInput.addEventListener("input", update);
	root.append(h("div", { class: "data-box" },
		h("div", { class: "row-ctl" }, nameInput, descInput),
		h("div", { class: "tpl-pick" },
			draft.columns.map(c => h("label", { class: "check" },
				h("input", {
					type: "checkbox",
					onchange: (e) => {
						if (e.target.checked) picked.add(c.id);
						else picked.delete(c.id);
						update();
					},
				}),
				` ${TYPE_ICONS[c.type]} ${c.name}`,
				CC.scope.isScoped(c) ? h("span", { class: "muted" }, ` · ${CC.scope.describe(c)}`) : null))),
		h("div", { class: "row-ctl" }, saveBtn,
			h("span", { class: "muted" }, "Saves names, types, colors and options. Values are not included."))
	));
}

// ---- appearance tab -------------------------------------------------------

function themeSample(p) {
	const sym = draft.starSymbol;
	return h("div", { class: "sample" },
		h("span", { class: "cc-box cc-checked", style: { background: p.accent, "border-color": p.accent, "--cc-checkMark": p.checkMark } }),
		h("span", {},
			h("span", { style: { color: p.star } }, sym + sym + sym),
			h("span", { style: { color: p.starEmpty } }, sym + sym)),
		h("span", { style: { color: p.link, "text-decoration": "underline" } }, "link"),
		h("span", { class: "swatches" }, (p.palette || []).slice(0, 5).map(c => h("span", { style: { background: c } })))
	);
}

function segmented(options, current, onPick) {
	return h("div", { class: "segmented" },
		options.map(([value, label]) => h("button", {
			class: value === current ? "on" : "",
			onclick: () => onPick(value),
		}, label)));
}

function renderAppearance(root) {
	root.append(
		h("div", { class: "toolbar" }, h("h2", {}, "Appearance")),
		h("p", { class: "hint" },
			"Pick a theme, then fine-tune any color below. Each theme has a light and a dark palette and follows Zotero’s appearance automatically. ",
			"Per-column colors (Columns tab) and per-option colors override the theme."
		)
	);

	// Theme cards
	root.append(h("h3", {}, "Theme"));
	const grid = h("div", { class: "theme-grid" });
	for (const [key, theme] of Object.entries(CC.THEMES)) {
		const p = Object.assign({}, theme[mode()]);
		grid.append(h("button", {
			class: "theme-card" + (draft.theme === key ? " selected" : ""),
			onclick: () => {
				draft.theme = key;
				apply({ now: true });
				render();
			},
		}, h("div", { class: "theme-name" }, h("span", {}, theme.name), draft.theme === key ? h("span", {}, "✓") : null), themeSample(p)));
	}
	root.append(grid);

	// Style options
	root.append(h("h3", {}, "Style"));
	root.append(h("div", { class: "form-grid" },
		h("span", {}, "Option chips"),
		segmented([["soft", "Soft"], ["solid", "Solid"], ["outline", "Outline"]], draft.chipStyle, (v) => {
			draft.chipStyle = v;
			apply({ now: true });
			render();
		}),
		h("span", {}, "Chip shape"),
		segmented([["pill", "Pill"], ["rounded", "Rounded"], ["square", "Square"]], draft.chipShape, (v) => {
			draft.chipShape = v;
			apply({ now: true });
			render();
		}),
		h("span", {}, "Rating symbol"),
		segmented(CC.STAR_SYMBOLS.map(s => [s, s]), draft.starSymbol, (v) => {
			draft.starSymbol = v;
			apply({ now: true });
			render();
		})
	));

	// Preview
	root.append(h("h3", {}, "Preview"), renderPreview());

	// Color overrides
	const hasOverrides = Object.keys(draft.overrides.light).length + Object.keys(draft.overrides.dark).length > 0;
	root.append(h("div", { class: "toolbar" },
		h("h3", { style: { flex: 1 } }, "Custom colors"),
		h("button", {
			disabled: !hasOverrides,
			onclick: () => {
				draft.overrides = { light: {}, dark: {} };
				apply({ now: true });
				render();
			},
		}, "Reset all to theme")
	));
	root.append(h("p", { class: "hint" }, "Outlined swatches differ from the theme. ↺ resets a single color."));

	const table = h("table", { class: "colors" },
		h("tr", {}, h("th", {}, "Element"), h("th", {}, "Light"), h("th", {}, "Dark")));
	const theme = CC.THEMES[draft.theme] || CC.THEMES.zotero;
	for (const [key, label] of CC.THEME_VARS) {
		const cell = (m) => {
			const overridden = key in draft.overrides[m];
			const value = draft.overrides[m][key] || theme[m][key] || (m === "dark" ? "#e6e7ea" : "#1d2129");
			const wrap = h("div", { class: "color-cell" + (overridden ? " overridden" : "") });
			wrap.append(
				h("input", {
					type: "color", value,
					oninput: (e) => {
						draft.overrides[m][key] = e.target.value;
						wrap.classList.add("overridden");
						apply();
					},
					onchange: () => render(),
				}),
				h("button", {
					class: "icon reset", title: "Reset to theme",
					onclick: () => {
						delete draft.overrides[m][key];
						apply({ now: true });
						render();
					},
				}, "↺"),
				!theme[m][key] && !overridden ? h("span", { class: "muted" }, "inherit") : null
			);
			return wrap;
		};
		table.append(h("tr", {}, h("td", {}, label), h("td", {}, cell("light")), h("td", {}, cell("dark"))));
	}
	root.append(table);
}

/** A fake item list showing one sample per column type. */
function renderPreview() {
	const cols = draft.columns.length ? draft.columns : [];
	const sample = [
		{ title: "Attention Is All You Need", seed: 0 },
		{ title: "Deep Residual Learning for Image Recognition", seed: 1 },
		{ title: "A Mathematical Theory of Communication", seed: 2 },
	];
	const wrap = h("div", { class: "preview" });
	wrap.append(h("div", { class: "row head" },
		h("span", { class: "cell title" }, "Title"),
		cols.map(c => h("span", { class: `cell w-${c.type}` }, c.name))));

	for (const s of sample) {
		const row = h("div", { class: "row" }, h("span", { class: "cell title" }, s.title));
		for (const col of cols) {
			const cell = h("span", { class: `cell cc-cell cc-type-${col.type} w-${col.type}` });
			if (col.color) cell.style.setProperty("--cc-col", col.color);
			switch (col.type) {
				case "checkbox":
					cell.append(h("span", { class: "cc-box" + (s.seed !== 1 ? " cc-checked" : "") }));
					break;
				case "rating": {
					const v = [col.max, Math.ceil(col.max / 2), 0][s.seed];
					const stars = h("span", { class: "cc-stars" });
					for (let i = col.max; i >= 1; i--) stars.append(h("span", { class: "cc-star" + (i <= v ? " cc-on" : "") }, draft.starSymbol));
					cell.append(stars);
					break;
				}
				case "link":
					if (s.seed !== 2) cell.append(h("span", { class: "cc-link" }, ["arxiv.org/abs/1706.03762", "github.com/KaimingHe"][s.seed]));
					break;
				case "text":
					cell.append(h("span", { class: "cc-text" }, ["Must cite — foundational", "Strong baseline, reread §4", ""][s.seed]));
					break;
				case "select": {
					const opt = col.options[s.seed % Math.max(1, col.options.length)];
					if (opt) cell.append(CC.makeChip(document, opt, draft.chipStyle));
					break;
				}
			}
			row.append(cell);
		}
		wrap.append(row);
	}
	if (!cols.length) wrap.append(h("div", { class: "row" }, h("span", { class: "cell muted" }, "Add columns to see a preview.")));
	return wrap;
}

// ---- data tab -------------------------------------------------------------

async function exportData() {
	const fp = new FilePicker();
	fp.init(window, "Export Custom Columns data", fp.modeSave);
	fp.appendFilter("JSON", "*.json");
	fp.defaultString = `zotero-custom-columns-${new Date().toISOString().slice(0, 10)}.json`;
	if (await fp.show() === fp.returnCancel) return;
	await store.flush();
	await IOUtils.writeJSON(fp.file, store.exportData());
	status("Exported");
}

async function importData() {
	const fp = new FilePicker();
	fp.init(window, "Import Custom Columns data", fp.modeOpen);
	fp.appendFilter("JSON", "*.json");
	if (await fp.show() !== fp.returnOK) return;
	try {
		const data = await IOUtils.readJSON(fp.file);
		const replace = confirmDialog("Import",
			"Replace your column definitions and theme with the ones in this file?\n\n"
			+ "OK: replace columns and theme, and merge values.\nCancel: keep your columns, merge values only.");
		store.importData(data, { replaceConfig: replace });
		draft = clone(store.config);
		render();
		status("Imported");
	}
	catch (e) {
		Zotero.logError(e);
		Services.prompt.alert(window, "Import failed", String(e.message || e));
	}
}

function csvBox() {
	let target = isCollectionFilter() ? filter : "library";
	let sub = true;
	const run = async () => {
		try {
			const path = target === "library"
				? await CC.csv.exportLibrary(window, Zotero.Libraries.userLibraryID)
				: await CC.csv.exportCollection(window, target, { subcollections: sub });
			if (path) status("CSV exported");
		}
		catch (e) {
			Zotero.logError(e);
			Services.prompt.alert(window, "Export failed", String(e.message || e));
		}
	};
	return h("div", { class: "data-box" },
		h("strong", {}, "Export to CSV"),
		h("div", { class: "muted" },
			"A spreadsheet of items with title, authors, year, DOI, a zotero:// link and every custom column that applies. ",
			"Also available by right-clicking a collection or selected items → Custom Columns."),
		h("div", { class: "row-ctl" },
			h("select", { onchange: e => (target = e.target.value) },
				h("option", { value: "library", selected: target === "library" }, "My Library (all columns)"),
				h("option", { disabled: true }, "── Collection ──"),
				collections().map(c => h("option", { value: c.ref, selected: c.ref === target },
					"\u00a0\u00a0\u00a0".repeat(c.depth) + (c.depth ? c.name : c.label)))),
			h("label", { class: "check" },
				h("input", { type: "checkbox", checked: true, onchange: e => (sub = e.target.checked) }),
				" include subcollections"),
			h("button", { class: "primary", onclick: run }, "Export CSV…"))
	);
}

function renderData(root) {
	const itemCount = Object.keys(store.values).length;
	const valueCount = Object.values(store.values).reduce((n, v) => n + Object.keys(v).length, 0);

	root.append(
		h("div", { class: "toolbar" }, h("h2", {}, "Data")),
		h("p", { class: "hint" },
			"Values live in your Zotero data folder, next to zotero.sqlite. Zotero sync does not carry them to other computers, so use export and import to move them, and include the folder in your backups."),
		h("div", { class: "data-box" },
			h("strong", {}, "Storage"),
			h("div", { class: "path" }, store.dir),
			h("div", {}, `${valueCount} value${valueCount === 1 ? "" : "s"} across ${itemCount} item${itemCount === 1 ? "" : "s"}.`),
			h("div", { class: "row-ctl" },
				h("button", { onclick: () => Zotero.File.reveal(store.dir) }, "Show folder"))
		),
		csvBox(),
		h("div", { class: "data-box" },
			h("strong", {}, "Backup and transfer"),
			h("div", { class: "muted" }, "Export saves the columns, theme and all values to one JSON file. Import merges values into what you already have."),
			h("div", { class: "row-ctl" },
				h("button", { class: "primary", onclick: exportData }, "Export…"),
				h("button", { onclick: importData }, "Import…"))
		),
		h("div", { class: "data-box" },
			h("strong", {}, "Reset"),
			h("div", { class: "row-ctl" },
				h("button", {
					onclick: () => {
						if (!confirmDialog("Reset settings", "Reset the theme and colors to defaults? Your columns and values are kept.")) return;
						Object.assign(draft, { theme: "zotero", overrides: { light: {}, dark: {} }, chipStyle: "soft", chipShape: "pill", starSymbol: "★" });
						apply({ now: true });
						render();
					},
				}, "Reset appearance"),
				h("button", {
					class: "danger",
					onclick: () => {
						if (!confirmDialog("Clear all values", `Remove all ${valueCount} stored values? Columns stay, but every cell becomes empty. This cannot be undone. Export first if unsure.`)) return;
						store.removeByKeys(Object.keys(store.values));
						CC.cells.redrawAll();
						render();
						status("Cleared");
					},
				}, "Clear all values"))
		)
	);
}

// ---- boot -----------------------------------------------------------------

function showCollection(ref) {
	filter = ref || "all";
	activeTab = "columns";
	render();
}

window.CCSettings = { focusColumn, showCollection };

for (const btn of document.querySelectorAll(".tab")) {
	btn.addEventListener("click", () => {
		activeTab = btn.dataset.tab;
		render();
	});
}

const unlisten = store.addListener((ev) => {
	if (ev.type !== "config" || applying) return;
	draft = clone(store.config);
	render();
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);

window.addEventListener("unload", () => {
	unlisten();
	if (applyTimer) {
		clearTimeout(applyTimer);
		store.setConfig(clone(draft));
	}
});

window.addEventListener("focus", () => {
	// Collections may have been added or renamed in the main window.
	_collections = null;
});

const initialRef = window.arguments?.[0]?.collectionRef;
if (initialRef) filter = initialRef;
render();
const focusID = window.arguments?.[0]?.focusColumnID;
if (focusID) setTimeout(() => focusColumn(focusID), 50);
