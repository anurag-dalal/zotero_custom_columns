/* global CustomColumns */
"use strict";

/**
 * Theme presets. Each theme has a light and a dark palette; the right one is
 * picked automatically from Zotero's appearance (prefers-color-scheme).
 *
 * Variables:
 *   accent     checkbox fill, default column accent
 *   checkMark  tick color inside a checked box
 *   boxBorder  border of an unchecked box
 *   star       filled rating symbol
 *   starEmpty  empty rating symbol
 *   starHover  rating symbol under the mouse
 *   link       link text
 *   text       text-column text ("" = inherit tree color)
 *   muted      placeholders and edit icons
 *   palette    default colors handed out to new select options
 */
CustomColumns.THEME_VARS = [
	["accent", "Accent / checkbox"],
	["checkMark", "Check mark"],
	["boxBorder", "Checkbox border"],
	["star", "Rating (filled)"],
	["starEmpty", "Rating (empty)"],
	["starHover", "Rating (hover)"],
	["link", "Link"],
	["text", "Text"],
	["muted", "Muted / placeholder"],
];

CustomColumns.THEMES = {
	zotero: {
		name: "Zotero",
		light: {
			accent: "#2e6fd8", checkMark: "#ffffff", boxBorder: "#9a9a9a",
			star: "#f5a623", starEmpty: "#d9d9d9", starHover: "#ffc95c",
			link: "#2e6fd8", text: "", muted: "#9a9a9a",
			palette: ["#2e6fd8", "#3ba55d", "#f5a623", "#e5484d", "#8e4ec6", "#12a594", "#e93d82", "#6e6e6e"],
		},
		dark: {
			accent: "#5b9cff", checkMark: "#10131a", boxBorder: "#7a7a7a",
			star: "#ffbf47", starEmpty: "#4a4a4a", starHover: "#ffd98a",
			link: "#79adff", text: "", muted: "#7a7a7a",
			palette: ["#5b9cff", "#4cc38a", "#ffbf47", "#ff6b6b", "#b07cf0", "#2bd0b8", "#f76fa8", "#a0a0a0"],
		},
	},
	ocean: {
		name: "Ocean",
		light: {
			accent: "#0077b6", checkMark: "#ffffff", boxBorder: "#7fa9c4",
			star: "#00b4d8", starEmpty: "#cfe6ef", starHover: "#48cae4",
			link: "#0077b6", text: "#023e58", muted: "#7fa9c4",
			palette: ["#0077b6", "#00b4d8", "#2a9d8f", "#90be6d", "#457b9d", "#1d3557", "#48cae4", "#6c8ea4"],
		},
		dark: {
			accent: "#48cae4", checkMark: "#03202c", boxBorder: "#3f6f86",
			star: "#48cae4", starEmpty: "#1f3d4b", starHover: "#90e0ef",
			link: "#90e0ef", text: "#cdeaf4", muted: "#5d8799",
			palette: ["#48cae4", "#00b4d8", "#2ec4b6", "#a7c957", "#7aa6c2", "#5390d9", "#90e0ef", "#8aa5b5"],
		},
	},
	sunset: {
		name: "Sunset",
		light: {
			accent: "#e76f51", checkMark: "#ffffff", boxBorder: "#d4a28f",
			star: "#f4a261", starEmpty: "#f3dccf", starHover: "#e9c46a",
			link: "#c8553d", text: "#5a2a1b", muted: "#c19a8b",
			palette: ["#e76f51", "#f4a261", "#e9c46a", "#d62828", "#9d4edd", "#bc4749", "#ff7f51", "#8d6e63"],
		},
		dark: {
			accent: "#ff8c69", checkMark: "#2a1209", boxBorder: "#8a5a49",
			star: "#ffb37a", starEmpty: "#4d3329", starHover: "#ffd59e",
			link: "#ffa38a", text: "#f7dccf", muted: "#9c7465",
			palette: ["#ff8c69", "#ffb37a", "#f6d57c", "#ff6b6b", "#c77dff", "#e5737a", "#ff9e7a", "#b39b92"],
		},
	},
	forest: {
		name: "Forest",
		light: {
			accent: "#2d6a4f", checkMark: "#ffffff", boxBorder: "#8aa894",
			star: "#52b788", starEmpty: "#d8e8dd", starHover: "#74c69d",
			link: "#1b4332", text: "#1b4332", muted: "#8aa894",
			palette: ["#2d6a4f", "#52b788", "#95d5b2", "#bc6c25", "#dda15e", "#606c38", "#40916c", "#7f8c7a"],
		},
		dark: {
			accent: "#74c69d", checkMark: "#0b1f16", boxBorder: "#4f6f5d",
			star: "#95d5b2", starEmpty: "#26392e", starHover: "#b7e4c7",
			link: "#95d5b2", text: "#d8f3dc", muted: "#6a8a77",
			palette: ["#74c69d", "#52b788", "#b7e4c7", "#e09f5a", "#e9c46a", "#a3b18a", "#40c98b", "#9fb0a3"],
		},
	},
	nord: {
		name: "Nord",
		light: {
			accent: "#5e81ac", checkMark: "#eceff4", boxBorder: "#a3adbf",
			star: "#ebcb8b", starEmpty: "#d8dee9", starHover: "#d08770",
			link: "#5e81ac", text: "#2e3440", muted: "#a3adbf",
			palette: ["#5e81ac", "#88c0d0", "#a3be8c", "#ebcb8b", "#d08770", "#bf616a", "#b48ead", "#4c566a"],
		},
		dark: {
			accent: "#88c0d0", checkMark: "#2e3440", boxBorder: "#616e88",
			star: "#ebcb8b", starEmpty: "#434c5e", starHover: "#d08770",
			link: "#88c0d0", text: "#e5e9f0", muted: "#7b88a1",
			palette: ["#88c0d0", "#81a1c1", "#a3be8c", "#ebcb8b", "#d08770", "#bf616a", "#b48ead", "#d8dee9"],
		},
	},
	dracula: {
		name: "Dracula",
		light: {
			accent: "#7c5cd6", checkMark: "#ffffff", boxBorder: "#a99bd0",
			star: "#e3a000", starEmpty: "#e6e0f5", starHover: "#ff79c6",
			link: "#7c5cd6", text: "#282a36", muted: "#a99bd0",
			palette: ["#7c5cd6", "#ff5fa2", "#2bb673", "#e3a000", "#f0623a", "#1fa7c4", "#bd93f9", "#6272a4"],
		},
		dark: {
			accent: "#bd93f9", checkMark: "#282a36", boxBorder: "#6272a4",
			star: "#f1fa8c", starEmpty: "#44475a", starHover: "#ff79c6",
			link: "#8be9fd", text: "#f8f8f2", muted: "#6272a4",
			palette: ["#bd93f9", "#ff79c6", "#50fa7b", "#f1fa8c", "#ffb86c", "#8be9fd", "#ff5555", "#6272a4"],
		},
	},
	solarized: {
		name: "Solarized",
		light: {
			accent: "#268bd2", checkMark: "#fdf6e3", boxBorder: "#93a1a1",
			star: "#b58900", starEmpty: "#eee8d5", starHover: "#cb4b16",
			link: "#268bd2", text: "#586e75", muted: "#93a1a1",
			palette: ["#268bd2", "#2aa198", "#859900", "#b58900", "#cb4b16", "#dc322f", "#d33682", "#6c71c4"],
		},
		dark: {
			accent: "#268bd2", checkMark: "#002b36", boxBorder: "#586e75",
			star: "#b58900", starEmpty: "#073642", starHover: "#cb4b16",
			link: "#2aa198", text: "#93a1a1", muted: "#586e75",
			palette: ["#268bd2", "#2aa198", "#859900", "#b58900", "#cb4b16", "#dc322f", "#d33682", "#6c71c4"],
		},
	},
	mono: {
		name: "Monochrome",
		light: {
			accent: "#333333", checkMark: "#ffffff", boxBorder: "#9e9e9e",
			star: "#333333", starEmpty: "#dddddd", starHover: "#777777",
			link: "#333333", text: "", muted: "#9e9e9e",
			palette: ["#212121", "#424242", "#616161", "#757575", "#9e9e9e", "#bdbdbd", "#546e7a", "#78909c"],
		},
		dark: {
			accent: "#e0e0e0", checkMark: "#1e1e1e", boxBorder: "#757575",
			star: "#e0e0e0", starEmpty: "#444444", starHover: "#bdbdbd",
			link: "#e0e0e0", text: "", muted: "#757575",
			palette: ["#f5f5f5", "#e0e0e0", "#bdbdbd", "#9e9e9e", "#757575", "#616161", "#90a4ae", "#b0bec5"],
		},
	},
	candy: {
		name: "Candy",
		light: {
			accent: "#ff4d8d", checkMark: "#ffffff", boxBorder: "#f2a7c3",
			star: "#ff4d8d", starEmpty: "#fde1ec", starHover: "#ff85b3",
			link: "#9b5de5", text: "#4a1942", muted: "#e0a3bf",
			palette: ["#ff4d8d", "#9b5de5", "#00bbf9", "#00f5d4", "#fee440", "#f15bb5", "#ff8fab", "#a29bfe"],
		},
		dark: {
			accent: "#ff6fa5", checkMark: "#2b0f1f", boxBorder: "#a35a7a",
			star: "#ff6fa5", starEmpty: "#4a2338", starHover: "#ffa3c6",
			link: "#c39bff", text: "#ffe3f0", muted: "#a87892",
			palette: ["#ff6fa5", "#b388ff", "#4fd1ff", "#4ff5dd", "#ffe86b", "#f77fc6", "#ffa6bf", "#b8b0ff"],
		},
	},
};

