'use client';

import { useState, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';

interface WordDefinition {
  word: string;
  definition: string[];
  example: string;
}

interface Footnote {
  id: string;
  word: string;
  definition: string;
  position: number;
}

interface SelectedWord {
  id: string;
  word: string;
  position: number;
}

interface WordDefinitionResult {
  wordId: string;
  word: string;
  definition: WordDefinition | null;
  selectedDefinitions: boolean[];
  isLoading: boolean;
  error?: string;
  footnoteId?: string; // 각주가 삽입된 경우 각주 ID
}

export default function Home() {
  const [document, setDocument] = useState<string>('');
  const [documentWithFootnotes, setDocumentWithFootnotes] = useState<string>('');
  const [selectedWords, setSelectedWords] = useState<SelectedWord[]>([]);
  const [wordDefinitions, setWordDefinitions] = useState<WordDefinitionResult[]>([]);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [footnotes, setFootnotes] = useState<Footnote[]>([]);
  const [inputMethod, setInputMethod] = useState<'upload' | 'text'>('upload');
  const [tempText, setTempText] = useState<string>('');
  const [uploadedFile, setUploadedFile] = useState<string>('');
  const documentRef = useRef<HTMLDivElement>(null);

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    // 클라이언트 사이드에서 파일 확장자 검증
    const fileName = file.name.toLowerCase();
    const isValidFile = fileName.endsWith('.docx') || fileName.endsWith('.txt');
    
    if (!isValidFile) {
      alert(`지원하지 않는 파일 형식입니다.\n업로드된 파일: ${file.name}\n지원 형식: .docx, .txt`);
      return;
    }

    setIsGeneratingAll(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/parse-document', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '파일 파싱에 실패했습니다.');
      }

      const { text } = await response.json();
      setUploadedFile(text);
    } catch (error) {
      console.error('파일 읽기 오류:', error);
      alert(error instanceof Error ? error.message : '파일을 읽는데 실패했습니다.');
    } finally {
      setIsGeneratingAll(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/octet-stream': ['.docx'], // 일부 브라우저에서 DOCX를 이렇게 인식
      'text/plain': ['.txt']
    },
    multiple: false
  });

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      const selectedText = selection.toString().trim();
      
      // 너무 긴 텍스트는 제외 (50자 이상)
      if (selectedText.length > 50) {
        selection.removeAllRanges();
        return;
      }
      
      // 이미 선택된 단어인지 확인
      const isAlreadySelected = selectedWords.some(word => word.word === selectedText);
      
      if (!isAlreadySelected) {
        const newWord: SelectedWord = {
          id: `word-${Date.now()}-${Math.random()}`,
          word: selectedText,
          position: documentWithFootnotes.indexOf(selectedText)
        };
        
        // 원본 문서에서 선택된 단어를 [[단어]] 형태로 표시 (첫 번째 발견되는 것만)
        const firstOccurrenceIndex = documentWithFootnotes.indexOf(selectedText);
        
        if (firstOccurrenceIndex !== -1) {
          const updatedDocument = 
            documentWithFootnotes.substring(0, firstOccurrenceIndex) + 
            `[[${selectedText}]]` + 
            documentWithFootnotes.substring(firstOccurrenceIndex + selectedText.length);
          
          setSelectedWords([...selectedWords, newWord]);
          setDocumentWithFootnotes(updatedDocument);
        }
      }
      
      // 선택 해제
      selection.removeAllRanges();
    }
  };

  const removeSelectedWord = (wordId: string) => {
    const wordToRemove = selectedWords.find(word => word.id === wordId);
    if (wordToRemove) {
      // 문서에서 [[단어]] 형태를 원래 단어로 복원
      const bracketRegex = new RegExp(`\\[\\[${wordToRemove.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\]`, 'gi');
      const updatedDocument = documentWithFootnotes.replace(bracketRegex, wordToRemove.word);
      setDocumentWithFootnotes(updatedDocument);
    }
    
    setSelectedWords(selectedWords.filter(word => word.id !== wordId));
    setWordDefinitions(wordDefinitions.filter(def => def.wordId !== wordId));
  };

  const clearAllSelectedWords = () => {
    // 문서에서 모든 [[단어]] 형태를 원래 단어로 복원
    let updatedDocument = documentWithFootnotes;
    selectedWords.forEach(word => {
      const bracketRegex = new RegExp(`\\[\\[${word.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\]`, 'gi');
      updatedDocument = updatedDocument.replace(bracketRegex, word.word);
    });
    setDocumentWithFootnotes(updatedDocument);
    
    setSelectedWords([]);
    setWordDefinitions([]);
  };

  const resetToHome = () => {
    setDocument('');
    setDocumentWithFootnotes('');
    setSelectedWords([]);
    setWordDefinitions([]);
    setFootnotes([]);
    setTempText('');
    setUploadedFile('');
    setInputMethod('upload');
  };

  const extractContextSentences = (text: string, word: string, wordPosition: number) => {
    const sentences = text.split(/[.!?]+/).filter(sentence => sentence.trim().length > 0);
    
    let targetSentenceIndex = -1;
    let currentPosition = 0;
    
    for (let i = 0; i < sentences.length; i++) {
      const sentenceEnd = currentPosition + sentences[i].length;
      if (wordPosition >= currentPosition && wordPosition <= sentenceEnd) {
        targetSentenceIndex = i;
        break;
      }
      currentPosition = sentenceEnd + 1;
    }
    
    if (targetSentenceIndex === -1) return sentences.slice(0, 7).join('. ');
    
    const startIndex = Math.max(0, targetSentenceIndex - 3);
    const endIndex = Math.min(sentences.length, targetSentenceIndex + 4);
    
    const contextSentences = sentences.slice(startIndex, endIndex);
    
    // 선택된 단어가 포함된 문장에 대괄호 추가
    const relativeTargetIndex = targetSentenceIndex - startIndex;
    if (relativeTargetIndex >= 0 && relativeTargetIndex < contextSentences.length) {
      contextSentences[relativeTargetIndex] = contextSentences[relativeTargetIndex].replace(
        new RegExp(`\\b${word}\\b`, 'i'),
        `[[${word}]]`
      );
    }
    
    return contextSentences.join('. ');
  };

  // 개별 단어 정의 생성
  const handleGenerateDefinition = async (wordId: string, word: string) => {
    if (!word || !document) return;

    // 해당 단어의 로딩 상태 업데이트
    setWordDefinitions(prev => {
      const existing = prev.find(def => def.wordId === wordId);
      if (existing) {
        return prev.map(def => 
          def.wordId === wordId ? { ...def, isLoading: true, error: undefined } : def
        );
      } else {
        return [...prev, {
          wordId,
          word,
          definition: null,
          selectedDefinitions: [],
          isLoading: true
        }];
      }
    });

    try {
      const wordPosition = document.indexOf(word);
      const contextText = extractContextSentences(document, word, wordPosition);

      const response = await fetch('/api/generate-definition', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: contextText,
          word: word
        }),
      });

      if (!response.ok) {
        throw new Error('정의 생성에 실패했습니다.');
      }

      const definition: WordDefinition = await response.json();
      
      setWordDefinitions(prev => 
        prev.map(def => 
          def.wordId === wordId 
            ? { 
                ...def, 
                definition, 
                selectedDefinitions: new Array(definition.definition.length).fill(true),
                isLoading: false 
              }
            : def
        )
      );
    } catch (error) {
      console.error('정의 생성 오류:', error);
      setWordDefinitions(prev => 
        prev.map(def => 
          def.wordId === wordId 
            ? { ...def, isLoading: false, error: '정의 생성에 실패했습니다.' }
            : def
        )
      );
    }
  };

  // 모든 단어 정의 일괄 생성
  const handleGenerateAllDefinitions = async () => {
    if (selectedWords.length === 0) return;

    setIsGeneratingAll(true);
    
    // 모든 단어를 WordDefinitionResult로 초기화
    const initialDefinitions: WordDefinitionResult[] = selectedWords.map(word => ({
      wordId: word.id,
      word: word.word,
      definition: null,
      selectedDefinitions: [],
      isLoading: true
    }));
    
    setWordDefinitions(initialDefinitions);

    // 병렬로 모든 정의 생성
    const promises = selectedWords.map(async (selectedWord) => {
      try {
        const wordPosition = document.indexOf(selectedWord.word);
        const contextText = extractContextSentences(document, selectedWord.word, wordPosition);

        const response = await fetch('/api/generate-definition', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: contextText,
            word: selectedWord.word
          }),
        });

        if (!response.ok) {
          throw new Error('정의 생성에 실패했습니다.');
        }

        const definition: WordDefinition = await response.json();
        
        setWordDefinitions(prev => 
          prev.map(def => 
            def.wordId === selectedWord.id 
              ? { 
                  ...def, 
                  definition, 
                  selectedDefinitions: new Array(definition.definition.length).fill(true),
                  isLoading: false 
                }
              : def
          )
        );
      } catch (error) {
        console.error(`${selectedWord.word} 정의 생성 오류:`, error);
        setWordDefinitions(prev => 
          prev.map(def => 
            def.wordId === selectedWord.id 
              ? { ...def, isLoading: false, error: '정의 생성에 실패했습니다.' }
              : def
          )
        );
      }
    });

    await Promise.all(promises);
    setIsGeneratingAll(false);
  };

  const handleDefinitionToggle = (wordId: string, definitionIndex: number) => {
    setWordDefinitions(prev => 
      prev.map(def => {
        if (def.wordId === wordId) {
          const newSelectedDefinitions = [...def.selectedDefinitions];
          newSelectedDefinitions[definitionIndex] = !newSelectedDefinitions[definitionIndex];
          return { ...def, selectedDefinitions: newSelectedDefinitions };
        }
        return def;
      })
    );
  };

  // 각주 번호를 문서 위치 순서대로 재정렬하는 함수
  const renumberFootnotesByPosition = (document: string, footnotesList: Footnote[]) => {
    // 문서에서 각주 위치 찾기
    const footnotePositions: Array<{footnote: Footnote, position: number}> = [];
    
    footnotesList.forEach(footnote => {
      const escapedWord = footnote.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const footnoteRegex = new RegExp(`${escapedWord}<sup>\\d+\\)</sup>`, 'i');
      const match = document.match(footnoteRegex);
      if (match) {
        const position = document.indexOf(match[0]);
        footnotePositions.push({ footnote, position });
      }
    });
    
    // 문서 위치 순서대로 정렬
    footnotePositions.sort((a, b) => a.position - b.position);
    
    // 새로운 번호로 업데이트
    let updatedDocument = document;
    const renumberedFootnotes = footnotePositions.map((item, index) => {
      const newNumber = index + 1;
      const escapedWord = item.footnote.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const oldFootnoteRegex = new RegExp(`${escapedWord}<sup>\\d+\\)</sup>`, 'i');
      updatedDocument = updatedDocument.replace(oldFootnoteRegex, `${item.footnote.word}<sup>${newNumber})</sup>`);
      
      return {
        ...item.footnote,
        position: newNumber
      };
    });
    
    return { document: updatedDocument, footnotes: renumberedFootnotes };
  };

  // 각주 번호 수동 재정렬 함수
  const handleRenumberFootnotes = () => {
    if (footnotes.length === 0) return;
    const { document: finalDocument, footnotes: renumberedFootnotes } = renumberFootnotesByPosition(documentWithFootnotes, footnotes);
    setDocumentWithFootnotes(finalDocument);
    setFootnotes(renumberedFootnotes);
  };

  // DOCX 파일 다운로드 함수
  const handleDownloadDocx = async () => {
    if (!documentWithFootnotes) return;

    try {
      // 각주 번호가 포함된 텍스트를 파싱하여 TextRun 배열로 변환
      const parseTextWithFootnotes = (text: string): TextRun[] => {
        const parts = text.split(/(<sup>\d+\)<\/sup>)/);
        const runs: TextRun[] = [];
        
        parts.forEach(part => {
          if (part.match(/<sup>(\d+)\)<\/sup>/)) {
            const footnoteNumber = part.match(/<sup>(\d+)\)<\/sup>/)?.[1];
            if (footnoteNumber) {
              runs.push(new TextRun({
                text: footnoteNumber + ')',
                superScript: true,
                size: 16
              }));
            }
          } else if (part.trim()) {
            runs.push(new TextRun(part));
          }
        });
        
        return runs;
      };

      // HTML 태그 제거 및 텍스트 정리 (각주 번호는 유지)
      const cleanText = documentWithFootnotes
        .replace(/<[^>]*(?!sup)>/g, '') // sup 태그를 제외한 모든 HTML 태그 제거
        .replace(/\[\[([^\]]+)\]\]/g, '$1') // [[단어]] 형태를 단어로 변환
        .trim();

      // 문서 본문 단락들 생성 (각주 번호 포함)
      const paragraphs = cleanText
        .split(/\n+/)
        .filter(line => line.trim().length > 0)
        .map(line => new Paragraph({
          children: parseTextWithFootnotes(line.trim()),
          spacing: { after: 200 }
        }));

      // 각주 섹션 추가
      const footnoteSection = [];
      if (footnotes.length > 0) {
        // 각주 제목
        footnoteSection.push(new Paragraph({
          children: [new TextRun({
            text: "각주",
            bold: true,
            size: 28
          })],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 }
        }));

        // 각주 목록 (위치 순서대로 정렬)
        const sortedFootnotes = [...footnotes].sort((a, b) => a.position - b.position);
        sortedFootnotes.forEach(footnote => {
          // 각주 정의에서 줄바꿈을 처리
          const definitionLines = footnote.definition.split('\n');
          const children: TextRun[] = [
            new TextRun({
              text: `${footnote.position}) `,
              bold: true
            })
          ];
          
          definitionLines.forEach((line, index) => {
            if (index > 0) {
              children.push(new TextRun({
                text: '\n' + line,
                break: 1
              }));
            } else {
              children.push(new TextRun(line));
            }
          });

          footnoteSection.push(new Paragraph({
            children: children,
            spacing: { after: 150 }
          }));
        });
      }

      // DOCX 문서 생성
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            // 제목
            new Paragraph({
              children: [new TextRun({
                text: "문서 각주 생성 결과",
                bold: true,
                size: 32
              })],
              heading: HeadingLevel.HEADING_1,
              spacing: { after: 400 }
            }),
            
            // 본문
            ...paragraphs,
            
            // 각주 섹션
            ...footnoteSection
          ]
        }]
      });

      // 파일 생성 및 다운로드
      const blob = await Packer.toBlob(doc);
      const fileName = `footnote_document_${new Date().toISOString().slice(0, 10)}.docx`;
      saveAs(blob, fileName);
      
    } catch (error) {
      console.error('DOCX 다운로드 오류:', error);
      alert('DOCX 파일 다운로드 중 오류가 발생했습니다.');
    }
  };

  const handleInsertFootnote = (wordId: string) => {
    const wordDef = wordDefinitions.find(def => def.wordId === wordId);
    if (!wordDef?.definition) return;

    const selectedDefs = wordDef.definition.definition.filter((_, index) => wordDef.selectedDefinitions[index]);
    // 예시도 선택된 경우 포함
    if (wordDef.selectedDefinitions[wordDef.definition.definition.length]) {
      selectedDefs.push(`예시: ${wordDef.definition.example}`);
    }
    
    if (selectedDefs.length === 0) return;

    const footnoteId = `footnote-${Date.now()}-${Math.random()}`;
    // 각주 형식을 구조화된 형태로 변경 - 줄바꿈 추가  
    const formattedDefinitions = selectedDefs.map(def => `ㆍ${def}`).join('\n');
    const footnoteText = `${wordDef.word}\n${formattedDefinitions}`;
    
    // 임시 번호로 각주 생성 (나중에 재정렬됨)
    const newFootnote: Footnote = {
      id: footnoteId,
      word: wordDef.word,
      definition: footnoteText,
      position: 999 // 임시 번호
    };

    // 문서에 각주 번호 추가 (대괄호가 있는 경우 고려)
    const bracketWordRegex = new RegExp(`\\[\\[${wordDef.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\]`, 'i');
    const normalWordRegex = new RegExp(`\\b${wordDef.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    
    let updatedDocument = documentWithFootnotes;
    if (bracketWordRegex.test(updatedDocument)) {
      // [[단어]] 형태인 경우
      updatedDocument = updatedDocument.replace(bracketWordRegex, `${wordDef.word}<sup>${newFootnote.position})</sup>`);
    } else {
      // 일반 단어인 경우
      updatedDocument = updatedDocument.replace(normalWordRegex, `${wordDef.word}<sup>${newFootnote.position})</sup>`);
    }

    const updatedFootnotes = [...footnotes, newFootnote];
    
    // 각주 번호를 위치 순서대로 재정렬
    const { document: finalDocument, footnotes: renumberedFootnotes } = renumberFootnotesByPosition(updatedDocument, updatedFootnotes);
    
    setDocumentWithFootnotes(finalDocument);
    setFootnotes(renumberedFootnotes);
    
    // wordDefinitions에서 각주 ID 추가 (삭제하지 않음)
    setWordDefinitions(prevDefs => 
      prevDefs.map(def => 
        def.wordId === wordId 
          ? { ...def, footnoteId: footnoteId }
          : def
      )
    );
  };

  const handleRemoveFootnote = (wordId: string) => {
    const wordDef = wordDefinitions.find(def => def.wordId === wordId);
    if (!wordDef?.footnoteId) return;

    const footnoteToRemove = footnotes.find(fn => fn.id === wordDef.footnoteId);
    if (!footnoteToRemove) return;

    // 문서에서 각주 번호 제거 (정확한 매칭을 위해 escape 처리)
    const escapedWord = wordDef.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const footnoteRegex = new RegExp(`${escapedWord}<sup>\\d+\\)</sup>`, 'g');
    const updatedDocument = documentWithFootnotes.replace(footnoteRegex, `[[${wordDef.word}]]`);

    // 각주 목록에서 제거
    const updatedFootnotes = footnotes.filter(fn => fn.id !== wordDef.footnoteId);
    
    // 각주 번호를 위치 순서대로 재정렬
    const { document: finalDocument, footnotes: renumberedFootnotes } = renumberFootnotesByPosition(updatedDocument, updatedFootnotes);

    setDocumentWithFootnotes(finalDocument);
    setFootnotes(renumberedFootnotes);
    
    // wordDefinitions에서 각주 ID 제거
    setWordDefinitions(prevDefs => 
      prevDefs.map(def => 
        def.wordId === wordId 
          ? { ...def, footnoteId: undefined }
          : def
      )
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white w-12 h-12 rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-xl font-bold">📚</span>
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                문서 각주 생성 시스템
              </h1>
              <p className="text-gray-600 mt-1">AI로 쉽고 빠른 전문용어 설명</p>
            </div>
          </div>
          {document && (
            <div className="flex items-center space-x-3">
              <button
                onClick={handleDownloadDocx}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-300 flex items-center space-x-2 shadow-md hover:shadow-lg text-sm"
              >
                <span>📄</span>
                <span>DOCX 다운로드</span>
              </button>
              <button
                onClick={resetToHome}
                className="px-4 py-2 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-lg hover:from-gray-700 hover:to-gray-800 transition-all duration-300 flex items-center space-x-2 shadow-md hover:shadow-lg text-sm"
              >
                <span>←</span>
                <span>새 문서</span>
              </button>
            </div>
          )}
        </div>

        {!document ? (
          <div className="space-y-8">
            {/* 입력 방식 선택 탭 */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden">
              <div className="flex border-b border-gray-200">
                <button
                  onClick={() => setInputMethod('upload')}
                  className={`px-8 py-4 text-sm font-semibold transition-all duration-300 flex items-center space-x-2 ${
                    inputMethod === 'upload'
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span>📂</span>
                  <span>파일 업로드</span>
                </button>
                <button
                  onClick={() => setInputMethod('text')}
                  className={`px-8 py-4 text-sm font-semibold transition-all duration-300 flex items-center space-x-2 ${
                    inputMethod === 'text'
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span>✏️</span>
                  <span>직접 입력</span>
                </button>
              </div>

              {/* 선택된 입력 방식에 따른 내용 */}
              <div className="p-8">
                {inputMethod === 'upload' ? (
                  <div className="space-y-6">
                    <div {...getRootProps()} className="relative border-2 border-dashed border-blue-300/60 rounded-xl p-8 text-center cursor-pointer hover:border-purple-400/80 transition-all duration-300 bg-gradient-to-br from-blue-50/40 via-white to-purple-50/40 hover:from-blue-100/60 hover:to-purple-100/60 hover:shadow-lg group">
                      <input {...getInputProps()} />
                      {isDragActive ? (
                        <div className="space-y-3">
                          <div className="text-5xl animate-bounce">📁</div>
                          <p className="text-lg text-purple-600 font-semibold">파일을 여기에 놓으세요!</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="text-5xl text-blue-400 group-hover:scale-105 transition-transform duration-300">📁</div>
                          <div className="space-y-3">
                            <p className="text-lg text-gray-700 font-semibold group-hover:text-blue-600 transition-colors duration-300">파일을 드래그하거나 클릭하여 업로드하세요</p>
                            <div className="flex items-center justify-center space-x-2">
                              <div className="flex items-center space-x-1 bg-white/80 px-3 py-1 rounded-full border border-gray-200 text-xs">
                                <span className="text-blue-500">📄</span>
                                <span className="font-medium text-gray-600">DOCX</span>
                              </div>
                              <div className="flex items-center space-x-1 bg-white/80 px-3 py-1 rounded-full border border-gray-200 text-xs">
                                <span className="text-green-500">📝</span>
                                <span className="font-medium text-gray-600">TXT</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* 업로드된 파일 미리보기 */}
                    {uploadedFile && (
                      <div className="bg-gradient-to-r from-green-50/60 to-emerald-50/60 border border-green-300/50 p-5 rounded-xl shadow-md transition-all duration-300">
                        <div className="flex items-center space-x-3 mb-4">
                          <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white w-8 h-8 rounded-lg flex items-center justify-center">
                            <span className="text-sm">✅</span>
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-green-700">업로드 완료</h3>
                            <p className="text-xs text-green-600">문서 미리보기</p>
                          </div>
                        </div>
                        <div className="bg-white/80 p-4 rounded-lg border border-green-200/50 max-h-32 overflow-y-auto text-sm text-gray-700 leading-relaxed">
                          {uploadedFile.substring(0, 200)}
                          {uploadedFile.length > 200 && (
                            <span className="text-green-600 font-medium">...</span>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* 파일 업로드 버튼 */}
                    <div className="flex justify-center">
                      <button
                        onClick={() => {
                          if (uploadedFile) {
                            setDocument(uploadedFile);
                            setDocumentWithFootnotes(uploadedFile);
                          }
                        }}
                        disabled={!uploadedFile}
                        className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-semibold"
                      >
                        🚀 문서 로드
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="relative">
                      <textarea
                        value={tempText}
                        onChange={(e) => setTempText(e.target.value)}
                        className="w-full h-64 p-5 border-2 border-gray-200/60 rounded-xl focus:ring-2 focus:ring-blue-200/60 focus:border-blue-400/70 resize-none text-sm leading-relaxed bg-gradient-to-br from-blue-50/20 via-white to-purple-50/20 transition-all duration-300 shadow-md hover:shadow-lg placeholder:text-gray-400"
                        placeholder="각주를 구성할 글을 입력해 주세요.&#10;&#10;예시:&#10;인공지능은 현대 사회에서 중요한 역할을 하고 있습니다. 머신러닝과 딥러닝 기술의 발전으로 다양한 분야에서 혁신이 일어나고 있습니다."
                      />
                      <div className="absolute top-3 right-3 bg-white/70 px-2 py-1 rounded-md text-xs text-gray-500">
                        {tempText.length}자
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <button
                        onClick={() => {
                          if (tempText.trim()) {
                            setDocument(tempText);
                            setDocumentWithFootnotes(tempText);
                          }
                        }}
                        disabled={!tempText.trim()}
                        className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-semibold"
                      >
                        🚀 문서 로드
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-8">
            {/* 좌측: 원본 문서 */}
            <div className="flex flex-col space-y-6">
              <div className="flex items-center space-x-3">
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white w-8 h-8 rounded-lg flex items-center justify-center">
                  <span>📄</span>
                </div>
                <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">원본 문서</h2>
              </div>
              
              {/* 문서 내용과 각주 - 스크롤 가능 */}
              <div 
                className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 hover:shadow-2xl transition-all duration-300 overflow-y-auto"
                style={{ height: '750px' }}
              >
                <div
                  ref={documentRef}
                  className="p-8 cursor-text document-content"
                  onMouseUp={handleTextSelection}
                  dangerouslySetInnerHTML={{ 
                    __html: documentWithFootnotes
                      .replace(/\n/g, '<br>')
                      .replace(/\[\[([^\]]+)\]\]/g, '<span data-selected-word style="background: linear-gradient(135deg, #dbeafe, #e0e7ff); color: #1e40af; padding: 2px 4px; border-radius: 4px; font-weight: 600; border: 1px solid #3b82f6; box-shadow: 0 1px 2px rgba(59, 130, 246, 0.1);">$1</span>')
                  }}
                />
                
                {/* 각주 목록 */}
                {footnotes.length > 0 && (
                  <div className="mx-8 mb-8 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 p-4 rounded-xl shadow-md">
                    <div className="flex items-center space-x-2 mb-3">
                      <span className="text-xl">📝</span>
                      <h3 className="text-lg font-bold text-amber-700">각주</h3>
                    </div>
                    <div className="space-y-2">
                      {footnotes.map((footnote) => (
                        <div key={footnote.id} className="text-sm leading-relaxed">
                          <span className="font-bold text-amber-600">{footnote.position}.</span> 
                          <span 
                            className="text-gray-700 ml-2"
                            dangerouslySetInnerHTML={{ __html: footnote.definition.replace(/\n/g, '<br>') }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}</div>


            </div>

                        {/* 우측: 단어 정의들 */}
            <div className="flex flex-col space-y-6">
              <div className="flex items-center space-x-3">
                <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white w-8 h-8 rounded-lg flex items-center justify-center">
                  <span>💡</span>
                </div>
                <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">단어 정의</h2>
              </div>

              <div 
                className="overflow-y-auto space-y-6 pr-2" 
                style={{ height: '750px' }}
              >
                {/* 선택된 단어들 표시 */}
                {selectedWords.length > 0 && (
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 p-5 rounded-xl shadow-lg">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-2">
                        <h3 className="text-lg font-semibold text-blue-700">
                          선택된 단어 ({selectedWords.length}개)
                        </h3>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={handleGenerateAllDefinitions}
                          disabled={isGeneratingAll}
                          className="px-3 py-2 text-sm bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-500 transition-all duration-300 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 font-medium"
                        >
                          {isGeneratingAll ? '생성 중...' : '단어 정의'}
                        </button>
                        {footnotes.length > 0 && (
                          <button
                            onClick={handleRenumberFootnotes}
                            className="px-3 py-2 text-sm bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg hover:from-indigo-700 hover:to-blue-700 transition-all duration-300 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 font-medium"
                            title="각주 번호를 문서 내 위치 순서대로 정렬합니다"
                          >
                            번호 정렬
                          </button>
                        )}
                        <button
                          onClick={clearAllSelectedWords}
                          className="px-3 py-2 text-sm bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-300 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 font-medium"
                        >
                          전체 삭제
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedWords.map((selectedWord) => {
                        const wordDef = wordDefinitions.find(def => def.wordId === selectedWord.id);
                        return (
                          <div key={selectedWord.id} className="flex items-center space-x-2 bg-white/80 px-3 py-2 rounded-lg border border-gray-200 hover:shadow-md transition-all duration-300">
                            <span className="font-medium text-gray-800 text-sm">{selectedWord.word}</span>
                            <div className="flex items-center space-x-1">
                              <button
                                onClick={() => handleGenerateDefinition(selectedWord.id, selectedWord.word)}
                                disabled={wordDef?.isLoading || isGeneratingAll}
                                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
                              >
                                {wordDef?.isLoading ? '생성중' : wordDef?.definition ? '재생성' : '정의'}
                              </button>
                              <button
                                onClick={() => removeSelectedWord(selectedWord.id)}
                                className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                              >
                                삭제
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {wordDefinitions.length > 0 ? (
                  <div className="space-y-3">
                  {wordDefinitions.map((wordDef) => (
                    <div key={wordDef.wordId} className="bg-white/80 backdrop-blur-sm p-4 rounded-xl shadow-lg border-2 border-gray-200 hover:shadow-xl transition-all duration-300">
                      <div className="mb-3">
                        <div className={`${
                          wordDef.footnoteId 
                            ? 'bg-gradient-to-r from-green-50 to-emerald-50' 
                            : 'bg-gradient-to-r from-blue-50 to-purple-50'
                        } px-3 py-2 rounded-lg inline-block`}>
                          <h3 className={`text-sm font-semibold ${
                            wordDef.footnoteId ? 'text-green-700' : 'text-blue-700'
                          }`}>
                            선택단어: {wordDef.word} {wordDef.footnoteId && '✅'}
                          </h3>
                        </div>
                      </div>
                      
                      {wordDef.isLoading ? (
                        <div className="text-center py-12">
                          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600 mx-auto"></div>
                          <p className="text-gray-500 mt-4 font-medium">정의 생성 중...</p>
                        </div>
                      ) : wordDef.error ? (
                        <div className="text-center py-12 bg-red-50 rounded-xl border border-red-200">
                          <span className="text-4xl mb-4 block">⚠️</span>
                          <p className="text-red-600 font-medium mb-4">{wordDef.error}</p>
                          <button
                            onClick={() => handleGenerateDefinition(wordDef.wordId, wordDef.word)}
                            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-medium"
                          >
                            🔄 다시 시도
                          </button>
                        </div>
                      ) : wordDef.definition ? (
                        <>
                          <div className="space-y-2 mb-4">
                            {wordDef.definition.definition.map((def, index) => (
                              <label key={index} className={`flex items-start space-x-3 p-2 rounded-lg border transition-all duration-300 ${
                                wordDef.footnoteId 
                                  ? 'bg-gray-100 border-gray-200 cursor-not-allowed' 
                                  : 'bg-gray-50 border-gray-200 hover:border-blue-300 hover:bg-blue-50 cursor-pointer'
                              }`}>
                                <input
                                  type="checkbox"
                                  checked={wordDef.selectedDefinitions[index]}
                                  onChange={() => !wordDef.footnoteId && handleDefinitionToggle(wordDef.wordId, index)}
                                  disabled={!!wordDef.footnoteId}
                                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-1 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                                <span className={`text-sm leading-relaxed ${
                                  wordDef.footnoteId ? 'text-gray-500' : 'text-gray-700'
                                }`}>{def}</span>
                              </label>
                            ))}
                          </div>

                          <div className="mb-4">
                            <label className={`flex items-start space-x-3 p-2 rounded-lg border transition-all duration-300 ${
                              wordDef.footnoteId 
                                ? 'bg-gray-100 border-gray-200 cursor-not-allowed' 
                                : 'bg-indigo-50 border-indigo-200 hover:border-indigo-300 hover:bg-indigo-100 cursor-pointer'
                            }`}>
                              <input
                                type="checkbox"
                                checked={wordDef.selectedDefinitions[wordDef.definition?.definition.length || 0] || false}
                                onChange={() => !wordDef.footnoteId && wordDef.definition && handleDefinitionToggle(wordDef.wordId, wordDef.definition.definition.length)}
                                disabled={!!wordDef.footnoteId}
                                className="mt-1 h-4 w-4 text-blue-600 focus:ring-1 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                              />
                              <div className="flex-1">
                                <span className={`text-xs font-medium block mb-1 ${
                                  wordDef.footnoteId ? 'text-gray-500' : 'text-indigo-600'
                                }`}>예시</span>
                                <span className={`text-sm leading-relaxed ${
                                  wordDef.footnoteId ? 'text-gray-500' : 'text-gray-700'
                                }`}>{wordDef.definition.example}</span>
                              </div>
                            </label>
                          </div>

                          {wordDef.footnoteId ? (
                            <button
                              onClick={() => handleRemoveFootnote(wordDef.wordId)}
                              className="w-full px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-300 font-medium text-sm"
                            >
                              각주 제거
                            </button>
                          ) : (
                            <button
                              onClick={() => handleInsertFootnote(wordDef.wordId)}
                              disabled={!wordDef.selectedDefinitions.some(Boolean)}
                              className="w-full px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all duration-300 font-medium text-sm"
                            >
                              각주 삽입
                            </button>
                          )}
                        </>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div 
                  className="bg-white/80 backdrop-blur-sm p-12 rounded-2xl shadow-xl border border-white/20 text-center text-gray-500 flex items-center justify-center"
                  style={{ height: '750px' }}
                >
                  <div className="space-y-4">
                    <div className="text-6xl text-gray-400 mb-6">🎯</div>
                    <div className="space-y-3">
                      <p className="text-xl text-gray-700 font-semibold">좌측 문서에서 단어를 드래그하여 선택하세요</p>
                      <p className="text-sm text-gray-500 bg-white/60 px-4 py-2 rounded-lg">여러 단어를 선택할 수 있으며, 각 단어별로 정의를 생성할 수 있습니다.</p>
                    </div>
                  </div>
                </div>
              )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
