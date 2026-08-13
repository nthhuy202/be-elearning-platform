export const MESSAGES = {
  AUTH: {
    INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng',
    INVALID_OR_EXPIRED_TOKEN: 'Token không hợp lệ hoặc đã hết hạn',
    CURRENT_PASSWORD_INCORRECT: 'Mật khẩu hiện tại không đúng',
    NEW_PASSWORD_MUST_DIFFER: 'Mật khẩu mới phải khác mật khẩu hiện tại',
    FORGOT_PASSWORD_SENT:
      'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi đi.',
    PASSWORD_RESET_SUCCESS: 'Đặt lại mật khẩu thành công.',
  },

  USER: {
    NOT_FOUND: 'Người dùng không tồn tại',
    EMAIL_ALREADY_EXISTS: 'Email đã tồn tại',
  },

  VALIDATION: {
    EMAIL_INVALID: 'Email không hợp lệ',
    PASSWORD_INVALID: 'Mật khẩu không hợp lệ',
    PASSWORD_MIN_LENGTH: (min: number) =>
      `Mật khẩu phải có ít nhất ${min} ký tự`,
    CURRENT_PASSWORD_REQUIRED: 'Vui lòng nhập mật khẩu hiện tại',
    NEW_PASSWORD_MIN_LENGTH: (min: number) =>
      `Mật khẩu mới phải có ít nhất ${min} ký tự`,
    FULL_NAME_REQUIRED: 'Họ tên không được để trống',
    PHONE_INVALID: 'Số điện thoại không hợp lệ',
    TOKEN_REQUIRED: 'Token không được để trống',
  },
} as const;
