/**
 * 直接测试 Agent SDK query() 是否能通过认证
 * 复现 server/chain.ts 的调用方式（CODEBUDDY_CODE_PATH 指向打包 CLI）
 */
import { query } from '@tencent-ai/agent-sdk';

process.env.CODEBUDDY_CODE_PATH = 'E:/WorkBuddy/2026-08-26-14-59-46/stock-monitor-agent/release/win-unpacked/resources/app/cli/bin/codebuddy';

const main = async () => {
  console.log('开始 query() 测试（prompt: 你好，请只回复 OK）...');
  const t0 = Date.now();
  try {
    const stream = query({
      prompt: '你好，请只回复 OK',
      options: {
        cwd: process.cwd(),
        model: 'auto',
        maxTurns: 2,
        permissionMode: 'default',
      },
    });
    for await (const msg of stream) {
      const type = msg.type;
      if (type === 'assistant') {
        const content = msg?.message?.content;
        if (typeof content === 'string') console.log(`[assistant] ${content.slice(0, 200)}`);
        else if (Array.isArray(content)) {
          for (const b of content) {
            if (b?.type === 'text') console.log(`[assistant/text] ${b.text.slice(0, 200)}`);
          }
        }
      } else if (type === 'result') {
        console.log(`[result] error=${msg?.error ?? '无'} duration=${Date.now() - t0}ms`);
      } else if (type === 'system') {
        console.log(`[system] subtype=${msg?.subtype} ${JSON.stringify(msg).slice(0, 200)}`);
      } else {
        console.log(`[${type}]`);
      }
    }
    console.log('=== stream 正常结束 ===');
  } catch (e) {
    console.error('=== query 失败 ===', e?.message || e);
  }
  process.exit(0);
};

main();
