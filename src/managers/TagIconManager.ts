import { Menu, WorkspaceLeaf } from 'obsidian';
import IconicPlugin, { TagItem, STRINGS } from 'src/IconicPlugin';
import IconManager from 'src/managers/IconManager';
import IconPicker from 'src/dialogs/IconPicker';

/**
 * Handles icons in the Tags pane.
 */
export default class TagIconManager extends IconManager {
	private containerEl: HTMLElement;

	constructor(plugin: IconicPlugin) {
		super(plugin);
		this.plugin.registerEvent(this.app.workspace.on('layout-change', () => {
			if (activeDocument.contains(this.containerEl)) {
				return;
			} else {
				this.app.workspace.iterateAllLeaves(leaf => this.manageLeaf(leaf));
			}
		}));
		this.app.workspace.iterateAllLeaves(leaf => this.manageLeaf(leaf));
	}

	/**
	 * Start managing this leaf if has a matching type.
	 */
	private manageLeaf(leaf: WorkspaceLeaf): void {
		if (leaf.getViewState().type !== 'tag') return;

		this.stopMutationObserver(this.containerEl);
		this.containerEl = leaf.view.containerEl.find(':scope > .tag-container > div');
		this.setMutationObserver(this.containerEl, {
			subtree: true,
			childList: true,
		}, mutation => {
			// Refresh when tags are added or removed
			for (const addedNode of mutation.addedNodes) {
				if (addedNode instanceof HTMLElement && addedNode.hasClass('tree-item')) {
					this.refreshIcons();
					return;
				}
			}
		});
		this.refreshIcons();
	}

	/**
	 * Refresh all tag icons.
	 */
	refreshIcons(unloading?: boolean): void {
		const tags = this.plugin.getTagItems(unloading);
		const itemEls = this.containerEl?.findAll('.tree-item') ?? [];
		if (itemEls) this.refreshChildIcons(tags, itemEls);
	}
	
	/**
	 * Refresh an array of tag icons, including any subitems.
	 */
	private refreshChildIcons(tags: TagItem[], itemEls: HTMLElement[]): void {
		for (const itemEl of itemEls) {
			itemEl.addClass('iconic-item');

			const selfEl = itemEl.find(':scope > .tree-item-self');
			if (!selfEl) continue;
			const tagId = selfEl.find(':scope > .tree-item-inner > .tree-item-inner-text')?.getText();
			if (!tagId) continue;
			const tag = tags.find(tag => tag.id === tagId);
			if (!tag) continue;

			let iconEl = selfEl.find(':scope > .tree-item-icon') ?? selfEl.createDiv({ cls: 'tree-item-icon' });
			let folderIconEl = selfEl.find(':scope > .iconic-sidekick:not(.tree-item-icon)');

			if (tag.items) {
				if (this.plugin.settings.minimalFolderIcons || !this.plugin.settings.showAllFolderIcons && !tag.icon) {
					folderIconEl?.remove();
				} else {
					const arrowColor = tag.icon || tag.iconDefault ? null : tag.color;
					this.refreshIcon({ icon: null, color: arrowColor }, iconEl);
					folderIconEl = folderIconEl ?? selfEl.createDiv({ cls: 'iconic-sidekick' });
					if (iconEl.nextElementSibling !== folderIconEl) {
						iconEl.insertAdjacentElement('afterend', folderIconEl);
					}
					iconEl = folderIconEl;
				}
			}

			if (iconEl.hasClass('collapse-icon') && !tag.icon && !tag.iconDefault) {
				this.refreshIcon(tag, iconEl); // Skip click listener if icon will be a collapse arrow
			} else if (this.plugin.isSettingEnabled('clickableIcons')) {
				this.refreshIcon(tag, iconEl, event => {
					IconPicker.openSingle(this.plugin, tag, (newIcon, newColor) => {
						this.plugin.saveTagIcon(tag, newIcon, newColor);
						this.refreshIcons();
						this.plugin.editorIconManager?.refreshIcons();
					});
					event.stopPropagation();
				});
			} else {
				this.refreshIcon(tag, iconEl);
			}

			if (selfEl) {
				this.setEventListener(selfEl, 'contextmenu', event => this.onContextMenu(tag.id, event));
			}
		}
	}

	/**
	 * When user context-clicks a tag, add custom items to the menu.
	 */
	onContextMenu(tagId: string, event: MouseEvent): void {
		navigator?.vibrate(100); // Not supported on iOS
		this.plugin.menuManager.closeAndFlush();
		const tag = this.plugin.getTagItem(tagId);
		if (!tag) return;

		// Change icon
		const menu = new Menu();
		menu.addItem(menuItem => menuItem
			.setTitle(STRINGS.menu.changeIcon)
			.setIcon('lucide-image-plus')
			.setSection('icon')
			.onClick(() => IconPicker.openSingle(this.plugin, tag, (newIcon, newColor) => {
				this.plugin.saveTagIcon(tag, newIcon, newColor);
				this.refreshIcons();
				this.plugin.editorIconManager?.refreshIcons();
			}))
		);

		// Remove icon / Reset color
		if (tag.icon || tag.color) {
			menu.addItem(menuItem => menuItem
				.setTitle(tag.icon ? STRINGS.menu.removeIcon : STRINGS.menu.resetColor)
				.setIcon(tag.icon ? 'lucide-image-minus' : 'lucide-rotate-ccw')
				.setSection('icon')
				.onClick(() => {
					this.plugin.saveTagIcon(tag, null, null);
					this.refreshIcons();
					this.plugin.editorIconManager?.refreshIcons();
				})
			);
		}

		menu.showAtMouseEvent(event);
	}
}
