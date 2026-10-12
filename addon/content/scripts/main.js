/* global CustomColumns, Zotero, Services */
"use strict";

const SETTINGS_URL = "chrome://customcolumns/content/settings/settings.html";
const SETTINGS_WINDOWTYPE = "customcolumns:settings";
const HTML_NS_MAIN = "http://www.w3.org/1999/xhtml";

Object.assign(CustomColumns, {
	pluginID: null,
	version: null,
	rootURI: null,
	initialized: false,
	_notifierID: null,
	_unlisten: null,

	async init({ id, version, rootURI }) {
		this.pluginID = id;
		this.version = version;
		this.rootURI = rootURI;

		await Zotero.initializationPromise;
		await this.store.load();

		// Registering columns makes Zotero reset the item tree's columns, which
		// fails (and stalls DB transactions for 30s) if the tree hasn't mounted yet.
		await Zotero.uiReadyPromise;
		await this._waitForItemTrees();

		this._cleanupLeftovers();
		this.cells.sync();
		this.itemPane.register();
		await Zotero.PreferencePanes.register({
			pluginID: id,
			src: rootURI + "content/preferences.xhtml",
			label: "Custom Columns",
			image: rootURI + "content/icons/icon.svg",
		});

		this._unlisten = this.store.addListener(ev => this._onStoreChange(ev));
		this._notifierID = Zotero.Notifier.registerObserver(
			{ notify: (...args) => this._onNotify(...args) },
			["item"],
			"customColumns"
		);

		this.initialized = true;
		for (const win of Zotero.getMainWindows()) {
			if (win.ZoteroPane) this.addToWindow(win);
		}
	},

	async _waitForItemTrees(timeoutMs = 30000) {
		const deadline = Date.now() + timeoutMs;
		for (;;) {
			const wins = Zotero.getMainWindows();
			// No main window yet: trees created later pick the columns up on mount.
			if (!wins.length || wins.every(w => w.ZoteroPane?.itemsView?.tree)) return;
			if (Date.now() > deadline) return;
			await Zotero.Promise.delay(100);
		}
	},

	async shutdown() {
		// Each step runs on its own so one failure can't leave the rest of the
		// plugin registered (which would confuse a reinstall).
		const steps = [
			() => Services.wm.getMostRecentWindow(SETTINGS_WINDOWTYPE)?.close(),
			() => Zotero.getMainWindows().forEach(win => this.removeFromWindow(win)),
			() => this._notifierID && Zotero.Notifier.unregisterObserver(this._notifierID),
			() => this._unlisten?.(),
			() => this.itemPane.unregister(),
			() => this.cells.unregisterAll(),
			() => this.store.flush(),
		];
		for (const step of steps) {
			try {
				await step();
			}
			catch (e) {
				Zotero.logError(e);
			}
		}
		this.initialized = false;
	},

	/**
	 * Remove anything a previous copy of the plugin left registered, e.g. after
	 * an uninstall that didn't finish cleanly.
	 */
	_cleanupLeftovers() {
		try {
			for (const col of Zotero.ItemTreeManager.getCustomColumns()) {
				if (col.pluginID === this.pluginID) Zotero.ItemTreeManager.unregisterColumn(col.dataKey);
			}
		}
		catch (e) {
			Zotero.logError(e);
		}
		try {
			const paneID = CSS.escape(`${this.pluginID}-custom-columns`);
			if (Zotero.ItemPaneManager.customSectionData?.options?.some(s => s.paneID === paneID)) {
				Zotero.ItemPaneManager.unregisterSection(paneID);
			}
		}
		catch (e) {
			Zotero.logError(e);
		}
	},

	// ---- windows ---------------------------------------------------------

	addToWindow(win) {
		if (!this.initialized) return; // init() adds to open windows when ready
		const doc = win.document;
		// Start from a clean slate in case an earlier copy left its menus behind.
		this.removeFromWindow(win);

		win.MozXULElement.insertFTLIfNeeded("custom-columns.ftl");

		const link = doc.createElementNS(HTML_NS_MAIN, "link");
		link.id = "cc-stylesheet";
		link.rel = "stylesheet";
		link.href = "chrome://customcolumns/content/styles/cells.css";
		doc.documentElement.append(link);

		const style = doc.createElementNS(HTML_NS_MAIN, "style");
		style.id = "cc-theme";
		style.textContent = this.buildThemeCSS(this.store.config);
		doc.documentElement.append(style);

		this._addToolsMenu(doc);
		this._addItemMenu(doc);
		this._addCollectionMenu(doc);
		this._watchView(win);
	},

	/** Re-register columns when the viewed collection changes scoped columns in or out. */
	_watchView(win) {
		const view = win.ZoteroPane?.itemsView;
		if (!view?.onRefresh || win._ccOnRefresh) return;
		win._ccOnRefresh = () => {
			// Defer: registering columns refreshes the tree, which is mid-refresh here.
			win.setTimeout(() => {
				if (this.initialized && this.cells.needsSync()) this.cells.sync();
			}, 0);
		};
		view.onRefresh.addListener(win._ccOnRefresh);
	},

	removeFromWindow(win) {
		const doc = win.document;
		for (const id of ["cc-stylesheet", "cc-theme", "cc-tools-menuitem", "cc-item-menu",
			"cc-item-menu-sep", "cc-coll-menu", "cc-coll-menu-sep", "cc-editor-panel", "cc-option-popup"]) {
			doc.getElementById(id)?.remove();
		}
		const itemMenu = doc.getElementById("zotero-itemmenu");
		if (itemMenu?._ccOnShowing) {
			itemMenu.removeEventListener("popupshowing", itemMenu._ccOnShowing);
			delete itemMenu._ccOnShowing;
		}
		const collMenu = doc.getElementById("zotero-collectionmenu");
		if (collMenu?._ccOnShowing) {
			collMenu.removeEventListener("popupshowing", collMenu._ccOnShowing);
			delete collMenu._ccOnShowing;
		}
		if (win._ccOnRefresh) {
			win.ZoteroPane?.itemsView?.onRefresh?.removeListener(win._ccOnRefresh);
			delete win._ccOnRefresh;
		}
		doc.querySelector('[href="custom-columns.ftl"]')?.remove();
	},

	_applyTheme() {
		const css = this.buildThemeCSS(this.store.config);
		for (const win of Zotero.getMainWindows()) {
			const style = win.document.getElementById("cc-theme");
			if (style) style.textContent = css;
		}
	},

	_addToolsMenu(doc) {
		const popup = doc.getElementById("menu_ToolsPopup");
		if (!popup) return;
		const mi = doc.createXULElement("menuitem");
		mi.id = "cc-tools-menuitem";
		mi.setAttribute("label", "Custom Columns…");
		mi.addEventListener("command", () => this.openSettings());
		popup.append(mi);
	},

	/** "Custom Columns" submenu in the item context menu, for bulk edits. */
	_addItemMenu(doc) {
		const itemMenu = doc.getElementById("zotero-itemmenu");
		if (!itemMenu) return;

		const sep = doc.createXULElement("menuseparator");
		sep.id = "cc-item-menu-sep";
		const menu = doc.createXULElement("menu");
		menu.id = "cc-item-menu";
		menu.setAttribute("label", "Custom Columns");
		const popup = doc.createXULElement("menupopup");
		menu.append(popup);
		itemMenu.append(sep, menu);

		popup.addEventListener("popupshowing", (e) => {
			if (e.target === popup) this._buildItemMenu(doc, popup);
		});
		itemMenu._ccOnShowing = (e) => {
			if (e.target !== itemMenu) return;
			const hasItems = this._selectedItems(doc).length > 0;
			menu.hidden = !hasItems;
			sep.hidden = !hasItems;
		};
		itemMenu.addEventListener("popupshowing", itemMenu._ccOnShowing);
	},

	/** "Custom Columns" submenu in the collection/library context menu. */
	_addCollectionMenu(doc) {
		const collMenu = doc.getElementById("zotero-collectionmenu");
		if (!collMenu) return;
		const sep = doc.createXULElement("menuseparator");
		sep.id = "cc-coll-menu-sep";
		const menu = doc.createXULElement("menu");
		menu.id = "cc-coll-menu";
		menu.setAttribute("label", "Custom Columns");
		const popup = doc.createXULElement("menupopup");
		menu.append(popup);
		collMenu.append(sep, menu);

		popup.addEventListener("popupshowing", (e) => {
			if (e.target === popup) this._buildCollectionMenu(doc, popup);
		});
		collMenu._ccOnShowing = (e) => {
			if (e.target !== collMenu) return;
			const row = doc.defaultView.ZoteroPane?.collectionsView?.selectedTreeRow;
			const show = !!row && !row.isFeed?.() && !row.isFeeds?.() && !row.isHeader?.() && !row.isSeparator?.();
			menu.hidden = !show;
			sep.hidden = !show;
		};
		collMenu.addEventListener("popupshowing", collMenu._ccOnShowing);
	},

	_buildCollectionMenu(doc, popup) {
		popup.replaceChildren();
		const win = doc.defaultView;
		const row = win.ZoteroPane?.collectionsView?.selectedTreeRow;
		if (!row) return;
		const isCollection = !!row.isCollection?.();
		const ref = isCollection ? this.scope.refFor(row.ref) : null;
		const xul = (tag, attrs = {}, onCommand) => {
			const el = doc.createXULElement(tag);
			for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
			if (onCommand) el.addEventListener("command", onCommand);
			return el;
		};

		popup.append(xul("menuitem", { label: "Export to CSV…" }, () => {
			this.csv.exportTreeRow(win, row).catch((e) => {
				Zotero.logError(e);
				Services.prompt.alert(win, "Export failed", String(e.message || e));
			});
		}));
		popup.append(xul("menuseparator"));

		const tplMenu = xul("menu", { label: isCollection ? "Apply template to this collection" : "Apply template to all items" });
		const tplPopup = xul("menupopup");
		tplMenu.append(tplPopup);
		for (const tpl of this.templates.list()) {
			const names = tpl.columns.map(c => c.name).join(", ");
			tplPopup.append(xul("menuitem", { label: tpl.name, tooltiptext: names }, () => {
				this.templates.apply(tpl.id, ref);
				const where = isCollection ? `“${row.ref.name}”` : "all items";
				const pw = new Zotero.ProgressWindow({ closeOnClick: true });
				pw.changeHeadline("Custom Columns");
				pw.addDescription(`Added ${tpl.columns.length} columns from “${tpl.name}” to ${where}`);
				pw.show();
				pw.startCloseTimer(3500);
			}));
		}
		popup.append(tplMenu);

		if (isCollection) {
			const scoped = this.store.config.columns.filter(c => this.scope.isScoped(c) && this.scope.appliesToCollection(c, row.ref));
			popup.append(xul("menuitem", {
				label: scoped.length ? `Columns for this collection (${scoped.length})…` : "Add columns for this collection…",
			}, () => this.openSettings(null, { collectionRef: ref })));
		}
		popup.append(xul("menuitem", { label: "Settings…" }, () => this.openSettings()));
	},

	_selectedItems(doc) {
		const pane = doc.defaultView.ZoteroPane;
		return (pane?.getSelectedItems() || []).filter(i => i instanceof Zotero.Item && !i.isFeedItem);
	},

	_buildItemMenu(doc, popup) {
		popup.replaceChildren();
		const items = this._selectedItems(doc);
		const { store } = this;
		const xul = (tag, attrs = {}, onCommand) => {
			const el = doc.createXULElement(tag);
			for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
			if (onCommand) el.addEventListener("command", onCommand);
			return el;
		};
		const subMenu = (label) => {
			const m = xul("menu", { label });
			const p = xul("menupopup");
			m.append(p);
			return [m, p];
		};
		const suffix = items.length > 1 ? ` (${items.length} items)` : "";

		const columns = this.csv.columnsForItems(items);
		for (const col of columns) {
			const values = items.map(i => store.get(i, col.id));
			const allSame = values.every(v => v === values[0]);
			const current = allSame ? values[0] : undefined;

			switch (col.type) {
				case "checkbox": {
					const checked = values.every(Boolean);
					popup.append(xul("menuitem", { label: col.name, type: "checkbox", checked: checked ? "true" : "false" },
						() => store.set(items, col.id, !checked)));
					break;
				}
				case "rating": {
					const [m, p] = subMenu(col.name);
					const sym = store.config.starSymbol || "★";
					for (let v = col.max; v >= 1; v--) {
						p.append(xul("menuitem", { label: sym.repeat(v), type: "radio", checked: current === v ? "true" : "false" },
							() => store.set(items, col.id, v)));
					}
					p.append(xul("menuseparator"), xul("menuitem", { label: "Clear" }, () => store.set(items, col.id, 0)));
					popup.append(m);
					break;
				}
				case "select": {
					const [m, p] = subMenu(col.name);
					for (const opt of col.options) {
						p.append(xul("menuitem", {
							label: opt.label,
							class: "menuitem-iconic",
							image: this.dotIcon(opt.color),
							type: "radio",
							checked: current === opt.id ? "true" : "false",
						}, () => store.set(items, col.id, opt.id)));
					}
					p.append(xul("menuseparator"), xul("menuitem", { label: "Clear" }, () => store.set(items, col.id, "")));
					popup.append(m);
					break;
				}
				case "text":
				case "link": {
					popup.append(xul("menuitem", { label: `Edit ${col.name}…${suffix}` }, () => {
						const anchor = doc.querySelector("#zotero-items-tree .row.selected") || doc.getElementById("zotero-items-tree");
						this.editors.editText(doc, anchor, {
							title: col.name + suffix,
							value: current || "",
							placeholder: col.type === "link" ? "https://…" : "Write a comment…",
							multiline: col.type === "text",
							onSave: v => store.set(items, col.id, col.type === "link" ? this.normalizeURL(v) : v.trim()),
						});
					}));
					break;
				}
			}
		}
		if (columns.length) popup.append(xul("menuseparator"));
		popup.append(xul("menuitem", { label: `Export ${items.length > 1 ? "selected items" : "item"} to CSV…` }, () => {
			this.csv.exportItems(doc.defaultView, items).catch(e => Zotero.logError(e));
		}));
		popup.append(xul("menuitem", { label: "Settings…" }, () => this.openSettings()));
	},

	// ---- events ----------------------------------------------------------

	_onStoreChange(ev) {
		if (ev.type === "config") {
			this.cells.sync();
			this._applyTheme();
		}
		else if (ev.type === "values") {
			this.cells.redraw(ev.items);
		}
	},

	_onNotify(event, type, ids, extraData) {
		if (type !== "item" || event !== "delete") return;
		const keys = [];
		for (const id of ids) {
			const d = extraData?.[id];
			if (d?.libraryID !== undefined && d.key) keys.push(`${d.libraryID}/${d.key}`);
		}
		if (keys.length) this.store.removeByKeys(keys);
	},

	// ---- settings window -------------------------------------------------

	/**
	 * @param {string} [focusColumnID] - scroll to and highlight this column
	 * @param {{collectionRef?: string}} [opts] - filter the Columns tab to a collection
	 */
	openSettings(focusColumnID, { collectionRef } = {}) {
		const existing = Services.wm.getMostRecentWindow(SETTINGS_WINDOWTYPE);
		if (existing) {
			existing.focus();
			if (collectionRef) existing.CCSettings?.showCollection(collectionRef);
			if (focusColumnID) existing.CCSettings?.focusColumn(focusColumnID);
			return;
		}
		const parent = Zotero.getMainWindow();
		parent.openDialog(
			SETTINGS_URL,
			"customcolumns-settings",
			"chrome,centerscreen,resizable=yes,dialog=no,width=980,height=720",
			{ focusColumnID, collectionRef }
		);
	},
});
