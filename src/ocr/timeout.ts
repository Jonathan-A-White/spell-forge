// src/ocr/timeout.ts — Promise timeout utility for OCR operations

/**
 * Races a promise against a timeout. If the promise doesn't settle within
 * `ms` milliseconds, the returned promise rejects with a descriptive error.
 *
 * The original promise is NOT cancelled (JS doesn't support that), but the
 * caller can stop waiting and show an error to the user.
 */
export function raceWithTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
