// Copyright (c) BrownWebTech

import { App, ButtonComponent, Modal, Notice } from "obsidian";
import {
	applyChildrenSync,
	buildChildrenSection,
	PlannedChange,
} from "./children-sync";

export class PreviewModal extends Modal {
	constructor(
		app: App,
		private changes: PlannedChange[],
		private skippedFolders: number
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass("folder-children-preview-modal");

		contentEl.createEl("h2", { text: "Update Children Sections" });

		if (this.changes.length === 0) {
			contentEl.createEl("p", {
				text: "No notes need updating — all Children sections are already up to date.",
			});
			if (this.skippedFolders > 0) {
				contentEl.createEl("p", {
					cls: "folder-children-preview-muted",
					text: `${this.skippedFolders} folder(s) skipped (no parent note found).`,
				});
			}
			return;
		}

		const summary = contentEl.createEl("p");
		summary.setText(
			`${this.changes.length} note(s) will be updated. Review the planned Children sections below.`
		);

		if (this.skippedFolders > 0) {
			contentEl.createEl("p", {
				cls: "folder-children-preview-muted",
				text: `${this.skippedFolders} folder(s) skipped (no parent note found).`,
			});
		}

		const scrollContainer = contentEl.createDiv({
			cls: "folder-children-preview-scroll",
		});
		scrollContainer.setCssStyles({
			maxHeight: "50vh",
			overflowY: "auto",
			marginTop: "0.75rem",
			marginBottom: "1rem",
			border: "1px solid var(--background-modifier-border)",
			borderRadius: "var(--radius-s)",
			padding: "0.5rem",
		});

		for (const change of this.changes) {
			const item = scrollContainer.createDiv({
				cls: "folder-children-preview-item",
			});
			item.setCssStyles({
				marginBottom: "0.75rem",
				paddingBottom: "0.75rem",
				borderBottom: "1px solid var(--background-modifier-border)",
			});

			item.createEl("strong", { text: change.file.basename });
			item.createEl("div", {
				cls: "folder-children-preview-path",
				text: change.file.path,
			}).setCssStyles({
				fontSize: "var(--font-ui-smaller)",
				color: "var(--text-muted)",
				marginBottom: "0.25rem",
			});

			const preview = item.createEl("pre", {
				cls: "folder-children-preview-content",
			});
			preview.setCssStyles({
				margin: "0",
				padding: "0.5rem",
				backgroundColor: "var(--background-secondary)",
				borderRadius: "var(--radius-s)",
				fontSize: "var(--font-ui-smaller)",
				whiteSpace: "pre-wrap",
				wordBreak: "break-word",
			});
			const sectionPreview =
				change.childrenSection.length > 0
					? buildChildrenSection(
							change.childrenSection.split("\n").filter(Boolean)
						).trimEnd()
					: "(Children section will be removed — no direct children)";
			preview.setText(sectionPreview);
		}

		const buttonContainer = contentEl.createDiv({
			cls: "modal-button-container",
		});
		buttonContainer.setCssStyles({
			display: "flex",
			justifyContent: "flex-end",
			gap: "0.5rem",
		});

		new ButtonComponent(buttonContainer)
			.setButtonText("Cancel")
			.onClick(() => this.close());

		new ButtonComponent(buttonContainer)
			.setButtonText("Approve")
			.setCta()
			.onClick(() => {
				void this.approve();
			});
	}

	private async approve(): Promise<void> {
		try {
			const result = await applyChildrenSync(this.app.vault, this.changes);
			this.close();
			new Notice(
				`Folder Children: updated ${result.updated} note(s).`
			);
		} catch (error) {
			console.error("Folder Children apply failed:", error);
			new Notice(
				"Folder Children update failed. Check the developer console for details."
			);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
