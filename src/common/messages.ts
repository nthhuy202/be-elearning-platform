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
    UNAUTHORIZED: 'Bạn cần đăng nhập để thực hiện thao tác này',
    FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này',
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

  COURSE: {
    // --- success ---
    CREATE_SUCCESS: 'Tạo khoá học thành công',
    LIST_SUCCESS: 'Lấy danh sách khoá học thành công',
    DETAIL_SUCCESS: 'Lấy thông tin khoá học thành công',
    UPDATE_SUCCESS: 'Cập nhật khoá học thành công',
    DELETE_SUCCESS: 'Xoá khoá học thành công',

    // --- error ---
    NOT_FOUND: 'Khoá học không tồn tại',
    NOT_OWNER: 'Bạn không phải giảng viên của khoá học này',
  },

  LESSON: {
    CREATE_SUCCESS: 'Tạo bài học thành công',
    LIST_SUCCESS: 'Lấy danh sách bài học thành công',
    DETAIL_SUCCESS: 'Lấy thông tin bài học thành công',
    UPDATE_SUCCESS: 'Cập nhật bài học thành công',
    DELETE_SUCCESS: 'Xoá bài học thành công',
    REORDER_SUCCESS: 'Sắp xếp lại bài học thành công',
    NOT_FOUND: 'Bài học không tồn tại',
    REORDER_INVALID_ITEMS: 'Danh sách bài học cần sắp xếp không hợp lệ',
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
    TITLE_REQUIRED: 'Tiêu đề khoá học không được để trống',
    DESCRIPTION_INVALID: 'Mô tả không hợp lệ',
    THUMBNAIL_URL_INVALID: 'Đường dẫn ảnh bìa không hợp lệ',
    PRICE_INVALID: 'Giá phải là số nguyên không âm',
    CURRENCY_INVALID: 'Đơn vị tiền tệ không hợp lệ',
    CONTENT_INVALID: 'Nội dung bài học không hợp lệ',
    ORDER_INDEX_INVALID: 'Thứ tự bài học phải là số nguyên không âm',
    REORDER_ITEMS_REQUIRED: 'Cần ít nhất một bài học để sắp xếp',
  },
} as const;
