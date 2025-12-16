export async function onRequest(context) {
  const apiUrl = "https://worker.19parikshitjain.workers.dev/api/admin/audits";

  return fetch(apiUrl, {
    method: context.request.method,
    headers: context.request.headers,
    body: context.request.body,
  });
}
