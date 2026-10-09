import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { FiltroCategoriaPersonal, wherePersonaPorCategoria } from './categoria-personal';
import type { CategoriaPersonal } from './categoria-personal';

class QueryDePrueba {
  @FiltroCategoriaPersonal()
  categoria?: CategoriaPersonal;
}

const validar = (categoria: unknown) => {
  const dto = plainToInstance(QueryDePrueba, { categoria });
  return { dto, errores: validateSync(dto) };
};

describe('categoria-personal', () => {
  describe('FiltroCategoriaPersonal', () => {
    it.each(['oficial', 'subalterno'])('acepta "%s"', (valor) => {
      const { dto, errores } = validar(valor);
      expect(errores).toHaveLength(0);
      expect(dto.categoria).toBe(valor);
    });

    it.each(['', 'todos', undefined])('trata %p como "todos" (sin filtro)', (valor) => {
      const { dto, errores } = validar(valor);
      expect(errores).toHaveLength(0);
      expect(dto.categoria).toBeUndefined();
    });

    it('rechaza otro valor', () => {
      expect(validar('civil').errores).toHaveLength(1);
    });
  });

  describe('wherePersonaPorCategoria', () => {
    it('sin categoría no restringe', () => {
      expect(wherePersonaPorCategoria(undefined)).toEqual({});
    });

    it('usa la relación vigente, o cualquiera si la persona ya no tiene una', () => {
      expect(wherePersonaPorCategoria('oficial')).toEqual({
        OR: [
          { relaciones_laborales: { some: { fecha_fin: null, tipo_funcionario: 'oficial' } } },
          {
            relaciones_laborales: {
              none: { fecha_fin: null },
              some: { tipo_funcionario: 'oficial' },
            },
          },
        ],
      });
    });
  });
});
