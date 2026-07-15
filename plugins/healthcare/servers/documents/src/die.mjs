/** Throw an Error with the given message. Errors name the remedy, not just the
 *  symptom — a worker reads them and retries. */
export function die(msg) {
  throw new Error(msg);
}
