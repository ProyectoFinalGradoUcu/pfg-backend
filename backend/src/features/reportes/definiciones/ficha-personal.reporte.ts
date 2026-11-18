import { ContextoEjecucion, DefinicionReporte, ResultadoReporte } from '../reportes.types';
import { campo, COLUMNAS_CAMPO_VALOR, fmtFecha, unir } from './_helpers';
import { wherePersonaReporte } from '../alcance-reportes';

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

    const id = BigInt(filtros.persona_id);
    const p = await prisma.personas.findFirst({
      where: { id, ...wherePersonaReporte(filtros) },
    });
    if (!p) return { columnas: COLUMNAS_CAMPO_VALOR, filas: [] };

    const vinculos = await prisma.relaciones_familiares.findMany({
      where: { OR: [
        { persona_id: id, tipo_relacion: 'Hijo/a' },
        { familiar_id: id, tipo_relacion: { in: ['Madre', 'Padre', 'Padre/Madre'] } },
      ] },
      include: { personas_relaciones_familiares_persona_idTopersonas: true, personas_relaciones_familiares_familiar_idTopersonas: true },
    });
    const hijos = [...new Map(vinculos.map(v => {
      const h = v.persona_id === id ? v.personas_relaciones_familiares_familiar_idTopersonas : v.personas_relaciones_familiares_persona_idTopersonas;
      return [h.id.toString(), unir(h.primer_nombre, h.segundo_nombre, h.primer_apellido, h.segundo_apellido)];
    })).values()].sort();

    const filas = [
      campo('Apellido y nombre', unir(p.primer_apellido, p.segundo_apellido) + ', ' + unir(p.primer_nombre, p.segundo_nombre)),
      campo('Cédula', p.cedula),
      campo('Credencial Cívica', p.credencial_civica),
      campo('Fecha de nacimiento', fmtFecha(p.fecha_nacimiento)),
      campo('Lugar de nacimiento', p.lugar_nacimiento),
      campo('Dirección', p.direccion),
      campo('Teléfono', p.telefono),
      campo('E-mail', p.email),
      campo('Departamento / Localidad', unir(p.departamento, p.localidad)),
      campo('Sección Judicial', p.seccional),
      campo('Nivel de idoneidad', p.nivel_idoneidad != null ? `Nivel ${p.nivel_idoneidad}` : null),
      campo('Hijos', hijos.join(', ') || null),
    ];

    return { columnas: COLUMNAS_CAMPO_VALOR, filas };
  },
};
