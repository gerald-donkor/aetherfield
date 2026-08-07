import * as authSchema from "./auth-schema";
import * as applicationSchema from "./schema";

/** One schema object for Drizzle's relational API and Better Auth's adapter. */
export const databaseSchema = {
  ...applicationSchema,
  ...authSchema,
};
