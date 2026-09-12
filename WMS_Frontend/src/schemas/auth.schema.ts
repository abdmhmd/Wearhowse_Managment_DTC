import { z } from 'zod';

/**
 * Client-side login format validation. Messages are i18n key paths rendered
 * via the translation function (e.g. t('auth.login.validation.USERNAME_TOO_SHORT')).
 * The server enforces NO stricter contract here: it returns the same generic
 * credentials error for any malformed input so formatting rules never turn
 * into a username-existence oracle.
 */
export const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'auth.login.validation.USERNAME_TOO_SHORT')
    .regex(/^[a-zA-Z0-9._-]+$/, 'auth.login.validation.USERNAME_INVALID_CHARS')
    .max(50, 'auth.login.validation.USERNAME_TOO_LONG'),
  password: z.string().min(6, 'auth.login.validation.PASSWORD_TOO_SHORT'),
});

export type LoginFormData = z.infer<typeof loginSchema>;