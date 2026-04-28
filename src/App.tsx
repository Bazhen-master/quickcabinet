import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from './app/store';
import { SceneRoot } from './editor/scene-root';
import { Toolbar } from './ui/toolbar';
import { Inspector } from './ui/inspector';

export default function App() {
  const removeSelectedCabinetElement = useAppStore((s) => s.removeSelectedCabinetElement);
  const language = useAppStore((s) => s.language);
  const themeMode = useAppStore((s) => s.themeMode);
  const isDarkBlue = themeMode === 'dark-blue';
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1440));
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const isMobile = viewportWidth <= 1024;
  const mobileUiScale = 0.6;

  const mobileInspectorTitle = useMemo(
    () => (language === 'ru' ? 'Инспектор' : 'Inspector'),
    [language]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete') return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      event.preventDefault();
      removeSelectedCabinetElement();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [removeSelectedCabinetElement]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!isMobile) setMobileInspectorOpen(false);
  }, [isMobile]);

  return (
    <div
      style={{
        height: '100vh',
        display: 'grid',
        gridTemplateRows: isMobile ? 'auto 1fr' : '56px 1fr',
        background: isDarkBlue ? '#18181b' : '#fafaf9',
        color: isDarkBlue ? '#e5e7eb' : '#111827',
      }}
    >
      <Toolbar uiScale={isMobile ? mobileUiScale : 1} />
      {isMobile ? (
        <div style={{ position: 'relative', minHeight: 0, minWidth: 0 }}>
          <div style={{ minWidth: 0, minHeight: 0, height: '100%' }}><SceneRoot /></div>

          <button
            onClick={() => setMobileInspectorOpen((value) => !value)}
            style={{
              position: 'absolute',
              right: 12,
              bottom: mobileInspectorOpen ? '66vh' : 14,
              zIndex: 40,
              border: '1px solid #f59e0b',
              background: isDarkBlue ? 'rgba(245,158,11,0.95)' : 'rgba(251,146,60,0.95)',
              color: '#111',
              fontWeight: 700,
              borderRadius: 10,
              padding: '10px 12px',
              cursor: 'pointer',
              backdropFilter: 'blur(6px)',
              transition: 'bottom 180ms ease',
            }}
          >
            {mobileInspectorTitle}
          </button>

          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: '68%',
              transform: mobileInspectorOpen ? 'translateY(0)' : 'translateY(calc(100% - 42px))',
              transition: 'transform 220ms ease',
              zIndex: 35,
              borderTopLeftRadius: 14,
              borderTopRightRadius: 14,
              border: `1px solid ${isDarkBlue ? '#3f3f46' : '#e7e5e4'}`,
              background: isDarkBlue ? 'rgba(24,24,27,0.88)' : 'rgba(250,250,249,0.84)',
              backdropFilter: 'blur(10px)',
              overflow: 'hidden',
              boxShadow: '0 -10px 26px rgba(0,0,0,0.28)',
            }}
          >
            <div
              style={{
                height: 42,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderBottom: `1px solid ${isDarkBlue ? '#3f3f46' : '#e7e5e4'}`,
                cursor: 'pointer',
              }}
              onClick={() => setMobileInspectorOpen((value) => !value)}
            >
              <div style={{ width: 56, height: 5, borderRadius: 999, background: isDarkBlue ? '#71717a' : '#a8a29e' }} />
            </div>
            <div style={{ height: 'calc(100% - 42px)', overflow: 'auto' }}>
              <Inspector uiScale={mobileUiScale} />
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 390px', minHeight: 0 }}>
          <div style={{ minWidth: 0, minHeight: 0 }}><SceneRoot /></div>
          <Inspector />
        </div>
      )}
    </div>
  );
}
