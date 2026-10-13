import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../lib/prisma.service.js';
import { AlcanceResuelto, unidadIdsDeAlcance } from '../../lib/alcance/alcance.types.js';
import {
  Catalogo,
  ColumnaPlantilla,
  DefinicionPlantilla,
  FilaLeida,
  ResultadoCarga,
  construirPlantilla,
  elegirOpcion,
  leerHoja,
  normalizarCedula,
  parsearEntero,
  parsearFecha,
  parsearSiNo,
  procesarEnSerie,
  resumir,
  separarRepetidas,
} from '../../lib/carga-masiva/index.js';
import { SubalternosService } from './subalternos.service.js';
import { CreatePersonalDto } from './dto/create-personal.dto.js';
import { ETIQUETAS_NIVEL_EDUCATIVO, NIVELES_EDUCATIVOS } from './legajo-militar.constants.js';

const TIPOS_PERSONAL = { Oficial: 'oficial', Subalterno: 'subalterno', Civil: 'civil' } as const;
const GENEROS = { Masculino: 'M', Femenino: 'F', Otro: 'O', M: 'M', F: 'F', O: 'O' } as const;
const ESTADOS_CIVILES = ['Soltero', 'Casado', 'Divorciado', 'Viudo', 'Unión libre'];
const TIPOS_RELACION = ['Cónyuge', 'Padre', 'Madre', 'Hijo/a', 'Hermano/a', 'Otro'];
const SI_NO = ['SI', 'NO'];

/** Etiqueta legible, código guardado. También acepta el código tal cual (en caso que tengan una plantilla vieja). */
const NIVELES_POR_ETIQUETA: Record<string, string> = Object.fromEntries([
  ...NIVELES_EDUCATIVOS.map((n) => [ETIQUETAS_NIVEL_EDUCATIVO[n], n]),
  ...NIVELES_EDUCATIVOS.map((n) => [n, n]),
]);

const COLUMNAS: ColumnaPlantilla[] = [
  { clave: 'cedula', titulo: 'Cédula', requerida: true, ayuda: 'Sin puntos ni guión. Ej: 12345678' },
  { clave: 'primer_nombre', titulo: 'Primer nombre', requerida: true },
  { clave: 'segundo_nombre', titulo: 'Segundo nombre' },
  { clave: 'primer_apellido', titulo: 'Primer apellido', requerida: true },
  { clave: 'segundo_apellido', titulo: 'Segundo apellido' },
  { clave: 'tipo_personal', titulo: 'Tipo de personal', requerida: true, tipo: 'lista', lista: 'tipos',
    ayuda: 'Oficial y Subalterno requieren los datos militares. Civil requiere al menos un familiar militar.' },
  { clave: 'fecha_nacimiento', titulo: 'Fecha de nacimiento', tipo: 'fecha' },
  { clave: 'genero', titulo: 'Género', tipo: 'lista', lista: 'generos' },
  { clave: 'estado_civil', titulo: 'Estado civil', tipo: 'lista', lista: 'estados_civiles' },
  { clave: 'lugar_nacimiento', titulo: 'Lugar de nacimiento' },
  { clave: 'email', titulo: 'Email' },
  { clave: 'telefono', titulo: 'Teléfono' },
  { clave: 'direccion', titulo: 'Dirección' },
  { clave: 'codigo_postal', titulo: 'Código postal' },
  { clave: 'seccional', titulo: 'Seccional' },
  { clave: 'etnia', titulo: 'Etnia' },
  // Datos militares
  { clave: 'regimen', titulo: 'Régimen', tipo: 'lista', lista: 'regimenes', ayuda: 'Obligatorio para oficiales y subalternos.' },
  { clave: 'unidad', titulo: 'Unidad', tipo: 'lista', lista: 'unidades', ayuda: 'Unidad donde revista hoy. Se registra como su destino actual.' },
  { clave: 'sub_unidad', titulo: 'Sub-unidad', tipo: 'lista', lista: 'sub_unidades', ayuda: 'Opcional. Tiene que pertenecer a la unidad elegida.' },
  { clave: 'programa', titulo: 'Programa', tipo: 'lista', lista: 'programas', ayuda: 'Obligatorio para oficiales y subalternos.' },
  { clave: 'situacion', titulo: 'Situación', tipo: 'lista', lista: 'situaciones', ayuda: 'Obligatorio para oficiales y subalternos.' },
  { clave: 'escalafon', titulo: 'Escalafón', tipo: 'lista', lista: 'escalafones', ayuda: 'Obligatorio para oficiales y subalternos.' },
  { clave: 'grado', titulo: 'Grado', tipo: 'lista', lista: 'grados', ayuda: 'Grado actual. Obligatorio para oficiales y subalternos.' },
  { clave: 'fecha_inicio', titulo: 'Fecha de ingreso', tipo: 'fecha',
    ayuda: 'Inicio de la relación laboral. Se usa para la antigüedad total. Obligatoria para oficiales y subalternos.' },
  { clave: 'fecha_ultimo_ascenso', titulo: 'Fecha del último ascenso', tipo: 'fecha',
    ayuda: 'Las reglas de ascenso cuentan la permanencia en el grado desde esta fecha. Si se deja vacía, cuentan desde la fecha de ingreso.' },
  { clave: 'anios_servicio_anterior', titulo: 'Años de servicio anteriores', tipo: 'numero',
    ayuda: 'Años de servicio previos al ingreso que suman a la antigüedad. Vacío = 0.' },
  { clave: 'tiene_mando', titulo: 'Tiene mando', tipo: 'lista', lista: 'si_no' },
  { clave: 'prima_tecnica', titulo: 'Prima técnica', ayuda: 'Hasta 10 caracteres. Ej: A' },
  // Legajo militar
  { clave: 'nivel_educativo', titulo: 'Nivel educativo', tipo: 'lista', lista: 'niveles', ayuda: 'Lo usan las reglas de ascenso.' },
  { clave: 'fecha_ingreso_eta', titulo: 'Fecha de ingreso a la ETA', tipo: 'fecha' },
  { clave: 'fecha_egreso_eta', titulo: 'Fecha de egreso de la ETA', tipo: 'fecha' },
  { clave: 'numero_orden_egreso_eta', titulo: 'N.º de orden de egreso de la ETA' },
  { clave: 'mutaciones', titulo: 'Mutaciones', ayuda: 'Texto libre del cambio de escalafón, si lo hubo.' },
  // Civiles
  { clave: 'familiares', titulo: 'Familiares',
    ayuda: 'Cédulas de militares ya registrados (o que estén en este mismo archivo), con el vínculo después de dos puntos. ' +
      'Varios se separan con |. Ej: 12345678:Cónyuge|87654321:Padre. Obligatorio para civiles.' },
  { clave: 'observaciones', titulo: 'Observaciones', ancho: 40 },
];

