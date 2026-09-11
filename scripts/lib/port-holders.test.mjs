import { describe, expect, it } from 'vitest';
import {
  METRO_PORT,
  freePlan,
  holders,
  ownerOf,
  parseCwds,
  parseDockerPs,
  parseLsofListeners,
  renderPorts,
} from './port-holders.mjs';
import { SERVICES, resolvePorts } from './ports.mjs';

const LSOF = [
  'p692',
  'crapportd',
  'f11',
  'n*:49433',
  'f12',
  'n*:49433',
  'p18025',
  'cnode',
  'f12',
  'n127.0.0.1:5300',
  'f13',
  'n[::1]:5300',
  'f14',
  'n*:8081',
  'p2000',
  'ccom.docke',
  'f80',
  'n*:5304',
  '',
].join('\n');

const CWDS = [
  'p18025',
  'fcwd',
  'n/Users/x/Dev/kyc-topic',
  'p2000',
  'fcwd',
  'n/',
  '',
].join('\n');

const DOCKER = [
  'kyc-topic-postgres-test-1\t0.0.0.0:5304->5432/tcp, [::]:5304->5432/tcp\tkyc-topic\t/Users/x/Dev/kyc-topic\t/Users/x/Dev/kyc-topic/docker-compose.test.yml',
  'kyc-other-dev-postgres-1\t0.0.0.0:5325->5432/tcp\tkyc-other-dev\t/Users/x/Dev/kyc-other\t/Users/x/Dev/kyc-other/examples/full-service-demo/docker-compose.yml',
  'blink-for-woocommerce-db-1\t3306/tcp, 33060/tcp\tblink-for-woocommerce\t/Users/x/Dev/blink\t',
  'lonely\t\t\t\t',
  '',
].join('\n');

const WORKTREES = [
  { path: '/Users/x/Dev/kyc', isMain: true },
  { path: '/Users/x/Dev/kyc-topic', isMain: false },
  { path: '/Users/x/Dev/kyc-other', isMain: false },
];
const SELF = '/Users/x/Dev/kyc-topic';

describe('the lsof parsers', () => {
  it('lists one listener per pid and port, IPv4 and IPv6 collapsed', () => {
    expect(parseLsofListeners(LSOF)).toEqual([
      { pid: 692, command: 'rapportd', port: 49433 },
      { pid: 18025, command: 'node', port: 5300 },
      { pid: 18025, command: 'node', port: 8081 },
      { pid: 2000, command: 'com.docke', port: 5304 },
    ]);
    expect(parseLsofListeners('')).toEqual([]);
  });

  it('maps pids to their working directories', () => {
    expect([...parseCwds(CWDS)]).toEqual([
      [18025, '/Users/x/Dev/kyc-topic'],
      [2000, '/'],
    ]);
  });
});

describe('parseDockerPs', () => {
  it('reads the host ports and the compose labels of each container', () => {
    expect(parseDockerPs(DOCKER)).toEqual([
      {
        name: 'kyc-topic-postgres-test-1',
        hostPorts: [5304],
        project: 'kyc-topic',
        workingDir: '/Users/x/Dev/kyc-topic',
        configFiles: '/Users/x/Dev/kyc-topic/docker-compose.test.yml',
      },
      {
        name: 'kyc-other-dev-postgres-1',
        hostPorts: [5325],
        project: 'kyc-other-dev',
        workingDir: '/Users/x/Dev/kyc-other',
        configFiles:
          '/Users/x/Dev/kyc-other/examples/full-service-demo/docker-compose.yml',
      },
      {
        name: 'blink-for-woocommerce-db-1',
        hostPorts: [],
        project: 'blink-for-woocommerce',
        workingDir: '/Users/x/Dev/blink',
        configFiles: '',
      },
      {
        name: 'lonely',
        hostPorts: [],
        project: '',
        workingDir: '',
        configFiles: '',
      },
    ]);
  });
});

describe('ownerOf', () => {
  it.each([
    ['/Users/x/Dev/kyc-topic', 'this worktree'],
    ['/Users/x/Dev/kyc-topic/examples/full-service-demo', 'this worktree'],
    ['/Users/x/Dev/kyc-topical', 'foreign'],
    ['/Users/x/Dev/kyc-other/examples', 'worktree kyc-other'],
    ['/Users/x/Dev/kyc', 'worktree kyc'],
    ['/', 'foreign'],
    [undefined, 'foreign'],
  ])('%s belongs to %s', (dir, owner) => {
    expect(ownerOf(dir, { worktrees: WORKTREES, self: SELF })).toBe(owner);
  });
});

const rowsOf = (env = { KYC_PORT_BASE: '5300' }) =>
  holders({
    ports: resolvePorts(env),
    listeners: parseLsofListeners(LSOF),
    cwds: parseCwds(CWDS),
    containers: parseDockerPs(DOCKER),
    worktrees: WORKTREES,
    self: SELF,
  });

