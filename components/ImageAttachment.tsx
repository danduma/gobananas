import React from 'react';
import { X } from 'lucide-react';

interface ImageAttachmentProps {
  files: File[];
  onRemove: (index: number) => void;
}

export const ImageAttachment: React.FC<ImageAttachmentProps> = ({ files, onRemove }) => {
  if (!files.length) return null;

  return (
    <div className="flex flex-wrap gap-3 mt-3">
      {files.map((file, index) => {
        const objectUrl = URL.createObjectURL(file);
        return (
          <div
            key={`${file.name}-${index}`}
            className="relative w-24 h-24 rounded-lg overflow-hidden border border-slate-700 bg-slate-800"
          >
            <img src={objectUrl} alt={file.name} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-1 hover:bg-black"
              aria-label="Remove attachment"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[10px] text-center text-slate-200 py-1 px-1">
              {file.name}
            </div>
          </div>
        );
      })}
    </div>
  );
};


