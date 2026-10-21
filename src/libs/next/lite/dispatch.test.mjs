import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dispatchLiteRequest } from './dispatch.mjs';

test('forwards the same authenticated request, query and unread streaming body', async () => {
  const request = new Request('https://example.com/webapi/chat/openai?mode=stream', {
    method: 'POST', headers: { Cookie: 'session=existing', 'Content-Type': 'application/json' }, body: '{"message":"hello"}',
  });
  const response = new Response('token stream', { headers: { 'Set-Cookie': 'session=renewed', 'Content-Type': 'text/event-stream' } });
  const result = await dispatchLiteRequest(request, [{
    pattern: /^\/webapi\/chat\/(?<provider>[^/]+)$/, load: async () => ({
      POST: async (forwarded, context) => {
        assert.equal(forwarded, request);
        assert.equal(forwarded.headers.get('cookie'), 'session=existing');
        assert.equal(forwarded.bodyUsed, false);
        assert.deepEqual(await context.params, { provider: 'openai' });
        assert.equal(new URL(forwarded.url).searchParams.get('mode'), 'stream');
        assert.deepEqual(await forwarded.json(), { message: 'hello' });
        return response;
      },
    }),
  }]);
  assert.equal(result, response);
  assert.equal(result.headers.get('set-cookie'), 'session=renewed');
  assert.equal(await result.text(), 'token stream');
});

test('preserves upstream authentication failure and never matches disabled routes', async () => {
  let calls = 0;
  const routes = [{ pattern: /^\/trpc\/lambda\/(?<trpc>[^/]+)$/, load: async () => ({ GET: () => { calls++; return Response.json({ error: 'unauthorized' }, { status: 401 }); } }) }];
  assert.equal((await dispatchLiteRequest(new Request('https://example.com/trpc/lambda/file.getFiles'), routes)).status, 401);
  assert.equal((await dispatchLiteRequest(new Request('https://example.com/api/workflows/purge'), routes)).status, 404);
  assert.equal(calls, 1);
});

test('decodes catch-all auth paths, rejects malformed encoding and does not accept wrong methods', async () => {
  const routes = [{ pattern: /^\/api\/auth\/(?<all>.+)$/, catchAll: ['all'], load: async () => ({ POST: async (_, context) => Response.json(await context.params) }) }];
  assert.deepEqual(await (await dispatchLiteRequest(new Request('https://example.com/api/auth/sign-in/email', { method: 'POST' }), routes)).json(), { all: ['sign-in', 'email'] });
  assert.equal((await dispatchLiteRequest(new Request('https://example.com/api/auth/%ZZ', { method: 'POST' }), routes)).status, 400);
  const wrongMethod = await dispatchLiteRequest(new Request('https://example.com/api/auth/sign-in/email'), routes);
  assert.equal(wrongMethod.status, 405);
  assert.match(wrongMethod.headers.get('allow'), /POST/);
});
