import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { compare } from 'bcryptjs';
import { prisma } from '../lib/db';

type PassportUser = {
  id: string;
  email: string;
  username: string;
};

// Configure a LocalStrategy (email + password) to satisfy the
// "Passport.js local strategy" requirement. We still return a JWT
// for stateless clients.
const localStrategy = new LocalStrategy(
  {
    usernameField: 'email',
    passwordField: 'password',
    session: false,
  },
  async (email, password, done) => {
    try {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return done(null, false, { message: 'Invalid credentials' });

      const ok = await compare(password, user.password);
      if (!ok) return done(null, false, { message: 'Invalid credentials' });

      const safeUser: PassportUser = {
        id: user.id,
        email: user.email,
        username: user.username,
      };
      return done(null, safeUser);
    } catch (err) {
      return done(err);
    }
  }
);

passport.use(localStrategy);

export async function authenticateLocal(email: string, password: string): Promise<PassportUser | null> {
  return await new Promise((resolve, reject) => {
    // Invoke the LocalStrategy verify callback without an Express req/res.
    (localStrategy as any)._verify(email, password, (err: any, user: any) => {
      if (err) return reject(err);
      if (!user) return resolve(null);
      return resolve(user as PassportUser);
    });
  });
}
