class NotificationMailer < ApplicationMailer

  #Default Email
  default from: "no-reply@etyme.com"

  def notification_email notification
    @notification = notification
    @notifiable   = @notification.notifiable
    @email        = @notification.notifiable.email
    mail(to: @email,  subject: "Etyme Notification Alert",from: "Etyme <no-reply@etyme.com>")
  end

end
