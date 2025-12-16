export async function onRequest(context) {
  return fetch("https://worker.19parikshitjain.workers.dev", {
    method: context.request.method,
    headers: context.request.headers,
    body: context.request.body,
  });
}
