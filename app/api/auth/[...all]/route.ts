import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "../../../../lib/auth/server";

const { GET, POST } = toNextJsHandler((request) =>
  getAuth().handler(request),
);

export { GET, POST };
