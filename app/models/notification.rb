class Notification < ApplicationRecord

  belongs_to :notifiable,polymorphic: true
  belongs_to :createable, polymorphic: true
  enum status: [:unread, :read]
  enum notification_type: [:chat, :new_application, :invitation, :application_status,:contract,:document_request]
  after_create :send_notification_email
  default_scope { order(created_at: :desc) }
  scope :all_notifications,->{where(notification_type: notification_types.keys)}

  private

    # After Create
    def send_notification_email
      NotificationMailer.notification_email(self).deliver
    end

end
