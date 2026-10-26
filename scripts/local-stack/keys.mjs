// Prints the local-stack anon/service JWTs (dev-only secret; not a credential).
import crypto from 'node:crypto';
const secret = process.env.FILO_LOCAL_JWT_SECRET ?? 'filo-local-dev-jwt-secret-not-for-production-use';
const b = (x) => Buffer.from(JSON.stringify(x)).toString('base64url');
const sign = (role) => {
  const h = b({ alg: 'HS256', typ: 'JWT' });
  const p = b({ role, iss: 'supabase-local', iat: 1700000000, exp: 2000000000 });
  return `${h}.${p}.${crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`;
};
console.log(`ANON=${sign('anon')}`);
console.log(`SERVICE=${sign('service_role')}`);
