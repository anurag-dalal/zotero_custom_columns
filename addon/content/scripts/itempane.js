/* global CustomColumns, Zotero */
"use strict";

/**
 * "Custom Columns" section in the item pane: edit every column for the
 * selected item in one place.
 */
CustomColumns.itemPane = {
	paneID: null,

	register() {
		const icon = "chrome://customcolumns/content/icons/section.svg";
		this.paneID = Zotero.ItemPaneManager.registerSection({
			paneID: "custom-columns",
			pluginID: CustomColumns.pluginID,
			header: { l10nID: "customcolumns-section-header", icon },
			sidenav: { l10nID: "customcolumns-section-sidenav", icon },
			sectionButtons: [{
				type: "cc-settings",
				icon: "chrome://zotero/skin/16/universal/options.svg",
				l10nID: "customcolumns-section-settings",
				onClick: () => CustomColumns.openSettings(),
			}],
			onInit: ({ body, refresh }) => {
				body._ccUnlisten = CustomColumns.store.addListener((ev) => {
					const item = body._ccItem;
					if (!item) return;
					const key = CustomColumns.store.keyFor(item);
					if (ev.type === "config" || ev.items?.some(i => CustomColumns.store.keyFor(i) === key)) {
						refresh();
					}
				});
			},
			onDestroy: ({ body }) => {
				body._ccUnlisten?.();
			},
			onItemChange: ({ item, setEnabled }) => {
				setEnabled(!!item && !item.isFeedItem);
			},
			onRender: ({ doc, body, item, editable, setSectionSummary }) => {
				body._ccItem = item;
				this.render(doc, body, item, editable);
				setSectionSummary(this.summary(item));
			},
		});
	},

	unregister() {
		if (this.paneID) Zotero.ItemPaneManager.unregisterSection(this.paneID);
		this.paneID = null;
	},

	summary(item) {
		const { store } = CustomColumns;
		const parts = [];
		for (const col of CustomColumns.scope.columnsForItem(item)) {
			const v = store.get(item, col.id);
			if (v === undefined) continue;
			if (col.type === "rating") parts.push((store.config.starSymbol || "★").repeat(v));
			else if (col.type === "select") {
				const o = col.options.find(o => o.id === v);
				if (o) parts.push(o.label);
			}
			else if (col.type === "checkbox") parts.push("✓ " + col.name);
		}
		return parts.join(" · ");
	},

	render(doc, body, item, editable) {
		const HTML = "http://www.w3.org/1999/xhtml";
		const { store } = CustomColumns;
		const el = (tag, cls, text) => {
			const e = doc.createElementNS(HTML, tag);
			if (cls) e.className = cls;
			if (text !== undefined) e.textContent = text;
			return e;
		};

		body.replaceChildren();
		const grid = el("div", "cc-pane");
		body.append(grid);

		const columns = CustomColumns.scope.columnsForItem(item);
		if (!columns.length) {
			const empty = el("div", "cc-pane-empty", store.config.columns.length
				? "No columns apply to this item (its collections have no columns). "
				: "No custom columns yet. ");
			const link = el("a", "cc-pane-link", "Add columns…");
			link.addEventListener("click", () => CustomColumns.openSettings());
			empty.append(link);
			grid.append(empty);
			return;
		}

		for (const col of columns) {
			const value = store.get(item, col.id);
			const label = el("div", "cc-pane-label", col.name);
			const field = el("div", `cc-pane-field cc-type-${col.type}`);
			if (col.color) field.style.setProperty("--cc-col", col.color);
			const set = v => store.set(item, col.id, v);

			switch (col.type) {
				case "checkbox": {
					const box = el("span", "cc-box" + (value ? " cc-checked" : ""));
					box.setAttribute("role", "checkbox");
					box.setAttribute("aria-checked", value ? "true" : "false");
					box.tabIndex = 0;
					const toggle = () => editable && set(!value);
					box.addEventListener("click", toggle);
					box.addEventListener("keydown", (e) => {
						if (e.key === " " || e.key === "Enter") {
							e.preventDefault();
							toggle();
						}
					});
					field.append(box);
					break;
				}
				case "rating": {
					const stars = el("span", "cc-stars");
					for (let v = col.max; v >= 1; v--) {
						const star = el("span", "cc-star" + (value && v <= value ? " cc-on" : ""), store.config.starSymbol || "★");
						star.addEventListener("click", () => editable && set(v === value ? 0 : v));
						stars.append(star);
					}
					field.append(stars);
					if (value) field.append(el("span", "cc-pane-muted", `${value}/${col.max}`));
					break;
				}
				case "link": {
					const input = el("input", "cc-pane-input");
					input.type = "text";
					input.placeholder = "https://…";
					input.value = value || "";
					input.readOnly = !editable;
					input.addEventListener("change", () => set(CustomColumns.normalizeURL(input.value)));
					input.addEventListener("keydown", (e) => {
						if (e.key === "Enter") input.blur();
					});
					const open = el("button", "cc-pane-btn", "↗");
					open.title = "Open in browser";
					open.disabled = !value;
					open.addEventListener("click", () => value && Zotero.launchURL(value));
					field.append(input, open);
					break;
				}
				case "text": {
					const ta = el("textarea", "cc-pane-input cc-pane-textarea");
					ta.rows = Math.min(8, Math.max(2, String(value || "").split("\n").length));
					ta.placeholder = "Write a comment…";
					ta.value = value || "";
					ta.readOnly = !editable;
					ta.addEventListener("change", () => set(ta.value.trim()));
					field.append(ta);
					break;
				}
				case "select": {
					for (const opt of col.options) {
						const chip = CustomColumns.makeChip(doc, opt, store.config.chipStyle);
						chip.classList.add("cc-pane-chip");
						if (opt.id !== value) chip.classList.add("cc-off");
						chip.addEventListener("click", () => editable && set(opt.id === value ? "" : opt.id));
						field.append(chip);
					}
					if (!col.options.length) field.append(el("span", "cc-pane-muted", "No options defined"));
					break;
				}
			}
			grid.append(label, field);
		}
	},
};
