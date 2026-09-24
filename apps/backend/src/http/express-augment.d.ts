import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by requireAuth once the session cookie is verified. */
    userId?: string;
  }
}
