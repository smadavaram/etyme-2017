class Notification < ActiveRecord::Base

  belongs_to :notifiable,polymorphic: true

  default_scope { order(created_at: :desc) }

  after_create :send_notification_email

  private

    # After Create
    def send_notification_email
      NotificationMailer.notification_email(self).deliver
    end

end
