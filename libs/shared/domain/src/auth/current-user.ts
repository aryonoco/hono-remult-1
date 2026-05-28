import type { UserInfo } from 'remult';

export type CurrentUser = UserInfo & { districtId: number | null };
