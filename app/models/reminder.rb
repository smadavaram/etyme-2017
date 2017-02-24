class Reminder < ActiveRecord::Base

  enum status: [:done, :not_done]

  validates :title            ,presence: :true
  validates :remind_at        ,presence: :true

  belongs_to     :user
  belongs_to     :reminderable ,polymorphic:  :true

  after_create   :add_reminder_in_delayed_job

  private

  def add_reminder_in_delayed_job
    self.delay(run_at: self.remind_at ).send_reminder_email
  end

  def send_reminder_email
    UserMailer.send_remind_email(self)
  end
end
