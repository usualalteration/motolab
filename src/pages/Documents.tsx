import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGarage } from "@/contexts/GarageContext";
import { api, getToken } from "@/lib/api";
import type { DocFile } from "@/types";
import { toast } from "sonner";
import {
  FileText, Upload, Download, Trash2, Loader2, Paperclip, Receipt, BookOpen,
} from "@/components/icons";
import MotorcycleSelector from "@/components/MotorcycleSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";

const DOC_TYPES = [
  { value: "receipt", label: "Receipt" },
  { value: "manual", label: "Technical manual" },
  { value: "photo", label: "Photograph" },
  { value: "invoice", label: "Invoice" },
  { value: "document", label: "Document" },
];

function docTypeIcon(type: string | null) {
  if (type === "receipt" || type === "invoice") return Receipt;
  if (type === "manual") return BookOpen;
  return Paperclip;
}

function fmtSize(bytes: number | null | undefined) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Documents() {
  const { selected, selectedId, motorcycles } = useGarage();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("document");
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: docs = [], isLoading } = useQuery<DocFile[]>({
    queryKey: ["documents", selectedId],
    queryFn: () =>
      api.get<DocFile[]>(`/api/my/v1/documents?motorcycleId=${selectedId}`),
    enabled: selectedId !== null,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file || !selectedId) throw new Error("Select a file");
      // 1. Request a presigned upload URL.
      const up = await api.post<{ uploadUrl: string; s3Key: string; contentType: string }>(
        "/api/my/v1/documents",
        { action: "upload-url", motorcycleId: selectedId, filename: file.name, contentType: file.type || "application/octet-stream" },
      );
      // 2. PUT the file directly to object storage.
      const putRes = await fetch(up.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!putRes.ok) throw new Error(`Upload failed: ${putRes.status}`);
      // 3. Confirm and persist metadata.
      return api.post<DocFile>("/api/my/v1/documents", {
        action: "confirm",
        motorcycleId: selectedId,
        s3Key: up.s3Key,
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        docType,
      });
    },
    onSuccess: () => {
      toast.success("Document uploaded");
      setOpen(false);
      setFile(null);
      qc.invalidateQueries({ queryKey: ["documents", selectedId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadMutation = useMutation({
    mutationFn: async (id: number) => {
      const data = await api.get<{ downloadUrl: string; document: DocFile }>(`/api/my/v1/documents/${id}`);
      return data.downloadUrl;
    },
    onSuccess: (url) => {
      window.open(url, "_blank");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.del(`/api/my/v1/documents/${id}`),
    onSuccess: () => {
      toast.success("Document deleted");
      qc.invalidateQueries({ queryKey: ["documents", selectedId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    uploadMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground">Receipts, manuals, photos and technical files</p>
        </div>
        <div className="flex items-center gap-2">
          <MotorcycleSelector />
          {selected && (
            <Button onClick={() => setOpen(true)}><Upload className="h-4 w-4" /> Upload</Button>
          )}
        </div>
      </div>

      {motorcycles.length === 0 ? (
        <Empty text="Register a motorcycle first to store documents." />
      ) : !selected ? (
        <Empty text="Select a motorcycle to view its documents." />
      ) : isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-md bg-muted/30" />)}</div>
      ) : docs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center space-y-4 py-16 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/40" />
            <div>
              <h2 className="font-bold">No documents stored</h2>
              <p className="mt-1 text-sm text-muted-foreground">Upload receipts, manuals or photos for this {selected.brand} {selected.model}.</p>
            </div>
            <Button onClick={() => setOpen(true)}><Upload className="h-4 w-4" /> Upload document</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {docs.map((d) => {
                const Icon = docTypeIcon(d.docType);
                return (
                  <li key={d.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-secondary/10">
                        <Icon className="h-4 w-4 text-secondary" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{d.filename}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {d.docType && <Badge variant="muted" className="px-1.5 py-0">{d.docType}</Badge>}
                          <span>{fmtSize(d.sizeBytes)}</span>
                          {d.createdAt && <span>· {d.createdAt.slice(0, 10)}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => downloadMutation.mutate(d.id)} disabled={downloadMutation.isPending}>
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        onClick={() => deleteMutation.mutate(d.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Upload document</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="docType">Document type</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger id="docType"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="file">File</Label>
              <Input id="file" name="file" type="file" ref={fileRef}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
              {file && <p className="text-xs text-muted-foreground">{file.name} · {fmtSize(file.size)}</p>}
            </div>
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
              Files are uploaded directly to S3-compatible object storage via a
              presigned URL, then metadata is recorded for this motorcycle.
            </div>
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
              <Button type="submit" disabled={uploadMutation.isPending || !file}>
                {uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Upload
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center space-y-2 py-20 text-center">
        <FileText className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  );
}
