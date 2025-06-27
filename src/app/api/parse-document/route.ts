import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: '파일이 필요합니다.' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text = '';

    // 파일 확장자 확인
    const fileName = file.name.toLowerCase();
    const isDocx = fileName.endsWith('.docx') || 
                   file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const isTxt = fileName.endsWith('.txt') || file.type === 'text/plain';

    if (isDocx) {
      // DOCX 파일 처리
      try {
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
      } catch (docxError) {
        console.error('DOCX 파싱 오류:', docxError);
        return NextResponse.json(
          { error: 'DOCX 파일을 읽을 수 없습니다. 파일이 손상되었거나 올바른 형식이 아닐 수 있습니다.' },
          { status: 400 }
        );
      }
    } else if (isTxt) {
      // TXT 파일 처리
      text = buffer.toString('utf-8');
    } else {
      return NextResponse.json(
        { error: `지원하지 않는 파일 형식입니다. (지원 형식: DOCX, TXT)\n업로드된 파일: ${file.name}, MIME 타입: ${file.type}` },
        { status: 400 }
      );
    }

    if (!text.trim()) {
      return NextResponse.json(
        { error: '문서에서 텍스트를 추출할 수 없습니다.' },
        { status: 400 }
      );
    }

    return NextResponse.json({ text: text.trim() });

  } catch (error) {
    console.error('문서 파싱 오류:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: `문서 파싱 중 오류가 발생했습니다: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: '문서 파싱 중 알 수 없는 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
} 