CustomColumns.STAR_SYMBOLS = ["★", "●", "♥", "◆", "▲", "✿"];

/** Black or white, whichever reads better on `hex`. */
CustomColumns.contrastText = function (hex) {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
	if (!m) return "#ffffff";
	const n = parseInt(m[1], 16);
	const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
		c /= 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	return lum > 0.45 ? "#1a1a1a" : "#ffffff";
};

/** Resolve the effective palette for a mode, applying user overrides. */
CustomColumns.resolvePalette = function (config, mode) {
	const theme = CustomColumns.THEMES[config.theme] || CustomColumns.THEMES.zotero;
	return Object.assign({}, theme[mode], config.overrides?.[mode] || {});
};

/** Build the CSS variable block injected into windows that show columns. */
CustomColumns.buildThemeCSS = function (config) {
	const vars = (mode) => {
		const p = CustomColumns.resolvePalette(config, mode);
		return CustomColumns.THEME_VARS
			.map(([key]) => `--cc-${key}: ${p[key] || "inherit"};`)
			.join(" ");
	};
	const radius = { pill: "999px", rounded: "4px", square: "0" }[config.chipShape] || "999px";
	return `:root { ${vars("light")} --cc-chip-radius: ${radius}; }\n`
		+ `@media (prefers-color-scheme: dark) { :root { ${vars("dark")} } }\n`;
};

/** Accept only #rgb / #rrggbb / #rrggbbaa; anything else becomes "". */
CustomColumns.safeColor = function (value) {
	return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value || "") ? value : "";
};
