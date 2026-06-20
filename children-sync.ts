// Copyright (c) BrownWebTech

import { App, TFile, TFolder, Vault } from "obsidian";

const CHILDREN_CALLOUT_HEADING = "> [!abstract]- Children";

/**
 * Parent-note convention (MOC / folder-note style):
 *
 * For a folder at `path/to/FolderName/`, candidates are checked in order:
 *   1. Index note inside the folder: `path/to/FolderName/FolderName.md` (preferred)
 *   2. Sibling note next to the folder:  `path/to/FolderName.md`
 *
 * If both exist, the index note inside the folder wins. This matches common
 * Obsidian MOC setups and the Folder Notes plugin default.
 */
export function findParentNote(folder: TFolder, vault: Vault): TFile | null {
	const folderName = folder.name;

	const indexPath = joinPath(folder.path, `${folderName}.md`);
	const indexNote = vault.getAbstractFileByPath(indexPath);
	if (indexNote instanceof TFile) {
		return indexNote;
	}

	if (folder.parent) {
		const siblingPath =
			folder.parent.path === ""
				? `${folderName}.md`
				: joinPath(folder.parent.path, `${folderName}.md`);
		const siblingNote = vault.getAbstractFileByPath(siblingPath);
		if (siblingNote instanceof TFile) {
			return siblingNote;
		}
	}

	return null;
}

export function isHidden(name: string): boolean {
	return name.startsWith(".");
}

function joinPath(dir: string, file: string): string {
	if (!dir) {
		return file;
	}
	return `${dir}/${file}`;
}

function shouldSkipFolder(folder: TFolder, configDir: string): boolean {
	if (!folder.path) {
		return true;
	}
	if (isHidden(folder.name)) {
		return true;
	}
	if (folder.path === configDir || folder.path.startsWith(`${configDir}/`)) {
		return true;
	}
	return false;
}

function collectChildLinks(
	folder: TFolder,
	parentNote: TFile,
	app: App
): string[] {
	const links: string[] = [];

	for (const child of folder.children) {
		if (isHidden(child.name)) {
			continue;
		}

		if (child instanceof TFolder) {
			const subfolderNote = findParentNote(child, app.vault);
			if (subfolderNote) {
				links.push(
					`- ${app.fileManager.generateMarkdownLink(subfolderNote, parentNote.path)}`
				);
			} else {
				links.push(`- [[${child.name}]]`);
			}
			continue;
		}

		if (child instanceof TFile) {
			if (child.path === parentNote.path) {
				continue;
			}
			links.push(
				`- ${app.fileManager.generateMarkdownLink(child, parentNote.path)}`
			);
		}
	}

	links.sort((a, b) =>
		a.localeCompare(b, undefined, { sensitivity: "base" })
	);
	return links;
}

function findCalloutChildrenSectionBounds(content: string): {
	startIdx: number;
	endIdx: number;
} | null {
	const headingMatch = content.match(
		/^> \[!abstract\]- Children\s*$/m
	);
	if (!headingMatch || headingMatch.index === undefined) {
		return null;
	}

	const startIdx = headingMatch.index;
	let cursor = startIdx + headingMatch[0].length;
	if (content[cursor] === "\n") {
		cursor++;
	}

	while (cursor < content.length) {
		const lineBreak = content.indexOf("\n", cursor);
		const lineEnd = lineBreak === -1 ? content.length : lineBreak;
		const line = content.slice(cursor, lineEnd);

		if (line.startsWith("> ")) {
			cursor = lineEnd === content.length ? content.length : lineEnd + 1;
			continue;
		}
		if (line.trim() === "" || /^##\s+/.test(line)) {
			return { startIdx, endIdx: cursor };
		}
		return { startIdx, endIdx: cursor };
	}

	return { startIdx, endIdx: content.length };
}

