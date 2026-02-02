/**
 * athor: KhoaNDCE170420
 * Customer Email Service - handle sending emails to customers
 */
const nodemailer = require("nodemailer");

// create reusable transporter object using SMTP transport
const createTransporter = () => {
    return nodemailer.createTransport({
        //can change to orther SMTP service if needed by replacing gmail config to other service config
        service: "gmail", 
        auth: {
            user: process.env.SMTP_USER, // Email sender address
            pass: process.env.SMTP_PASS, // app password 
        },
    });
};

const EmailService = {
    /**
     * Send account suspension notification email
     * 
     * @param {String} customerEmail - Customer's email
     * @param {String} customerName - Customer's name
     * @returns {Promise<Object>} Email sending result
     */
    async sendAccountSuspensionEmail(customerEmail, customerName) {
        try {
            const transporter = createTransporter();

            const mailOptions = {
                from: {
                    name: "Smart Fruit Shop",
                    address: process.env.EMAIL_USER || "noreply@smartfruitshop.vn"
                },
                to: customerEmail,
                subject: "Account Suspension Notification - Smart Fruit Shop",
                // Email content in HTML and plain text
                html: `
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <style>
                            body {
                                font-family: Arial, sans-serif;
                                line-height: 1.6;
                                color: #333;
                                max-width: 600px;
                                margin: 0 auto;
                                padding: 20px;
                            }
                            .container {
                                background-color: #f9f9f9;
                                border: 1px solid #ddd;
                                border-radius: 8px;
                                padding: 30px;
                            }
                            .header {
                                background-color: #ff6b6b;
                                color: white;
                                padding: 15px;
                                border-radius: 8px 8px 0 0;
                                text-align: center;
                                margin: -30px -30px 20px -30px;
                            }
                            .content {
                                margin: 20px 0;
                            }
                            .highlight {
                                background-color: #fff3cd;
                                padding: 15px;
                                border-left: 4px solid #ffc107;
                                margin: 20px 0;
                            }
                            .footer {
                                margin-top: 30px;
                                padding-top: 20px;
                                border-top: 1px solid #ddd;
                                color: #666;
                                font-size: 14px;
                            }
                            .support-link {
                                color: #007bff;
                                text-decoration: none;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h2>⚠️ Account Suspension Notice</h2>
                            </div>
                            <div class="content">
                                <p>Hello <strong>${customerName}</strong>,</p>
                                
                                <p>Your account on the <strong>Smart Fruit Shop</strong> system has been temporarily suspended due to a violation of the terms of use.</p>
                                
                                <div class="highlight">
                                    <strong>What does this mean?</strong><br>
                                    You will not be able to access your account or place orders until this issue is resolved.
                                </div>
                                
                                <p>If you believe this is an error, please contact support via email: 
                                    <a href="mailto:support@smartfruitshop.vn" class="support-link">support@smartfruitshop.vn</a>
                                </p>
                                
                                <p>We appreciate your understanding and cooperation.</p>
                            </div>
                            <div class="footer">
                                <p>Sincerely,<br>
                                <strong>Smart Fruit Shop Team</strong></p>
                                
                                <p style="font-size: 12px; color: #999;">
                                    This is an automated message. Please do not reply to this email.
                                </p>
                            </div>
                        </div>
                    </body>
                    </html>
                `,
                text: `
Hello ${customerName},

Your account on the Smart Fruit Shop system has been temporarily suspended due to a violation of the terms of use.

If you believe this is an error, please contact support via email support@smartfruitshop.vn.

Sincerely,
Smart Fruit Shop
                `.trim()
            };

            const info = await transporter.sendMail(mailOptions);

            return {
                status: "OK",
                message: "Email sent successfully",
                messageId: info.messageId
            };
        } catch (error) {
            console.error("Email sending error:", error);
            return {
                status: "ERR",
                message: `Failed to send email: ${error.message}`
            };
        }
    },

    /**
     * Send account reactivation notification email
     * 
     * @param {String} customerEmail - Customer's email
     * @param {String} customerName - Customer's name
     * @returns {Promise<Object>} Email sending result
     */
    async sendAccountReactivationEmail(customerEmail, customerName) {
        try {
            const transporter = createTransporter();

            const mailOptions = {
                from: {
                    name: "Smart Fruit Shop",
                    address: process.env.EMAIL_USER || "noreply@smartfruitshop.vn"
                },
                to: customerEmail,
                subject: "Account Reactivated - Smart Fruit Shop",
                // Email content in HTML and plain text
                html: `
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <style>
                            body {
                                font-family: Arial, sans-serif;
                                line-height: 1.6;
                                color: #333;
                                max-width: 600px;
                                margin: 0 auto;
                                padding: 20px;
                            }
                            .container {
                                background-color: #f9f9f9;
                                border: 1px solid #ddd;
                                border-radius: 8px;
                                padding: 30px;
                            }
                            .header {
                                background-color: #28a745;
                                color: white;
                                padding: 15px;
                                border-radius: 8px 8px 0 0;
                                text-align: center;
                                margin: -30px -30px 20px -30px;
                            }
                            .content {
                                margin: 20px 0;
                            }
                            .highlight {
                                background-color: #d4edda;
                                padding: 15px;
                                border-left: 4px solid #28a745;
                                margin: 20px 0;
                            }
                            .footer {
                                margin-top: 30px;
                                padding-top: 20px;
                                border-top: 1px solid #ddd;
                                color: #666;
                                font-size: 14px;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h2>✅ Account Reactivated</h2>
                            </div>
                            <div class="content">
                                <p>Hello <strong>${customerName}</strong>,</p>
                                
                                <p>Good news! Your account on <strong>Smart Fruit Shop</strong> has been reactivated.</p>
                                
                                <div class="highlight">
                                    You can now log in and continue shopping with us!
                                </div>
                                
                                <p>Thank you for your patience and for being a valued customer.</p>
                                
                                <p>If you have any questions, please don't hesitate to contact us.</p>
                            </div>
                            <div class="footer">
                                <p>Sincerely,<br>
                                <strong>Smart Fruit Shop Team</strong></p>
                            </div>
                        </div>
                    </body>
                    </html>
                `,
                text: `
Hello ${customerName},

Good news! Your account on Smart Fruit Shop has been reactivated.

You can now log in and continue shopping with us!

Thank you for your patience.

Sincerely,
Smart Fruit Shop
                `.trim()
            };

            const info = await transporter.sendMail(mailOptions);

            return {
                status: "OK",
                message: "Email sent successfully",
                messageId: info.messageId
            };
        } catch (error) {
            console.error("Email sending error:", error);
            return {
                status: "ERR",
                message: `Failed to send email: ${error.message}`
            };
        }
    },

    /**
     * Gửi email khi đặt trước đã sẵn sàng giao – nhắc khách thanh toán phần còn lại.
     * @param {String} customerEmail
     * @param {String} customerName
     * @param {String} fruitTypeName - Tên loại trái cây
     * @param {Number} quantityKg
     * @param {Number} daysToPay - Số ngày phải thanh toán (mặc định 7)
     */
    async sendPreOrderReadyEmail(customerEmail, customerName, fruitTypeName = "sản phẩm đặt trước", quantityKg = 0, daysToPay = 7) {
        try {
            const transporter = createTransporter();
            const fruitLabel = fruitTypeName ? `${fruitTypeName} (${quantityKg} kg)` : `sản phẩm (${quantityKg} kg)`;

            const mailOptions = {
                from: {
                    name: "Smart Fruit Shop",
                    address: process.env.EMAIL_USER || "noreply@smartfruitshop.vn"
                },
                to: customerEmail,
                subject: "Đặt trước sẵn sàng – Vui lòng thanh toán phần còn lại – Smart Fruit Shop",
                html: `
                    <!DOCTYPE html>
                    <html lang="vi">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
                            .container { background-color: #f9f9f9; border: 1px solid #ddd; border-radius: 8px; padding: 30px; }
                            .header { background-color: #28a745; color: white; padding: 15px; border-radius: 8px 8px 0 0; text-align: center; margin: -30px -30px 20px -30px; }
                            .content { margin: 20px 0; }
                            .highlight { background-color: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0; }
                            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 14px; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header"><h2>Đặt trước sẵn sàng giao</h2></div>
                            <div class="content">
                                <p>Xin chào <strong>${customerName || "Quý khách"}</strong>,</p>
                                <p>Sản phẩm đặt trước của bạn <strong>${fruitLabel}</strong> đã được phân bổ và sẵn sàng để giao.</p>
                                <div class="highlight">
                                    <strong>Vui lòng thanh toán phần tiền còn lại trong vòng ${daysToPay} ngày.</strong><br>
                                    Nếu không thanh toán đủ trong thời hạn trên, đơn đặt trước có thể bị hủy và <strong>tiền cọc đã thanh toán sẽ không được hoàn lại</strong>.
                                </div>
                                <p>Vui lòng đăng nhập vào ứng dụng/website và hoàn tất thanh toán để nhận hàng.</p>
                            </div>
                            <div class="footer">
                                <p>Trân trọng,<br><strong>Smart Fruit Shop</strong></p>
                            </div>
                        </div>
                    </body>
                    </html>
                `,
                text: `
Xin chào ${customerName || "Quý khách"},

Sản phẩm đặt trước của bạn ${fruitLabel} đã sẵn sàng giao.

Vui lòng thanh toán phần tiền còn lại trong vòng ${daysToPay} ngày. Nếu không thanh toán đủ trong thời hạn trên, đơn có thể bị hủy và tiền cọc đã thanh toán sẽ không được hoàn lại.

Trân trọng,
Smart Fruit Shop
                `.trim()
            };

            const info = await transporter.sendMail(mailOptions);
            return { status: "OK", message: "Email sent successfully", messageId: info.messageId };
        } catch (error) {
            console.error("PreOrder ready email error:", error);
            return { status: "ERR", message: `Failed to send email: ${error.message}` };
        }
    }
};



