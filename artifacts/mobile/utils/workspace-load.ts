/** Keep a failed workspace's route when recreating its native WebView. */
export interface WorkspaceLoadState {
  sourceUrl: string;
  lastUrl: string;
  failed: boolean;
  generation: number;
}

export const initialWorkspaceLoad = (url: string): WorkspaceLoadState => ({
  sourceUrl: url, lastUrl: url, failed: false, generation: 0,
});

type Action =
  | { type: 'open' | 'navigation' | 'loading'; url: string }
  | { type: 'failure'; url?: string }
  | { type: 'retry' };

export function workspaceLoadReducer(state: WorkspaceLoadState, action: Action): WorkspaceLoadState {
  switch (action.type) {
    case 'open':
      return state.sourceUrl === action.url ? state : {
        ...initialWorkspaceLoad(action.url), generation: state.generation + 1,
      };
    case 'navigation':
      // Changing the source prop here would reload SPA navigation.
      return { ...state, lastUrl: action.url };
    case 'loading':
      return { ...state, lastUrl: action.url, failed: false };
    case 'failure':
      // Android also reports HTTP failures for subresources. Those belong to
      // the website's own error UI, not a full-screen native error.
      if (action.url && action.url.split('#')[0] !== state.lastUrl.split('#')[0]) return state;
      return { ...state, failed: true };
    case 'retry':
      return { ...state, sourceUrl: state.lastUrl, failed: false, generation: state.generation + 1 };
  }
}
