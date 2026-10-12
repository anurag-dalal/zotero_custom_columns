#!/usr/bin/env node
// End-to-end smoke test against a running dev Zotero:
//   npm run dev -- --debug-server     (in one terminal)
//   npm run smoke                     (in another)
//
// Creates a few sample items in the dev library, shows the custom columns,
// clicks cells like a user would and checks the stored values. Saves
// screenshots to build/screenshots/.
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { RDP } from "./rdp.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shots = join(root, "build", "screenshots");
mkdirSync(shots, { recursive: true });

const rdp = await new RDP().connect();
let failures = 0;

async function step(name, body) {
	try {
		const out = await rdp.run(body);
		console.log(`✓ ${name}${out !== null && out !== undefined ? "  " + JSON.stringify(out) : ""}`);
		return out;
	}
	catch (e) {
		failures++;
		console.log(`✗ ${name}\n  ${String(e.message).split("\n").slice(0, 6).join("\n  ")}`);
		return null;
	}
}

// Shared helpers injected at the start of every step.
const H = `
	const CC = Zotero.CustomColumns;
	const store = CC.store;
	const win = Zotero.getMainWindow();
	const doc = win.document;
	const view = win.ZoteroPane.itemsView;
	const delay = ms => Zotero.Promise.delay(ms);
	const assert = (cond, msg) => { if (!cond) throw new Error("assert: " + msg); };
	const col = type => store.config.columns.find(c => c.type === type);
	const testItems = async () => (await Zotero.Items.getAll(Zotero.Libraries.userLibraryID))
		.filter(i => i.isRegularItem() && (i.getField("extra") || "").includes("cc-smoke"))
		.sort((a, b) => a.getField("title").localeCompare(b.getField("title")));
	const cellFor = (item, type) => {
		const row = view.getRowIndexByID(item.id);
		const rowEl = doc.getElementById(view.tree.props.id + "-row-" + row);
		return rowEl && rowEl.querySelector(".cc-type-" + type);
	};
	const click = el => {
		for (const t of ["mousedown", "mouseup", "click"]) {
			el.dispatchEvent(new win.MouseEvent(t, { bubbles: true, cancelable: true, button: 0, view: win }));
		}
	};
`;

await step("plugin initialized", `${H}
	for (let i = 0; i < 100 && !CC?.initialized; i++) await delay(200);
	assert(CC.initialized, "not initialized");
	return { version: Zotero.version, columns: store.config.columns.map(c => c.name + ":" + c.type) };
`);

await step("create sample items", `${H}
	const titles = ["A Mathematical Theory of Communication", "Attention Is All You Need", "Deep Residual Learning for Image Recognition", "Language Models are Few-Shot Learners"];
	const have = new Set((await testItems()).map(i => i.getField("title")));
	for (const t of titles) {
		if (have.has(t)) continue;
		const it = new Zotero.Item("journalArticle");
		it.libraryID = Zotero.Libraries.userLibraryID;
		it.setField("title", t);
		it.setField("extra", "cc-smoke");
		await it.saveTx();
	}
	await win.ZoteroPane.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
	await view.waitForLoad();
	return (await testItems()).length;
`);

await step("show custom columns in item tree", `${H}
	const keys = new Set([...CC.cells.registered.values()].map(r => r.dataKey));
	for (let guard = 0; guard < 20; guard++) {
		const cols = view.tree._getColumns();
		const i = cols.findIndex(c => keys.has(c.dataKey) && c.hidden);
		if (i < 0) break;
		view.tree._columns.toggleHidden(i);
		await delay(100);
	}
	await delay(300);
	const visible = view.tree._getColumns().filter(c => keys.has(c.dataKey) && !c.hidden).length;
	assert(visible === keys.size, "visible " + visible + " of " + keys.size);
	return visible;
`);

await step("checkbox: click toggles value", `${H}
	const [a] = await testItems();
	const c = col("checkbox");
	store.set(a, c.id, false);
	await delay(150);
	const cell = cellFor(a, "checkbox");
	assert(cell, "checkbox cell not rendered");
	click(cell);
	await delay(150);
	assert(store.get(a, c.id) === true, "expected checked");
	assert(cellFor(a, "checkbox").querySelector(".cc-checked"), "checked box not drawn");
	click(cellFor(a, "checkbox"));
	await delay(150);
	assert(store.get(a, c.id) === undefined, "expected unchecked");
	click(cellFor(a, "checkbox"));
	await delay(150);
	return store.get(a, c.id);
`);

