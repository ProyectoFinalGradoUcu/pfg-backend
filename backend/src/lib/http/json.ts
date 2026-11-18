/** Replacer de `JSON.stringify`: los BigInt (ids de Prisma) salen como string. */
export const reemplazarBigInt = (_clave: string, valor: unknown): unknown =>
  typeof valor === 'bigint' ? valor.toString() : valor;

/** Copia serializable de un valor: BigInt como string y Date como ISO. */
export const aJsonPlano = <T>(valor: T): T =>
  JSON.parse(JSON.stringify(valor, reemplazarBigInt)) as T;
