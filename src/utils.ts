import {Vault, TFile} from 'obsidian';

// create file if it doesn't exist, otherwise return the existing file
// create folder before creating the file if it doesn't exist
export function safeCreateFile(vault: Vault, path: string, content: string): Promise<TFile> {
	const folderPath = path.substring(0, path.lastIndexOf('/'));

	const existingFolder = vault.getAbstractFileByPath(folderPath);
	if (!existingFolder) {
		return vault.createFolder(folderPath).then(() => {
			return vault.create(path, content);
		});
	} else {
		const existingFile = vault.getAbstractFileByPath(path);
		if (existingFile instanceof TFile) {
			return Promise.resolve(existingFile);
		} else {
			return vault.create(path, content);
		}
	}
}
