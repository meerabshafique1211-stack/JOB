import { NextResponse, type NextRequest } from 'next/server';
import { requireOwner } from '@/lib/supabase/server';
import { markdownToDocx, safeFilename } from '@/lib/documents';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireOwner();
  const { id } = await params;
  const format = new URL(request.url).searchParams.get('format') ?? 'original';
  const { data: doc } = await supabase.from('cv_documents').select('*').eq('id', id).maybeSingle();
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const name = safeFilename(doc.title);
  if (format === 'original' && doc.storage_path) {
    const { data, error } = await supabase.storage.from('documents').download(doc.storage_path);
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'missing' }, { status: 500 });
    const ext = doc.storage_path.split('.').pop();
    return new NextResponse(new Uint8Array(await data.arrayBuffer()), {
      headers: { 'content-type': doc.mime_type ?? 'application/octet-stream', 'content-disposition': `attachment; filename="${name}.${ext}"` },
    });
  }
  if (format === 'txt') {
    return new NextResponse(doc.content ?? '', { headers: { 'content-type': 'text/plain; charset=utf-8', 'content-disposition': `attachment; filename="${name}.txt"` } });
  }
  const buf = await markdownToDocx(doc.content ?? '');
  return new NextResponse(new Uint8Array(buf), {
    headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'content-disposition': `attachment; filename="${name}.docx"` },
  });
}
