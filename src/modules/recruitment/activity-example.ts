import { CUSTOM_ACTIVITY_PROGRESS_MESSAGE, CUSTOM_ACTIVITY_READY_MESSAGE, CUSTOM_ACTIVITY_RESTORE_MESSAGE, CUSTOM_ACTIVITY_SUBMIT_MESSAGE } from "../../../shared/contracts/interview-rounds.ts";

export const activityExample = `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><title>校园协作情景快答</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #f5efe3; color: #253b32; font: 15px/1.55 system-ui, sans-serif; }
  main { max-width: 600px; margin: auto; padding: 19px 15px; }
  article { background: #fffcf5; border: 1px solid #e0d5bf; border-radius: 16px; padding: 16px; }
  header { display: flex; gap: 8px; justify-content: space-between; align-items: baseline; flex-wrap: wrap; }
  h1 { margin: 0; font-size: 20px; } output { color: #796044; font-size: 12px; }
  progress { accent-color: #30614c; width: 100%; height: .65rem; margin: 8px 0 12px; }
  h2 { margin: 0 0 12px; font-size: 16px; }
  #choices { display: grid; gap: 7px; }
  button { width: 100%; min-height: 44px; background: #e9f0e6; color: #173c2d; border: 1px solid #c1d3c3; border-radius: 8px; text-align: left; padding: 8px 11px; font: inherit; cursor: pointer; }
  button:hover, button:focus-visible { background: #d7e6d9; }
  button:focus-visible { outline: 2px solid #30614c; outline-offset: 2px; }
  p { margin: 0; }
</style>
<main><article>
  <header><h1>校园协作情景快答</h1><output id="steps" aria-live="polite"></output></header>
  <progress id="progress" aria-label="游戏进度" max="3" value="0"></progress>
  <h2 id="prompt" tabindex="-1"></h2><div id="choices"></div>
</article></main>
<script>
  const rounds = [
    { question: '活动开始前，两位同学对分工有不同理解。你会怎么做？', choices: ['对齐目标，写下各人的交付和时间', '先各自开始，到了现场再说'], correct: 0 },
    { question: '海报距离截止还剩一小时，发现活动地点写错了。', choices: ['只修手边这一份', '核对正确地点，同步给发布和现场同学'], correct: 1 },
    { question: '活动结束后，怎样让下次协作更顺利？', choices: ['记录有效做法和一项待改进的问题', '保留成品，复盘留到下次开始'], correct: 0 },
  ];
  const steps = document.getElementById('steps');
  const progress = document.getElementById('progress');
  const prompt = document.getElementById('prompt');
  const choices = document.getElementById('choices');
  let answers = [];
  function show() {
    const index = answers.length;
    steps.textContent = index + ' / ' + rounds.length + ' 已答';
    progress.value = index;
    choices.replaceChildren();
    if (index === rounds.length) {
      prompt.textContent = '已完成校园协作快答';
    } else {
      const round = rounds[index];
      prompt.textContent = round.question;
      round.choices.forEach((choice, option) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = choice;
        button.addEventListener('click', () => {
          answers.push(option);
          show();
          const correct = answers.filter((value, n) => value === rounds[n].correct).length;
          const percent = Math.round(answers.length / rounds.length * 100);
          if (answers.length < rounds.length) {
            parent.postMessage({ type: ${JSON.stringify(CUSTOM_ACTIVITY_PROGRESS_MESSAGE)}, progress: percent,
              progressText: '已答 ' + answers.length + '/' + rounds.length + ' 题', payload: { answers } }, '*');
          } else {
            const score = Math.round(correct / rounds.length * 100);
            parent.postMessage({ type: ${JSON.stringify(CUSTOM_ACTIVITY_SUBMIT_MESSAGE)}, status: 'completed',
              score, maxScore: 100, scoreLabel: '协作得分', scoreUnit: '分', badge: { label: score >= 67 ? '协作清晰' : '继续练习', tone: score >= 67 ? 'success' : 'info' },
              summary: '已完成校园协作情景快答，答对 ' + correct + ' / ' + rounds.length + ' 题。',
              metrics: [{ label: '协作判断', value: correct, max: rounds.length, unit: '题' }, { label: '作答完整度', value: percent, max: 100, unit: '%' }],
              qa: rounds.map((item, n) => ({ question: item.question, answer: item.choices[answers[n]], tag: answers[n] === item.correct ? '回答准确' : '可再思考' })),
              tags: ['校园活动', '团队协作'], payload: { answers, correct, total: rounds.length } }, '*');
          }
          prompt.focus({ preventScroll: true });
        }, { once: true });
        choices.append(button);
      });
    }
  }
  window.addEventListener('message', (event) => {
    if (event.source !== parent || event.data?.type !== ${JSON.stringify(CUSTOM_ACTIVITY_RESTORE_MESSAGE)} || answers.length) return;
    const restored = event.data.saved?.payload?.answers;
    if (Array.isArray(restored) && restored.length < rounds.length && restored.every((value, n) => Number.isInteger(value) && value >= 0 && value < rounds[n].choices.length)) {
      answers = restored.slice();
      show();
    }
  });
  show();
  parent.postMessage({ type: ${JSON.stringify(CUSTOM_ACTIVITY_READY_MESSAGE)} }, '*');
</script></html>`;
