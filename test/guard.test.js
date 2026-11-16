import test from 'node:test';
import assert from 'node:assert/strict';
import { checkGrounding } from '../server/guard.js';
import { isExplanatoryField } from '../server/agent/runner.js';

test('allows explanatory example numbers but still grounds decision fields', () => {
  const output = { judgment: '价格需要有证据。', misread: { mistake: '不要把一万条评论当销量。', verify: '回商品页核对。' } };
  const facts = '价格 63.08 USD。';
  const fields = () => [{ label: 'judgment', text: output.judgment }, { label: 'misread.mistake', text: output.misread.mistake }, { label: 'misread.verify', text: output.misread.verify }];
  assert.equal(isExplanatoryField('misread.mistake'), true);
  assert.equal(isExplanatoryField('demand.judgment'), false);
  assert.deepEqual(checkGrounding(output, facts, () => [{ label: 'judgment', text: '当前价格是 10000 USD。' }]), ['judgment 中的数字 10000 不在事实材料里']);
});
