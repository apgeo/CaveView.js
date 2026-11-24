import type React from 'react'
import type { ParsedCave, ViewerOptions, ViewPreset } from '@shared/types';
import type { Language } from '@shared/i18n';
import type { TextureDownloadInspector } from '@shared/utils/XyzTileDownloader';
import type { LidarEditMode } from '@shared/utils/lidarPointEditing';
import type { LiDARAnomaly, ProfileResult } from '@shared/utils/speleoAnalysis';
import type { SelStation } from '../../../App';

export interface NavigationBindings {
  t: (key: string) => string
  lang: Language
  isPlyLidar: boolean
  loadedFile: { name: string; size: number; ext: string } | null
  cave: ParsedCave
  handleExportScreenshot: () => void
  isEmbedMode: boolean
  openShareDialog: () => void
  opts: ViewerOptions
  toggleOpt: (key: keyof ViewerOptions) => void
  setOpts: React.Dispatch<React.SetStateAction<ViewerOptions>>
  isRecording: boolean
  setIsRecording: React.Dispatch<React.SetStateAction<boolean>>
  setActiveViewPreset: React.Dispatch<React.SetStateAction<ViewPreset | null>>
  activeViewPreset: ViewPreset | null
  setFitTrigger: React.Dispatch<React.SetStateAction<number>>
  splayCount: number
  appStatus: { msg: string; type: "info" | "error" | "success" | "progress"; progress?: number; } | null
  setAppStatus: React.Dispatch<React.SetStateAction<{ msg: string; type: "info" | "error" | "success" | "progress"; progress?: number; } | null>>
  lidarEditMode: LidarEditMode
  setLidarEditMode: React.Dispatch<React.SetStateAction<LidarEditMode>>
  lidarEditBusy: boolean
  lidarBrushSize: number
  setLidarBrushSize: React.Dispatch<React.SetStateAction<number>>
  lidarKeepSelectionCount: number
  applyLidarKeepSelection: () => void
  clearLidarKeepSelection: () => void
  undoLidarEdit: () => void
  lidarUndoCaveRef: React.MutableRefObject<ParsedCave | null>
  resetLidarEdits: () => void
  lidarOriginalCaveRef: React.MutableRefObject<ParsedCave | null>
  lidarEditRemovedCount: number
  contourLevels: { major: number; minor: number; }
  trackObjectUrl: (url: string) => string
  clearSurfaceTextureUrl: (url?: string | null) => void
  textureDownloadInfo: TextureDownloadInspector | null
  handleClearTileCache: () => Promise<void>
  textureFileInputRef: React.RefObject<HTMLInputElement>
  shiftTexture: (dx: number, dy: number) => void
  calibFileInputRef: React.RefObject<HTMLInputElement>
  handleCalibFile: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleTextureFile: (e: React.ChangeEvent<HTMLInputElement>) => void
  shiftCave: (dx: number, dy: number, dz: number) => void
  tiffFileInputRef: React.RefObject<HTMLInputElement>
  handleTiffFile: (tifFile: File, tfwFile?: File) => Promise<void>
  tfwFileInputRef: React.RefObject<HTMLInputElement>
  activeProfilePoints: SelStation[] | null
  profilePicking: boolean
  startProfilePick: () => void
  setProfileClipping: (on: boolean) => void
  measurementMode: "off" | "distance" | "polygon"
  cycleMeasurementMode: () => void
  selectedStations: SelStation[]
  setSelectedStations: React.Dispatch<React.SetStateAction<SelStation[]>>
  isLiDARAnalyzing: boolean
  cancelLiDARAnalysis: () => void
  runLiDARAnalysis: () => void
  isLidarMapGenerating: boolean
  cancelLidarPlanMap: () => void
  generateLidarPlanMap: () => void
  anomalies: LiDARAnomaly[]
  setActiveAnomalyId: React.Dispatch<React.SetStateAction<string | null>>
  activeAnomalyId: string | null
  selectedSegmentProfile: ProfileResult | null
  toggleFullscreen: () => void
  applyTheme: (name: "classic" | "precision" | "light") => void
  currentTheme: string
  setLang: React.Dispatch<React.SetStateAction<Language>>
  setHelpDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
  handleFile: (file: File) => Promise<void>
  loadFromUrl: (rawUrl: string, label: string) => Promise<void>
  handleReset: () => void
  downloadableTexture: { dataUrl: string; bbox: string; } | null
  downloadGeneratedTexture: () => void
  handleDownloadDmr5: (lat: number, lon: number, extentMeters: number, heightSystem?: 'bpv' | 'etrs89') => Promise<void>
  isDmrDownloading: boolean
  lastDownloadedDmr: {
    tifBuffer: ArrayBuffer;
    tfwText: string;
    filename: string;
    minZ: number;
    maxZ: number;
    width: number;
    height: number;
    heightSystem?: 'bpv' | 'etrs89';
    quasigeoidUndulation?: number;
  } | null
  handleSaveDmrFiles: () => void
}
