// Loads the feed page by page for one mode + category. Switching either resets
// the list and cursor; late responses for an old filter are dropped by the reducer.
// Paging looks at the list the reader can SEE (hidden topics and sources removed): a page
// that filters down to nothing keeps fetching, a bounded number of times (lib/feedLogic).

import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { Api } from './api.ts';
import type { AccountApi } from './account.ts';
import { FEED_PAGE_SIZE } from './config.ts';
import { isInvalidCursor, rawDetail, userMessage } from './errors.ts';
import {
  feedKey,
  feedReducer,
  initialFeedState,
  loadFeedPages,
  needsRefill,
  shouldLoadMore,
  type CardFilter,
  type FeedQuery,
  type FeedState,
} from './feedLogic.ts';

export interface UseFeed {
  state: FeedState;
  loadMore: () => void;
  retry: () => void;
}

const SHOW_ALL: CardFilter = (cards) => cards;

// `filter` removes what the reader hid (its identity may change on every render).
export function useFeed(api: Api, query: FeedQuery, account?: AccountApi, filter: CardFilter = SHOW_ALL): UseFeed {
  const key = feedKey(query);
  const [state, dispatch] = useReducer(feedReducer, key, initialFeedState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const filterRef = useRef(filter);
  filterRef.current = filter;
  // The fetch chain now running (one per key at a time). A newer chain makes an older one stop.
  const busy = useRef<{ id: number; key: string } | null>(null);
  const nextId = useRef(0);
  // The last failure was a rejected cursor: retry must start the list again.
  const restart = useRef(false);

  const load = useCallback(
    async (k: string, cursor: string | null): Promise<void> => {
      if (busy.current?.key === k) return;
      const id = ++nextId.current;
      busy.current = { id, key: k };
      restart.current = false;
      try {
        await loadFeedPages({
          cursor,
          // From the first page nothing is known yet (the reducer resets in the same tick).
          known: cursor === null ? [] : stateRef.current.items,
          filter: (cards) => filterRef.current(cards),
          fetchPage: (c) =>
            query.mode === 'for_you'
              ? (account as AccountApi).feedForYou(c, FEED_PAGE_SIZE)
              : api.feed({ mode: query.mode, category: query.category, cursor: c, limit: FEED_PAGE_SIZE }),
          onRequest: () => dispatch({ type: 'request', key: k }),
          onPage: (page) => dispatch({ type: 'page', key: k, page }),
          alive: () => busy.current?.id === id,
        });
      } catch (err) {
        const status = err && typeof err === 'object' ? Number((err as { status?: unknown }).status) : NaN;
        restart.current = isInvalidCursor(status, rawDetail(err));
        dispatch({ type: 'fail', key: k, error: userMessage(err) });
      } finally {
        if (busy.current?.id === id) busy.current = null;
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
    if (shouldLoadMore(s, key)) void load(key, s.cursor);
  }, [key, load]);

  // A list that filtered down to nothing (everything fetched is hidden) while the server has
  // more: fetch on, without waiting for a scroll that can never happen. Each fetch chain is
  // bounded and ends in a visible card, the end of the feed, or an error, so this cannot loop.
  const visibleCount = filter(state.items).length;
  useEffect(() => {
    if (needsRefill(state, key, visibleCount)) void load(key, state.cursor);
  }, [state, key, visibleCount, load]);

  const retry = useCallback(() => {
    const s = stateRef.current;
    if (restart.current || s.cursor === null) {
      restart.current = false;
      dispatch({ type: 'reset', key });
      void load(key, null);
    } else {
      void load(key, s.cursor);
    }
  }, [key, load]);

  return { state, loadMore, retry };
}