await step("rating: click sets, click again clears", `${H}
	const [, b] = await testItems();
	const c = col("rating");
	const star = v => cellFor(b, "rating").querySelector('.cc-star[data-value="' + v + '"]');
	click(star(4));
	await delay(150);
	assert(store.get(b, c.id) === 4, "expected 4, got " + store.get(b, c.id));
	assert(cellFor(b, "rating").querySelectorAll(".cc-on").length === 4, "4 stars lit");
	click(star(4));
	await delay(150);
	assert(store.get(b, c.id) === undefined, "expected cleared");
	click(star(5));
	await delay(150);
	return store.get(b, c.id);
`);

await step("options: dropdown pick sets option", `${H}
	const [, , cItem] = await testItems();
	const c = col("select");
	click(cellFor(cItem, "select"));
	let popup;
	for (let i = 0; i < 30 && !(popup = doc.getElementById("cc-option-popup"))?.state?.startsWith("open"); i++) await delay(100);
	assert(popup, "option popup missing");
	const items = [...popup.querySelectorAll("menuitem")];
	const target = items.find(mi => mi.getAttribute("label") === c.options[2].label);
	target.doCommand();
	popup.hidePopup();
	await delay(150);
	assert(store.get(cItem, c.id) === c.options[2].id, "option not stored");
	const chip = cellFor(cItem, "select").querySelector(".cc-chip");
	assert(chip && chip.textContent === c.options[2].label, "chip not drawn");
	return chip.textContent;
`);

await step("text: edit panel saves comment", `${H}
	const [a] = await testItems();
	const c = col("text");
	const edit = cellFor(a, "text").querySelector(".cc-edit");
	click(edit);
	let panel;
	for (let i = 0; i < 30 && (panel = doc.getElementById("cc-editor-panel"))?.state !== "open"; i++) await delay(100);
	assert(panel?.state === "open", "editor panel did not open: " + panel?.state);
	const ta = panel.querySelector("textarea");
	ta.value = "Foundational. Must cite.\\nRe-read section 3.";
	panel.querySelector(".cc-primary").click();
	await delay(200);
	assert(store.get(a, c.id) === "Foundational. Must cite.\\nRe-read section 3.", "text not stored: " + store.get(a, c.id));
	return cellFor(a, "text").querySelector(".cc-text").textContent;
`);

await step("link: stored URL renders and normalizes", `${H}
	const [, b, cItem] = await testItems();
	const c = col("link");
	store.set(b, c.id, CC.normalizeURL("arxiv.org/abs/1706.03762"));
	store.set(cItem, c.id, CC.normalizeURL("10.1109/CVPR.2016.90"));
	await delay(150);
	const t1 = cellFor(b, "link").querySelector(".cc-link").textContent;
	assert(store.get(cItem, c.id) === "https://doi.org/10.1109/CVPR.2016.90", "doi not normalized");
	// Clicking the link must not change selection or throw; stub launchURL.
	const orig = Zotero.launchURL;
	let launched = null;
	Zotero.launchURL = u => (launched = u);
	try { click(cellFor(b, "link").querySelector(".cc-link")); } finally { Zotero.launchURL = orig; }
	assert(launched === "https://arxiv.org/abs/1706.03762", "launchURL got " + launched);
	return { shown: t1, launched };
`);

await step("bulk edit: context-menu builder covers all columns", `${H}
	const items = await testItems();
	win.ZoteroPane.selectItems(items.map(i => i.id));
	await delay(200);
	const popup = doc.querySelector("#cc-item-menu menupopup");
	assert(popup, "item menu missing");
	CC._buildItemMenu(doc, popup);
	const labels = [...popup.children].map(e => e.getAttribute("label")).filter(Boolean);
	// Apply "Done" (select) to all via the submenu
	const sel = col("select");
	const sub = [...popup.querySelectorAll("menu")].find(m => m.getAttribute("label") === sel.name);
	sub.querySelector('menuitem[label="' + sel.options[2].label + '"]').doCommand();
	await delay(150);
	assert(items.every(i => store.get(i, sel.id) === sel.options[2].id), "bulk select failed");
	// Spread some variety back for the screenshot
	store.set(items[0], sel.id, sel.options[1].id);
	store.set(items[3], sel.id, sel.options[0].id);
	store.set(items[3], col("rating").id, 2);
	store.set(items[2], col("rating").id, 3);
	store.set(items[2], col("checkbox").id, true);
	store.set(items[1], col("text").id, "Strong baseline; reproduce Table 2");
	win.ZoteroPane.selectItem(items[1].id);
	return labels;
`);

