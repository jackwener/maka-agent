import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  SEARCH_MAX_LIMIT,
  normalizeSearchDomain,
  normalizeSearchDomainList,
  normalizeSearchLimit,
  normalizeSearchQuery,
  normalizeSearchUrl,
  rewriteSearchQueryForFreshness,
  searchDomainMatches,
} from '../search.js';

describe('search contract normalizers (PR-SEARCH-0)', () => {
  describe('normalizeSearchQuery', () => {
    it('trims and preserves CJK query text', () => {
      assert.deepEqual(normalizeSearchQuery('  最新 AI 新闻  '), { ok: true, value: '最新 AI 新闻' });
    });

    it('rejects non-string and empty query', () => {
      for (const bad of [undefined, null, 42, true, {}, [], '   ']) {
        const result = normalizeSearchQuery(bad);
        assert.equal(result.ok, false, `bad=${String(bad)}`);
        if (!result.ok) {
          assert.equal(result.reason, 'invalid_query');
        }
      }
    });
  });

  describe('normalizeSearchLimit', () => {
    it('defaults omitted values', () => {
      assert.deepEqual(normalizeSearchLimit(undefined), { ok: true, value: 5 });
      assert.deepEqual(normalizeSearchLimit(null), { ok: true, value: 5 });
    });

    it('truncates and clamps to max', () => {
      assert.deepEqual(normalizeSearchLimit(3.8), { ok: true, value: 3 });
      assert.deepEqual(normalizeSearchLimit(999), { ok: true, value: SEARCH_MAX_LIMIT });
    });

    it('rejects invalid limits', () => {
      for (const bad of ['5', NaN, Infinity, 0, -1]) {
        const result = normalizeSearchLimit(bad);
        assert.equal(result.ok, false, `bad=${String(bad)}`);
      }
    });
  });

  describe('domains', () => {
    it('normalizes hostnames and URLs', () => {
      assert.deepEqual(normalizeSearchDomain(' HTTPS://WWW.Example.COM/path?q=1 '), {
        ok: true,
        value: 'example.com',
      });
      assert.deepEqual(normalizeSearchDomain('docs.example.com'), { ok: true, value: 'docs.example.com' });
    });

    it('dedupes domain arrays after canonicalization', () => {
      assert.deepEqual(normalizeSearchDomainList(['www.example.com', 'https://example.com/a', 'docs.example.com']), {
        ok: true,
        value: ['example.com', 'docs.example.com'],
      });
    });

    it('rejects invalid domain payloads with invalid_domain, not blocked_domain', () => {
      for (const bad of [undefined, null, 42, {}, [], '', '   ', 'https://']) {
        const result = normalizeSearchDomain(bad);
        assert.equal(result.ok, false, `bad=${String(bad)}`);
        if (!result.ok) {
          assert.equal(result.reason, 'invalid_domain');
        }
      }
      const listResult = normalizeSearchDomainList('example.com');
      assert.equal(listResult.ok, false);
      if (!listResult.ok) {
        assert.equal(listResult.reason, 'invalid_domain');
      }
    });

    it('uses suffix matching', () => {
      assert.equal(searchDomainMatches('docs.example.com', ['example.com']), true);
      assert.equal(searchDomainMatches('badexample.com', ['example.com']), false);
      assert.equal(searchDomainMatches('example.com', ['example.com']), true);
    });
  });

  describe('normalizeSearchUrl', () => {
    it('allows http/https and strips tracking params', () => {
      assert.deepEqual(
        normalizeSearchUrl('https://example.com/page?utm_source=x&keep=1&gclid=abc#hash'),
        { ok: true, value: 'https://example.com/page?keep=1#hash' },
      );
    });

    it('rejects active or local-only schemes', () => {
      for (const bad of [
        'javascript:alert(1)',
        'file:///tmp/a',
        'data:text/html,hi',
        'blob:https://example.com/id',
        'chrome-extension://abc/index.html',
      ]) {
        const result = normalizeSearchUrl(bad);
        assert.equal(result.ok, false, `bad=${bad}`);
        if (!result.ok) {
          assert.equal(result.reason, 'blocked_scheme');
        }
      }
    });
  });

  describe('freshness rewrite', () => {
    const now = new Date('2026-05-25T00:00:00Z');

    it('appends the current year for fresh queries without a year', () => {
      assert.equal(rewriteSearchQueryForFreshness('latest model news', now), 'latest model news 2026');
      assert.equal(rewriteSearchQueryForFreshness('今天 AI 新闻', now), '今天 AI 新闻 2026');
    });

    it('replaces stale year for fresh queries', () => {
      assert.equal(rewriteSearchQueryForFreshness('latest OpenAI news 2024', now), 'latest OpenAI news 2026');
    });

    it('does not rewrite historical queries', () => {
      assert.equal(rewriteSearchQueryForFreshness('history of AI since 2019', now), 'history of AI since 2019');
      assert.equal(rewriteSearchQueryForFreshness('过去几年 AI 发展', now), '过去几年 AI 发展');
    });
  });
});
