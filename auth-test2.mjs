/**
 * 测试 2：用 internal 环境（未登录）验证 onAuthUrl 流程
 * 不打开浏览器、30s 超时后主动放弃 —— 不会影响 external 登录态
 */
import { unstable_v2_authenticate, unstable_v2_logout } from '@tencent-ai/agent-sdk';

process.env.CODEBUDDY_CODE_PATH = 'E:/WorkBuddy/2026-08-26-14-59-46/stock-monitor-agent/release/win-unpacked/resources/app/cli/bin/codebuddy';

const main = async () => {
  console.log('=== internal 环境调用 authenticate（预期触发 onAuthUrl）===');
  const t0 = Date.now();
  try {
    const result = await Promise.race([
      unstable_v2_authenticate({
        environment: 'internal',
        onAuthUrl: (state) => {
          console.log(`✓ onAuthUrl 在 ${Date.now() - t0}ms 后触发:`);
          console.log('  state  =', state.state);
          console.log('  authUrl =', state.authUrl);
        },
        timeout: 25_000,
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT_25S')), 30_000)),
    ]);
    console.log('✓ 意外直接成功:', result.userinfo.userName);
  } catch (e) {
    console.log('结果:', e?.message || e);
  } finally {
    // 清理 internal 环境可能残留的凭据缓存
    try {
      await unstable_v2_logout({ environment: 'internal' });
      console.log('（internal 环境已清理）');
    } catch (e) {
      console.log('（internal 清理失败:', e?.message || e, '）');
    }
  }
  process.exit(0);
};

main();