await step("item pane section renders editors", `${H}
	await delay(600);
	const section = doc.querySelector('item-pane-custom-section[data-pane$="custom-columns"]') || [...doc.querySelectorAll("item-pane-custom-section")].find(s => s.querySelector(".cc-pane"));
	assert(section, "section not found");
	const pane = section.querySelector(".cc-pane");
	assert(pane, "section body empty");
	return { labels: [...pane.querySelectorAll(".cc-pane-label")].map(e => e.textContent), stars: pane.querySelectorAll(".cc-star").length };
`);

await step("cells line up with column headers", `${H}
	await delay(200);
	const widths = el => [...el.querySelectorAll(":scope > .cell")].map(c => Math.round(c.getBoundingClientRect().width));
	const header = widths(doc.querySelector("#zotero-items-tree .virtualized-table-header"));
	const rows = view.rowCount;
	for (let i = 0; i < rows; i++) {
		const row = widths(doc.getElementById(view.tree.props.id + "-row-" + i));
		// Zotero gives the first column a couple of px extra in rows; allow that.
		const off = row.findIndex((w, j) => Math.abs(w - header[j]) > 3);
		assert(off < 0, "row " + i + " cell " + off + ": " + row[off] + "px vs header " + header[off] + "px");
	}
	return header;
`);

await step("values persisted to disk", `${H}
	await store.flush();
	const data = await IOUtils.readJSON(PathUtils.join(store.dir, "values.json"));
	return Object.keys(data.items).length;
`);

await step("collection columns: template scoped to a collection", `${H}
	// A "Review" collection holding two of the sample items
	let coll = Zotero.Collections.getByLibrary(Zotero.Libraries.userLibraryID).find(c => c.name === "CC Review");
	if (!coll) {
		coll = new Zotero.Collection({ name: "CC Review", libraryID: Zotero.Libraries.userLibraryID });
		await coll.saveTx();
	}
	const items = await testItems();
	await Zotero.DB.executeTransaction(async () => {
		for (const it of items.slice(0, 2)) { it.addToCollection(coll.id); await it.save(); }
	});
	const ref = CC.scope.refFor(coll);
	// Remove columns left from a previous run, then apply the screening template
	store.setConfig(Object.assign({}, store.config, { columns: store.config.columns.filter(c => !c.scope) }));
	const ids = CC.templates.apply("builtin-review", ref);
	await delay(300);
	assert(ids.length === 5, "template columns " + ids.length);
	const reg = () => ids.filter(id => CC.cells.registered.has(id)).length;

	// Library view: scoped columns are not in the item list
	await win.ZoteroPane.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
	await view.waitForLoad(); await delay(500);
	const inLibrary = reg();

	// Collection view: they are registered and visible
	await win.ZoteroPane.collectionsView.selectCollection(coll.id);
	await view.waitForLoad();
	for (let i = 0; i < 40 && reg() < ids.length; i++) await delay(100);
	await delay(800);
	const keys = new Set(ids.map(id => CC.cells.registered.get(id)?.dataKey));
	const visible = view.tree._getColumns().filter(c => keys.has(c.dataKey) && !c.hidden).length;
	assert(inLibrary === 0, "scoped columns registered in library view: " + inLibrary);
	assert(reg() === ids.length, "not registered in collection: " + reg());
	assert(visible === ids.length, "auto-show failed, visible " + visible);
	assert(!store.config.columns.some(c => c.autoShow), "autoShow flag not cleared");

	// Item pane: an item in the collection gets the scoped columns, one outside doesn't
	const inColl = items[0], outside = items[3];
	assert(CC.scope.columnsForItem(inColl).length === store.config.columns.length, "item in collection misses columns");
	assert(CC.scope.columnsForItem(outside).every(c => !c.scope), "item outside gets scoped columns");

	// Set some values for the CSV test
	const dec = store.getColumn(ids[0]);
	store.set(inColl, dec.id, dec.options[0].id);
	store.set(items[1], dec.id, dec.options[2].id);
	store.set(inColl, ids[1], 4);
	store.set(inColl, ids[4], 'Core method, "must" include');
	return { inLibrary, inCollection: reg(), visible };
`);

await step("collection columns: hide state survives switching away and back", `${H}
	const coll = Zotero.Collections.getByLibrary(Zotero.Libraries.userLibraryID).find(c => c.name === "CC Review");
	const qual = store.config.columns.find(c => c.scope && c.name === "Quality");
	const key = () => CC.cells.registered.get(qual.id)?.dataKey;
	const idx = () => view.tree._getColumns().findIndex(c => c.dataKey === key());
	view.tree._columns.toggleHidden(idx());   // user hides "Quality"
	await delay(300);
	await win.ZoteroPane.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
	await view.waitForLoad(); await delay(600);
	await win.ZoteroPane.collectionsView.selectCollection(coll.id);
	await view.waitForLoad();
	for (let i = 0; i < 40 && idx() < 0; i++) await delay(100);
	await delay(400);
	const hidden = view.tree._getColumns()[idx()].hidden;
	assert(hidden, "hidden state lost after switching collections");
	view.tree._columns.toggleHidden(idx());   // show it again for the screenshot
	await delay(300);
	return { hidden };
`);

