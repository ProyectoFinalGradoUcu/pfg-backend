import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';

/**
 * Categoría del personal militar según `relaciones_laborales.tipo_funcionario`.
 * La ausencia del filtro equivale a "todos" (ambas categorías).
 */
export const CATEGORIAS_PERSONAL = ['oficial', 'subalterno'] as const;
export type CategoriaPersonal = (typeof CATEGORIAS_PERSONAL)[number];

/** Propiedad `categoria` para los DTO de query de listados de personal. */
export function FiltroCategoriaPersonal() {
  return applyDecorators(
    ApiPropertyOptional({
      enum: CATEGORIAS_PERSONAL,
      example: 'oficial',
      description: 'Solo oficiales o solo subalternos. Sin este filtro se listan todos.',
    }),
    IsOptional(),
    // '' o 'todos' desde la interfaz equivalen a no filtrar.
    Transform(({ value }) => (value === '' || value === 'todos' ? undefined : value)),
    IsIn([...CATEGORIAS_PERSONAL]),
  );
}

/**
 * Fragmento de `where` sobre `personas`: la categoría se toma de la relación laboral
 * vigente; si la persona no tiene ninguna (retirados), de cualquiera de las cerradas.
 */
export function wherePersonaPorCategoria(categoria?: CategoriaPersonal) {
  if (!categoria) return {};
  return {
    OR: [
      { relaciones_laborales: { some: { fecha_fin: null, tipo_funcionario: categoria } } },
      {
        relaciones_laborales: {
          none: { fecha_fin: null },
          some: { tipo_funcionario: categoria },
        },
      },
    ],
  };
}
