import { Request, Response, NextFunction } from 'express';
import { usersRepository } from '../users/users.repository';
import { verifyPassword } from '../../utils/crypto';
import { generateToken } from '../../utils/jwt';
import { sendSuccess } from '../../utils/response';
import { loginSchema } from './auth.validator';
import { AuthError, ValidationError } from '../../utils/AppError';

export class AuthController {
  async login(req: Request, _res: Response, next: NextFunction) {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

      const { username, password } = parsed.data;
      const user = await usersRepository.findByUsername(username);
      if (!user || !user.is_active) throw new AuthError('Invalid credentials or inactive account', 'AUTH_INVALID_CREDENTIALS');

      const isPasswordValid = await verifyPassword(password, user.password_hash);
      if (!isPasswordValid) throw new AuthError('Invalid credentials', 'AUTH_INVALID_CREDENTIALS');

      const token = generateToken({ userId: user.id, username: user.username, role: user.role });
      sendSuccess(_res, {
        token,
        user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role },
      });
    } catch (error) {
      next(error);
    }
  }
}
export const authController = new AuthController();
