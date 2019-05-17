class Notification < ApplicationRecord

  belongs_to :notifiable,polymorphic: true
  belongs_to :createable, polymorphic: true
  enum status: [:unread, :read]
  enum notification_type: [:chat, :new_application, :invitation, :application_status]
  default_scope { order(created_at: :desc) }

  after_create :send_notification_email

  private

    # After Create
    def send_notification_email
      NotificationMailer.notification_email(self).deliver
    end

end
