

import type { NavigationBindings } from './types';
import { SidebarAccordion } from './SidebarAccordion';

export function ProjectSection({ bindings }: { bindings: Pick<NavigationBindings, 't' | 'lang' | 'isPlyLidar' | 'loadedFile' | 'cave' | 'handleExportScreenshot' | 'isEmbedMode' | 'openShareDialog' | 'opts' | 'toggleOpt' | 'setOpts' | 'isRecording' | 'setIsRecording' | 'handleFile' | 'loadFromUrl' | 'handleReset' | 'downloadableTexture' | 'downloadGeneratedTexture' | 'lastDownloadedDmr' | 'handleSaveDmrFiles'> }) {
  const { t, lang, isPlyLidar, loadedFile, cave, handleExportScreenshot, isEmbedMode, openShareDialog, opts, toggleOpt, setOpts, isRecording, setIsRecording, handleFile, loadFromUrl, handleReset, downloadableTexture, downloadGeneratedTexture, lastDownloadedDmr, handleSaveDmrFiles } = bindings
  return <>
<div className="sidebar-dataset-banner">
                        <div className="sidebar-dataset-top">
                          <div className="sidebar-dataset-title">
                            <span className="material-symbols-outlined" style={{ fontSize: '15px', color: 'var(--cv-primary)' }} aria-hidden="true">analytics</span>
                            <span>{t('file.title')}</span>
                          </div>

                        </div>
                        {isPlyLidar ? (
                          <div className="sidebar-dataset-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                            <div className="sidebar-stat-card">
                              <span className="sidebar-stat-label">{t('file.format')}</span>
                              <span className="sidebar-stat-val">{loadedFile?.ext.replace('.', '').toUpperCase()}</span>
                            </div>
                            <div className="sidebar-stat-card">
                              <span className="sidebar-stat-label">{lang === 'sk' ? 'Body' : 'Points'}</span>
                              <span className="sidebar-stat-val accent">{cave.pointCount.toLocaleString()}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="sidebar-dataset-grid" style={{ gridTemplateColumns: cave.scrapCount > 0 ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)' }}>
                            <div className="sidebar-stat-card">
                              <span className="sidebar-stat-label">{t('file.format')}</span>
                              <span className="sidebar-stat-val">{loadedFile?.ext.replace('.', '').toUpperCase()}</span>
                            </div>
                            <div className="sidebar-stat-card">
                              <span className="sidebar-stat-label">{t('file.segments')}</span>
                              <span className="sidebar-stat-val accent">{cave.segmentCount.toLocaleString()}</span>
                            </div>
                            <div className="sidebar-stat-card">
                              <span className="sidebar-stat-label">{t('file.stations')}</span>
                              <span className="sidebar-stat-val">{cave.stationCount.toLocaleString()}</span>
                            </div>
                            {cave.scrapCount > 0 && (
                              <div className="sidebar-stat-card">
                                <span className="sidebar-stat-label">{t('file.scraps')}</span>
                                <span className="sidebar-stat-val">{cave.scrapCount.toLocaleString()}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
      <label className="btn-back">{t('navigation.openFile')}<input type="file" aria-label={t('navigation.openFile')} accept=".lox,.3d,.plt,.ply,.stl" onChange={e => { const file = e.target.files?.[0]; if (file) void handleFile(file); e.target.value = '' }} /></label>
      <button type="button" className="btn-back" onClick={handleReset}>{t('navigation.closeModel')}</button>
      <SidebarAccordion heading={<h3>{t('welcome.demoTitle')}</h3>} detailsLabel={t('navigation.details')}>
        <button type="button" className="btn-back" onClick={() => loadFromUrl(`${import.meta.env.BASE_URL}test_simple.lox`, 'model-simple.lox')}>LOX · Simple</button>
        <button type="button" className="btn-back" onClick={() => loadFromUrl(`${import.meta.env.BASE_URL}test_model2.lox`, 'model2.lox')}>LOX · Model 2</button>
        <button type="button" className="btn-back" onClick={() => loadFromUrl(`${import.meta.env.BASE_URL}vetrna_dira.ply`, 'Vetrna_dira_merge.ply')}>PLY · Vetrná diera</button>
      </SidebarAccordion>
      <SidebarAccordion heading={<h3>{t('navigation.exports')}</h3>} detailsLabel={t('navigation.details')}>
        {!isEmbedMode && (
                  <button
                    onClick={openShareDialog}
                    data-close-navigation
                    className=" btn-back"
                    style={{
                      background: 'rgba(99,102,241,0.12)',
                      borderColor: 'rgba(99,102,241,0.3)',
                      color: '#a5b4fc',
                      padding: '3px 7px',
                      fontSize: '11px',
                      fontWeight: 600
                    }}
                    title={lang === 'sk' ? 'Zdieľať ako iframe' : 'Share as iframe'}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }} aria-hidden="true">share</span>
                    <span>{lang === 'sk' ? 'Zdieľať' : 'Share'}</span>
                  </button>
                )}
        <button type="button" className="btn-back" onClick={handleExportScreenshot}>{t('navigation.screenshot')}</button>
        {downloadableTexture && (
                <button
                  onClick={downloadGeneratedTexture}
                  style={{
                    padding: '3px 8px',
                    background: '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    flexShrink: 0
                  }}
                  title={lang === 'sk' ? "Stiahnuť textúru a kalibračný súbor" : "Download texture with calibration"}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }} aria-hidden="true">download</span>
                  {lang === 'sk' ? 'Textúra' : 'Texture'}
                </button>
              )}
              {lastDownloadedDmr && (
                <button
                  type="button"
                  onClick={handleSaveDmrFiles}
                  style={{
                    padding: '4px 8px',
                    background: '#f59e0b',
                    color: '#0f172a',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    flexShrink: 0
                  }}
                  title={lang === 'sk' ? "Stiahnuť DMR 5.0 GeoTIFF a World súbor (.tfw)" : "Download DMR 5.0 GeoTIFF and World file (.tfw)"}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }} aria-hidden="true">terrain</span>
                  DMR 5.0
                </button>
              )}
        <SidebarAccordion heading={<div className="cad-card-header">
                        <div className="cad-card-title">
                          <span className="material-symbols-outlined" aria-hidden="true">videocam</span>
                          {lang === 'sk' ? 'Prezentácia & Záznam' : 'Presentation & Recording'}
                        </div>
                      </div>} detailsLabel={t('navigation.details')}>

                      <div className="cad-subcard" style={{ marginTop: '6px' }}>
                        <div className="cad-control-row">
                          <span className="cad-control-label">{lang === 'sk' ? 'Dĺžka záznamu' : 'Record duration'}</span>
                          <span className="cad-control-value">{opts.recordingDuration === 0 ? (lang === 'sk' ? 'Manuálne' : 'Manual') : `${opts.recordingDuration}s`}</span>
                        </div>
                        <input type="range" min={0} max={60} step={5}
                          value={opts.recordingDuration}
                          onChange={e => setOpts(p => ({ ...p, recordingDuration: Number(e.target.value) }))}
                          className="cad-slider" />
                      </div>
                      <button
                        className={`btn-record ${isRecording ? 'recording' : ''}`}
                        disabled={isRecording}
                        style={{ marginTop: '8px', width: '100%' }}
                        onClick={() => {
                          const container = document.getElementById(opts.engine === 'v2' ? 'nextgen-cave-canvas' : 'main-cave-canvas')
                          const canvas = container?.querySelector('canvas')
                          if (!canvas) {
                            alert('Canvas not found!')
                            return
                          }

                          try {
                            const captureStream = canvas.captureStream
                            if (!captureStream) throw new Error('CaptureStream not supported')

                            const stream = captureStream.call(canvas, 60)
                            const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
                            const mimeType = mimeTypes.find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm'

                            const recorder = new MediaRecorder(stream, { mimeType })
                            const chunks: Blob[] = []

                            recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
                            recorder.onstop = () => {
                              const blob = new Blob(chunks, { type: mimeType.split(';')[0] })
                              const url = URL.createObjectURL(blob)
                              const a = document.createElement('a')
                              a.href = url; a.download = `cave_presentation_${new Date().getTime()}.webm`
                              a.click()
                              setTimeout(() => URL.revokeObjectURL(url), 0)
                              setIsRecording(false)
                              delete (window as Window & { _activeRecorder?: MediaRecorder })._activeRecorder
                            }

                            (window as Window & { _activeRecorder?: MediaRecorder })._activeRecorder = recorder
                            setIsRecording(true)
                            recorder.start()

                            if (opts.recordingDuration > 0) {
                              setTimeout(() => {
                                if (recorder.state === 'recording') recorder.stop()
                              }, opts.recordingDuration * 1000)
                            }
                          } catch (err) {
                            console.error('Recording error:', err)
                            alert('Error starting recording')
                            setIsRecording(false)
                          }
                        }}
                      >
                        <div className="record-dot" />
                        {isRecording
                          ? (lang === 'sk' ? 'Nahráva sa...' : 'Recording...')
                          : (lang === 'sk' ? 'Nahrať prezentáciu' : 'Record Presentation')}
                      </button>
                      {isRecording && <button type="button" className="btn-back" onClick={() => (window as Window & { _activeRecorder?: MediaRecorder })._activeRecorder?.stop()}>STOP</button>}

</SidebarAccordion>
      </SidebarAccordion>
  </>
}