describe('holders', () => {
  it('gives every service of the block a row, plus Metro', () => {
    const rows = rowsOf();
    expect(rows.map(r => r.service)).toEqual([
      ...Object.keys(SERVICES),
      'metro',
    ]);
    expect(rows.find(r => r.service === 'webHosted')).toEqual({
      service: 'webHosted',
      env: 'KYC_WEB_PORT',
      what: 'react-demo, hosted mode',
      port: 5301,
      holder: undefined,
    });
  });

  it('names the process on a port with its owner', () => {
    expect(rowsOf().find(r => r.service === 'api').holder).toEqual({
      kind: 'process',
      label: 'node (pid 18025)',
      pid: 18025,
      owner: 'this worktree',
    });
    expect(rowsOf().find(r => r.service === 'metro')).toMatchObject({
      port: METRO_PORT,
      global: true,
      holder: { kind: 'process', pid: 18025, owner: 'this worktree' },
    });
  });

  it('prefers the container over the docker proxy process lsof sees', () => {
    expect(rowsOf().find(r => r.service === 'testDb').holder).toEqual({
      kind: 'container',
      label: 'kyc-topic-postgres-test-1 (compose kyc-topic)',
      project: 'kyc-topic',
      configFiles: '/Users/x/Dev/kyc-topic/docker-compose.test.yml',
      owner: 'this worktree',
    });
    const other = rowsOf({ KYC_PORT_BASE: '5320' }).find(
      r => r.service === 'devDb',
    );
    expect(other.holder).toMatchObject({
      kind: 'container',
      owner: 'worktree kyc-other',
    });
  });

  it('labels a container without a compose project by its name', () => {
    const rows = holders({
      ports: resolvePorts({}),
      listeners: [],
      cwds: new Map(),
      containers: [
        {
          name: 'adhoc',
          hostPorts: [5100],
          project: '',
          workingDir: '',
          configFiles: '',
        },
      ],
      worktrees: WORKTREES,
      self: SELF,
    });
    expect(rows[0].holder).toMatchObject({ label: 'adhoc', owner: 'foreign' });
  });
});

const W = Math.max(...Object.keys(SERVICES).map(k => k.length), 'metro'.length);
const row = (service, port, holder = '-') =>
  `${service.padEnd(W)}  ${String(port).padEnd(5)}  ${holder}`;

describe('renderPorts', () => {
  it('prints the block, then one aligned line per row', () => {
    const lines = renderPorts(rowsOf(), {
      base: 5300,
      source: '.env.local',
      self: SELF,
    });
    expect(lines[0]).toBe(
      'port block 5300 (.env.local) - /Users/x/Dev/kyc-topic',
    );
    expect(lines[1]).toBe(
      row('service', 'port', 'holder').replace('port ', 'port '),
    );
    expect(lines).toContain(
      row('api', 5300, 'node (pid 18025) [this worktree]'),
    );
    expect(lines).toContain(row('webHosted', 5301));
    expect(lines).toContain(
      row(
        'testDb',
        5304,
        'kyc-topic-postgres-test-1 (compose kyc-topic) [this worktree]',
      ),
    );
    expect(lines.at(-1)).toBe(
      row('metro', 8081, 'node (pid 18025) [this worktree]'),
    );
  });
});

describe('freePlan', () => {
  const foreignMetro = {
    service: 'metro',
    port: 8081,
    holder: {
      kind: 'process',
      label: 'node (pid 7)',
      pid: 7,
      owner: 'foreign',
    },
  };
  const siblingDb = {
    service: 'devDb',
    port: 5305,
    holder: {
      kind: 'container',
      label: 'kyc-other-dev-postgres-1 (compose kyc-other-dev)',
      project: 'kyc-other-dev',
      configFiles: '/x/docker-compose.yml',
      owner: 'worktree kyc-other',
    },
  };

  it('stops what is ours - one action per pid or compose project - and keeps the rest with a reason', () => {
    const { stop, keep } = freePlan([...rowsOf(), foreignMetro, siblingDb]);
    expect(stop).toEqual([
      { kind: 'kill', pid: 18025, label: 'node (pid 18025)' },
      {
        kind: 'compose-down',
        project: 'kyc-topic',
        configFiles: '/Users/x/Dev/kyc-topic/docker-compose.test.yml',
        label: 'kyc-topic-postgres-test-1 (compose kyc-topic)',
      },
    ]);
    expect(keep).toEqual([
      {
        service: 'metro',
        port: 8081,
        label: 'node (pid 7)',
        reason: 'not this repo - stop it yourself',
      },
      {
        service: 'devDb',
        port: 5305,
        label: 'kyc-other-dev-postgres-1 (compose kyc-other-dev)',
        reason: 'worktree kyc-other - FORCE=1 stops it',
      },
    ]);
  });

  it("stops a sibling worktree's leftovers with force, never a foreign process", () => {
    const { stop, keep } = freePlan([foreignMetro, siblingDb], { force: true });
    expect(stop).toEqual([
      {
        kind: 'compose-down',
        project: 'kyc-other-dev',
        configFiles: '/x/docker-compose.yml',
        label: 'kyc-other-dev-postgres-1 (compose kyc-other-dev)',
      },
    ]);
    expect(keep).toEqual([expect.objectContaining({ service: 'metro' })]);
  });

  it('keys a container without a project by its label', () => {
    const adhoc = {
      service: 'api',
      port: 5100,
      holder: {
        kind: 'container',
        label: 'adhoc',
        project: '',
        configFiles: '',
        owner: 'this worktree',
      },
    };
    expect(freePlan([adhoc, { ...adhoc, port: 5101 }]).stop).toHaveLength(1);
  });
});
