import fs from 'node:fs';
// Generate a readable collection. It is intentionally not executed during authoring.
const items = [];
function add(name, method, path, body, status, script = [], token = 'tokenA') {
  const req = { method, header: [], url: '{{baseUrl}}' + path };
  if (token) req.header.push({ key: 'Authorization', value: `Bearer {{${token}}}` });
  if (body !== undefined) {
    req.header.push({ key: 'Content-Type', value: 'application/json' });
    req.body = {
      mode: 'raw',
      raw: JSON.stringify(body, null, 2),
      options: { raw: { language: 'json' } },
    };
  }
  items.push({
    name,
    request: req,
    protocolProfileBehavior: { disableCookies: true },
    event: [
      {
        listen: 'test',
        script: {
          type: 'text/javascript',
          exec: [
            `pm.test('HTTP ${status}', () => pm.response.to.have.status(${status}));`,
            ...script,
          ],
        },
      },
    ],
  });
}
const setToken = (key) => [`pm.collectionVariables.set('${key}', pm.response.json().token);`];
const setId = (key) => [`pm.collectionVariables.set('${key}', pm.response.json().data._id);`];
const task = {
  title: 'Write final report',
  course: 'AAD',
  dueDate: '2026-11-25',
  priority: 'high',
  status: 'todo',
  notes: 'Add genuine screenshots after checking.',
};
const session = {
  title: 'Postman practice',
  course: 'AAD',
  startAt: '2026-11-24T10:00:00+13:00',
  duration: 45,
  status: 'planned',
  notes: 'Explain each HTTP response.',
};
add('01 Health', 'GET', '/health', undefined, 200, [], null);
add('02 Protected route without token', 'GET', '/tasks', undefined, 401, [], null);
add(
  '03 Register student A',
  'POST',
  '/auth/register',
  { name: 'Alex Student', email: '{{emailA}}', password: '{{password}}' },
  201,
  setToken('tokenA'),
  null,
);
add(
  '04 Duplicate registration',
  'POST',
  '/auth/register',
  { name: 'Alex Student', email: '{{emailA}}', password: '{{password}}' },
  409,
  [],
  null,
);
add(
  '05 Invalid login',
  'POST',
  '/auth/login',
  { email: '{{emailA}}', password: 'incorrect-password' },
  401,
  [],
  null,
);
add(
  '06 Valid login A',
  'POST',
  '/auth/login',
  { email: '{{emailA}}', password: '{{password}}' },
  200,
  setToken('tokenA'),
  null,
);
add('07 Current user', 'GET', '/auth/me', undefined, 200, [
  "pm.test('Student role',()=>pm.expect(pm.response.json().user.role).to.eql('student'));",
]);
for (const [type, input, key, offset] of [
  ['tasks', task, 'taskId', 8],
  ['sessions', session, 'sessionId', 17],
]) {
  add(`${offset} Create ${type}`, 'POST', '/' + type, input, 201, setId(key));
  add(`${offset + 1} List ${type}`, 'GET', '/' + type, undefined, 200, [
    `pm.test('Created ID is listed',()=>pm.expect(pm.response.json().data.map(x=>x._id)).to.include(pm.collectionVariables.get('${key}')));`,
  ]);
  add(`${offset + 2} Read ${type}`, 'GET', `/${type}/{{${key}}}`, undefined, 200);
  add(
    `${offset + 3} Update ${type}`,
    'PUT',
    `/${type}/{{${key}}}`,
    {
      ...input,
      title: input.title + ' updated',
      status: type === 'tasks' ? 'in-progress' : 'completed',
    },
    200,
    [
      "pm.test('Updated title',()=>pm.expect(pm.response.json().data.title).to.include('updated'));",
    ],
  );
  add(
    `${offset + 4} Invalid ${type}`,
    'POST',
    '/' + type,
    type === 'tasks' ? { ...input, title: '' } : { ...input, duration: 5 },
    400,
  );
  add(
    `${offset + 5} Owner injection ${type}`,
    'POST',
    '/' + type,
    { ...input, owner: 'attacker' },
    400,
  );
}
add('26 Malformed ObjectId', 'GET', '/tasks/not-an-id', undefined, 400);
add(
  '27 NoSQL injection rejected',
  'POST',
  '/auth/login',
  { email: { $ne: null }, password: '{{password}}' },
  400,
  [],
  null,
);
add('28 Student cannot read admin totals', 'GET', '/admin/stats', undefined, 403);
add(
  '29 Register student B',
  'POST',
  '/auth/register',
  { name: 'Taylor Student', email: '{{emailB}}', password: '{{password}}' },
  201,
  setToken('tokenB'),
  null,
);
for (const [type, key] of [
  ['tasks', 'taskId'],
  ['sessions', 'sessionId'],
]) {
  add(`B cannot read A ${type}`, 'GET', `/${type}/{{${key}}}`, undefined, 404, [], 'tokenB');
  add(
    `B cannot update A ${type}`,
    'PUT',
    `/${type}/{{${key}}}`,
    type === 'tasks' ? task : session,
    404,
    [],
    'tokenB',
  );
  add(`B cannot delete A ${type}`, 'DELETE', `/${type}/{{${key}}}`, undefined, 404, [], 'tokenB');
}
add('30 Public VAPID key', 'GET', '/push/key', undefined, 200, [
  "pm.test('Public key exists',()=>pm.expect(pm.response.json().publicKey).to.be.a('string').and.have.length.above(80));",
]);
add(
  '31 Send real push to A browser (enable notifications as A first)',
  'POST',
  '/push/test',
  { title: 'Postman demonstration', body: 'This push was sent through the backend API.' },
  200,
  [
    "pm.test('At least one delivery accepted',()=>pm.expect(pm.response.json().sent).to.be.above(0));",
  ],
);
add(
  '32 Reject untrusted push endpoint',
  'POST',
  '/push/subscriptions',
  {
    endpoint: 'https://localhost/internal',
    keys: { p256dh: 'A'.repeat(87), auth: 'B'.repeat(22) },
  },
  400,
);
for (const [type, key] of [
  ['tasks', 'taskId'],
  ['sessions', 'sessionId'],
]) {
  add(`33 Delete own ${type}`, 'DELETE', `/${type}/{{${key}}}`, undefined, 204);
  add(`34 Confirm deleted ${type}`, 'GET', `/${type}/{{${key}}}`, undefined, 404);
}
add('35 Remove push subscription', 'DELETE', '/push/subscriptions', undefined, 200);
add('36 Logout A', 'POST', '/auth/logout', {}, 204);
add('37 Revoked token A', 'GET', '/auth/me', undefined, 401);
add(
  '38 Admin login (optional separate CLI-created account)',
  'POST',
  '/auth/login',
  { email: '{{adminEmail}}', password: '{{adminPassword}}' },
  200,
  setToken('adminToken'),
  null,
);
add('39 Admin statistics (optional)', 'GET', '/admin/stats', undefined, 200, [], 'adminToken');
const vars = {
  baseUrl: 'https://localhost:3443/api',
  emailA: 'alex.aad@example.com',
  emailB: 'taylor.aad@example.com',
  password: 'StudyPlanner!2026',
  tokenA: '',
  tokenB: '',
  taskId: '',
  sessionId: '',
  adminEmail: 'admin.aad@example.com',
  adminPassword: '',
  adminToken: '',
};
fs.writeFileSync(
  'postman/Study-Planner.postman_collection.json',
  JSON.stringify(
    {
      info: {
        name: 'Study Planner — manual evidence',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        description:
          'Run requests in order. Use new test email addresses for a fresh run. Before real push, sign into the browser as A and enable notifications. Optional admin steps need a CLI-created account. Tests have been authored; execute them yourself and record actual results. Collection Bearer headers take priority over cookies.',
      },
      variable: Object.entries(vars).map(([key, value]) => ({ key, value, type: 'string' })),
      item: items,
    },
    null,
    2,
  ),
);
console.log(`Wrote ${items.length} requests.`);
