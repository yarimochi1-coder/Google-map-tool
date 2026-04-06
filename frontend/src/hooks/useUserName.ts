import { useState, useCallback } from 'react';

const STORAGE_KEY = 'paint-map-username';

export function useUserName() {
  const [userName, setUserNameState] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  });

  const setUserName = useCallback((name: string) => {
    localStorage.setItem(STORAGE_KEY, name);
    setUserNameState(name);
  }, []);

  return { userName, setUserName };
}
