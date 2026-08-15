export const BCRYPT_SALT_ROUNDS = 10;

export const PASSWORD_RESET_TOKEN_TTL_MINUTES = 15;

export const PASSWORD_MIN_LENGTH = 8;

export const SUPPORTED_CURRENCIES = ['VND', 'USD'] as const;

export const COURSE_TITLE_MAX_LENGTH = 200;
export const LESSON_TITLE_MAX_LENGTH = 200;

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

export const VNPAY_VERSION = '2.1.0';
export const VNPAY_COMMAND = 'pay';
export const VNPAY_CURRENCY = 'VND';
export const VNPAY_LOCALE = 'vn';
export const VNPAY_ORDER_TYPE = 'other';
export const VNPAY_EXPIRE_MINUTES = 15;
export const VNPAY_SUCCESS_RESPONSE_CODE = '00';

export const DEFAULT_EMAIL = 'no-reply@elearning.local';

export const VNPAY_IPN_RESPONSE = {
  SUCCESS: { RspCode: '00', Message: 'Confirm Success' },
  ORDER_NOT_FOUND: { RspCode: '01', Message: 'Order not found' },
  ORDER_ALREADY_CONFIRMED: {
    RspCode: '02',
    Message: 'Order already confirmed',
  },
  INVALID_AMOUNT: { RspCode: '04', Message: 'Invalid amount' },
  INVALID_SIGNATURE: { RspCode: '97', Message: 'Invalid signature' },
  UNKNOWN_ERROR: { RspCode: '99', Message: 'Unknown error' },
} as const;

export const THROTTLE = {
  DEFAULT: {
    ttl: 60_000,
    limit: 100,
  },
  LOGIN: { ttl: 60_000, limit: 5 },
  REGISTER: { ttl: 60_000, limit: 5 },
  FORGOT_PASSWORD: { ttl: 300_000, limit: 3 },
  VERIFICATION_REQUEST: { ttl: 300_000, limit: 3 },
  VERIFICATION_CONFIRM: { ttl: 300_000, limit: 5 },
};

export const VERIFICATION_CODE_TTL_MINUTES = 10;
export const VERIFICATION_CODE_MAX = 1_000_000; // mã 6 chữ số: 000000–999999
export const VERIFICATION_CODE_LENGTH = 6;
