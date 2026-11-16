import { TEACHING_TERMS } from '../../src/terms.js';

const NATURE = { type: 'string', enum: ['fact', 'estimate', 'assumption', 'unknown'] };
const str = (max, min = 1) => ({ type: 'string', minLength: min, maxLength: max });
const ids = { type: 'array', items: { type: 'string' }, maxItems: 8 };

const found = {
  type: 'array', maxItems: 5,
  items: { type: 'object', required: ['text', 'nature'], properties: { text: str(260), nature: NATURE, evidence_ids: ids } }
};
const misread = { type: 'object', required: ['mistake', 'verify'], properties: { mistake: str(220), verify: str(220) } };
const scope = { type: 'object', required: ['can_show', 'cannot_show'], properties: { can_show: str(240), cannot_show: str(240) } };
const lesson = {
  type: 'object', required: ['node', 'evidence_card', 'method', 'depth'],
  properties: { node: { type: 'string', enum: ['N1', 'N2', 'N3'] }, evidence_card: str(500), method: str(500), depth: { type: 'string', enum: ['short', 'default'] } }
};

const base = (extraProps = {}, extraRequired = []) => ({
  type: 'object',
  required: ['why', 'found', 'how_to_read', 'misread', 'scope', ...extraRequired],
  properties: { why: str(160), found, how_to_read: str(520), misread, scope, gap: str(300), ...extraProps }
});

export const CARD_SCHEMAS = {
  identify: base({
    decision: { type: 'string', enum: ['single', 'ambiguous', 'none'] },
    candidates: { type: 'array', maxItems: 3, items: { type: 'object', required: ['asin', 'reason'], properties: { asin: str(20), reason: str(200) } } }
  }),
  demand: base({
    lesson,
    second_node: { type: 'string', enum: ['N1', 'N2'] },
    second_node_reason: str(320),
    deferred_issue: str(260)
  }, ['lesson', 'second_node', 'second_node_reason']),
  competition: base({
    comparison_rows: { type: 'array', maxItems: 8, items: { type: 'object', required: ['evidence_id', 'role', 'reason'], properties: { evidence_id: str(20), role: { type: 'string', enum: ['comparable', 'uncertain', 'not_comparable'] }, reason: str(200) } } }
  }),
  profit: base({ lesson }, ['lesson']),
  risk: base({
    checks: { type: 'array', minItems: 3, maxItems: 6, items: { type: 'object', required: ['item', 'why', 'where'], properties: { item: str(120), why: str(200), where: str(200) } } }
  }, ['checks']),
  summary: base({
    takeaways: { type: 'array', minItems: 2, maxItems: 4, items: str(220) },
    checklist: { type: 'array', minItems: 3, maxItems: 6, items: str(200) }
  }, ['takeaways', 'checklist'])
};

const annotation = { type: 'object', required: ['figure_id', 'how_to_read', 'verify'], properties: { figure_id: str(40), how_to_read: str(320), verify: str(220) } };
const basis = { type: 'array', maxItems: 4, items: { type: 'object', required: ['text', 'nature'], properties: { text: str(260), nature: NATURE, evidence_ids: ids } } };

export const ANALYSIS_SCHEMA = {
  type: 'object', required: ['dimensions', 'verdict', 'assumptions', 'next_steps', 'glossary'],
  properties: {
    dimensions: {
      type: 'array', minItems: 5, maxItems: 5,
      items: {
        type: 'object', required: ['key', 'signal', 'judgment', 'basis', 'annotations'],
        properties: { key: { type: 'string', enum: ['demand', 'competition', 'profit', 'risk', 'fit'] }, signal: { type: 'string', enum: ['positive', 'neutral', 'negative', 'insufficient'] }, judgment: str(500), interpretation: { type: 'array', minItems: 2, maxItems: 3, items: str(420) }, basis, gap: str(300), annotations: { type: 'array', maxItems: 8, items: annotation } }
      }
    },
    verdict: { type: 'object', required: ['bucket', 'reason'], properties: { bucket: { type: 'string', enum: ['worth_verifying', 'need_more', 'not_recommended'] }, reason: str(360) } },
    assumptions: { type: 'array', maxItems: 5, items: { type: 'object', required: ['text', 'nature', 'verify'], properties: { text: str(240), nature: NATURE, verify: str(220) } } },
    next_steps: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'object', required: ['task', 'why', 'where'], properties: { task: str(160), why: str(200), where: str(200) } } },
    glossary: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'object', required: ['key', 'explanation'], properties: { key: { type: 'string', enum: TEACHING_TERMS.map((term) => term.key) }, explanation: str(220) } } },
    change_note: str(320)
  }
};

export const COMPARISON_SCHEMA = {
  type: 'object', required: ['difference'],
  properties: {
    difference: str(420),
    driven_by: { type: 'array', maxItems: 4, items: { type: 'object', required: ['figure_id', 'note'], properties: { figure_id: str(40), note: str(220) } } }
  }
};

export const PRACTICE_SCHEMA = {
  type: 'object', required: ['question', 'options', 'correct', 'hint', 'difficulty'],
  properties: {
    question: str(320),
    options: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', required: ['id', 'text', 'why'], properties: { id: { type: 'string', enum: ['a', 'b', 'c'] }, text: str(200), why: str(260) } } },
    correct: { type: 'string', enum: ['a', 'b', 'c'] },
    hint: str(260),
    difficulty: { type: 'string', enum: ['default', 'harder'] }
  }
};

export const FEEDBACK_SCHEMA = {
  type: 'object', required: ['feedback', 'method_reminder'],
  properties: { feedback: str(520), refers_to_judgment: str(260), method_reminder: str(260) }
};

export const COACH_SCHEMA = {
  type: 'object', required: ['answer'],
  properties: { answer: str(1800) }
};

export const TRANSFER_SCORE_SCHEMA = {
  type: 'object', required: ['items'],
  properties: {
    items: {
      type: 'array', minItems: 3, maxItems: 3,
      items: { type: 'object', required: ['dimension', 'score', 'quote', 'reason'], properties: { dimension: { type: 'string', enum: ['evidence', 'scope', 'uncertainty'] }, score: { type: 'integer', minimum: 0, maximum: 2 }, quote: { type: 'string', maxLength: 300 }, reason: str(300) } }
    },
    next_practice: str(300)
  }
};

export const LEARNING_SCHEMA = {
  type: 'object', required: ['corrected', 'unverified', 'methods', 'checklist'],
  properties: {
    corrected: { type: 'array', maxItems: 4, items: { type: 'object', required: ['misunderstanding', 'based_on', 'detail'], properties: { misunderstanding: str(200), based_on: { type: 'string', enum: ['judgment_comparison', 'practice', 'transfer'] }, detail: str(260) } } },
    unverified: { type: 'array', maxItems: 5, items: str(200) },
    methods: { type: 'array', minItems: 1, maxItems: 5, items: str(220) },
    checklist: { type: 'array', minItems: 3, maxItems: 6, items: str(200) }
  }
};
