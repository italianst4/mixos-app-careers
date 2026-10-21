import { AppClientError, createAppClient } from "@/lib/apps/sdk";

/**
 * The typed client, named once.
 *
 * The `<"careers">` type argument is what buys the checking: `call()` only
 * accepts route specs this app declares, the input is checked against that
 * route's own Zod schema, and the result comes back typed from its `output`.
 * Without it every call falls back to `unknown`.
 */
export const client = createAppClient<"careers">("careers");

/**
 * The one error string this app may put on screen.
 *
 * An `AppClientError` message has already been through `safeErrorMessage` on
 * the way out of the gateway, so it carries no table or column names. Anything
 * else reaching a catch block is a bug in the browser rather than a report for
 * the person using it, and gets a generic line instead.
 */
export function messageOf(err: unknown): string {
  return err instanceof AppClientError ? err.message : "Something went wrong. Try again.";
}
