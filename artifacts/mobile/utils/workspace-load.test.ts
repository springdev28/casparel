import { describe, expect, it } from 'vitest';
import { initialWorkspaceLoad, workspaceLoadReducer as reduce } from './workspace-load';

describe('workspace recovery', () => {
  const home = 'https://casparel.example/dashboard';
  const deepLink = 'https://casparel.example/resources?tag=science#saved';

  it('recreates a failed renderer on the current route without reloading ordinary navigation', () => {
    const start = initialWorkspaceLoad(home);
    const navigated = reduce(start, { type: 'navigation', url: deepLink });
    expect(navigated.sourceUrl).toBe(home);
    expect(navigated.generation).toBe(0);
    const failed = reduce(navigated, { type: 'failure' });
    expect(failed.failed).toBe(true);
    const retry = reduce(failed, { type: 'retry' });
    expect(retry.failed).toBe(false);
    expect(retry.sourceUrl).toBe(deepLink);
    expect(retry.generation).toBe(1);
  });

  it('ignores failed images or API requests but catches a failed main document', () => {
    const start = initialWorkspaceLoad(deepLink);
    for (const url of ['https://casparel.example/api/resources', 'https://casparel.example/image.png']) {
      expect(reduce(start, { type: 'failure', url })).toBe(start);
    }
    expect(reduce(start, { type: 'failure', url: deepLink.split('#')[0] }).failed).toBe(true);
  });

  it('a newly opened route replaces an old failed document', () => {
    const failed = reduce(initialWorkspaceLoad(home), { type: 'failure' });
    const opened = reduce(failed, { type: 'open', url: deepLink });
    expect(opened.sourceUrl).toBe(deepLink);
    expect(opened.failed).toBe(false);
    expect(opened.generation).toBe(1);
  });
});
