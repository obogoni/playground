import React, { useEffect, useRef } from 'react';
import { Terminal as Xterm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface Props {
  ptyId: string | null;
  visible: boolean;
}

/**
 * One xterm.js instance bound to a PTY id. Stays mounted across tab/worktree
 * switches; visibility is toggled via CSS so PTYs keep running and scrollback
 * is preserved.
 */
export const Terminal: React.FC<Props> = ({ ptyId, visible }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Xterm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const disposeRef = useRef<(() => void) | null>(null);
  const currentPtyRef = useRef<string | null>(null);

  useEffect(() => {
    const term = new Xterm({
      fontFamily: 'Cascadia Code, Consolas, ui-monospace, monospace',
      fontSize: 13,
      theme: { background: '#1e1e1e', foreground: '#d4d4d4' },
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    if (hostRef.current) term.open(hostRef.current);
    fitRef.current = fit;
    termRef.current = term;
    try { fit.fit(); } catch {}

    const onResize = () => {
      try { fit.fit(); } catch {}
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      disposeRef.current?.();
      term.dispose();
    };
  }, []);

  // Bind to PTY id
  useEffect(() => {
    if (!termRef.current) return;
    if (currentPtyRef.current === ptyId) return;
    disposeRef.current?.();
    disposeRef.current = null;
    currentPtyRef.current = ptyId;
    if (!ptyId) return;

    const term = termRef.current;
    const onData = window.api.tabs.onData((id, data) => {
      if (id === ptyId) term.write(data);
    });
    const inputDispose = term.onData(data => window.api.tabs.write(ptyId, data));
    const sendResize = () => {
      window.api.tabs.resize(ptyId, term.cols, term.rows);
    };
    const resizeDispose = term.onResize(() => sendResize());
    try { fitRef.current?.fit(); } catch {}
    sendResize();

    disposeRef.current = () => {
      onData();
      inputDispose.dispose();
      resizeDispose.dispose();
    };
  }, [ptyId]);

  // Refit when becoming visible
  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => {
        try { fitRef.current?.fit(); } catch {}
      });
    }
  }, [visible]);

  return (
    <div
      className="terminal-host"
      ref={hostRef}
      style={{ display: visible ? 'block' : 'none' }}
    />
  );
};