await step("CSV: collection export has scoped columns and correct values", `${H}
	const coll = Zotero.Collections.getByLibrary(Zotero.Libraries.userLibraryID).find(c => c.name === "CC Review");
	const tmp = PathUtils.join(PathUtils.tempDir, "cc-smoke.csv");
	const orig = CC.csv._save;
	let savedName;
	CC.csv._save = async (w, name, text) => { savedName = name; await IOUtils.writeUTF8(tmp, text); return tmp; };
	try { await CC.csv.exportCollection(win, CC.scope.refFor(coll)); }
	finally { CC.csv._save = orig; }
	const text = await IOUtils.readUTF8(tmp);
	const lines = text.replace(/^\uFEFF/, "").trim().split("\\r\\n");
	const header = lines[0].split(",");
	const bytes = await IOUtils.read(tmp, { maxBytes: 3 });
	assert(bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF, "missing UTF-8 BOM");
	assert(header.includes("Decision") && header.includes("Reason") && header.includes("Read"), "header: " + lines[0]);
	assert(lines.length === 3, "expected 2 item rows, got " + (lines.length - 1));
	assert(text.includes('"Core method, ""must"" include"'), "quoting broken");
	assert(/,Include,/.test(text) && /,Exclude,/.test(text), "option labels missing");
	assert(/,TRUE,|,FALSE,/.test(text), "checkbox values missing");
	return { file: savedName, header: header.length, rows: lines.length - 1 };
`);

await step("CSV: library export + selected-items columns", `${H}
	const items = await testItems();
	const csvText = CC.csv.build(CC.csv._prepare(items), store.config.columns);
	const rows = csvText.trim().split("\\r\\n").length - 1;
	assert(rows === items.length, "rows " + rows);
	const outsideCols = CC.csv.columnsForItems([items[3]]).map(c => c.name);
	assert(!outsideCols.includes("Decision"), "scoped column leaked into unrelated items");
	return { rows, outsideCols };
`);

await step("templates: save custom template and remove it", `${H}
	const cols = store.config.columns.filter(c => !c.scope).slice(0, 2).map(c => c.id);
	const id = CC.templates.saveFrom("My smoke template", "test", cols);
	const tpl = CC.templates.get(id);
	assert(tpl && tpl.columns.length === 2, "template not saved");
	assert(!JSON.stringify(tpl).includes('"id":"' + cols[0]), "template leaked column ids");
	CC.templates.remove(id);
	assert(!CC.templates.get(id), "template not removed");
	return tpl.columns.map(c => c.name);
`);

await step("collection context menu builds", `${H}
	const coll = Zotero.Collections.getByLibrary(Zotero.Libraries.userLibraryID).find(c => c.name === "CC Review");
	await win.ZoteroPane.collectionsView.selectCollection(coll.id);
	const popup = doc.querySelector("#cc-coll-menu menupopup");
	assert(popup, "collection menu missing");
	CC._buildCollectionMenu(doc, popup);
	const labels = [...popup.querySelectorAll(":scope > menuitem, :scope > menu")].map(e => e.getAttribute("label"));
	assert(labels.includes("Export to CSV…"), "no export entry");
	await view.waitForLoad();
	return labels;
`);

await rdp.screenshot(join(shots, "collection-columns.png"));
console.log("  screenshot: build/screenshots/collection-columns.png");

await step("back to library view", `${H}
	await win.ZoteroPane.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
	await view.waitForLoad(); await delay(500);
	const items = await testItems();
	win.ZoteroPane.selectItem(items[1].id);
	await delay(300);
	return CC.cells.registered.size;
`);

await rdp.screenshot(join(shots, "main-window.png"));
console.log("  screenshot: build/screenshots/main-window.png");

await step("settings window opens; tabs render", `${H}
	CC.openSettings();
	let sw;
	for (let i = 0; i < 50 && !(sw = Services.wm.getMostRecentWindow("customcolumns:settings")); i++) await delay(100);
	assert(sw, "settings window did not open");
	for (let i = 0; i < 50 && !sw.document.querySelector(".card"); i++) await delay(100);
	const cards = sw.document.querySelectorAll(".card").length;
	assert(cards === store.config.columns.length, "cards " + cards);
	return cards;
`);
await rdp.screenshot(join(shots, "settings-columns.png"), "settings.html");
console.log("  screenshot: build/screenshots/settings-columns.png");

