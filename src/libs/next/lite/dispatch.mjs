/** Forward to an existing route without consuming its body or replacing its authentication. */
export async function dispatchLiteRequest(request, routes) {
  const pathname = new URL(request.url).pathname.replace(/\/$/, '') || '/';
  for (const route of routes) {
    const match = route.pattern.exec(pathname);
    if (!match) continue;

    const params = {};
    try {
      for (const [name, value] of Object.entries(match.groups || {})) {
        if (value === undefined) continue;
        params[name] = route.catchAll?.includes(name)
          ? value.split('/').map(decodeURIComponent)
          : decodeURIComponent(value);
      }
    } catch {
      return Response.json({ error: 'Invalid URL encoding' }, { status: 400 });
    }

    const module = await route.load();
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'].filter(
      (method) => typeof module[method] === 'function',
    );
    if (methods.includes('GET') && !methods.includes('HEAD')) methods.push('HEAD');
    if (!methods.includes('OPTIONS')) methods.push('OPTIONS');
    const allow = methods.join(', ');
    const handler = module[request.method] || (request.method === 'HEAD' ? module.GET : undefined);
    if (!handler) {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { Allow: allow } });
      return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: allow } });
    }
    const response = await handler(request, { params: Promise.resolve(params) });
    if (request.method !== 'HEAD') return response;
    await response.body?.cancel();
    return new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  return Response.json({ error: 'Not found in the chat and files deployment' }, { status: 404 });
}
