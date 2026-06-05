import React, { useEffect } from 'react';

interface Props {
  message: string;
  onDismiss: () => void;
}

export const Toast: React.FC<Props> = ({ message, onDismiss }) => {
  useEffect(() => {
    const t = setTimeout(onDismiss, 6000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <div className="toast" onClick={onDismiss}>
      {message}
    </div>
  );
};
