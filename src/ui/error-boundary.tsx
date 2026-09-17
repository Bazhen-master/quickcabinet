import { Component, type ReactNode } from 'react';
import { useAppStore } from '../app/store';

type Props = { label: string; children: ReactNode };
type State = { error: Error | null };

/**
 * Keeps a crash in one panel from blanking the whole editor. It deliberately does not save: if the project state
 * itself caused the crash, saving it would make the editor crash again after a reload. Undo is the way out instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.label}]`, error);
  }

  private undoAndRetry = () => {
    useAppStore.getState().undo();
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    const canUndo = useAppStore.getState().history.past.length > 0;
    const buttonStyle = { padding: '6px 10px', borderRadius: 6, border: '1px solid #52525b', background: '#27272a', color: '#e5e7eb', cursor: 'pointer' } as const;
    return (
      <div role="alert" style={{ padding: 16, fontSize: 13, lineHeight: 1.5, background: '#1b1b1d', color: '#e5e7eb', height: '100%', boxSizing: 'border-box', overflow: 'auto' }}>
        <div style={{ fontWeight: 700, color: '#fca5a5', marginBottom: 6 }}>{`Ошибка: ${this.props.label}`}</div>
        <div style={{ marginBottom: 10 }}>
          Остальной редактор работает. Чаще всего помогает отменить последнее действие.
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#a1a1aa', marginBottom: 12, whiteSpace: 'pre-wrap' }}>{this.state.error.message}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {canUndo ? <button onClick={this.undoAndRetry} style={buttonStyle}>Отменить последнее действие</button> : null}
          <button onClick={() => this.setState({ error: null })} style={buttonStyle}>Продолжить</button>
          <button onClick={() => window.location.reload()} style={buttonStyle}>Перезагрузить страницу</button>
        </div>
      </div>
    );
  }
}
