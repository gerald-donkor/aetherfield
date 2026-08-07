import "server-only";

import { getAuth } from "./server";

/** Better Auth CLI entrypoint. This module is never imported by the app. */
export const auth = getAuth();
