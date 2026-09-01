/**
 * Plugin-wide serialization boundary for settings-authority transactions.
 *
 * Conlang Workbench stores settings in one shared mutable object and persists
 * that object as a whole. An authority transaction therefore must not begin
 * while another authority transaction still has provisional state installed.
 *
 * The important boundary is earlier than persistence itself. A transaction
 * commonly reads its previous value, constructs rollback state, and installs a
 * requested value before calling saveSettings(). Serializing saveSettings()
 * alone would therefore be too late: the next transaction could already have
 * mistaken another transaction's provisional value for settled authority.
 *
 * This coordinator deliberately owns only ordering. It does not know how an
 * individual transaction validates input, changes settings, persists data,
 * reloads runtime state, rolls back, performs a compensating save, or changes
 * vault files. Those security-sensitive semantics remain in the specialized
 * transaction modules that already own them.
 *
 * Callers must enter this queue before performing any authority-sensitive read,
 * snapshot, candidate construction, or mutation that depends on settled
 * settings state.
 */
export class SettingsAuthorityQueue {
  /*
   * The tail represents completion of the most recently queued authority
   * transaction. Starting with a fulfilled Promise lets the first transaction
   * begin on the next Promise continuation without waiting for real work.
   */
  private tail: Promise<void> = Promise.resolve();

  /**
   * Run one complete settings-authority transaction after all previously
   * submitted transactions have settled.
   *
   * The callback itself is intentionally deferred until this request reaches
   * the front of the queue. That is the security property H13 requires: code
   * inside the callback cannot capture another queued transaction's provisional
   * settings as its rollback authority.
   *
   * The caller receives the transaction's original result or rejection. The
   * internal tail is converted back to a fulfilled Promise in either case so
   * an unexpected exception in one transaction cannot permanently prevent
   * later authority work from running.
   */
  run<T>(transaction: () => Promise<T>): Promise<T> {
    const result = this.tail.then(transaction);

    this.tail = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }
}
