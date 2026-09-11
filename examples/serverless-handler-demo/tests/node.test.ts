import http from 'node:http';
import { createNodeServer, listen, send, toRequest } from '../src/node';

// A stand-in for the app: echoes the body and the auth header, 404 elsewhere
const echo = async (request: Request) =>
  new URL(request.url).pathname === '/echo'
    ? Response.json({
        echo: await request.json(),
        auth: request.headers.get('authorization'),
      })
    : Response.json({ error: 'Not found' }, { status: 404 });

describe('createNodeServer', () => {
  let server: http.Server;
  let origin: string;

  beforeAll(async () => {
    server = createNodeServer(echo);
    origin = await listen(server, 0);
  });

  afterAll(() => {
    server.close();
  });

  it('serves the handler over HTTP with the body and headers intact', async () => {
    const response = await fetch(`${origin}/echo`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer user-1',
      },
      body: JSON.stringify({ platform: 'IOS' }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      echo: { platform: 'IOS' },
      auth: 'Bearer user-1',
    });
  });

  it('hands every path to the handler, which answers its own 404', async () => {
    expect((await fetch(`${origin}/nope`)).status).toBe(404);
  });
});

describe('createNodeServer without a Host header', () => {
  it('still routes (origin falls back to localhost)', async () => {
    const server = createNodeServer(async request =>
      Response.json({ url: request.url }),
    );
    const req = Object.assign((async function* () {})(), {
      headers: {},
      method: 'GET',
      url: '/health',
    }) as unknown as http.IncomingMessage;
    const end = vi.fn();
    const res = { setHeader: vi.fn(), end } as unknown as http.ServerResponse;
    server.emit('request', req, res);
    await vi.waitFor(() => expect(end).toHaveBeenCalled());
    expect(JSON.parse(end.mock.calls[0][0].toString())).toEqual({
      url: 'http://localhost/health',
    });
  });
});

describe('toRequest / send', () => {
  it('joins repeated headers, drops bodies of GET requests and defaults method + url', async () => {
    const fake = Object.assign(
      (async function* () {
        yield Buffer.from('ignored');
      })(),
      { headers: { 'x-multi': ['a', 'b'], 'x-one': 'c', 'x-none': undefined } },
    ) as unknown as http.IncomingMessage;
    const request = await toRequest(fake, 'http://origin');
    expect(request.method).toBe('GET');
    expect(request.url).toBe('http://origin/');
    expect(request.headers.get('x-multi')).toBe('a, b');
    expect(request.headers.get('x-one')).toBe('c');
    expect(request.headers.has('x-none')).toBe(false);
    expect(request.body).toBeNull();
  });

  it('writes status, headers and body onto the Node response', async () => {
    const setHeader = vi.fn();
    const end = vi.fn();
    const res = { setHeader, end } as unknown as http.ServerResponse;
    await send(
      new Response('hi', { status: 201, headers: { 'x-a': '1' } }),
      res,
    );
    expect(res.statusCode).toBe(201);
    expect(setHeader).toHaveBeenCalledWith('x-a', '1');
    expect(end).toHaveBeenCalledWith(Buffer.from('hi'));
  });
});
