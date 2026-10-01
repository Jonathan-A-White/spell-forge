// src/grist/errors.ts — The ways talking to the factory goes wrong, typed so the UI can say the right thing.

/** The backend cannot be reached: fetch threw, or a standby answered 503. Worth trying again later. */
export class GristOffline extends Error {
  constructor(message = 'The factory cannot be reached right now.') {
    super(message);
    this.name = 'GristOffline';
  }
}

/** 401 reason no_licence: this device's key holds no licence for the app. */
export class GristUnlicensed extends Error {
  constructor(message = 'This device holds no licence to use the factory.') {
    super(message);
    this.name = 'GristUnlicensed';
  }
}

/** Anything else the backend refuses or answers oddly, with the HTTP status (0 when it never got that far). */
export class GristBackendError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GristBackendError';
    this.status = status;
  }
}

/** A grist the app built that the grind's limits (protocol §19) would refuse: caught before any network call. */
export class GristLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GristLimitError';
  }
}
