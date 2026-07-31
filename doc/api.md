# Folder Spaces API Documentation

This document describes the public API provided by `folder-spaces` for integration with third-party Obsidian plugins (e.g., **Obsidian Window Spaces**).

## Accessing the API

You can obtain the plugin API instance from Obsidian's plugin registry:

```typescript
const folderSpaces = app.plugins.plugins["folder-spaces"] as { api?: FolderSpacesAPI } | undefined;
const api = folderSpaces?.api;
```

## TypeScript Definitions

```typescript
import type { View, WorkspaceLeaf } from "obsidian";

export interface FolderSpaceView extends View {
  readonly isFolderSpace: true;
  readonly folderPath: string | null;
  getFolderPath(): string | null;
}

export interface FolderSpacesAPI {
  readonly version: string;
  readonly viewType: string;

  /** Check if a WorkspaceLeaf or View is a Folder Space instance */
  isFolderSpaceView(target: unknown): boolean;

  /** Extract the folder path associated with a WorkspaceLeaf or View */
  getFolderPath(target: unknown): string | null;

  /** Retrieve all active Folder Space view instances in the current workspace */
  getFolderSpaces(): FolderSpaceView[];

  /** Open or switch to a Folder Space tab for the specified folder path */
  openFolderSpace(
    folderPath: string,
    location?: "left-sidebar" | "right-sidebar" | "editor" | "window"
  ): Promise<WorkspaceLeaf | null>;
}
```

## API Methods

### 1. `isFolderSpaceView(target: unknown): boolean`
Returns `true` if the passed `leaf` or `view` object is a Folder Space view.

### 2. `getFolderPath(target: unknown): string | null`
Returns the folder path (e.g. `"Projects/Active"`) configured for the given `leaf` or `view`, or `null` if not applicable.

### 3. `getFolderSpaces(): FolderSpaceView[]`
Returns an array of all active `FolderSpaceView` instances currently open across all workspace splits and windows.

### 4. `openFolderSpace(folderPath: string, location?: "left-sidebar" | "right-sidebar" | "editor" | "window"): Promise<WorkspaceLeaf | null>`
Programmatically opens a Folder Space leaf for `folderPath` at the designated location (`"left-sidebar"`, `"right-sidebar"`, `"editor"`, or `"window"`). Returns the created or revealed `WorkspaceLeaf`.
