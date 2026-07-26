// 担当者ごとの表示範囲を決めるロジック。
// 管理者は全員分、それ以外は自分が登録したピンだけが見える。

export const ADMIN_NAME = '有持';

// staff 未設定の古いデータは管理者の担当として扱う
export function getStaffName(staff: string | undefined): string {
  return (!staff || staff === '未設定') ? ADMIN_NAME : staff;
}

export function isAdmin(userName: string): boolean {
  return userName === ADMIN_NAME;
}

// 自分が担当のものだけに絞る（管理者はそのまま全件）
export function filterByStaff<T extends { staff?: string }>(
  items: T[],
  userName: string
): T[] {
  if (isAdmin(userName)) return items;
  return items.filter((item) => getStaffName(item.staff) === userName);
}
