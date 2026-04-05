import { useState, useRef } from "react";
import { MobileLayout } from "@/components/layout/MobileLayout";
import {
  useListDocuments,
  useCreateDocument,
  useDeleteDocument,
  useUpdateDocument,
  getListDocumentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { FileText, Upload, Trash2, ExternalLink, CheckCircle2, Loader2, Star } from "lucide-react";
import { usePermissions } from "@/App";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type UploadStep = "idle" | "file-selected" | "working" | "done" | "error";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function uploadFileToServer(
  file: File,
  onProgress: (pct: number) => void
): Promise<{ objectPath: string; filename: string; contentType: string; fileSize: number }> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/storage/upload");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 90));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Invalid server response"));
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.error || `Upload failed (${xhr.status})`));
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.timeout = 120_000;

    xhr.send(formData);
  });
}

export default function Documents() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [uploadStep, setUploadStep] = useState<UploadStep>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusText, setStatusText] = useState("");

  const { data: documents, isLoading } = useListDocuments({
    query: { queryKey: getListDocumentsQueryKey() },
  });

  const createDocument = useCreateDocument();
  const deleteDocument = useDeleteDocument();
  const updateDocument = useUpdateDocument();

  const { can } = usePermissions();
  const invalidateDocs = () => queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });

  const resetSheet = () => {
    setUploadStep("idle");
    setSelectedFile(null);
    setTitle("");
    setDescription("");
    setEffectiveDate("");
    setUploadError(null);
    setUploadProgress(0);
    setStatusText("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setTitle((prev) => prev || file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
    setUploadStep("file-selected");
    setUploadError(null);
  };

  const handleUploadAndSave = async () => {
    if (!selectedFile || !title.trim()) return;
    setUploadStep("working");
    setUploadError(null);
    setUploadProgress(0);
    setStatusText("Uploading file...");

    try {
      const result = await uploadFileToServer(selectedFile, (pct) => {
        setUploadProgress(pct);
      });

      setUploadProgress(95);
      setStatusText("Saving document record...");

      await new Promise<void>((resolve, reject) => {
        createDocument.mutate(
          {
            data: {
              title: title.trim(),
              description: description.trim() || null,
              filename: result.filename,
              objectPath: result.objectPath,
              contentType: result.contentType,
              fileSize: formatFileSize(result.fileSize),
              isCurrent: true,
              effectiveDate: effectiveDate || null,
            },
          },
          {
            onSuccess: () => { invalidateDocs(); resolve(); },
            onError: (err) => reject(err),
          }
        );
      });

      setUploadProgress(100);
      setUploadStep("done");
      setTimeout(() => { setSheetOpen(false); resetSheet(); }, 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed. Please try again.";
      setUploadError(msg);
      setUploadStep("error");
    }
  };

  const handleSetCurrent = (id: number) => {
    documents?.forEach((doc) => {
      if (doc.isCurrent && doc.id !== id) {
        updateDocument.mutate({ id: doc.id, data: { isCurrent: false } });
      }
    });
    updateDocument.mutate({ id, data: { isCurrent: true } }, { onSuccess: invalidateDocs });
  };

  const handleDelete = (id: number) => {
    deleteDocument.mutate({ id }, { onSuccess: invalidateDocs });
  };

  const handleOpenDocument = (doc: { objectPath: string }) => {
    window.open(`/api/storage${doc.objectPath}`, "_blank", "noopener");
  };

  const currentDoc = documents?.find((d) => d.isCurrent);
  const otherDocs = documents?.filter((d) => !d.isCurrent) ?? [];

  return (
    <MobileLayout>
      <div className="p-5 space-y-5">
        <header className="flex items-start justify-between mt-2">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">CBA Documents</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Collective Bargaining Agreements</p>
          </div>
          {can("documents.upload") && (
            <Button
              size="sm"
              className="rounded-xl h-10 gap-1.5 font-bold text-xs uppercase tracking-wider shrink-0"
              onClick={() => { setSheetOpen(true); resetSheet(); }}
            >
              <Upload className="w-4 h-4" /> Upload
            </Button>
          )}
        </header>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
        ) : (documents?.length ?? 0) === 0 ? (
          <div className="py-16 text-center bg-card border border-dashed border-border rounded-xl">
            <FileText className="w-14 h-14 mx-auto text-muted-foreground opacity-20 mb-4" />
            <p className="font-semibold text-muted-foreground">No CBA uploaded yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-5">Upload the contract to give stewards quick access.</p>
            {can("documents.upload") && (
              <Button onClick={() => { setSheetOpen(true); resetSheet(); }} className="rounded-xl gap-2">
                <Upload className="w-4 h-4" /> Upload CBA
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {currentDoc && (
              <section className="space-y-2.5">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Current Agreement</p>
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Star className="w-3.5 h-3.5 text-primary fill-primary" />
                        <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Active CBA</span>
                      </div>
                      <p className="font-bold text-foreground leading-tight text-base">{currentDoc.title}</p>
                      {currentDoc.description && (
                        <p className="text-sm text-muted-foreground mt-1 leading-snug">{currentDoc.description}</p>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2 text-xs text-muted-foreground">
                        {currentDoc.effectiveDate && <span>Effective {currentDoc.effectiveDate}</span>}
                        {currentDoc.expirationDate && <span>Expires {currentDoc.expirationDate}</span>}
                        {currentDoc.fileSize && <span>{currentDoc.fileSize}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Uploaded {format(new Date(currentDoc.uploadedAt), "MMMM d, yyyy")}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Button size="sm" className="rounded-lg h-9 gap-1.5 text-xs" onClick={() => handleOpenDocument(currentDoc)}>
                        <ExternalLink className="w-3.5 h-3.5" /> Open
                      </Button>
                      {can("documents.upload") && <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-9 w-9 p-0 rounded-lg text-destructive hover:bg-destructive/10">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="max-w-[320px] rounded-2xl">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
                            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="flex-col gap-2">
                            <AlertDialogCancel className="w-full">Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(currentDoc.id)} className="bg-destructive w-full">Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {otherDocs.length > 0 && (
              <section className="space-y-2.5">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Previous Agreements</p>
                {otherDocs.map((doc) => (
                  <div key={doc.id} className="bg-card border border-border rounded-xl p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground text-sm leading-tight">{doc.title}</p>
                        {doc.effectiveDate && (
                          <p className="text-xs text-muted-foreground mt-0.5">Effective {doc.effectiveDate}</p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {can("documents.upload") && (
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-primary" title="Set as current" onClick={() => handleSetCurrent(doc.id)}>
                            <Star className="w-4 h-4" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg" onClick={() => handleOpenDocument(doc)}>
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                        {can("documents.upload") && <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg text-destructive hover:bg-destructive/10">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="max-w-[320px] rounded-2xl">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete document?</AlertDialogTitle>
                              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="flex-col gap-2">
                              <AlertDialogCancel className="w-full">Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(doc.id)} className="bg-destructive w-full">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>}
                      </div>
                    </div>
                  </div>
                ))}
              </section>
            )}
          </div>
        )}
      </div>

      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open && uploadStep === "working") return;
          setSheetOpen(open);
          if (!open) resetSheet();
        }}
      >
        <SheetContent side="bottom" className="h-auto max-h-[92dvh] rounded-t-2xl overflow-y-auto">
          <SheetHeader className="mb-5">
            <SheetTitle className="text-lg font-extrabold tracking-tight">Upload CBA Document</SheetTitle>
          </SheetHeader>

          {uploadStep === "done" ? (
            <div className="py-10 text-center">
              <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-3" />
              <p className="font-bold text-lg">Document uploaded</p>
              <p className="text-sm text-muted-foreground mt-1">Your CBA is now available for stewards.</p>
            </div>
          ) : uploadStep === "working" ? (
            <div className="py-8 space-y-5 text-center pb-8">
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
              <p className="text-sm font-medium text-muted-foreground">{statusText}</p>
              {uploadProgress > 0 && (
                <div className="mx-4">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300 rounded-full"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{uploadProgress}%</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 pb-8">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                  File (PDF or Word document)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="hidden"
                  onChange={handleFileSelected}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "w-full border-2 border-dashed rounded-xl p-6 text-center transition-colors",
                    selectedFile ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  )}
                >
                  {selectedFile ? (
                    <div>
                      <FileText className="w-8 h-8 text-primary mx-auto mb-2" />
                      <p className="text-sm font-semibold text-foreground">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatFileSize(selectedFile.size)} — tap to change</p>
                    </div>
                  ) : (
                    <div>
                      <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                      <p className="text-sm font-medium text-muted-foreground">Tap to select PDF or Word doc</p>
                    </div>
                  )}
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. 2024–2027 Collective Bargaining Agreement"
                  className="h-12 rounded-xl bg-card"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notes (optional)</label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Ratified March 2024"
                  className="min-h-[60px] rounded-xl bg-card resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Effective Date (optional)</label>
                <Input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="h-12 rounded-xl bg-card"
                />
              </div>

              {uploadError && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
                  <p className="text-sm text-destructive">{uploadError}</p>
                </div>
              )}

              <Button
                className="w-full h-12 rounded-xl font-bold text-base mt-2"
                onClick={handleUploadAndSave}
                disabled={!selectedFile || !title.trim()}
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload & Save
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </MobileLayout>
  );
}
