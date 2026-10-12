export default {
  fetch(request) {
    const url = new URL(request.url);
    url.hostname = 'veltrix.beibarysbolat0.workers.dev';
    return Response.redirect(url.toString(), 308);
  },
};
