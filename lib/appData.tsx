// Shared data every screen needs: the API, app_config (labels and notices) and
// the category list. Loaded once at start. If app_config fails to load, cards
// still render with the fallback disclaimer and AI label from labels.ts.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AppConfig, Category } from '../contract/types.ts';
import type { Api } from './api.ts';

export interface AppData {
  api: Api;
  config: AppConfig | null;
  categories: Category[];
}

const AppDataContext = createContext<AppData | null>(null);

export function AppDataProvider({ api, children }: { api: Api; children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    let alive = true;
    api
      .appConfig()
      .then((c) => alive && setConfig(c))
      .catch(() => undefined);
    api
      .categories()
      .then((c) => alive && setCategories(c))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [api]);

  return <AppDataContext.Provider value={{ api, config, categories }}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppData {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData must be used inside AppDataProvider');
  return value;
}
