import { TIPOS_PERMITIDOS } from './archivos.mime';

export interface RestriccionesArchivo {
  tipos: readonly string[];
  tamanioMaximoBytes: number;
  /** Cómo se nombran los tipos en los mensajes de error. */
  tiposLegibles: string;
}

const MB = 1024 * 1024;

export const RESTRICCIONES_DOCUMENTO: RestriccionesArchivo = {
  tipos: TIPOS_PERMITIDOS,
  tamanioMaximoBytes: 10 * MB,
  tiposLegibles: 'PDF, JPG o PNG',
};

export const RESTRICCIONES_IMAGEN: RestriccionesArchivo = {
  tipos: ['image/jpeg', 'image/png'],
  tamanioMaximoBytes: 2 * MB,
  tiposLegibles: 'JPG o PNG',
};

export const mensajeTamanio = (r: RestriccionesArchivo): string =>
  `El archivo supera el tamaño máximo de ${r.tamanioMaximoBytes / MB} MB`;
