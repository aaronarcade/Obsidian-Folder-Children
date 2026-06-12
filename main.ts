// Copyright (c) BrownWebTech

import { Notice, Plugin } from "obsidian";
import { planChildrenSync } from "./children-sync";
import { PreviewModal } from "./preview-modal";

export default class FolderChildrenPlugin extends Plugin {
	async onload(): Promise<void> {
		this.addRibbonIcon("folder-tree", "Sync folder children lists", () => {
			void this.openPreview();
		});

		this.addCommand({
			id: "sync-folder-children",
			name: "Sync folder children lists",
			callback: () => {
				void this.openPreview();
			},
		});
	}

	private async openPreview(): Promise<void> {
		try {
			const { changes, skippedFolders } = await planChildrenSync(this.app);
			new PreviewModal(this.app, changes, skippedFolders).open();
		} catch (error) {
			console.error("Folder Children preview failed:", error);
			new Notice(
				"Folder Children preview failed. Check the developer console for details."
			);
		}
	}
}
