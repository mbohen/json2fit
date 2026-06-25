import { Injectable } from '@angular/core';
import JSZip from 'jszip';
import { ConversionResult } from '@shared/models';

@Injectable({ providedIn: 'root' })
export class DownloadService {
  downloadText(filename: string, content: string, mimeType: string): void {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    this.saveBlob(filename, blob);
  }

  downloadBinary(filename: string, content: Uint8Array, mimeType: string): void {
    const copy = new Uint8Array(content.byteLength);
    copy.set(content);
    const blob = new Blob([copy.buffer], { type: mimeType });
    this.saveBlob(filename, blob);
  }

  downloadResult(result: ConversionResult): void {
    if (typeof result.content === 'string') {
      this.downloadText(result.filename, result.content, result.mimeType);
    } else {
      this.downloadBinary(result.filename, result.content, result.mimeType);
    }
  }

  async downloadZip(filename: string, results: ConversionResult[]): Promise<void> {
    const zip = new JSZip();
    for (const result of results) {
      if (result.status === 'success' && result.content) {
        zip.file(result.filename, result.content);
      }
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    this.saveBlob(filename, blob);
  }

  downloadBlob(filename: string, blob: Blob): void {
    this.saveBlob(filename, blob);
  }

  private saveBlob(filename: string, blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
