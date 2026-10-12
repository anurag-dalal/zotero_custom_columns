/* global Zotero, Services, Components, APP_SHUTDOWN */
"use strict";

var chromeHandle;

function install() {}

async function startup({ id, version, rootURI }) {
	const aomStartup = Components.classes["@mozilla.org/addons/addon-manager-startup;1"]
		.getService(Components.interfaces.amIAddonManagerStartup);
	const manifestURI = Services.io.newURI(rootURI + "manifest.json");
	chromeHandle = aomStartup.registerChrome(manifestURI, [
		["content", "customcolumns", rootURI + "content/"],
	]);

	const ctx = { Zotero, Services, rootURI, CustomColumns: {} };
	for (const name of ["themes", "store", "scope", "templates", "cells", "editors", "csv", "itempane", "main"]) {
		Services.scriptloader.loadSubScript(`${rootURI}content/scripts/${name}.js`, ctx);
	}
	Zotero.CustomColumns = ctx.CustomColumns;

	// Do not await: plugins start while Zotero is still initializing.
	Zotero.CustomColumns.init({ id, version, rootURI }).catch(e => Zotero.logError(e));
}

function onMainWindowLoad({ window }) {
	Zotero.CustomColumns?.addToWindow(window);
}

function onMainWindowUnload({ window }) {
	Zotero.CustomColumns?.removeFromWindow(window);
}

async function shutdown(data, reason) {
	if (reason === APP_SHUTDOWN) {
		await Zotero.CustomColumns?.store.flush();
		return;
	}
	if (Zotero.CustomColumns) {
		await Zotero.CustomColumns.shutdown();
		delete Zotero.CustomColumns;
	}
	chromeHandle?.destruct();
	chromeHandle = null;
}

function uninstall() {}