await step("settings: theme switch applies to main window", `${H}
	const sw = Services.wm.getMostRecentWindow("customcolumns:settings");
	sw.document.querySelector('.tab[data-tab="appearance"]').click();
	await delay(200);
	const cards = [...sw.document.querySelectorAll(".theme-card")];
	cards.find(c => c.textContent.includes("Dracula")).click();
	await delay(300);
	assert(store.config.theme === "dracula", "theme not saved: " + store.config.theme);
	const css = doc.getElementById("cc-theme").textContent;
	assert(css.includes(CC.THEMES.dracula.light.accent), "main window CSS not updated");
	return { themes: cards.length };
`);
await rdp.screenshot(join(shots, "settings-appearance.png"), "settings.html");
console.log("  screenshot: build/screenshots/settings-appearance.png");
await rdp.screenshot(join(shots, "main-window-dracula.png"));
console.log("  screenshot: build/screenshots/main-window-dracula.png");

await step("settings: templates tab + collection filter render", `${H}
	const sw = Services.wm.getMostRecentWindow("customcolumns:settings");
	sw.document.querySelector('.tab[data-tab="templates"]').click();
	await delay(200);
	const tpls = sw.document.querySelectorAll(".card.template").length;
	assert(tpls >= 4, "templates " + tpls);
	const coll = Zotero.Collections.getByLibrary(Zotero.Libraries.userLibraryID).find(c => c.name === "CC Review");
	sw.CCSettings.showCollection(CC.scope.refFor(coll));
	await delay(200);
	const cards = sw.document.querySelectorAll(".card").length;
	const chips = sw.document.querySelectorAll(".coll-chip").length;
	assert(cards === store.config.columns.length, "filtered cards " + cards);
	assert(chips === 5, "scope chips " + chips);
	return { tpls, cards, chips };
`);
await rdp.screenshot(join(shots, "settings-collection.png"), "settings.html");
console.log("  screenshot: build/screenshots/settings-collection.png");
await rdp.run(`Services.wm.getMostRecentWindow("customcolumns:settings").document.querySelector('.tab[data-tab="templates"]').click(); return 1;`);
await rdp.screenshot(join(shots, "settings-templates.png"), "settings.html");
console.log("  screenshot: build/screenshots/settings-templates.png");
await rdp.run(`const sw = Services.wm.getMostRecentWindow("customcolumns:settings"); sw.CCSettings.showCollection(null); return 1;`);

await step("settings: add + rename + delete a column round-trips", `${H}
	const sw = Services.wm.getMostRecentWindow("customcolumns:settings");
	sw.document.querySelector('.tab[data-tab="columns"]').click();
	await delay(100);
	const before = store.config.columns.length;
	[...sw.document.querySelectorAll(".add-group button")].find(b => b.textContent.includes("Options")).click();
	await delay(200);
	assert(store.config.columns.length === before + 1, "column not added");
	const added = store.config.columns.at(-1);
	const name = sw.document.querySelector('.card[data-id="' + added.id + '"] .name');
	name.value = "Priority";
	name.dispatchEvent(new sw.Event("input", { bubbles: true }));
	await delay(700);
	assert(store.getColumn(added.id).name === "Priority", "rename not applied");
	const label = view.tree._getColumns().find(c => c.dataKey === CC.cells.registered.get(added.id).dataKey)?.label;
	assert(label === "Priority", "tree label " + label);
	// delete, answering the page's confirm prompt with "yes"
	sw.confirmDialog = () => true;
	sw.document.querySelector('.card[data-id="' + added.id + '"] .card-head button.danger').click();
	await delay(200);
	assert(!store.getColumn(added.id), "column not deleted");
	assert(!CC.cells.registered.has(added.id), "column still registered");
	// back to the default theme
	store.setConfig(Object.assign({}, store.config, { theme: "zotero" }));
	sw.close();
	return store.config.columns.length;
`);

await step("no plugin errors in console", `${H}
	const msgs = Services.console.getMessageArray() || [];
	const bad = msgs.map(m => m.message || String(m))
		.filter(m => /customcolumns|custom-columns|CustomColumns/i.test(m) && /error|exception/i.test(m));
	assert(!bad.length, bad.slice(0, 3).join("\\n"));
	return 0;
`);

rdp.close();
console.log(failures ? `\n${failures} step(s) failed` : "\nAll smoke tests passed");
process.exit(failures ? 1 : 0);
