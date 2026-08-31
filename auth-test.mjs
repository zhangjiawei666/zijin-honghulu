/**
 * 测试 SDK unstable_v2_authenticate：
 * 1) 已登录状态下是否立即返回（不触发 onAuthUrl）
 * 2) 未登录时 onAuthUrl 的触发与 authUrl 格式
 */
import { unstable_v2_authenticate, unstable_v2_logout } from '@tencent-ai/agent-sdk';

process.env.CODEBUDDY_CODE_PATH = 'E:/WorkBuddy/2026-08-26-14-59-46/stock-monitor-agent/release/win-unpacked/resources/app/cli/bin/codebuddy';

const main = async () => {
  console.log('=== 测试 1：已登录状态下调用 authenticate（10s 超时）===');
  try {
    const result = await Promise.race([
      unstable_v2_authenticate({
        environment: 'external',
        onAuthUrl: (state) => {
          console.log('!! onAuthUrl 触发（说明需要浏览器授权）:');
          console.log('   authUrl =', state.authUrl.slice(0, 120) + '...');
        },
        timeout: 10_000,
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT_10S')), 10_000)),
    ]);
    console.log('✓ 立即返回 userinfo:', JSON.stringify({
      userId: result.userinfo.userId,
      userName: result.userinfo.userName,
      userNickname: result.userinfo.userNickname,
      tokenLen: (result.userinfo.token || '').length,
    }));
  } catch (e) {
    console.log('✗ 失败:', e?.message || e);
  }
  process.exit(0);
};

main();