function findLegacyChildrenSectionBounds(content: string): {
	startIdx: number;
	endIdx: number;
} | null {
	const headingMatch = content.match(/^## Children\s*$/m);
	if (!headingMatch || headingMatch.index === undefined) {
		return null;
	}

	const startIdx = headingMatch.index;
	let endIdx = content.length;
	const afterHeading = content.slice(startIdx + headingMatch[0].length);
	const nextHeading = afterHeading.match(/\n##\s+/);
	if (nextHeading && nextHeading.index !== undefined) {
		endIdx = startIdx + headingMatch[0].length + nextHeading.index;
	}

	return { startIdx, endIdx };
}

function findChildrenSectionBounds(content: string): {
	startIdx: number;
	endIdx: number;
} | null {
	return (
		findCalloutChildrenSectionBounds(content) ??
		findLegacyChildrenSectionBounds(content)
	);
}

export function buildChildrenSection(childLines: string[]): string {
	if (childLines.length === 0) {
		return "";
	}
	const quotedLines = childLines.map((line) => `> ${line}`);
	return `${CHILDREN_CALLOUT_HEADING}\n${quotedLines.join("\n")}\n`;
}

export function updateChildrenSection(
	content: string,
	childLines: string[]
): string {
	const bounds = findChildrenSectionBounds(content);

	if (childLines.length === 0) {
		if (!bounds) {
			return content;
		}
		const before = content.slice(0, bounds.startIdx).replace(/\s+$/, "");
		const after = content.slice(bounds.endIdx).replace(/^\s+/, "");
		const parts = [before, after].filter((part) => part.length > 0);
		if (parts.length === 0) {
			return "";
		}
		const result = parts.join("\n\n");
		return content.endsWith("\n") ? `${result}\n` : result;
	}

	const newSection = buildChildrenSection(childLines).replace(/\n+$/, "\n");

	if (!bounds) {
		const trimmed = content.replace(/\s+$/, "");
		if (!trimmed) {
			return newSection;
		}
		return `${trimmed}\n\n${newSection}`;
	}

	const before = content.slice(0, bounds.startIdx).replace(/\s+$/, "");
	const after = content.slice(bounds.endIdx).replace(/^\s+/, "");
	const parts = [before, newSection.trimEnd(), after].filter(
		(part) => part.length > 0
	);
	const result = parts.join("\n\n");
	return content.endsWith("\n") ? `${result}\n` : result;
}

export interface PlannedChange {
	file: TFile;
	childrenSection: string;
	newContent: string;
}

export interface PlanResult {
	changes: PlannedChange[];
	skippedFolders: number;
}

export async function planChildrenSync(app: App): Promise<PlanResult> {
	const { vault } = app;
	const changes: PlannedChange[] = [];
	let skippedFolders = 0;

	const folders = vault
		.getAllLoadedFiles()
		.filter((file): file is TFolder => file instanceof TFolder);

	for (const folder of folders) {
		if (shouldSkipFolder(folder, vault.configDir)) {
			continue;
		}

		const parentNote = findParentNote(folder, vault);
		if (!parentNote) {
			skippedFolders++;
			continue;
		}

		const childLinks = collectChildLinks(folder, parentNote, app);
		const content = await vault.read(parentNote);
		const newContent = updateChildrenSection(content, childLinks);

		if (newContent !== content) {
			changes.push({
				file: parentNote,
				childrenSection: childLinks.join("\n"),
				newContent,
			});
		}
	}

	changes.sort((a, b) =>
		a.file.path.localeCompare(b.file.path, undefined, {
			sensitivity: "base",
		})
	);

	return { changes, skippedFolders };
}

export async function applyChildrenSync(
	vault: Vault,
	changes: PlannedChange[]
): Promise<{ updated: number }> {
	let updated = 0;

	for (const change of changes) {
		await vault.modify(change.file, change.newContent);
		updated++;
	}

	return { updated };
}

export interface SyncResult {
	updated: number;
	skipped: number;
}

export async function syncAllFolderChildren(app: App): Promise<SyncResult> {
	const { changes, skippedFolders } = await planChildrenSync(app);
	const { updated } = await applyChildrenSync(app.vault, changes);
	return { updated, skipped: skippedFolders };
}
