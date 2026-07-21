import { ContextoEjecucion, DefinicionReporte, ResultadoReporte } from '../reportes.types';
import { campo, COLUMNAS_CAMPO_VALOR, fmtFecha, unir } from './_helpers';

export const fichaPersonalReporte: DefinicionReporte = {
  clave: 'ficha-personal',
  titulo: 'Ficha de Datos Personales',
  descripcion: 'Datos personales y de contacto del funcionario.',
  categoria: 'Personal',

   

  parametros: [
    {
      clave: 'persona_id',
      etiqueta: 'Funcionario',
      tipo: 'select',
      fuenteOpciones: 'personas',
      requerido: true,
    },
  ],

  async ejecutar({ prisma, filtros }: ContextoEjecucion): Promise<ResultadoReporte> {
    if (!filtros.persona_id) {
      return { columnas: COLUMNAS_CAMPO_VALOR, filas: [] };
    }

    const p = await prisma.personas.findUnique({
      where: { id: BigInt(filtros.persona_id) },
    });
    if (!p) return { columnas: COLUMNAS_CAMPO_VALOR, filas: [] };

    const filas = [
      campo('Apellido y nombre', unir(p.primer_apellido, p.segundo_apellido) + ', ' + unir(p.primer_nombre, p.segundo_nombre)),
      campo('Cédula', p.cedula),
      campo('Fecha de nacimiento', fmtFecha(p.fecha_nacimiento)),
      campo('Lugar de nacimiento', p.lugar_nacimiento),
      campo('Dirección', p.direccion),
      campo('Teléfono', p.telefono),
      campo('E-mail', p.email),
      campo('Departamento / Localidad', unir(p.departamento, p.localidad)),
      campo('Sección Judicial', p.seccional),
    ];

    return { columnas: COLUMNAS_CAMPO_VALOR, filas };
  },
};
