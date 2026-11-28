import type {
  RuntimeFileAccessSurface,
  RuntimeFileMutationsSurface,
  RuntimeFileReadsSurface,
  RuntimeFileSearchSurface
} from '../files/lazy-runtime-file-commands'
import type {
  RuntimeStagedFileSavesSurface,
  RuntimeTerminalArtifactsSurface,
  RuntimeTerminalPathResolverSurface
} from '../files/lazy-runtime-file-transfer-commands'
import type { RuntimeFileWatches } from '../files/watch/file-watches'

export type RuntimeFileCommandSurface = RuntimeFileSearchSurface &
  RuntimeFileAccessSurface &
  RuntimeFileReadsSurface &
  Pick<RuntimeTerminalPathResolverSurface, 'resolveTerminalPath'> &
  Pick<
    RuntimeTerminalArtifactsSurface,
    | 'readTerminalArtifactFile'
    | 'readTerminalArtifactPreview'
    | 'statTerminalArtifact'
    | 'readTerminalArtifactChunk'
    | 'writeTerminalArtifactFile'
    | 'revokeTerminalFileGrantsForClient'
  > &
  Pick<RuntimeFileWatches, 'readFileExplorerDir' | 'watchFileExplorer'> &
  RuntimeFileMutationsSurface & { readonly stagedFileSaves: RuntimeStagedFileSavesSurface }

export function installRuntimeFileCommandSurface(
  target: RuntimeFileCommandSurface,
  fileSearch: RuntimeFileSearchSurface,
  terminalArtifacts: RuntimeTerminalArtifactsSurface,
  fileAccess: RuntimeFileAccessSurface,
  fileReads: RuntimeFileReadsSurface,
  fileMutations: RuntimeFileMutationsSurface,
  stagedFileSaveCommands: RuntimeStagedFileSavesSurface,
  fileWatches: RuntimeFileWatches,
  terminalPaths: RuntimeTerminalPathResolverSurface
): void {
  Object.assign(target, {
    listMobileFiles: fileSearch.listMobileFiles.bind(fileSearch),
    searchMobileFilePaths: fileSearch.searchMobileFilePaths.bind(fileSearch),
    searchQuickOpenFilePaths: fileSearch.searchQuickOpenFilePaths.bind(fileSearch),
    openMobileFile: fileAccess.openMobileFile.bind(fileAccess),
    openMobileDiff: fileAccess.openMobileDiff.bind(fileAccess),
    readMobileFile: fileReads.readMobileFile.bind(fileReads),
    resolveTerminalPath: terminalPaths.resolveTerminalPath.bind(terminalPaths),
    readTerminalArtifactFile: terminalArtifacts.readTerminalArtifactFile.bind(terminalArtifacts),
    readTerminalArtifactPreview:
      terminalArtifacts.readTerminalArtifactPreview.bind(terminalArtifacts),
    statTerminalArtifact: terminalArtifacts.statTerminalArtifact.bind(terminalArtifacts),
    readTerminalArtifactChunk: terminalArtifacts.readTerminalArtifactChunk.bind(terminalArtifacts),
    writeTerminalArtifactFile: terminalArtifacts.writeTerminalArtifactFile.bind(terminalArtifacts),
    revokeTerminalFileGrantsForClient:
      terminalArtifacts.revokeTerminalFileGrantsForClient.bind(terminalArtifacts),
    readFileExplorerDir: fileWatches.readFileExplorerDir.bind(fileWatches),
    watchFileExplorer: fileWatches.watchFileExplorer.bind(fileWatches),
    readFileExplorerPreview: fileReads.readFileExplorerPreview.bind(fileReads),
    readChatImagePreview: fileReads.readChatImagePreview.bind(fileReads),
    readFileExplorerChunk: fileReads.readFileExplorerChunk.bind(fileReads),
    readHostFileChunk: fileReads.readHostFileChunk.bind(fileReads),
    readDocPreviewFile: fileReads.readDocPreviewFile.bind(fileReads),
    readDocPreviewChunk: fileReads.readDocPreviewChunk.bind(fileReads),
    writeFileExplorerFile: fileMutations.writeFileExplorerFile.bind(fileMutations),
    formatFileExplorerText: fileMutations.formatFileExplorerText.bind(fileMutations),
    writeFileExplorerFileBase64: fileMutations.writeFileExplorerFileBase64.bind(fileMutations),
    writeFileExplorerFileBase64Chunk:
      fileMutations.writeFileExplorerFileBase64Chunk.bind(fileMutations),
    createFileExplorerFile: fileMutations.createFileExplorerFile.bind(fileMutations),
    createFileExplorerDir: fileMutations.createFileExplorerDir.bind(fileMutations),
    createFileExplorerDirNoClobber:
      fileMutations.createFileExplorerDirNoClobber.bind(fileMutations),
    commitFileExplorerUpload: fileMutations.commitFileExplorerUpload.bind(fileMutations),
    replaceFileExplorerFileWithUpload:
      fileMutations.replaceFileExplorerFileWithUpload.bind(fileMutations),
    renameFileExplorerPath: fileMutations.renameFileExplorerPath.bind(fileMutations),
    copyFileExplorerPath: fileMutations.copyFileExplorerPath.bind(fileMutations),
    deleteFileExplorerPath: fileMutations.deleteFileExplorerPath.bind(fileMutations),
    searchRuntimeFiles: fileSearch.searchRuntimeFiles.bind(fileSearch),
    listRuntimeFiles: fileSearch.listRuntimeFiles.bind(fileSearch),
    listRuntimeMarkdownDocuments: fileAccess.listRuntimeMarkdownDocuments.bind(fileAccess),
    pathsExistRuntimeFiles: fileAccess.pathsExistRuntimeFiles.bind(fileAccess),
    statRuntimeFile: fileAccess.statRuntimeFile.bind(fileAccess),
    stagedFileSaves: stagedFileSaveCommands
  } satisfies RuntimeFileCommandSurface)
}
