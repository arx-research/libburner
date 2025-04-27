export class BurnerTransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BurnerTransactionError";
    Object.setPrototypeOf(this, BurnerTransactionError.prototype);
  }
}
