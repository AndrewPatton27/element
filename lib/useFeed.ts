// Loads the feed page by page for one mode + category. Switching either resets
// the list and cursor; late responses for an old filter are dropped by the reducer.

import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { Api } from './api.ts';
import type { AccountApi } from './account.ts';
import { FEED_PAGE_SIZE } from './config.ts';
import { canLoadMore, feedKey, feedReducer, initialFeedState, type FeedQuery, type FeedState } from './feedLogic.ts';

export interface UseFeed {
  state: FeedState;
  loadMore: () => void;
  retry: () => void;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.';
}

export function useFeed(api: Api, query: FeedQuery, account?: AccountApi): UseFeed {
  const key = feedKey(query);
  const [state, dispatch] = useReducer(feedReducer, key, initialFeedState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const inflight = useRef<string | null>(null);

  const load = useCallback(
    async (k: string, cursor: string | null, hops = 0): Promise<void> => {
      const tag = `${k}@${cursor ?? ''}`;
      if (inflight.current === tag) return;
      inflight.current = tag;
      dispatch({ type: 'request', key: k });
      try {
        const page =
          query.mode === 'for_you'
            ? await (account as AccountApi).feedForYou(cursor, FEED_PAGE_SIZE)
            : await api.feed({ mode: query.mode, category: query.category, cursor, limit: FEED_PAGE_SIZE });
        if (page.items.length === 0 && page.next_cursor && page.next_cursor !== cursor) {
          // Every card on this page was unusable: skip ahead (at most 3 pages), then end.
          if (hops < 3) {
            inflight.current = null;
            return load(k, page.next_cursor, hops + 1);
          }
          dispatch({ type: 'page', key: k, page: { items: [], next_cursor: null } });
          return;
        }
        dispatch({ type: 'page', key: k, page });
      } catch (err) {
        dispatch({ type: 'fail', key: k, error: message(err) });
      } finally {
        if (inflight.current === tag) inflight.current = null;
      }
    },
    [api, account, query.mode, query.category],
  );

  useEffect(() => {
    dispatch({ type: 'reset', key });
    void load(key, null);
  }, [key, load]);

  const loadMore = useCallback(() => {
    const s = stateRef.current;
    if (s.key === key && canLoadMore(s) && s.items.length > 0) void load(key, s.cursor);
  }, [key, load]);

  const retry = useCallback(() => {
    const s = stateRef.current;
    void load(key, s.items.length > 0 ? s.cursor : null);
  }, [key, load]);

  return { state, loadMore, retry };
}