// Additional order-related email helpers
EmailService.sendOrderConfirmationEmail = async (
    customerEmail,
    customerName,
    orderId,
    amount,
    paymentMethod,
    paymentUrl = null,
) => {
    try {
        const transporter = createTransporter();

        const mailOptions = {
            from: {
                name: "Smart Fruit Shop",
                address: process.env.EMAIL_USER || "noreply@smartfruitshop.vn",
            },
            to: customerEmail,
            subject: `Xác nhận đơn hàng ${orderId}`,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                    <h2>✅ Đơn hàng đã được tạo</h2>
                    <p>Xin chào <strong>${customerName}</strong>,</p>
                    <p>Đơn hàng <strong>${orderId}</strong> của bạn đã được tạo với tổng tiền <strong>${amount}</strong>.</p>
                    <p>Phương thức thanh toán: <strong>${paymentMethod}</strong></p>
                    ${paymentUrl ? `<p>Hoàn tất thanh toán tại: <a href="${paymentUrl}">${paymentUrl}</a></p>` : ""}
                    <p>Cảm ơn bạn đã mua hàng tại Smart Fruit Shop.</p>
                </div>
            `,
            text: `Đơn hàng ${orderId} đã được tạo. Tổng: ${amount}. Phương thức: ${paymentMethod}`,
        };

        const info = await transporter.sendMail(mailOptions);
        return { status: "OK", messageId: info.messageId };
    } catch (error) {
        console.error("Order confirmation email error:", error);
        return { status: "ERR", message: error.message };
    }
};

EmailService.sendPaymentFailureEmail = async (customerEmail, customerName, orderId) => {
    try {
        const transporter = createTransporter();

        const mailOptions = {
            from: {
                name: "Smart Fruit Shop",
                address: process.env.EMAIL_USER || "noreply@smartfruitshop.vn",
            },
            to: customerEmail,
            subject: `Thanh toán thất bại cho đơn ${orderId}`,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                    <h2>⚠️ Thanh toán không thành công</h2>
                    <p>Xin chào <strong>${customerName}</strong>,</p>
                    <p>Thanh toán cho đơn hàng <strong>${orderId}</strong> không thành công. Bạn có thể thử thanh toán lại trong vòng 10 phút.</p>
                    <p>Nếu cần hỗ trợ, liên hệ support@smartfruitshop.vn.</p>
                </div>
            `,
            text: `Thanh toán cho đơn ${orderId} thất bại. Vui lòng thử lại.`,
        };

        const info = await transporter.sendMail(mailOptions);
        return { status: "OK", messageId: info.messageId };
    } catch (error) {
        console.error("Payment failure email error:", error);
        return { status: "ERR", message: error.message };
    }
};

module.exports = EmailService;