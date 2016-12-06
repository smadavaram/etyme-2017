class Notification < ActiveRecord::Base

  #Associations
  belongs_to :notifiable,polymorphic: true

  #Scopes
  default_scope { order(created_at: :desc) }


  #CallBack
  after_create :send_notification_email


  private

    # After Create
    def send_notification_email
      NotificationMailer.notification_email(self).deliver
    end

end
