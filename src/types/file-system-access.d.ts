/**
 * Ambient type declarations for the File System Access API.
 *
 * The @types/chrome package and the WXT-generated globals do not include the
 * newer File System Access API methods (showDirectoryPicker, queryPermission,
 * requestPermission). These declarations fill that gap so projectSync.ts
 * type-checks correctly without changing the tsconfig lib target.
 *
 * This file is auto-included because it lives under src/ which is covered by
 * the .wxt/tsconfig.json "include": ["../\**\/*"] glob.
 */

// ---------------------------------------------------------------------------
// PermissionStatus for FS handles
// ---------------------------------------------------------------------------

type FileSystemPermissionMode = 'read' | 'readwrite';

interface FileSystemPermissionDescriptor {
  mode: FileSystemPermissionMode;
}

type PermissionState = 'granted' | 'denied' | 'prompt';

// ---------------------------------------------------------------------------
// Augment FileSystemDirectoryHandle with the permission methods
// ---------------------------------------------------------------------------

interface FileSystemDirectoryHandle {
  queryPermission(descriptor: FileSystemPermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor: FileSystemPermissionDescriptor): Promise<PermissionState>;
}

// ---------------------------------------------------------------------------
// DirectoryPickerOptions + window.showDirectoryPicker
// ---------------------------------------------------------------------------

interface DirectoryPickerOptions {
  id?: string;
  mode?: FileSystemPermissionMode;
  startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | FileSystemHandle;
}

interface Window {
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}
