// 静的アセット（HTMLファイルなど）を正しく提供するための魔法のコードだ
export function onRequest(context) {
  return context.next();
}