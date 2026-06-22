const MODEL = 'gemini-2.5-flash';

const SYSTEM_PROMPT = `당신은 한국 전통 사주명리학 전문가입니다.
사용자의 성별과 생년월일(양력)을 바탕으로 사주를 분석하고, 로또 6/45 번호를 추천합니다.

분석 시 다음을 고려하세요:
- 년·월·일의 천간지지와 오행(木火土金水) 균형
- 일간(日干)을 중심으로 한 십성·용신·희신 개념
- 성별에 따른 대운 방향 참고
- 1~45 번호를 오행·음양·숫자 상징(예: 1·6=水, 2·7=火 등)과 연결

반드시 JSON만 출력하세요. 각 게임은 1~45 사이 서로 다른 6개 번호를 포함해야 합니다.
5게임을 추천하고, 각 게임마다 사주 근거를 구체적으로 설명하세요.
당첨을 보장하지 않으며, 재미와 참고 목적임을 overallAdvice에 언급하세요.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    sajuSummary: {
      type: 'STRING',
      description: '사주팔자 요약 (천간지지, 오행, 일간 특성 등 2~4문장)',
    },
    games: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          label: { type: 'STRING', description: '게임 라벨 예: 01게임' },
          numbers: {
            type: 'ARRAY',
            items: { type: 'INTEGER' },
            description: '1~45 중 중복 없는 6개 번호, 오름차순',
          },
          reason: {
            type: 'STRING',
            description: '해당 번호 조합을 추천하는 사주적 근거 (2~3문장)',
          },
        },
        required: ['label', 'numbers', 'reason'],
      },
    },
    overallAdvice: {
      type: 'STRING',
      description: '종합 조언 및 유의사항',
    },
  },
  required: ['sajuSummary', 'games', 'overallAdvice'],
};

function validateInput(body) {
  const { gender, birthDate } = body || {};
  if (!gender || !['male', 'female'].includes(gender)) {
    return '성별(male/female)을 올바르게 입력해 주세요.';
  }
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return '생년월일(YYYY-MM-DD)을 올바르게 입력해 주세요.';
  }
  const [y, m, d] = birthDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return '유효하지 않은 날짜입니다.';
  }
  if (y < 1920 || y > new Date().getFullYear()) {
    return '생년은 1920년 이후로 입력해 주세요.';
  }
  return null;
}

function validateNumbers(games) {
  if (!Array.isArray(games) || games.length === 0) return false;
  return games.every(game => {
    const nums = game.numbers;
    if (!Array.isArray(nums) || nums.length !== 6) return false;
    const set = new Set(nums);
    if (set.size !== 6) return false;
    return nums.every(n => Number.isInteger(n) && n >= 1 && n <= 45);
  });
}

function normalizeGames(games) {
  return games.map((game, i) => ({
    label: game.label || `${String(i + 1).padStart(2, '0')}게임`,
    numbers: [...game.numbers].sort((a, b) => a - b),
    reason: game.reason || '',
  }));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST만 허용됩니다.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다. Vercel 환경 변수를 확인해 주세요.' });
  }

  const inputError = validateInput(req.body);
  if (inputError) {
    return res.status(400).json({ error: inputError });
  }

  const { gender, birthDate } = req.body;
  const genderLabel = gender === 'male' ? '남성' : '여성';

  const userPrompt = `성별: ${genderLabel}
생년월일(양력): ${birthDate}

위 정보로 사주를 분석하고 로또 6/45 번호 5게임을 추천해 주세요.`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.85,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error('Gemini API error:', geminiRes.status, errBody);
      return res.status(502).json({ error: 'AI 분석 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.' });
    }

    const geminiData = await geminiRes.json();
    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(502).json({ error: 'AI 응답을 받지 못했습니다.' });
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: 'AI 응답 형식이 올바르지 않습니다.' });
    }

    if (!validateNumbers(parsed.games)) {
      return res.status(502).json({ error: '추천 번호 형식이 올바르지 않습니다. 다시 시도해 주세요.' });
    }

    return res.status(200).json({
      sajuSummary: parsed.sajuSummary,
      games: normalizeGames(parsed.games),
      overallAdvice: parsed.overallAdvice,
    });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
};
