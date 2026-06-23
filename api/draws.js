const { getSupabase } = require('../lib/supabase');

const PICK = 6;
const MIN = 1;
const MAX = 45;
const LIST_LIMIT = 50;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function validateTickets(tickets) {
  if (!Array.isArray(tickets) || tickets.length === 0 || tickets.length > 20) {
    return 'tickets는 1~20게임 배열이어야 합니다.';
  }

  for (const nums of tickets) {
    if (!Array.isArray(nums) || nums.length !== PICK) {
      return `각 게임은 ${PICK}개 번호여야 합니다.`;
    }
    const set = new Set(nums);
    if (set.size !== PICK) {
      return '게임 내 번호는 중복될 수 없습니다.';
    }
    for (const n of nums) {
      if (!Number.isInteger(n) || n < MIN || n > MAX) {
        return `번호는 ${MIN}~${MAX} 정수여야 합니다.`;
      }
    }
  }

  return null;
}

function normalizeTickets(tickets) {
  return tickets.map(nums => [...nums].sort((a, b) => a - b));
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('lotto_draws')
      .select('id, created_at, tickets, game_count')
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT);

    if (error) {
      console.error('Supabase GET error:', error);
      return res.status(500).json({ error: '추첨 기록을 불러오지 못했습니다.' });
    }

    return res.status(200).json({ draws: data });
  }

  if (req.method === 'POST') {
    const { tickets } = req.body || {};
    const inputError = validateTickets(tickets);
    if (inputError) {
      return res.status(400).json({ error: inputError });
    }

    const normalized = normalizeTickets(tickets);
    const { data, error } = await supabase
      .from('lotto_draws')
      .insert({
        tickets: normalized,
        game_count: normalized.length,
      })
      .select('id, created_at, tickets, game_count')
      .single();

    if (error) {
      console.error('Supabase POST error:', error);
      return res.status(500).json({ error: '추첨 기록 저장에 실패했습니다.' });
    }

    return res.status(201).json({ entry: data });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase
      .from('lotto_draws')
      .delete()
      .gte('created_at', '1970-01-01T00:00:00Z');

    if (error) {
      console.error('Supabase DELETE error:', error);
      return res.status(500).json({ error: '추첨 기록 삭제에 실패했습니다.' });
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'GET, POST, DELETE만 허용됩니다.' });
};
