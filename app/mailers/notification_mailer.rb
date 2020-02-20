# frozen_string_literal: true

class NotificationMailer < ApplicationMailer
  def notification_email(notification)
    @notification = notification
    @notifiable   = @notification.notifiable
    @email        = @notification.notifiable.email
    mail(to: @email, subject: 'Etyme Notification Alert')
  end

  def chat_and_notification_notifier(notifications, messages, to)
    @notifications = notifications
    @messages = messages
    mail(to: to, subject: 'Etyme Conversation and Notifications Alerts')
  end

  def send_csv(csv)
    attachments['aggregate_salary.csv'] = { mime_type: 'text/csv', content: csv }
    mail(to: 'tanays.tps@gmail.com', subject: 'My subject')
  end
end
