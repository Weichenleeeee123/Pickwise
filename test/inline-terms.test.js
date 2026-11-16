import test from 'node:test';
import assert from 'node:assert/strict';
import { reportTerms, termText } from '../src/ui/common.js';
import { renderMarkdown } from '../src/ui/md.js';
import { renderDeliverables } from '../src/ui/shell.js';
import { renderDimensions } from '../src/ui/results.js';
import { DEMO_CASE } from '../src/ui/demo-data.js';

test('body terms keep contextual explanations and cover terms omitted from the generated glossary',()=>{
  const terms=reportTerms({glossary:[{key:'bsr',explanation:'本次类目排名，不是订单。'}]});
  const html=termText('BSR、FBA、FBM、Buy Box、父体、子体和保本转化率。',terms);
  assert.match(html,/title="本次类目排名，不是订单。">BSR/);
  assert.match(html,/title="Fulfillment by Amazon/);
  for(const word of ['FBA','FBM','Buy Box','父体','子体','保本转化率'])assert.ok(html.includes('>'+word+'</abbr>'));
  assert.equal((html.match(/<abbr/g)??[]).length,7);
  assert.doesNotMatch(termText('ASINCODE _BSR FBA123',terms),/<abbr/);
});

test('full report markdown annotates visible prose while preserving bold, code, URLs and escaping',()=>{
  const html=renderMarkdown('# 选品报告\n\n**FBA 与 CPC** 应分开看，父体销量不能相加。\n\n- 保本转化率和 CVR\n\n`ASIN` https://example.com/FBA\n<script>alert(1)</script>',{glossary:reportTerms()});
  assert.match(html,/<strong><abbr[^>]+>FBA<\/abbr> 与 <abbr[^>]+>CPC<\/abbr><\/strong>/);
  assert.match(html,/<code>ASIN<\/code>/);
  assert.ok(html.includes('https://example.com/FBA'));
  assert.doesNotMatch(html,/<code><abbr|https:\/\/example.com\/<abbr|<script>/);
  assert.match(html,/&lt;script&gt;/);
});

test('legacy glossary sections disappear without hiding subsequent report sections',()=>{
  const html=renderMarkdown('## 分析\nCPC 是成本。\n## 本次报告术语\n- CPC：独立词条内容。\n### 词条\n不要单列。\n## 关键假设\nCVR 来自假设。',{glossary:reportTerms()});
  assert.doesNotMatch(html,/本次报告术语|独立词条内容|不要单列/);
  assert.match(html,/关键假设/);
  assert.match(html,/>CVR<\/abbr>/);
});

test('demo and real report layouts explain terms in the report body without a glossary panel',()=>{
  for(const demo of [true,false]){
    const view=structuredClone(DEMO_CASE.view);view.demo=demo;view.preloadedDemo=demo;
    const html=renderDimensions(view)+renderDeliverables(view,'analysis',{analysis:'## 本次报告术语\n- 独立条目\n## 实际报告\nFBA、CPC 与保本转化率。'});
    assert.doesNotMatch(html,/glossary-groups|本次报告术语|更多常见术语|独立条目/);
    assert.match(html,/实际报告/);
    assert.match(html,/>FBA<\/abbr>/);
    assert.match(html,/>保本转化率<\/abbr>/);
  }
});
