import * as z from 'zod/v4';

export const id = z.union([z.number().int().positive().max(Number.MAX_SAFE_INTEGER), z.string().regex(/^[A-Za-z0-9_-]+$/).max(128)]);
export const text = z.string().min(1).max(10000);
export const date = z.iso.date();
export const apiDate = z.string().refine(value => {
  if (z.iso.date().safeParse(value).success) return true;
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return false;
  const iso = `${match[3]}-${match[2]!.padStart(2, '0')}-${match[1]!.padStart(2, '0')}`;
  return z.iso.date().safeParse(iso).success;
}, 'Use a valid YYYY-MM-DD or DD/MM/YYYY date');
export const month = z.enum(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);
export const year = z.union([z.number().int().min(1900).max(9999), z.string().regex(/^[1-9]\d{3}$/)]);
export const period = { month, year };
export const ids = z.array(id).max(1000);
export const amount = z.union([z.number().finite(), z.string().regex(/^-?\d+(\.\d+)?$/)]);
export const code = z.union([text, z.number().int().max(Number.MAX_SAFE_INTEGER)]);
export const jsonObject = z.record(z.string(), z.json());
export function nonempty<T extends z.ZodRawShape>(shape: T) {
  return z.strictObject(shape).refine(value => Object.values(value).some(v => v !== undefined), 'Provide at least one field to change');
}
