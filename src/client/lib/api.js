// Browser authentication uses only the secure HttpOnly cookie, never a stored JWT.
export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (response.status === 204) return null;
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(
      result.error?.details?.map((d) => `${d.field}: ${d.message}`).join('; ') ||
        result.error?.message ||
        'Request failed',
    );
    error.status = response.status;
    throw error;
  }
  return result;
}
// Fetch every page to keep the displayed offline snapshot complete.
export async function getAll(resource) {
  const data = [];
  for (let page = 1; page <= 10000; page++) {
    const result = await api(`/${resource}?page=${page}`);
    data.push(...result.data);
    if (result.data.length < result.pageSize) return data;
  }
  throw new Error('Too many records to load');
}
