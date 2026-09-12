import React from 'react';
export type FileType='excel'|'csv'|'json';
interface Props{type:FileType;size?:number;className?:string;}
export function FileTypeIcon({type,size=28,className=''}:Props){const label=type==='excel'?'Excel':type.toUpperCase();return <img src={`/file-icons/${type}.svg`} width={size} height={size} className={className} alt={`${label} file`} loading="lazy" decoding="async"/>;}
export function fileTypeFromName(name:string):FileType{const lower=name.toLowerCase();if(lower.endsWith('.csv'))return'csv';if(lower.endsWith('.json'))return'json';return'excel';}
