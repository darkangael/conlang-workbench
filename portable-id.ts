/**
 * Generate a new portable linguistic-object identifier.
 *
 * Persisted linguistic IDs belong to the creator's dataset once written to
 * Markdown. The prefix is therefore only a Workbench generation convention;
 * source parsers must continue accepting arbitrary nonblank creator-authored
 * IDs rather than requiring this shape.
 *
 * Workbench uses the standards-based Web Crypto API when the current runtime
 * exposes randomUUID(). The capability check below keeps this non-desktop-only
 * plugin independent of Node's crypto module and allows unsupported runtimes to
 * omit the optional ID without blocking creator work.
 */
export type PortableLinguisticIdResult =
  | {
      status: "created";
      id: string;
    }
  | {
      status: "unsupported";
    };

/**
 * Try to generate a new portable linguistic-object identifier.
 *
 * A missing Web Crypto UUID capability is an environment limitation rather
 * than a failure of the creator's requested lexical write. Callers may
 * therefore continue without the optional portable ID and tell the creator
 * that it can be backfilled later.
 *
 * By contrast, if randomUUID() exists but throws, that exception is allowed to
 * propagate. An unexpected generator malfunction must not be silently
 * misreported as ordinary runtime incompatibility.
 */
export function createPortableLinguisticId(
  prefix: string,
): PortableLinguisticIdResult {
  const normalizedPrefix = prefix.trim();

  if (!normalizedPrefix) {
    throw new Error("portable linguistic ID prefix must not be blank");
  }

  // Portable-ID generation is intentionally runtime-neutral. Check the
  // standards-based global capability directly rather than binding this helper
  // to a particular Obsidian window. This also preserves the Node-backed
  // regression tests, which install or remove the global crypto capability.
  const cryptoApi = typeof crypto !== "undefined" ? crypto : undefined;

  if (!cryptoApi || typeof cryptoApi.randomUUID !== "function") {
    return {
      status: "unsupported",
    };
  }

  return {
    status: "created",
    id: `${normalizedPrefix}-${cryptoApi.randomUUID()}`,
  };
}
