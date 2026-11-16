export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      try {
        const result = await env.DB
          .prepare("SELECT 1 AS connected")
          .first();

        return Response.json({
          status: "ok",
          database: result?.connected === 1
            ? "connected"
            : "unexpected_result"
        });
      } catch (error) {
        console.error("Database connection failed");
        return Response.json(
          { status: "error", database: "unavailable" },
          { status: 500 }
        );
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json(
        { error: "API endpoint not implemented" },
        { status: 404 }
      );
    }

    return env.ASSETS.fetch(request);
  }
};
