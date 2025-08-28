// Đặt tên file này là ví dụ: "scripts/amazon_message_automation.js"

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Chỉ lắng nghe message có đúng tên
  if (request.message === "executeSendDesignSteps") {
    const task = request.task;
    const orderNumber = task.order_number;

    /**
     * Hàm helper mới để gửi log về background với prefix chuẩn.
     */
    const logToServer = (logMessage) => {
      const fullLogMessage = `[SendMessageAuto][Order: ${orderNumber}] ${logMessage}`;
      chrome.runtime.sendMessage({ message: "log_to_server", data: fullLogMessage });
      console.log(fullLogMessage); // Vẫn log ra console để debug
    };

    logToServer("Content script đã nhận task, bắt đầu thực thi.");

    // Hàm tiện ích: Chuyển đổi chuỗi base64 thành đối tượng File
    function base64ToFile(base64, filename, mimeType) {
      try {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new File([byteArray], filename, { type: mimeType });
      } catch (e) {
        console.error("Lỗi khi chuyển đổi base64:", e);
        return null;
      }
    }

    // Hàm tiện ích: Gắn đối tượng File vào một input[type=file]
    function attachFilesToInput(fileInput, filesArray) {
      const dataTransfer = new DataTransfer();
      for (const file of filesArray) {
        dataTransfer.items.add(file);
      }
      fileInput.files = dataTransfer.files;

      const event = new Event('change', { bubbles: true });
      fileInput.dispatchEvent(event);
    }

    /**
     * HÀM MỚI: Chờ xác nhận file đã được upload lên giao diện
     * Nó sẽ tìm tên file trong danh sách đã đính kèm.
     */
    async function waitForFileUpload(fileNamePart, timeout = 15000) {
      logToServer(`Đang chờ xác nhận file "${fileNamePart}" xuất hiện...`);
      return new Promise((resolve, reject) => {
        let intervalId = null;
        const timeoutId = setTimeout(() => {
          clearInterval(intervalId);
          reject(new Error(`Timeout: Không xác nhận được file upload sau ${timeout / 1000} giây.`));
        }, timeout);

        intervalId = setInterval(() => {
          const uploadedFileElement = document.querySelector('.file-attachment-list li');
          if (uploadedFileElement && uploadedFileElement.textContent.includes(fileNamePart)) {
            clearInterval(intervalId);
            clearTimeout(timeoutId);
            resolve(uploadedFileElement);
          }
        }, 500); // Kiểm tra mỗi nửa giây
      });
    }

// Hàm chính thực thi các bước
    async function runSteps() {
      try {
        // --- BƯỚC 1 (MỚI): Lấy tên khách hàng từ thẻ h2 ---
        const headerElement = document.querySelector('.ayb-contact-buyer-header h2');
        if (!headerElement) {
          throw new Error("Không tìm thấy thẻ h2 chứa tên khách hàng.");
        }
        const headerText = headerElement.textContent; // Sẽ là "Send message to Palmer"
        const customerName = headerText.replace('Send message to ', '').trim();

        if (!customerName) {
          throw new Error("Không thể trích xuất tên khách hàng từ header.");
        }
        logToServer(`✅ Đã lấy được tên khách hàng: "${customerName}"`);

        // --- BƯỚC 2: Tự động chọn "Contact reason" dựa vào dữ liệu từ server ---
        const reasonValue = task.contact_reason_value;
        if (!reasonValue) {
          throw new Error("Task không có 'contact_reason_value' từ server. Kiểm tra lại API.");
        }

        // Dùng giá trị động để tìm đúng radio button
        const reasonRadio = document.querySelector(`kat-radiobutton[value="${reasonValue}"] input[type="radio"]`);
        if (reasonRadio) {
          reasonRadio.click();
          console.log(`✅ Đã click vào radio button có value: "${reasonValue}"`);
          logToServer(`✅ Đã click vào radio button: ${reasonValue}`); // <-- VÀ Ở ĐÂY
        } else {
          throw new Error(`Không tìm thấy radio button với value="${reasonValue}"`);
        }

        await new Promise(r => setTimeout(r, 1000)); // Chờ giao diện ổn định

        // --- BƯỚC 3 & 4: Kiểm tra và đính kèm file nếu template yêu cầu ---
        if (task.has_attachment) {
          console.log("Template yêu cầu đính kèm file, bắt đầu xử lý...");

          const fileInput = document.querySelector('div.contact-buyer-file-input input[type="file"]');
          if (!fileInput) {
            throw new Error('Không tìm thấy ô input[type="file"]!');
          }

          // Lấy mảng files_data (số nhiều) từ API
          const filesInfo = task.files_data;
          if (!filesInfo || !Array.isArray(filesInfo) || filesInfo.length === 0) {
            throw new Error("Dữ liệu file (files_data) không tồn tại hoặc rỗng trong task.");
          }

          const filesToAttach = [];
          for (const fileInfo of filesInfo) {
            const designFile = base64ToFile(fileInfo.content_base64, fileInfo.filename, fileInfo.mime_type);
            if (designFile) {
              filesToAttach.push(designFile);
            }
          }

          if (filesToAttach.length > 0) {
            // Gọi hàm tiện ích đã nâng cấp
            attachFilesToInput(fileInput, filesToAttach);
            logToServer(`Đã inject ${filesToAttach.length} file vào input.`);

            // --- LOGIC MỚI: CHỜ XÁC NHẬN VÀ ĐỢI 2 GIÂY ---
            const firstFileName = filesToAttach[0].name;
            await waitForFileUpload(firstFileName); // Chờ đến khi thấy file trên UI
            logToServer(`✅ File đã được upload thành công. Chờ thêm 2 giây...`);
            await new Promise(r => setTimeout(r, 2000)); // Đợi 2 giây
          } else {
            throw new Error("Không có file nào được tạo thành công để đính kèm.");
          }

          await new Promise(r => setTimeout(r, 500));
        } else {
          logToServer("Template không yêu cầu đính kèm file, bỏ qua.");
        }

        // --- BƯỚC 5: Xây dựng và điền nội dung tin nhắn vào textarea ---
        const messageTextareaHost = document.querySelector('.contact-buyer-text-area kat-textarea');
        if (messageTextareaHost && task.message_content) {
          // Xây dựng nội dung tin nhắn cuối cùng
          const finalMessage = `Hi ${customerName},\n\n${task.message_content}`;

          const shadowRoot = messageTextareaHost.shadowRoot;
          if (shadowRoot) {
            const internalTextarea = shadowRoot.querySelector('textarea');
            if (internalTextarea) {
              // Sử dụng finalMessage đã được ghép tên
              internalTextarea.value = finalMessage;
              internalTextarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
              logToServer('✅ Đã điền nội dung tin nhắn (kèm tên khách hàng).');
            } else {
              throw new Error('Không tìm thấy thẻ <textarea> thật bên trong Shadow DOM.');
            }
          } else {
            throw new Error('Không thể truy cập Shadow DOM của kat-textarea. Trang web có thể đã thay đổi.');
          }
        } else {
          logToServer('⚠️ Không tìm thấy ô tin nhắn hoặc không có nội dung để điền.');
        }

        await new Promise(r => setTimeout(r, 1000)); // Thêm độ trễ nhỏ để UI kịp cập nhật preview

        // --- BƯỚC 6 (Kiểm tra): Tìm và log nút "Send" ---
        const sendButton = document.querySelector('kat-button.ayb-contact-form-send-button');
        if (sendButton) {
          console.log('✅ Đã tìm thấy nút Send:', sendButton);
          logToServer("✅ Đã tìm thấy nút Send. Chuẩn bị click...");
          // Khi nào mày muốn chạy thật thì bỏ comment dòng dưới đi
          sendButton.click();
        } else {
          console.warn('⚠️ Không tìm thấy nút Send!');
        }

        await new Promise(r => setTimeout(r, 2000));

        sendResponse({ status: "success" });

      } catch (error) {
        logToServer(`❌ LỖI: ${error.message}`); // <-- LOG CẢ LỖI NỮA
        console.error("Lỗi trong quá trình tự động hóa trên trang:", error);
        sendResponse({ status: "error", message: error.message });
      }
    }

    runSteps();
    return true; // Báo hiệu sẽ trả lời bất đồng bộ
  }
});