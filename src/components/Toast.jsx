import { useCallback, useEffect, useRef, useState } from 'react';

export function useToast() {
  const [message, setMessage] = useState(null);
  const timer = useRef(null);

  const show = useCallback((msg) => {
    setMessage(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 3000);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);
  return [message, show];
}

export default function Toast({ message }) {
  if (!message) return null;
  return <div className="toast">{message}</div>;
}
