import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { text, word } = await request.json();

    if (!text || !word) {
      return NextResponse.json(
        { error: '텍스트와 단어가 필요합니다.' },
        { status: 400 }
      );
    }

    const prompt = `###지시사항 
사용자가 지정한 단어의 뜻과 사용 예시를 작성하십시오. 
문맥을 참고해 단어의 의미를 개조식으로 설명하고, 쉬운 한 문장으로 예시를 작성하십시오. 
객관적·사실적 서술만 사용하며, 불필요한 감탄사·비속어·주관적 표현을 배제하십시오. 

###생성규칙 
1. **단어 위치** 
- 사용자가 지정한 단어는 맥락에서 **대괄호 2개에 쌓여 있습니다. ( "[[단어]]" )** 
2. **문맥 기반 의미 도출** 
- 맥락 전체를 검토하고 사용자가 지정한 위치의 단어가 어떤 뜻·기능으로 쓰였는지 판단하십시오. 
- 중의적일 경우 해당 문맥에 가장 부합하는 의미만 작성하십시오. 
- 불필요한 내용은 기입하지 마십시오. 
3. **개조식 정의 작성** 
- 조사·접속사·형용사·수식어 최소화 → 압축된 정보 전달. 
4. **예시문 작성** 
- 쉬운 어휘로 작성한 한 문장. 
- 단어를 실제 사용한 자연스러운 예문. 
5. **객관석 유지** 
- 평가·견해·감탄 배제, 사실 전달에 집중. 
- 통계·연도·출처 삽입은 해당 정보가 문맥 이해에 반드시 필요할 때만. 

###출력형식(JSON) 
{ 
"word": "<단어>", 
"definition": ["<의미1>", ...], 
"example": "<단어를 사용한 예시>" 
}

###맥락
${text}
###단어
${word}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1", // 최신 GPT-4.1 모델 사용
      messages: [
        {
          role: "system",
          content: "당신은 한국어 단어의 정의를 생성하는 전문가입니다. 주어진 맥락에서 단어의 의미를 정확하고 간결하게 설명해주세요. 반드시 JSON 형식으로만 응답하세요."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: "json_object" }
    });

    const response = completion.choices[0].message.content;
    
    if (!response) {
      throw new Error('OpenAI API 응답이 비어있습니다.');
    }

    const parsedResponse = JSON.parse(response);
    
    // 응답 형식 검증
    if (!parsedResponse.word || !parsedResponse.definition || !parsedResponse.example) {
      throw new Error('OpenAI API 응답 형식이 올바르지 않습니다.');
    }

    // definition이 배열이 아닌 경우 배열로 변환
    if (!Array.isArray(parsedResponse.definition)) {
      parsedResponse.definition = [parsedResponse.definition];
    }

    return NextResponse.json(parsedResponse);

  } catch (error) {
    console.error('OpenAI API 오류:', error);
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: `정의 생성 중 오류가 발생했습니다: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: '정의 생성 중 알 수 없는 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
} 