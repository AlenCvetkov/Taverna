export const MAX_IMAGE_BYTES = 1024 * 1024;
// Store only small raster images. SVG illustrations are bundled trusted assets.
export function parseProductImage(value) {
 if (typeof value !== 'string') throw new Error('Избери PNG, JPEG, WebP или GIF слика до 1 MB.');
 const match=/^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
 if (!match || match[2].length%4!==0) throw new Error('Избери PNG, JPEG, WebP или GIF слика.');
 const bytes=Buffer.from(match[2],'base64'),type=match[1];
 if (!bytes.length || bytes.length>MAX_IMAGE_BYTES) throw new Error('Сликата мора да биде до 1 MB.');
 const valid=type==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
  type==='jpeg'?bytes[0]===255 && bytes[1]===216 && bytes[2]===255:
  type==='webp'?bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP':
  /^GIF8[79]a$/.test(bytes.toString('ascii',0,6));
 if (!valid || bytes.toString('base64')!==match[2]) throw new Error('Сликата не е валидна.');
 return {bytes,mime:'image/'+type};
}
