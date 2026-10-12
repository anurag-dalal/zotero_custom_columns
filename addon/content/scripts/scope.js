/* global CustomColumns, Zotero */
"use strict";

/**
 * Collection scoping. A column without `scope` applies everywhere. A scoped
 * column looks like:
 *   scope: { collections: ["<libraryID>/<collectionKey>", …], subcollections: true }
 * and is only added to the item list while one of those collections (or, with
 * `subcollections`, one of their descendants) is being viewed.
 */
CustomColumns.scope = {
	refFor(collection) {
		return `${collection.libraryID}/${collection.key}`;
	},

	collectionFor(ref) {
		const [libraryID, key] = String(ref).split("/");
		return Zotero.Collections.getByLibraryAndKey(parseInt(libraryID), key) || null;
	},

	isScoped(col) {
		return !!col.scope?.collections?.length;
	},

	/** Refs of a collection and all of its ancestors, nearest first. */
	_lineage(collection) {
		const refs = [];
		let c = collection;
		for (let guard = 0; c && guard < 100; guard++) {
			refs.push(this.refFor(c));
			c = c.parentKey ? Zotero.Collections.getByLibraryAndKey(c.libraryID, c.parentKey) : null;
		}
		return refs;
	},

	/** Does a scoped column apply to this collection? Global columns always do. */
	appliesToCollection(col, collection) {
		if (!this.isScoped(col)) return true;
		if (!collection) return false;
		const wanted = new Set(col.scope.collections);
		const lineage = this._lineage(collection);
		return col.scope.subcollections
			? lineage.some(r => wanted.has(r))
			: wanted.has(lineage[0]);
	},

	appliesToItem(col, item) {
		if (!this.isScoped(col)) return true;
		for (const id of item.getCollections?.() || []) {
			const c = Zotero.Collections.get(id);
			if (c && !c.deleted && this.appliesToCollection(col, c)) return true;
		}
		return false;
	},

	columnsForCollection(collection) {
		return CustomColumns.store.config.columns.filter(c => this.appliesToCollection(c, collection));
	},

	columnsForItem(item) {
		return CustomColumns.store.config.columns.filter(c => this.appliesToItem(c, item));
	},

	/** Collections currently shown in the main window item lists. */
	viewedCollections() {
		const out = [];
		for (const win of Zotero.getMainWindows()) {
			for (const row of win.ZoteroPane?.itemsView?.collectionTreeRows || []) {
				if (row.isCollection?.()) out.push(row.ref);
			}
		}
		return out;
	},

	/** Columns that should be registered in the item tree right now. */
	activeColumns() {
		const viewed = this.viewedCollections();
		return CustomColumns.store.config.columns.filter(c =>
			!this.isScoped(c) || viewed.some(coll => this.appliesToCollection(c, coll)));
	},

	/**
	 * Every collection in every library, in tree order, for pickers.
	 * @returns {{ref, name, path, depth, libraryName}[]}
	 */
	allCollections() {
		const out = [];
		const walk = (collections, depth, prefix, libraryName) => {
			const sorted = collections.filter(c => !c.deleted)
				.sort((a, b) => Zotero.localeCompare(a.name, b.name));
			for (const c of sorted) {
				const path = prefix ? `${prefix} / ${c.name}` : c.name;
				out.push({ ref: this.refFor(c), name: c.name, path, depth, libraryName });
				walk(c.getChildCollections(), depth + 1, path, libraryName);
			}
		};
		for (const lib of Zotero.Libraries.getAll()) {
			if (lib.libraryType === "feed") continue;
			walk(Zotero.Collections.getByLibrary(lib.libraryID), 0, "", lib.name);
		}
		return out;
	},

	/** Human label for a ref, e.g. "Thesis / Chapter 2". */
	label(ref) {
		const c = this.collectionFor(ref);
		if (!c || c.deleted) return "(deleted collection)";
		const parts = [];
		for (let x = c, guard = 0; x && guard < 100; guard++) {
			parts.unshift(x.name);
			x = x.parentKey ? Zotero.Collections.getByLibraryAndKey(x.libraryID, x.parentKey) : null;
		}
		return parts.join(" / ");
	},

	describe(col) {
		if (!this.isScoped(col)) return "All items";
		const names = col.scope.collections.map(r => this.label(r));
		return names.join(", ") + (col.scope.subcollections ? " (+ subcollections)" : "");
	},
};
