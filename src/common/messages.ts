export const MESSAGES = {
  COMMON: {
    SUCCESS: 'Thành công',
    NOT_FOUND: 'Không tìm thấy dữ liệu',
    DUPLICATE_RECORD: 'Dữ liệu đã tồn tại',
    INVALID_REFERENCE: 'Dữ liệu tham chiếu không hợp lệ',
    INTERNAL_ERROR: 'Đã có lỗi xảy ra, vui lòng thử lại sau',
  },

  AUTH: {
    // --- success ---
    REGISTER_SUCCESS: 'Đăng ký tài khoản thành công',
    LOGIN_SUCCESS: 'Đăng nhập thành công',
    GET_PROFILE_SUCCESS: 'Lấy thông tin tài khoản thành công',
    RESET_PASSWORD_SUCCESS: 'Đặt lại mật khẩu thành công',
    FORGOT_PASSWORD_SENT:
      'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi đi.',

    // --- error ---
    INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng',
    INVALID_OR_EXPIRED_TOKEN: 'Token không hợp lệ hoặc đã hết hạn',
    CURRENT_PASSWORD_INCORRECT: 'Mật khẩu hiện tại không đúng',
    NEW_PASSWORD_MUST_DIFFER: 'Mật khẩu mới phải khác mật khẩu hiện tại',
  },

  USER: {
    // --- success ---
    CREATE_SUCCESS: 'Tạo người dùng thành công',
    LIST_SUCCESS: 'Lấy danh sách người dùng thành công',
    DETAIL_SUCCESS: 'Lấy thông tin người dùng thành công',
    UPDATE_SUCCESS: 'Cập nhật người dùng thành công',
    DELETE_SUCCESS: 'Xoá người dùng thành công',
    CHANGE_PASSWORD_SUCCESS: 'Đổi mật khẩu thành công',

    // --- error ---
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
