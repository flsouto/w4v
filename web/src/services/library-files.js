export function fileFromRecord(record) {
  const file = new File([record.data], record.name, {type:record.type,lastModified:record.lastModified});
  Object.defineProperties(file, {
    id:{value:record.id},
    isGenerated:{value:record.isGenerated || record.name.includes('generated-')},
    favorite:{value:Boolean(record.favorite),writable:true},
  });
  return file;
}

export function withFavorite(file, favorite) {
  const updated = new File([file],file.name,{type:file.type,lastModified:file.lastModified});
  Object.defineProperties(updated, {
    id:{value:file.id}, isGenerated:{value:file.isGenerated}, favorite:{value:favorite,writable:true},
    // Metadata changes share the original immutable audio; previews need not reload.
    audioSource:{value:file.audioSource || file},
  });
  return updated;
}
export function upsertFile(files, file) {
  return files.some(previous=>previous.id===file.id)
    ? files.map(previous=>previous.id===file.id ? file : previous)
    : [...files,file];
}
