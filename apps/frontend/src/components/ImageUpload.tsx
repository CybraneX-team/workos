import React, { useState } from 'react';
import { UploadCloud, Image as ImageIcon } from 'lucide-react';

export function ImageUpload({ value, onChange, deptColor }: { value: string; onChange: (v: string) => void; deptColor: string }) {
  const [isDragging, setIsDragging] = useState(false);
  
  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) onChange(result);
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div
      className="relative flex flex-col items-center justify-center rounded-lg overflow-hidden transition-all group"
      style={{
        border: `1px dashed ${isDragging ? deptColor : 'rgba(255,255,255,0.15)'}`,
        background: isDragging ? `${deptColor}10` : 'rgba(255,255,255,0.02)',
        height: 200,
        cursor: 'pointer',
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => document.getElementById('avatar-upload')?.click()}
    >
      <input
        id="avatar-upload"
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFile(e.target.files[0]);
          }
        }}
      />
      {value ? (
        <>
          <img src={value} alt="Avatar Preview" className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-30 transition-opacity" />
          <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <UploadCloud className="w-6 h-6 mb-1.5" style={{ color: deptColor }} />
            <span className="text-[11px] font-medium" style={{ color: deptColor }}>Replace photo</span>
          </div>
        </>
      ) : (
        <>
          <ImageIcon className="w-8 h-8 mb-2 opacity-50 transition-all group-hover:scale-110" style={{ color: isDragging ? deptColor : '#fff' }} />
          <span className="text-[11px] opacity-60 text-center px-4" style={{ color: isDragging ? deptColor : '#fff' }}>
            Click or drag & drop<br/>an image here
          </span>
        </>
      )}
    </div>
  );
}