interface Catalogos {
  regimenes: Catalogo<{ id: bigint; codigo: string; nombre: string }>;
  unidades: Catalogo<{ id: bigint; codigo: string; nombre: string }>;
  subUnidades: Catalogo<{ id: bigint; codigo: string; nombre: string; unidad_id: bigint }>;
  programas: Catalogo<{ id: bigint; codigo: string; nombre: string }>;
  situaciones: Catalogo<{ id: bigint; codigo: string; nombre: string }>;
  escalafones: Catalogo<{ id: bigint; codigo: string; nombre: string }>;
  grados: Catalogo<{ id: bigint; codigo: string; nombre: string; es_oficial: boolean; es_subalterno: boolean }>;
}

@Injectable()
export class PersonasCargaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subalternosService: SubalternosService,
  ) {}

  async generarPlantilla(alcance?: AlcanceResuelto): Promise<Buffer> {
    const cat = await this.cargarCatalogos(alcance);
    return construirPlantilla(this.definicion(cat));
  }

  /**
   * Con alcance de unidad, la lista de unidades trae solo las del usuario y la fila sin unidad
   * cae en la suya (si tiene una sola). El alta valida lo mismo que el formulario manual.
   */
  async procesarCarga(buffer: Buffer, alcance?: AlcanceResuelto): Promise<ResultadoCarga> {
    const cat = await this.cargarCatalogos(alcance);
    const filas = await leerHoja(buffer, this.definicion(cat));
    for (const f of filas) f.valores['cedula'] = normalizarCedula(f.valores['cedula'] ?? '');

    const { unicas, repetidas } = separarRepetidas(
      filas,
      (f) => f.valores['cedula'],
      (previa) => `La cédula está repetida en el archivo (ya aparece en la fila ${previa}).`,
    );

    // Primero los militares: así un civil puede tener de familiar a alguien del mismo archivo.
    const esCivil = (f: FilaLeida) => f.valores['tipo_personal'] && /civil/i.test(f.valores['tipo_personal']);
    const ordenadas = [...unicas.filter((f) => !esCivil(f)), ...unicas.filter(esCivil)];

    const resultados = await procesarEnSerie(ordenadas, async (fila) => {
      const dto = this.armarDto(fila, cat);
      const creado = (await this.subalternosService.createPersonal(dto, alcance)) as { id: number };
      return { id: creado.id };
    });

    return resumir([...resultados, ...repetidas]);
  }

  private armarDto(fila: FilaLeida, cat: Catalogos): CreatePersonalDto {
    const v = fila.valores;
    const t = (clave: string) => COLUMNAS.find((c) => c.clave === clave)!.titulo;

    if (!v['cedula']) throw new Error('Falta la cédula.');
    if (!/^\d{6,9}$/.test(v['cedula'])) throw new Error(`La cédula "${v['cedula']}" no es válida: tienen que ser entre 6 y 9 dígitos.`);
    if (!v['primer_nombre']) throw new Error('Falta el primer nombre.');
    if (!v['primer_apellido']) throw new Error('Falta el primer apellido.');
    const tipo = elegirOpcion(v['tipo_personal'], t('tipo_personal'), TIPOS_PERSONAL);
    if (!tipo) throw new Error('Falta el tipo de personal (Oficial, Subalterno o Civil).');

    const nivel = elegirOpcion(v['nivel_educativo'], t('nivel_educativo'), NIVELES_POR_ETIQUETA);

    const dto: CreatePersonalDto = {
      cedula: v['cedula'],
      primer_nombre: v['primer_nombre'],
      primer_apellido: v['primer_apellido'],
      segundo_nombre: v['segundo_nombre'] || undefined,
      segundo_apellido: v['segundo_apellido'] || undefined,
      fecha_nacimiento: parsearFecha(v['fecha_nacimiento'], t('fecha_nacimiento')),
      genero: elegirOpcion(v['genero'], t('genero'), GENEROS),
      estado_civil: elegirOpcion(v['estado_civil'], t('estado_civil'), Object.fromEntries(ESTADOS_CIVILES.map((e) => [e, e]))),
      lugar_nacimiento: v['lugar_nacimiento'] || undefined,
      email: v['email'] || undefined,
      telefono: v['telefono'] || undefined,
      direccion: v['direccion'] || undefined,
      codigo_postal: v['codigo_postal'] || undefined,
      seccional: v['seccional'] || undefined,
      etnia: v['etnia'] || undefined,
      es_civil: tipo === 'civil',
      observaciones: v['observaciones'] || undefined,
      familiares: this.parsearFamiliares(v['familiares']),
    };

    if (tipo === 'civil') {
      if (!dto.familiares?.length) {
        throw new Error('Un civil necesita al menos un familiar militar en la columna "Familiares".');
      }
      return dto;
    }

    const faltantes = (['regimen', 'unidad', 'programa', 'situacion', 'escalafon', 'grado', 'fecha_inicio'] as const)
      .filter((c) => !v[c] && !(c === 'unidad' && cat.unidades.items.length === 1))
      .map(t);
    if (faltantes.length) throw new Error(`Faltan datos militares: ${faltantes.join(', ')}.`);

    const unidad = v['unidad'] ? cat.unidades.resolver(v['unidad']) : cat.unidades.items[0];
    const subUnidad = cat.subUnidades.resolverOpcional(v['sub_unidad']);
    if (subUnidad && subUnidad.unidad_id !== unidad.id) {
      throw new Error(`La sub-unidad "${v['sub_unidad']}" no pertenece a la unidad "${cat.unidades.etiquetaDe(unidad)}".`);
    }
    const grado = cat.grados.resolver(v['grado']);
    if (tipo === 'oficial' && grado.es_subalterno) {
      throw new Error(`El grado "${v['grado']}" es de personal subalterno y la fila dice Oficial.`);
    }
    if (tipo === 'subalterno' && grado.es_oficial) {
      throw new Error(`El grado "${v['grado']}" es de oficiales y la fila dice Subalterno.`);
    }

    const fechaInicio = parsearFecha(v['fecha_inicio'], t('fecha_inicio'))!;
    const fechaUltimoAscenso = parsearFecha(v['fecha_ultimo_ascenso'], t('fecha_ultimo_ascenso'));
    if (fechaUltimoAscenso && fechaUltimoAscenso < fechaInicio) {
      throw new Error('La fecha del último ascenso es anterior a la fecha de ingreso.');
    }

    return {
      ...dto,
      tipo_funcionario: tipo,
      regimen_id: Number(cat.regimenes.resolver(v['regimen']).id),
      unidad_id: Number(unidad.id),
      sub_unidad_id: subUnidad ? Number(subUnidad.id) : undefined,
      programa_id: Number(cat.programas.resolver(v['programa']).id),
      situacion_id: Number(cat.situaciones.resolver(v['situacion']).id),
      escalafon_id: Number(cat.escalafones.resolver(v['escalafon']).id),
      grado_id: Number(grado.id),
      fecha_inicio: fechaInicio,
      fecha_ultimo_ascenso: fechaUltimoAscenso,
      anios_servicio_anterior: parsearEntero(v['anios_servicio_anterior'], t('anios_servicio_anterior')),
      tiene_mando: parsearSiNo(v['tiene_mando'], t('tiene_mando')),
      prima_tecnica: v['prima_tecnica'] || undefined,
      nivel_educativo: nivel,
      fecha_ingreso_eta: parsearFecha(v['fecha_ingreso_eta'], t('fecha_ingreso_eta')),
      fecha_egreso_eta: parsearFecha(v['fecha_egreso_eta'], t('fecha_egreso_eta')),
      numero_orden_egreso_eta: v['numero_orden_egreso_eta'] || undefined,
      mutaciones: v['mutaciones'] || undefined,
    };
  }

  private parsearFamiliares(valor: string): CreatePersonalDto['familiares'] {
    if (!valor) return undefined;
    const familiares = valor
      .split(/[|;\n]/)
      .map((parte) => parte.trim())
      .filter(Boolean)
      .map((parte) => {
        const [cedula, relacion] = parte.split(':');
        const tipoRelacion = relacion?.trim()
          ? elegirOpcion(relacion.trim(), 'Familiares', Object.fromEntries(TIPOS_RELACION.map((r) => [r, r])))
          : undefined;
        return { cedula: normalizarCedula(cedula ?? ''), tipo_relacion: tipoRelacion };
      });
    const invalida = familiares.find((f) => !/^\d{6,9}$/.test(f.cedula));
    if (invalida) throw new Error(`"Familiares": "${invalida.cedula}" no es una cédula válida. Formato: 12345678:Cónyuge|87654321:Padre`);
    return familiares;
  }

  private async cargarCatalogos(alcance?: AlcanceResuelto): Promise<Catalogos> {
    const unidadesAlcance = alcance ? unidadIdsDeAlcance(alcance) : null;
    const filtroUnidad = unidadesAlcance ? { id: { in: unidadesAlcance } } : {};
    const [regimenes, unidades, subUnidades, programas, situaciones, escalafones, grados] = await Promise.all([
      this.prisma.regimenes.findMany({ where: { vigente: true }, orderBy: { numero_ley: 'asc' } }),
      this.prisma.unidades.findMany({ where: { vigente: true, ...filtroUnidad }, orderBy: { denominacion: 'asc' } }),
      this.prisma.sub_unidades.findMany({
        where: { vigente: true, ...(unidadesAlcance ? { unidad_id: { in: unidadesAlcance } } : {}) },
        orderBy: { codigo: 'asc' },
      }),
      this.prisma.programas.findMany({ where: { vigente: true }, orderBy: { codigo: 'asc' } }),
      this.prisma.situaciones.findMany({ where: { vigente: true }, orderBy: { codigo: 'asc' } }),
      this.prisma.escalafones.findMany({ where: { vigente: true }, orderBy: { codigo: 'asc' } }),
      this.prisma.grados.findMany({ where: { vigente: true }, orderBy: { orden: 'asc' } }),
    ]);

    return {
      regimenes: new Catalogo('Régimen', regimenes.map((r) => ({ id: r.id, codigo: r.numero_ley, nombre: r.denominacion }))),
      unidades: new Catalogo('Unidad', unidades.map((u) => ({ id: u.id, codigo: u.codigo, nombre: u.denominacion }))),
      subUnidades: new Catalogo(
        'Sub-unidad',
        subUnidades.map((s) => ({ id: s.id, codigo: s.codigo, nombre: s.denominacion, unidad_id: s.unidad_id })),
      ),
      programas: new Catalogo('Programa', programas.map((p) => ({ id: p.id, codigo: p.codigo, nombre: p.denominacion }))),
      situaciones: new Catalogo('Situación', situaciones.map((s) => ({ id: s.id, codigo: s.codigo, nombre: s.denominacion }))),
      escalafones: new Catalogo('Escalafón', escalafones.map((e) => ({ id: e.id, codigo: e.codigo, nombre: e.denominacion }))),
      grados: new Catalogo(
        'Grado',
        grados.map((g) => ({
          id: g.id,
          codigo: g.codigo,
          nombre: g.denominacion,
          es_oficial: g.es_oficial,
          es_subalterno: g.es_subalterno,
        })),
      ),
    };
  }

  private definicion(cat: Catalogos): DefinicionPlantilla {
    return {
      hoja: 'Personal',
      titulo: 'Carga masiva de personal',
      columnas: COLUMNAS,
      listas: [
        { nombre: 'tipos', titulo: 'Tipo de personal', valores: Object.keys(TIPOS_PERSONAL) },
        { nombre: 'generos', titulo: 'Género', valores: ['Masculino', 'Femenino', 'Otro'] },
        { nombre: 'estados_civiles', titulo: 'Estado civil', valores: ESTADOS_CIVILES },
        { nombre: 'regimenes', titulo: 'Régimen', valores: cat.regimenes.etiquetas },
        { nombre: 'unidades', titulo: 'Unidad', valores: cat.unidades.etiquetas },
        { nombre: 'sub_unidades', titulo: 'Sub-unidad', valores: cat.subUnidades.etiquetas },
        { nombre: 'programas', titulo: 'Programa', valores: cat.programas.etiquetas },
        { nombre: 'situaciones', titulo: 'Situación', valores: cat.situaciones.etiquetas },
        { nombre: 'escalafones', titulo: 'Escalafón', valores: cat.escalafones.etiquetas },
        { nombre: 'grados', titulo: 'Grado', valores: cat.grados.etiquetas },
        { nombre: 'si_no', titulo: 'Sí / No', valores: SI_NO },
        { nombre: 'niveles', titulo: 'Nivel educativo', valores: NIVELES_EDUCATIVOS.map((n) => ETIQUETAS_NIVEL_EDUCATIVO[n]) },
        { nombre: 'relaciones', titulo: 'Tipo de relación (para Familiares)', valores: TIPOS_RELACION },
      ],
      instrucciones: [
        'Si el tipo de personal es Oficial o Subalterno, completá los datos militares (Régimen a Fecha de ingreso). ' +
          'Si es Civil, dejalos vacíos y completá "Familiares".',
        'Los militares de este archivo se cargan antes que los civiles: un civil puede tener de familiar a alguien del mismo archivo.',
        'Cada persona queda con su destino actual en la unidad indicada. El historial de destinos se carga aparte, desde Destinos.',
      ],
      ejemplos: [
        {
          cedula: '12345678', primer_nombre: 'Juan', segundo_nombre: 'Carlos', primer_apellido: 'Pérez', segundo_apellido: 'García',
          tipo_personal: 'Oficial', fecha_nacimiento: fechaEjemplo('1990-05-15'), genero: 'Masculino', estado_civil: 'Soltero',
          lugar_nacimiento: 'Montevideo', email: 'juan@ejemplo.com', telefono: '099111222',
          regimen: cat.regimenes.etiquetas[0] ?? '', unidad: cat.unidades.etiquetas[0] ?? '',
          programa: cat.programas.etiquetas[0] ?? '', situacion: cat.situaciones.etiquetas[0] ?? '',
          escalafon: cat.escalafones.etiquetas[0] ?? '',
          grado: cat.grados.etiquetas.find((g) => g.startsWith('TTE_1RO')) ?? cat.grados.etiquetas[0] ?? '',
          fecha_inicio: fechaEjemplo('2012-03-01'), fecha_ultimo_ascenso: fechaEjemplo('2021-02-01'),
          anios_servicio_anterior: 0, tiene_mando: 'NO', nivel_educativo: ETIQUETAS_NIVEL_EDUCATIVO.BACHILLERATO,
        },
        {
          cedula: '98765432', primer_nombre: 'Ana', primer_apellido: 'López', tipo_personal: 'Civil',
          fecha_nacimiento: fechaEjemplo('1995-03-20'), genero: 'Femenino', estado_civil: 'Casado',
          familiares: '12345678:Cónyuge', observaciones: 'Cónyuge de oficial',
        },
      ],
    };
  }
}

const fechaEjemplo = (iso: string) => new Date(`${iso}T00:00:00Z`);
