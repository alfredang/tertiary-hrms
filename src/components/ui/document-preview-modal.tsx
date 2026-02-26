"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, Download, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface DocumentPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  fileName: string;
}

function isImageFile(url: string, fileName: string): boolean {
  const ext = (fileName || url).split(".").pop()?.toLowerCase() || "";
  return ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);
}

export function DocumentPreviewModal({
  open,
  onOpenChange,
  url,
  fileName,
}: DocumentPreviewModalProps) {
  const isImage = isImageFile(url, fileName);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]",
            "w-[90vw] max-w-2xl max-h-[90vh]",
            "bg-gray-950 border border-gray-800 rounded-lg shadow-lg",
            "flex flex-col",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <p className="text-sm font-medium text-white truncate pr-4">
              {fileName}
            </p>
            <DialogPrimitive.Close className="rounded-sm text-gray-400 hover:text-white transition-colors">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-[200px]">
            {isImage ? (
              <img
                src={url}
                alt={fileName}
                className="max-w-full max-h-[70vh] object-contain rounded"
              />
            ) : (
              <div className="text-center space-y-3">
                <FileText className="h-16 w-16 text-gray-600 mx-auto" />
                <p className="text-sm text-gray-400">
                  Preview not available for this file type
                </p>
                <p className="text-xs text-gray-500">{fileName}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-800">
            <Button asChild variant="outline" size="sm" className="w-full border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800">
              <a href={url} download={fileName} target="_blank" rel="noopener noreferrer">
                <Download className="h-4 w-4 mr-2" />
                Download
              </a>
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
