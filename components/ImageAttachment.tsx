import React, { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';

interface ImageAttachmentProps {
  files: File[];
  onRemove: (index: number) => void;
}

export const ImageAttachment: React.FC<ImageAttachmentProps> = ({ files, onRemove }) => {
  if (!files.length) return null;

  const previews = useMemo(
    () =>
      files.map((file) => ({
        key: `${file.name}-${file.size}-${file.lastModified}`,
        url: URL.createObjectURL(file),
      })),
    [files]
  );

  useEffect(() => {
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [previews]);

  return (
    <div className="flex flex-wrap gap-3 mt-3">
      {previews.map((preview, index) => (
        <div
          key={preview.key}
          className="relative w-24 h-24 rounded-lg overflow-hidden border border-slate-700 bg-slate-800"
        >
          <img src={preview.url} alt={files[index].name} className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-1 hover:bg-black z-10"
            aria-label="Remove attachment"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[10px] text-center text-slate-200 py-1 px-1">
            {files[index].name}
          </div>
        </div>
      ))}
    </div>
  );
};














