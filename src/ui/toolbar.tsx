import { useMemo, useState } from 'react';
import { useAppStore, useProject } from '../app/store';
import { buildCuttingList, cuttingListToCsv } from '../domain/cutting-list';
import { saveNcExport } from '../infra/export-nc';
import { saveSelectedPartMap } from '../infra/export-part-map';
import { saveProjectToFile } from '../infra/save-load';
import { t } from '../i18n';

export function Toolbar({ uiScale = 1 }: { uiScale?: number }) {
  const project = useProject();
  const selected = useAppStore((s) => s.selected);
  const activeTool = useAppStore((s) => s.activeTool);
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const addDemoPart = useAppStore((s) => s.addDemoPart);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const newProject = useAppStore((s) => s.newProject);
  const saveProgress = useAppStore((s) => s.saveProgress);
  const loadProgress = useAppStore((s) => s.loadProgress);
  const openProjectFile = useAppStore((s) => s.openProjectFile);
  const hasSavedProgress = useAppStore((s) => s.hasSavedProgress);
  const saveProgressMessage = useAppStore((s) => s.saveProgressMessage);
  const selectionMode = useAppStore((s) => s.selectionMode);
  const setSelectionMode = useAppStore((s) => s.setSelectionMode);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const themeMode = useAppStore((s) => s.themeMode);
  const measuredFaces = useAppStore((s) => s.measuredFaces);
  const isDarkBlue = themeMode === 'dark-blue';
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [cuttingListMessage, setCuttingListMessage] = useState<string | null>(null);

  const selectedPart = selected?.type === 'part' || selected?.type === 'face'
    ? project.parts.find((part) => part.id === selected.partId) ?? null
    : null;

  const cuttingListRows = useMemo(() => buildCuttingList(project.parts), [project.parts]);

  const btn = (active: boolean): React.CSSProperties => ({
    padding: '8px 12px',
    borderRadius: 8,
    border: `1px solid ${isDarkBlue ? '#3f3f46' : '#d6d3d1'}`,
    background: active ? '#f59e0b' : (isDarkBlue ? '#27272a' : '#fff'),
    color: active ? '#111' : (isDarkBlue ? '#e5e7eb' : '#222'),
    cursor: 'pointer',
  });

  const handleCreateNewProject = () => {
    setShowNewProjectDialog(false);
    newProject();
  };

  const panelControlBorder = isDarkBlue ? '#3f3f46' : '#ddd';
  const panelControlBg = isDarkBlue ? '#27272a' : '#fff';
  const panelControlText = isDarkBlue ? '#e5e7eb' : '#111';
  const projectMenuButtonStyle: React.CSSProperties = {
    padding: '8px 10px',
    borderRadius: 8,
    border: `1px solid ${panelControlBorder}`,
    background: panelControlBg,
    color: panelControlText,
    cursor: 'pointer',
  };

  return (
    <div
      style={{
        zoom: uiScale,
        display: 'flex',
        gap: 8,
        padding: 12,
        borderBottom: `1px solid ${isDarkBlue ? '#3f3f46' : '#e7e5e4'}`,
        background: isDarkBlue ? '#202124' : '#fff',
        flexWrap: 'wrap',
        alignItems: 'center',
        position: 'relative',
      }}
    >
      <button style={{ ...btn(false), marginRight: 16 }} onClick={() => setProjectMenuOpen((value) => !value)}>
        {t(language, 'project')}
      </button>
      <button style={btn(false)} onClick={addDemoPart}>{t(language, 'addPanel')}</button>
      <button style={btn(false)} onClick={() => setActiveTool('select')}>{t(language, 'select')}</button>
      <button style={btn(activeTool === 'place-hole')} onClick={() => setActiveTool('place-hole')}>{t(language, 'placeHole')}</button>
      <button style={btn(activeTool === 'measure')} onClick={() => setActiveTool('measure')}>{t(language, 'measure')}</button>
      {activeTool === 'measure' ? (
        <span style={{ fontSize: 12, color: isDarkBlue ? '#d4d4d8' : '#444', padding: '0 4px' }}>
          {measuredFaces[0] && measuredFaces[1] ? '2/2' : measuredFaces[0] ? '1/2' : t(language, 'measureHint')}
        </span>
      ) : null}
      <button style={btn(false)} onClick={undo}>{t(language, 'undo')}</button>
      <button style={btn(false)} onClick={redo}>{t(language, 'redo')}</button>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: isDarkBlue ? '#a1a1aa' : '#57534e' }}>{t(language, 'selectionMode')}</span>
        <button style={btn(false)} onClick={() => setSelectionMode('part')}>{t(language, 'partMode')}</button>
        <button style={btn(selectionMode === 'group')} onClick={() => setSelectionMode('group')}>{t(language, 'groupMode')}</button>
        <span style={{ fontSize: 12, color: isDarkBlue ? '#a1a1aa' : '#57534e' }}>{t(language, 'language')}</span>
        <select value={language} onChange={(e) => setLanguage(e.target.value as 'en' | 'ru')} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${isDarkBlue ? '#3f3f46' : '#d6d3d1'}`, background: isDarkBlue ? '#27272a' : '#fff', color: isDarkBlue ? '#e5e7eb' : '#111' }}>
          <option value="en">{t(language, 'langEnglish')}</option>
          <option value="ru">{t(language, 'langRussian')}</option>
        </select>
      </div>

      {projectMenuOpen ? (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 12,
            marginTop: 8,
            width: 460,
            maxWidth: 'calc(100vw - 24px)',
            maxHeight: 'calc(100vh - 96px)',
            overflow: 'auto',
            background: isDarkBlue ? '#202124' : '#fff',
            border: `1px solid ${isDarkBlue ? '#3f3f46' : '#e7e5e4'}`,
            borderRadius: 12,
            boxShadow: isDarkBlue ? '0 10px 24px rgba(0,0,0,0.35)' : '0 10px 24px rgba(0,0,0,0.08)',
            padding: 12,
            zIndex: 20,
            display: 'grid',
            gap: 10,
          }}
        >
          <button
            onClick={() => setShowNewProjectDialog((value) => !value)}
            style={{
              ...projectMenuButtonStyle,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontWeight: 700,
            }}
          >
            <span>{t(language, 'newProject')}</span>
            <span>{showNewProjectDialog ? '-' : '+'}</span>
          </button>
          {showNewProjectDialog ? (
            <div style={{ display: 'grid', gap: 8, padding: 10, borderRadius: 8, border: `1px solid ${isDarkBlue ? '#3f3f46' : '#e7e5e4'}` }}>
              <div style={{ fontSize: 13, color: isDarkBlue ? '#e5e7eb' : '#444', lineHeight: 1.4 }}>{t(language, 'confirmNewProject')}</div>
              <button style={projectMenuButtonStyle} onClick={() => saveProjectToFile(project)}>{t(language, 'saveProjectFile')}</button>
              <button style={{ ...projectMenuButtonStyle, borderColor: '#f59e0b', background: isDarkBlue ? '#3f2c16' : '#fff7ed', color: isDarkBlue ? '#fde68a' : '#111' }} onClick={handleCreateNewProject}>{t(language, 'continueNewProject')}</button>
              <button style={projectMenuButtonStyle} onClick={() => setShowNewProjectDialog(false)}>{t(language, 'cancel')}</button>
            </div>
          ) : null}

          <div style={{ display: 'grid', gap: 8 }}>
            <button onClick={saveProgress} style={projectMenuButtonStyle}>{t(language, 'saveProgress')}</button>
            <button onClick={loadProgress} disabled={!hasSavedProgress} style={{ ...projectMenuButtonStyle, cursor: hasSavedProgress ? 'pointer' : 'not-allowed', opacity: hasSavedProgress ? 1 : 0.55 }}>{t(language, 'loadSavedProgress')}</button>
            <button onClick={() => saveProjectToFile(project)} style={projectMenuButtonStyle}>{t(language, 'saveProjectFile')}</button>
            <button onClick={() => { void openProjectFile(); }} style={projectMenuButtonStyle}>{t(language, 'openProjectFile')}</button>
            <button onClick={() => selectedPart && saveSelectedPartMap(selectedPart)} disabled={!selectedPart} style={{ ...projectMenuButtonStyle, cursor: selectedPart ? 'pointer' : 'not-allowed', opacity: selectedPart ? 1 : 0.55 }}>{t(language, 'exportPartMap')}</button>
          </div>
          {saveProgressMessage ? <div style={{ fontSize: 12, color: isDarkBlue ? '#d4d4d8' : '#57534e' }}>{saveProgressMessage}</div> : null}

          <div style={{ paddingTop: 12, borderTop: `1px solid ${isDarkBlue ? '#3f3f46' : '#e7e5e4'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{t(language, 'cuttingList')}</div>
                <div style={{ fontSize: 12, color: isDarkBlue ? '#a1a1aa' : '#57534e' }}>{cuttingListRows.length} {t(language, 'visibleParts')}</div>
              </div>
              <button
                onClick={() => {
                  const csv = cuttingListToCsv(cuttingListRows);
                  void navigator.clipboard.writeText(csv).then(
                    () => setCuttingListMessage(t(language, 'cuttingListCopiedCsv')),
                    () => setCuttingListMessage(t(language, 'cuttingListCopyFailed')),
                  );
                }}
                disabled={cuttingListRows.length === 0}
                style={{ ...projectMenuButtonStyle, cursor: cuttingListRows.length > 0 ? 'pointer' : 'not-allowed', opacity: cuttingListRows.length > 0 ? 1 : 0.55, whiteSpace: 'nowrap' }}
              >
                {t(language, 'copyCsv')}
              </button>
              <button
                onClick={() => saveNcExport(project.parts)}
                disabled={cuttingListRows.length === 0}
                style={{ ...projectMenuButtonStyle, cursor: cuttingListRows.length > 0 ? 'pointer' : 'not-allowed', opacity: cuttingListRows.length > 0 ? 1 : 0.55, whiteSpace: 'nowrap' }}
              >
                {t(language, 'exportNc')}
              </button>
            </div>
            {cuttingListMessage ? <div style={{ marginBottom: 8, fontSize: 12, color: isDarkBlue ? '#d4d4d8' : '#57534e' }}>{cuttingListMessage}</div> : null}
            <div style={{ maxHeight: 260, overflow: 'auto', border: `1px solid ${isDarkBlue ? '#3f3f46' : '#e7e5e4'}`, borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: isDarkBlue ? '#111111' : '#f5f5f4', color: isDarkBlue ? '#f4f4f5' : '#111' }}>
                    {[t(language, 'cabinet'), t(language, 'partName'), t(language, 'role'), t(language, 'height'), t(language, 'width')].map((header) => (
                      <th key={header} style={{ textAlign: 'left', padding: '7px 8px', borderBottom: `1px solid ${isDarkBlue ? '#3f3f46' : '#e7e5e4'}`, position: 'sticky', top: 0, background: isDarkBlue ? '#111111' : '#f5f5f4' }}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cuttingListRows.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: 10, color: isDarkBlue ? '#a1a1aa' : '#57534e' }}>{t(language, 'noVisiblePartsYet')}</td></tr>
                  ) : cuttingListRows.map((row) => (
                    <tr key={row.id}>
                      <td style={{ padding: '6px 8px', borderBottom: `1px solid ${isDarkBlue ? '#27272a' : '#f5f5f4'}` }}>{row.cabinet}</td>
                      <td style={{ padding: '6px 8px', borderBottom: `1px solid ${isDarkBlue ? '#27272a' : '#f5f5f4'}` }}>{row.partName}</td>
                      <td style={{ padding: '6px 8px', borderBottom: `1px solid ${isDarkBlue ? '#27272a' : '#f5f5f4'}` }}>{row.role}</td>
                      <td style={{ padding: '6px 8px', borderBottom: `1px solid ${isDarkBlue ? '#27272a' : '#f5f5f4'}` }}>{row.width}</td>
                      <td style={{ padding: '6px 8px', borderBottom: `1px solid ${isDarkBlue ? '#27272a' : '#f5f5f4'}` }}>{row.height}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
